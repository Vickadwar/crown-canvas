/**
 * @file src/app/api/screen-groups/[id]/route.ts
 * @description Deletes a `screen_group` (screens safely retain their pairing with `groupId = null`).
 */

import { eq } from "drizzle-orm";
import { db, isDatabaseConfigured, screenGroups } from "@/db";
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
    .delete(screenGroups)
    .where(eq(screenGroups.id, id))
    .returning();

  if (!deleted) {
    return Response.json({ error: "Screen group not found" }, { status: 404 });
  }

  await recordAuditLog({
    action: "screen_group.deleted",
    entityType: "screen_group",
    entityId: id,
    userId: session.userId,
    metadata: { name: deleted.name },
  });

  return Response.json({ ok: true });
}
