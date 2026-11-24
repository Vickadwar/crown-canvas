/**
 * @file src/app/api/media/[id]/route.ts
 * @description Archives a media asset and permanently purges its cloud storage blob so
 * Supabase Free Tier (1 GB) disk space is reclaimed immediately.
 */

import { and, eq, ne } from "drizzle-orm";
import { db, isDatabaseConfigured, mediaAssets } from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";
import { recordAuditLog } from "@/lib/audit";
import { broadcastFleetSignal } from "@/lib/realtime";
import { purgeMediaObject } from "@/lib/storage-provider";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  const { id } = await context.params;
  const [existing] = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, id));

  if (!existing) {
    return Response.json({ error: "Media asset not found" }, { status: 404 });
  }

  const { session, errorResponse } = await requireAdminAccess({
    disallowAuditor: true,
    departmentId: existing.departmentId,
    countryId: existing.countryId,
  });
  if (errorResponse) return errorResponse;

  const [archived] = await db
    .update(mediaAssets)
    .set({ isArchived: true, updatedAt: new Date() })
    .where(eq(mediaAssets.id, id))
    .returning();

  // Only purge blob from cloud storage if no other active deduplicated asset shares the path
  const otherRefs = await db
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.storagePath, existing.storagePath),
        eq(mediaAssets.isArchived, false),
        ne(mediaAssets.id, id)
      )
    )
    .limit(1);

  const [storageResult] = await Promise.all([
    otherRefs.length === 0
      ? purgeMediaObject(existing.storagePath, existing.publicUrl)
      : Promise.resolve({
          purged: false,
          reason: "Shared by another deduplicated asset",
        }),
    broadcastFleetSignal("manifest_refresh", {
      mediaAssetId: id,
      reason: "media_archived",
    }),
    recordAuditLog({
      action: otherRefs.length === 0 ? "media.purged" : "media.archived",
      entityType: "media_asset",
      entityId: id,
      userId: session.userId,
      metadata: {
        title: archived.title,
        freedBytes: otherRefs.length === 0 ? existing.fileSizeBytes : 0,
      },
    }),
  ]);

  return Response.json({
    ok: true,
    storagePurged: storageResult.purged,
    freedBytes: storageResult.purged ? existing.fileSizeBytes : 0,
  });
}
