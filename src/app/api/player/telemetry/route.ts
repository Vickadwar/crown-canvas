/**
 * @file src/app/api/player/telemetry/route.ts
 * @description Authenticated Proof-of-Play telemetry ingestion endpoint recording batched
 * offline-buffered playback completions into `proof_of_play_logs`. Automatically retries
 * transient Supabase pooler disconnects (`57P01`) and nullifies stale/deleted foreign keys
 * so offline queues never poison future telemetry flushes.
 */

import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  isDatabaseConfigured,
  mediaAssets,
  playlists,
  proofOfPlayLogs,
  quickPosts,
  screens,
  withDbRetry,
} from "@/db";
import { hashDeviceToken } from "@/lib/security";

const telemetryBatchSchema = z.object({
  items: z
    .array(
      z.object({
        playlistId: z.string().uuid().nullable().optional(),
        mediaAssetId: z.string().uuid().nullable().optional(),
        quickPostId: z.string().uuid().nullable().optional(),
        startedAt: z.string().datetime(),
        durationPlayedSeconds: z.number().int().min(1).max(7200),
        completed: z.boolean().default(true),
      })
    )
    .min(1)
    .max(100),
});

function isForeignKeyViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; cause?: { code?: string } };
  return e.code === "23503" || e.cause?.code === "23503";
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!bearer) {
    return Response.json(
      { error: "Missing device bearer token" },
      { status: 401 }
    );
  }

  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const tokenHash = hashDeviceToken(bearer);
    const [screen] = await withDbRetry(() =>
      db.select().from(screens).where(eq(screens.deviceTokenHash, tokenHash))
    );

    if (!screen) {
      return Response.json({ error: "Invalid device token" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = telemetryBatchSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid telemetry batch", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const items = parsed.data.items;

    // Validate optional FK references so deleted playlists/clips/slides in an offline queue
    // never cause Postgres 23503 FK violations; impressions are still recorded cleanly.
    const playlistIds = Array.from(
      new Set(
        items.map((i) => i.playlistId).filter((v): v is string => Boolean(v))
      )
    );
    const mediaIds = Array.from(
      new Set(
        items.map((i) => i.mediaAssetId).filter((v): v is string => Boolean(v))
      )
    );
    const quickPostIds = Array.from(
      new Set(
        items.map((i) => i.quickPostId).filter((v): v is string => Boolean(v))
      )
    );

    const [validPlaylists, validMedia, validPosts] = await withDbRetry(() =>
      Promise.all([
        playlistIds.length > 0
          ? db
              .select({ id: playlists.id })
              .from(playlists)
              .where(inArray(playlists.id, playlistIds))
          : Promise.resolve([]),
        mediaIds.length > 0
          ? db
              .select({ id: mediaAssets.id })
              .from(mediaAssets)
              .where(inArray(mediaAssets.id, mediaIds))
          : Promise.resolve([]),
        quickPostIds.length > 0
          ? db
              .select({ id: quickPosts.id })
              .from(quickPosts)
              .where(inArray(quickPosts.id, quickPostIds))
          : Promise.resolve([]),
      ])
    );

    const validPlaylistSet = new Set(validPlaylists.map((r) => r.id));
    const validMediaSet = new Set(validMedia.map((r) => r.id));
    const validPostSet = new Set(validPosts.map((r) => r.id));

    const rowsToInsert = items.map((item) => ({
      screenId: screen.id,
      branchId: screen.branchId,
      playlistId:
        item.playlistId && validPlaylistSet.has(item.playlistId)
          ? item.playlistId
          : null,
      mediaAssetId:
        item.mediaAssetId && validMediaSet.has(item.mediaAssetId)
          ? item.mediaAssetId
          : null,
      quickPostId:
        item.quickPostId && validPostSet.has(item.quickPostId)
          ? item.quickPostId
          : null,
      departmentId: screen.departmentId ?? null,
      startedAt: new Date(item.startedAt),
      durationPlayedSeconds: item.durationPlayedSeconds,
      completed: item.completed,
    }));

    try {
      await withDbRetry(() =>
        db.insert(proofOfPlayLogs).values(rowsToInsert)
      );
    } catch (insertErr) {
      if (isForeignKeyViolation(insertErr)) {
        // Race condition fallback (e.g., asset deleted between SELECT and INSERT)
        await withDbRetry(() =>
          db.insert(proofOfPlayLogs).values(
            items.map((item) => ({
              screenId: screen.id,
              branchId: screen.branchId,
              playlistId: null,
              mediaAssetId: null,
              quickPostId: null,
              departmentId: null,
              startedAt: new Date(item.startedAt),
              durationPlayedSeconds: item.durationPlayedSeconds,
              completed: item.completed,
            }))
          )
        );
      } else {
        throw insertErr;
      }
    }

    return Response.json({ ok: true, recorded: items.length });
  } catch (err) {
    console.error("[player/telemetry] Failed to record telemetry:", err);
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to record telemetry",
      },
      { status: 500 }
    );
  }
}
