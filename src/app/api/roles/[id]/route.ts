/**
 * @file src/app/api/roles/[id]/route.ts
 * @description Update or delete custom RBAC roles (system roles are protected from deletion
 * and Super Admin permissions remain locked).
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, isDatabaseConfigured, withDbRetry, roles, userScopes } from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";
import { ALL_PERMISSIONS, type RolePermission } from "@/lib/permissions";
import { recordAuditLog } from "@/lib/audit";

const updateRoleSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(400).nullable().optional(),
  color: z
    .enum(["purple", "info", "success", "warning", "outline", "danger"])
    .optional(),
  permissions: z.array(z.enum(ALL_PERMISSIONS)).min(1).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { session, errorResponse } = await requireAdminAccess({
    disallowAuditor: true,
    permission: "roles:manage",
  });
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const { id } = await context.params;
    const [existing] = await withDbRetry(() =>
      db.select().from(roles).where(eq(roles.id, id))
    );
    if (!existing) {
      return Response.json({ error: "Role not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = updateRoleSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message || "Invalid role update" },
        { status: 400 }
      );
    }

    if (existing.slug === "super_admin" && parsed.data.permissions) {
      return Response.json(
        { error: "Super Admin permissions cannot be restricted." },
        { status: 400 }
      );
    }

    const nextPermissions = parsed.data.permissions
      ? Array.from(new Set<RolePermission>(parsed.data.permissions))
      : existing.permissions;

    const [updated] = await withDbRetry(() =>
      db
        .update(roles)
        .set({
          name: parsed.data.name ?? existing.name,
          description:
            parsed.data.description !== undefined
              ? parsed.data.description
              : existing.description,
          color: parsed.data.color ?? existing.color,
          permissions: nextPermissions,
          updatedAt: new Date(),
        })
        .where(eq(roles.id, id))
        .returning()
    );

    await recordAuditLog({
      action: "rbac.role_updated",
      entityType: "role",
      entityId: updated.id,
      userId: session.userId,
      metadata: { name: updated.name, permissions: updated.permissions },
    });

    return Response.json({ role: updated });
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : "Failed to update role",
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
    permission: "roles:manage",
  });
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const { id } = await context.params;
    const [existing] = await withDbRetry(() =>
      db.select().from(roles).where(eq(roles.id, id))
    );
    if (!existing) {
      return Response.json({ error: "Role not found" }, { status: 404 });
    }
    if (existing.isSystem) {
      return Response.json(
        { error: "Built-in system roles cannot be deleted." },
        { status: 400 }
      );
    }

    const assigned = await withDbRetry(() =>
      db
        .select({ id: userScopes.id })
        .from(userScopes)
        .where(eq(userScopes.roleId, id))
        .limit(1)
    );
    if (assigned.length > 0) {
      return Response.json(
        {
          error:
            "Reassign or remove users with this custom role before deleting it.",
        },
        { status: 409 }
      );
    }

    await withDbRetry(() => db.delete(roles).where(eq(roles.id, id)));

    await recordAuditLog({
      action: "rbac.role_deleted",
      entityType: "role",
      entityId: id,
      userId: session.userId,
      metadata: { name: existing.name, slug: existing.slug },
    });

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : "Failed to delete role",
      },
      { status: 500 }
    );
  }
}
