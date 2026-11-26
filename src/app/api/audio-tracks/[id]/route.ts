/**
 * @file src/app/api/audio-tracks/[id]/route.ts
 * @description Update volume/title/status or delete an R2 background audio track.
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, isDatabaseConfigured, withDbRetry, audioTracks } from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";
import { purgeMediaObject } from "@/lib/storage-provider";
import { broadcastFleetSignal } from "@/lib/realtime";

const patchAudioSchema = z.object({
  title: z.string().trim().min(2).max(160).optional(),
  artist: z.string().trim().max(120).optional(),
  moodTag: z
    .enum(["showroom_lounge", "upbeat_promo", "corporate_ambient", "celebration"])
    .optional(),
  volumePercent: z.number().int().min(5).max(100).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { errorResponse } = await requireAdminAccess({ disallowAuditor: true });
  if (errorResponse) return errorResponse;
  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = patchAudioSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid audio update" }, { status: 400 });
    }

    const [updated] = await withDbRetry(() =>
      db
        .update(audioTracks)
        .set(parsed.data)
        .where(eq(audioTracks.id, id))
        .returning()
    );
    if (!updated) {
      return Response.json({ error: "Audio track not found" }, { status: 404 });
    }

    await broadcastFleetSignal("manifest_refresh", {
      reason: "audio_track_updated",
      audioTrackId: id,
    });
    return Response.json({ audioTrack: updated });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to update audio track" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { errorResponse } = await requireAdminAccess({ disallowAuditor: true });
  if (errorResponse) return errorResponse;
  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const { id } = await context.params;
    const [deleted] = await withDbRetry(() =>
      db.delete(audioTracks).where(eq(audioTracks.id, id)).returning()
    );
    if (!deleted) {
      return Response.json({ error: "Audio track not found" }, { status: 404 });
    }

    await Promise.all([
      purgeMediaObject(deleted.storagePath, deleted.publicUrl).catch(() => {}),
      broadcastFleetSignal("manifest_refresh", {
        reason: "audio_track_deleted",
        audioTrackId: id,
      }),
    ]);

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to delete audio track" },
      { status: 500 }
    );
  }
}
