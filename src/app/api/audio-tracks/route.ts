/**
 * @file src/app/api/audio-tracks/route.ts
 * @description Cloudflare R2 background music library (`GET`, `POST`) for silent slides & promos.
 */

import { desc } from "drizzle-orm";
import { connection } from "next/server";
import { z } from "zod";
import { db, isDatabaseConfigured, withDbRetry, audioTracks } from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";
import { broadcastFleetSignal } from "@/lib/realtime";
import { recordAuditLog } from "@/lib/audit";

const createAudioSchema = z.object({
  title: z.string().trim().min(2).max(160),
  artist: z.string().trim().max(120).default("Royalty-Free Audio"),
  moodTag: z
    .enum(["showroom_lounge", "upbeat_promo", "corporate_ambient", "celebration"])
    .default("showroom_lounge"),
  publicUrl: z.string().url(),
  storagePath: z.string().min(2).max(500),
  mimeType: z.string().max(100).default("audio/mpeg"),
  fileSizeBytes: z.number().int().nonnegative().default(0),
  durationSeconds: z.number().int().min(5).max(3600).default(180),
  volumePercent: z.number().int().min(5).max(100).default(35),
});

export async function GET() {
  await connection();
  const { errorResponse } = await requireAdminAccess();
  if (errorResponse) return errorResponse;
  if (!isDatabaseConfigured()) return Response.json({ audioTracks: [] });

  try {
    const rows = await withDbRetry(() =>
      db.select().from(audioTracks).orderBy(desc(audioTracks.createdAt))
    );
    return Response.json({ audioTracks: rows });
  } catch {
    return Response.json({ audioTracks: [] });
  }
}

export async function POST(request: Request) {
  const { session, errorResponse } = await requireAdminAccess({
    disallowAuditor: true,
  });
  if (errorResponse) return errorResponse;
  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const parsed = createAudioSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message || "Invalid audio track payload" },
        { status: 400 }
      );
    }

    const [created] = await withDbRetry(() =>
      db
        .insert(audioTracks)
        .values({
          ...parsed.data,
          createdBy: session.userId ?? null,
        })
        .returning()
    );

    await Promise.all([
      broadcastFleetSignal("manifest_refresh", {
        reason: "audio_track_created",
        audioTrackId: created.id,
      }),
      recordAuditLog({
        action: "audio_track.created",
        entityType: "audio_track",
        entityId: created.id,
        userId: session.userId,
        metadata: { title: created.title },
      }),
    ]);

    return Response.json({ audioTrack: created }, { status: 201 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to save audio track" },
      { status: 500 }
    );
  }
}
