/**
 * @file src/app/api/player/heartbeat/route.ts
 * @description Authenticated 30s player heartbeat endpoint updating screen online status,
 * live `currentItemTitle`, optional compressed remote screenshot snapshot, local cache
 * health metrics, and delivering pending remote commands.
 */

import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  isDatabaseConfigured,
  screens,
  screenCommands,
  withDbRetry,
} from "@/db";
import { hashDeviceToken } from "@/lib/security";

const heartbeatSchema = z.object({
  cacheStatus: z
    .enum(["pending", "downloading", "synced", "error"])
    .default("synced"),
  cachedAssetCount: z.number().int().nonnegative().default(0),
  storageUsedMb: z.number().int().nonnegative().default(0),
  appVersion: z.string().max(32).optional(),
  currentItemTitle: z.string().max(200).optional().nullable(),
  snapshotDataUrl: z
    .string()
    .max(260_000)
    .refine(
      (v) => v.startsWith("data:image/jpeg;base64,") || v.startsWith("data:image/webp;base64,"),
      { message: "Invalid snapshot format" }
    )
    .optional(),
  executedCommandIds: z.array(z.string().uuid()).default([]),
});

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
    return Response.json(
      { error: "DATABASE_URL is not configured." },
      { status: 503 }
    );
  }

  try {
    const tokenHash = hashDeviceToken(bearer);
    const [screen] = await withDbRetry(() =>
      db.select().from(screens).where(eq(screens.deviceTokenHash, tokenHash))
    );

    if (!screen) {
      return Response.json({ error: "Invalid device token" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = heartbeatSchema.safeParse(body);
    const data = parsed.success
      ? parsed.data
      : {
          cacheStatus: "synced" as const,
          cachedAssetCount: 0,
          storageUsedMb: 0,
          appVersion: undefined,
          currentItemTitle: undefined,
          snapshotDataUrl: undefined,
          executedCommandIds: [],
        };

    const now = new Date();

    await withDbRetry(() =>
      db
        .update(screens)
        .set({
          isOnline: true,
          lastHeartbeatAt: now,
          cacheStatus: data.cacheStatus,
          cachedAssetCount: data.cachedAssetCount,
          storageUsedMb: data.storageUsedMb,
          appVersion: data.appVersion ?? screen.appVersion,
          currentItemTitle:
            data.currentItemTitle !== undefined
              ? data.currentItemTitle
              : screen.currentItemTitle,
          ...(data.snapshotDataUrl
            ? {
                lastSnapshotUrl: data.snapshotDataUrl,
                lastSnapshotAt: now,
              }
            : {}),
          updatedAt: now,
        })
        .where(eq(screens.id, screen.id))
    );

    if (data.executedCommandIds.length > 0) {
      await withDbRetry(() =>
        db
          .update(screenCommands)
          .set({ status: "executed", executedAt: now })
          .where(
            and(
              eq(screenCommands.screenId, screen.id),
              inArray(screenCommands.id, data.executedCommandIds)
            )
          )
      );
    }

    // Atomically fetch AND mark pending commands as executed at delivery time
    // so destructive commands like `reload` / `clear_cache` can NEVER cause an infinite reload loop.
    const pendingCommands = await withDbRetry(() =>
      db
        .update(screenCommands)
        .set({ status: "executed", executedAt: now })
        .where(
          and(
            eq(screenCommands.screenId, screen.id),
            eq(screenCommands.status, "pending")
          )
        )
        .returning()
    );

    return Response.json({
      ok: true,
      activePlaylistId: screen.activePlaylistId,
      commands: pendingCommands,
      serverTime: now.toISOString(),
    });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to process heartbeat",
      },
      { status: 500 }
    );
  }
}
