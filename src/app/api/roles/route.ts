/**
 * @file src/app/api/roles/route.ts
 * @description List system + custom roles (with member counts) and create custom RBAC roles.
 */

import { connection } from "next/server";
import { z } from "zod";
import { db, isDatabaseConfigured, withDbRetry, roles, userScopes } from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";
import { ensureSystemRoles } from "@/lib/auth-policy";
import { ALL_PERMISSIONS, type RolePermission } from "@/lib/permissions";
import { recordAuditLog } from "@/lib/audit";

const createRoleSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(400).optional().nullable(),
  color: z
    .enum(["purple", "info", "success", "warning", "outline", "danger"])
    .default("info"),
  permissions: z.array(z.enum(ALL_PERMISSIONS)).min(1, "Select at least one permission"),
});

function slugifyRoleName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return base || `custom_role_${Date.now()}`;
}

export async function GET() {
  await connection();
  const { errorResponse } = await requireAdminAccess();
  if (errorResponse) return errorResponse;

  const roleRows = await ensureSystemRoles();
  const scopeRows = isDatabaseConfigured()
    ? await withDbRetry(() => db.select().from(userScopes)).catch(() => [])
    : [];

  return Response.json({
    roles: roleRows.map((r) => ({
      ...r,
      memberCount: new Set(
        scopeRows
          .filter((s) =>
            r.isSystem
              ? s.roleId === r.id || (!s.roleId && s.role === r.slug)
              : s.roleId === r.id
          )
          .map((s) => s.userId)
      ).size,
    })),
  });
}

export async function POST(request: Request) {
  const { session, errorResponse } = await requireAdminAccess({
    disallowAuditor: true,
    permission: "roles:manage",
  });
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const parsed = createRoleSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        {
          error:
            parsed.error.issues[0]?.message || "Invalid custom role payload",
        },
        { status: 400 }
      );
    }

    const existing = await ensureSystemRoles();
    let slug = slugifyRoleName(parsed.data.name);
    if (existing.some((r) => r.slug === slug)) {
      slug = `${slug}_${Math.floor(100 + Math.random() * 900)}`;
    }

    const uniquePermissions = Array.from(
      new Set<RolePermission>(parsed.data.permissions)
    );

    const [created] = await withDbRetry(() =>
      db
        .insert(roles)
        .values({
          slug,
          name: parsed.data.name,
          description: parsed.data.description?.trim() || null,
          color: parsed.data.color,
          isSystem: false,
          permissions: uniquePermissions,
        })
        .returning()
    );

    await recordAuditLog({
      action: "rbac.role_created",
      entityType: "role",
      entityId: created.id,
      userId: session.userId,
      metadata: { name: created.name, slug: created.slug, permissions: uniquePermissions },
    });

    return Response.json({ role: { ...created, memberCount: 0 } }, { status: 201 });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to create custom role",
      },
      { status: 500 }
    );
  }
}
