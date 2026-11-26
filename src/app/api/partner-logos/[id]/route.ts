/**
 * @file src/app/api/partner-logos/[id]/route.ts
 * @description Update order/visibility or delete a Partner Logo (with R2 purge).
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, isDatabaseConfigured, withDbRetry, partnerLogos } from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";
import { purgeMediaObject } from "@/lib/storage-provider";
import { broadcastFleetSignal } from "@/lib/realtime";

const patchPartnerSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  tagline: z.string().trim().max(160).nullable().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
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
    const parsed = patchPartnerSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid partner logo update" }, { status: 400 });
    }

    const [updated] = await withDbRetry(() =>
      db
        .update(partnerLogos)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(partnerLogos.id, id))
        .returning()
    );
    if (!updated) {
      return Response.json({ error: "Partner logo not found" }, { status: 404 });
    }

    await broadcastFleetSignal("manifest_refresh", {
      reason: "partner_logo_updated",
      partnerLogoId: id,
    });
    return Response.json({ partnerLogo: updated });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to update partner logo" },
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
      db.delete(partnerLogos).where(eq(partnerLogos.id, id)).returning()
    );
    if (!deleted) {
      return Response.json({ error: "Partner logo not found" }, { status: 404 });
    }

    await Promise.all([
      deleted.storagePath
        ? purgeMediaObject(deleted.storagePath, deleted.logoUrl).catch(() => {})
        : Promise.resolve(),
      broadcastFleetSignal("manifest_refresh", {
        reason: "partner_logo_deleted",
        partnerLogoId: id,
      }),
    ]);

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to delete partner logo" },
      { status: 500 }
    );
  }
}
