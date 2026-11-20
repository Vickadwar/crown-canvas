/**
 * @file src/app/api/quick-posts/route.ts
 * @description Creates Crown Studio Quick Post slides with scoped RBAC validation and
 * Maker-Checker approval workflow defaults.
 */

import { db, isDatabaseConfigured, quickPosts } from "@/db";
import { canAutoApproveContent, requireAdminAccess } from "@/lib/auth-guard";
import { quickPostPayloadSchema } from "@/lib/quick-post-schema";
import { recordAuditLog } from "@/lib/audit";

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "DATABASE_URL is not configured in .env.local yet." },
      { status: 503 }
    );
  }

  try {
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

    const [created] = await db
      .insert(quickPosts)
      .values({
        title: parsed.data.title,
        templateType: parsed.data.templateType,
        departmentId: parsed.data.departmentId,
        countryId: parsed.data.countryId ?? null,
        dataFeedId: parsed.data.dataFeedId ?? null,
        durationSeconds: parsed.data.durationSeconds,
        slideConfig,
        createdBy: session.userId,
        approvalStatus: autoApproved ? "approved" : "pending_approval",
        approvedBy: autoApproved ? session.userId : null,
        approvedAt: autoApproved ? new Date() : null,
      })
      .returning();

    await recordAuditLog({
      action: autoApproved
        ? "quick_post.created"
        : "quick_post.submitted_for_approval",
      entityType: "quick_post",
      entityId: created.id,
      userId: session.userId,
      metadata: {
        title: created.title,
        approvalStatus: created.approvalStatus,
      },
    });

    return Response.json({ quickPost: created }, { status: 201 });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to create quick post",
      },
      { status: 500 }
    );
  }
}
