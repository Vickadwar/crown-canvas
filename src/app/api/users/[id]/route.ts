import { eq } from "drizzle-orm";
import { db, isDatabaseConfigured, userScopes } from "@/db";
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
  await db.delete(userScopes).where(eq(userScopes.id, id));
  await recordAuditLog({
    action: "rbac.scope_removed",
    entityType: "user_scope",
    entityId: id,
    userId: session.userId,
  });
  return Response.json({ ok: true });
}
