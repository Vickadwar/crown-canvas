/**
 * @file src/app/api/templates/[id]/route.ts
 * @description Deletes a custom reusable Crown Studio template from `studio_templates`.
 */

import { eq } from "drizzle-orm";
import { db, isDatabaseConfigured, studioTemplates } from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";
import { recordAuditLog } from "@/lib/audit";

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
  const [deleted] = await db
    .delete(studioTemplates)
    .where(eq(studioTemplates.id, id))
    .returning();

  if (!deleted) {
    return Response.json({ error: "Template not found" }, { status: 404 });
  }

  await recordAuditLog({
    action: "studio_template.deleted",
    entityType: "studio_template",
    entityId: id,
    userId: session.userId,
    metadata: { name: deleted.name },
  });

  return Response.json({ ok: true });
}
