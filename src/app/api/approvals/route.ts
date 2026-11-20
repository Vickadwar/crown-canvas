/**
 * @file src/app/api/approvals/route.ts
 * @description Maker-Checker Content Approval endpoint allowing `super_admin`,
 * `country_manager`, and `department_lead` to approve or reject pending media & slides.
 */

import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, isDatabaseConfigured, mediaAssets, quickPosts } from "@/db";
import { canAutoApproveContent, requireAdminAccess } from "@/lib/auth-guard";
import { recordAuditLog } from "@/lib/audit";
import { broadcastFleetSignal } from "@/lib/realtime";

const approvalActionSchema = z.object({
  entityKind: z.enum(["media_asset", "quick_post"]),
  entityId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  rejectionReason: z.string().max(300).optional(),
});

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  const { session, errorResponse } = await requireAdminAccess({
    disallowAuditor: true,
  });
  if (errorResponse) return errorResponse;

  if (!canAutoApproveContent(session)) {
    return Response.json(
      {
        error:
          "Only Super Admins, Country Managers, and Department Leads can approve or reject content.",
      },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const parsed = approvalActionSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid approval request", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { entityKind, entityId, decision, rejectionReason } = parsed.data;
    const now = new Date();

    if (entityKind === "media_asset") {
      const [updated] = await db
        .update(mediaAssets)
        .set({
          approvalStatus: decision,
          approvedBy: session.userId,
          approvedAt: now,
          rejectionReason: decision === "rejected" ? (rejectionReason ?? null) : null,
          updatedAt: now,
        })
        .where(eq(mediaAssets.id, entityId))
        .returning();

      if (!updated) {
        return Response.json({ error: "Media asset not found" }, { status: 404 });
      }

      await Promise.all([
        broadcastFleetSignal("manifest_refresh", {
          mediaAssetId: entityId,
          reason: `media_${decision}`,
        }),
        recordAuditLog({
          action: `media.${decision}`,
          entityType: "media_asset",
          entityId,
          userId: session.userId,
          metadata: { title: updated.title, rejectionReason: rejectionReason ?? null },
        }),
      ]);

      return Response.json({ ok: true, item: updated });
    }

    const [updated] = await db
      .update(quickPosts)
      .set({
        approvalStatus: decision,
        approvedBy: session.userId,
        approvedAt: now,
        rejectionReason: decision === "rejected" ? (rejectionReason ?? null) : null,
        updatedAt: now,
      })
      .where(eq(quickPosts.id, entityId))
      .returning();

    if (!updated) {
      return Response.json({ error: "Quick post not found" }, { status: 404 });
    }

    await Promise.all([
      broadcastFleetSignal("manifest_refresh", {
        quickPostId: entityId,
        reason: `quick_post_${decision}`,
      }),
      recordAuditLog({
        action: `quick_post.${decision}`,
        entityType: "quick_post",
        entityId,
        userId: session.userId,
        metadata: { title: updated.title, rejectionReason: rejectionReason ?? null },
      }),
    ]);

    return Response.json({ ok: true, item: updated });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to process approval",
      },
      { status: 500 }
    );
  }
}
