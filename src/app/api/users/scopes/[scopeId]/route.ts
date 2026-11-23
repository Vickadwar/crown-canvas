/**
 * @file src/app/api/users/scopes/[scopeId]/route.ts
 * @description Removes a single role/scope assignment from a user while guarding
 * against removing the last active Super Admin scope.
 */

import { eq } from "drizzle-orm";
import { db, isDatabaseConfigured, withDbRetry, users, userScopes } from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";
import { recordAuditLog } from "@/lib/audit";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ scopeId: string }> }
) {
  const { session, errorResponse } = await requireAdminAccess({
    disallowAuditor: true,
    permission: "team:manage",
  });
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const { scopeId } = await context.params;
    const [scope] = await withDbRetry(() =>
      db.select().from(userScopes).where(eq(userScopes.id, scopeId))
    );
    if (!scope) {
      return Response.json({ error: "Scope not found" }, { status: 404 });
    }

    if (scope.role === "super_admin") {
      const [allUsers, allScopes] = await withDbRetry(() =>
        Promise.all([db.select().from(users), db.select().from(userScopes)])
      );
      const activeUserIds = new Set(
        allUsers.filter((u) => u.isActive).map((u) => u.id)
      );
      const remainingSuperScopes = allScopes.filter(
        (s) =>
          s.id !== scopeId &&
          s.role === "super_admin" &&
          activeUserIds.has(s.userId)
      );
      if (remainingSuperScopes.length === 0) {
        return Response.json(
          { error: "Cannot remove the last active Super Admin role." },
          { status: 400 }
        );
      }
    }

    await withDbRetry(() =>
      db.delete(userScopes).where(eq(userScopes.id, scopeId))
    );

    await recordAuditLog({
      action: "rbac.scope_removed",
      entityType: "user_scope",
      entityId: scopeId,
      userId: session.userId,
      metadata: { targetUserId: scope.userId, role: scope.role },
    });

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : "Failed to remove scope",
      },
      { status: 500 }
    );
  }
}
