/**
 * @file src/app/api/promotions/[id]/route.ts
 * @description Update or delete an agency Promotion campaign (with R2 purge on delete).
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, isDatabaseConfigured, withDbRetry, promotions } from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";
import { purgeMediaObject } from "@/lib/storage-provider";
import { broadcastFleetSignal } from "@/lib/realtime";

const patchPromotionSchema = z.object({
  title: z.string().trim().min(2).max(180).optional(),
  description: z.string().trim().max(500).optional(),
  agencyName: z.string().trim().max(120).optional(),
  campaignCode: z.string().trim().max(64).nullable().optional(),
  mediaType: z.enum(["image", "video", "pdf"]).optional(),
  publicUrl: z.string().url().optional(),
  storagePath: z.string().min(2).max(500).optional(),
  mimeType: z.string().max(100).optional(),
  fileSizeBytes: z.number().int().nonnegative().optional(),
  sha256Checksum: z.string().max(64).optional(),
  durationSeconds: z.number().int().min(5).max(300).optional(),
  displayFitMode: z
    .enum(["auto", "ambient_blur", "edge_cover", "showroom_light"])
    .optional(),
  audioTrackId: z.string().uuid().nullable().optional(),
  targetType: z
    .enum(["screen", "screen_group", "branch", "country", "screen_role", "global"])
    .optional(),
  targetId: z.string().uuid().nullable().optional(),
  targetScreenIds: z.array(z.string().uuid()).max(200).nullable().optional(),
  targetPlaylistIds: z.array(z.string().uuid()).max(200).nullable().optional(),
  priority: z.number().int().min(1).max(1000).optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
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
    const parsed = patchPromotionSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid promotion update" }, { status: 400 });
    }

    const patchData: Record<string, unknown> = {
      ...parsed.data,
      updatedAt: new Date(),
    };
    if (parsed.data.startDate !== undefined) {
      patchData.startDate = parsed.data.startDate
        ? new Date(parsed.data.startDate)
        : null;
    }
    if (parsed.data.endDate !== undefined) {
      patchData.endDate = parsed.data.endDate ? new Date(parsed.data.endDate) : null;
    }
    if (parsed.data.targetScreenIds !== undefined) {
      patchData.targetScreenIds =
        parsed.data.targetScreenIds && parsed.data.targetScreenIds.length > 0
          ? parsed.data.targetScreenIds
          : null;
    }
    if (parsed.data.targetPlaylistIds !== undefined) {
      patchData.targetPlaylistIds =
        parsed.data.targetPlaylistIds && parsed.data.targetPlaylistIds.length > 0
          ? parsed.data.targetPlaylistIds
          : null;
    }

    const [updated] = await withDbRetry(() =>
      db
        .update(promotions)
        .set(patchData)
        .where(eq(promotions.id, id))
        .returning()
    );
    if (!updated) {
      return Response.json({ error: "Promotion not found" }, { status: 404 });
    }

    await broadcastFleetSignal("manifest_refresh", {
      reason: "promotion_updated",
      promotionId: id,
    });
    return Response.json({ promotion: updated });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to update promotion" },
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
      db.delete(promotions).where(eq(promotions.id, id)).returning()
    );
    if (!deleted) {
      return Response.json({ error: "Promotion not found" }, { status: 404 });
    }

    await Promise.all([
      purgeMediaObject(deleted.storagePath, deleted.publicUrl).catch(() => {}),
      broadcastFleetSignal("manifest_refresh", {
        reason: "promotion_deleted",
        promotionId: id,
      }),
    ]);

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to delete promotion" },
      { status: 500 }
    );
  }
}
