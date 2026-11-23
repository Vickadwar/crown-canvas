/**
 * @file src/app/api/sidebar-profiles/[id]/route.ts
 * @description Update or delete a reusable Sidebar Profile with live Realtime push.
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  isDatabaseConfigured,
  withDbRetry,
  sidebarProfiles,
} from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";
import { broadcastFleetSignal } from "@/lib/realtime";
import { recordAuditLog } from "@/lib/audit";

const patchProfileSchema = z.object({
  name: z.string().trim().min(2).max(140).optional(),
  description: z.string().trim().max(300).nullable().optional(),
  theme: z
    .enum(["white_minimal", "warm_editorial", "navy_dark", "slate_industrial"])
    .optional(),
  displayName: z.string().trim().max(140).nullable().optional(),
  showClock: z.boolean().optional(),
  showWeather: z.boolean().optional(),
  showQr: z.boolean().optional(),
  qrTitle: z.string().trim().max(100).nullable().optional(),
  promoLabel: z.string().trim().max(200).nullable().optional(),
  qrTargetUrl: z.string().trim().url().nullable().optional().or(z.literal("")),
  slideIntervalSeconds: z.number().int().min(3).max(60).optional(),
  productIds: z.array(z.string().uuid()).optional(),
  isDefault: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { session, errorResponse } = await requireAdminAccess({
    disallowAuditor: true,
    permission: "playlists:manage",
  });
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = patchProfileSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message || "Invalid sidebar update" },
        { status: 400 }
      );
    }

    if (parsed.data.isDefault) {
      await withDbRetry(() =>
        db.update(sidebarProfiles).set({ isDefault: false })
      );
    }

    const [updated] = await withDbRetry(() =>
      db
        .update(sidebarProfiles)
        .set({
          ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
          ...(parsed.data.description !== undefined
            ? { description: parsed.data.description }
            : {}),
          ...(parsed.data.theme !== undefined ? { theme: parsed.data.theme } : {}),
          ...(parsed.data.displayName !== undefined
            ? { displayName: parsed.data.displayName }
            : {}),
          ...(parsed.data.showClock !== undefined
            ? { showClock: parsed.data.showClock }
            : {}),
          ...(parsed.data.showWeather !== undefined
            ? { showWeather: parsed.data.showWeather }
            : {}),
          ...(parsed.data.showQr !== undefined ? { showQr: parsed.data.showQr } : {}),
          ...(parsed.data.qrTitle !== undefined
            ? { qrTitle: parsed.data.qrTitle }
            : {}),
          ...(parsed.data.promoLabel !== undefined
            ? { promoLabel: parsed.data.promoLabel }
            : {}),
          ...(parsed.data.qrTargetUrl !== undefined
            ? {
                qrTargetUrl: parsed.data.qrTargetUrl
                  ? parsed.data.qrTargetUrl.trim()
                  : null,
              }
            : {}),
          ...(parsed.data.slideIntervalSeconds !== undefined
            ? { slideIntervalSeconds: parsed.data.slideIntervalSeconds }
            : {}),
          ...(parsed.data.productIds !== undefined
            ? { productIds: parsed.data.productIds }
            : {}),
          ...(parsed.data.isDefault !== undefined
            ? { isDefault: parsed.data.isDefault }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(sidebarProfiles.id, id))
        .returning()
    );

    if (!updated) {
      return Response.json(
        { error: "Sidebar profile not found" },
        { status: 404 }
      );
    }

    await Promise.all([
      broadcastFleetSignal("manifest_refresh", {
        reason: "sidebar_profile_updated",
        sidebarProfileId: id,
      }),
      recordAuditLog({
        action: "sidebar.profile_updated",
        entityType: "sidebar_profile",
        entityId: id,
        userId: session.userId,
        metadata: { name: updated.name, theme: updated.theme },
      }),
    ]);

    return Response.json({ profile: updated });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to update sidebar profile",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { session, errorResponse } = await requireAdminAccess({
    disallowAuditor: true,
    permission: "playlists:manage",
  });
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const { id } = await context.params;
    const [deleted] = await withDbRetry(() =>
      db
        .delete(sidebarProfiles)
        .where(eq(sidebarProfiles.id, id))
        .returning()
    );

    if (!deleted) {
      return Response.json(
        { error: "Sidebar profile not found" },
        { status: 404 }
      );
    }

    await Promise.all([
      broadcastFleetSignal("manifest_refresh", {
        reason: "sidebar_profile_deleted",
        sidebarProfileId: id,
      }),
      recordAuditLog({
        action: "sidebar.profile_deleted",
        entityType: "sidebar_profile",
        entityId: id,
        userId: session.userId,
        metadata: { name: deleted.name },
      }),
    ]);

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to delete sidebar profile",
      },
      { status: 500 }
    );
  }
}
