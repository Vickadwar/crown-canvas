import { eq } from "drizzle-orm";
import { db, isDatabaseConfigured, quickPosts } from "@/db";
import { canAutoApproveContent, requireAdminAccess } from "@/lib/auth-guard";
import { recordAuditLog } from "@/lib/audit";
import { broadcastFleetSignal } from "@/lib/realtime";
import { quickPostPayloadSchema } from "@/lib/quick-post-schema";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = quickPostPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid quick post payload", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { session, errorResponse } = await requireAdminAccess({
      disallowAuditor: true,
      departmentId: parsed.data.departmentId,
      countryId: parsed.data.countryId ?? null,
    });
    if (errorResponse) return errorResponse;

    const autoApproved = canAutoApproveContent(session);
    const slideConfig = {
      ...parsed.data.slideConfig,
      qrUrl: parsed.data.slideConfig.qrUrl || undefined,
    };

    const [updated] = await db
      .update(quickPosts)
      .set({
        title: parsed.data.title,
        templateType: parsed.data.templateType,
        departmentId: parsed.data.departmentId,
        countryId: parsed.data.countryId ?? null,
        dataFeedId: parsed.data.dataFeedId ?? null,
        durationSeconds: parsed.data.durationSeconds,
        slideConfig,
        approvalStatus: autoApproved ? "approved" : "pending_approval",
        approvedBy: autoApproved ? session.userId : null,
        approvedAt: autoApproved ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(quickPosts.id, id))
      .returning();

    if (!updated) {
      return Response.json({ error: "Quick post not found" }, { status: 404 });
    }

    await Promise.all([
      broadcastFleetSignal("manifest_refresh", {
        quickPostId: id,
        reason: "quick_post_updated",
      }),
      recordAuditLog({
        action: "quick_post.updated",
        entityType: "quick_post",
        entityId: id,
        userId: session.userId,
        metadata: {
          title: updated.title,
          backgroundTheme: slideConfig.backgroundTheme ?? null,
        },
      }),
    ]);

    return Response.json({ quickPost: updated });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to update quick post",
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
  });
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  const { id } = await context.params;
  const [archived] = await db
    .update(quickPosts)
    .set({ isArchived: true, updatedAt: new Date() })
    .where(eq(quickPosts.id, id))
    .returning();

  if (!archived) {
    return Response.json({ error: "Quick post not found" }, { status: 404 });
  }

  await recordAuditLog({
    action: "quick_post.archived",
    entityType: "quick_post",
    entityId: id,
    userId: session.userId,
    metadata: { title: archived.title },
  });

  return Response.json({ ok: true });
}
