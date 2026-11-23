/**
 * @file src/app/api/users/route.ts
 * @description Zero-email enterprise user provisioning & scoped RBAC assignment.
 * Creates real Supabase Auth accounts with a Temporary Password (forced change on
 * first login) and syncs exact Auth UUIDs into `public.users` and `user_scopes`.
 */

import crypto from "crypto";
import { desc, eq } from "drizzle-orm";
import { connection } from "next/server";
import { z } from "zod";
import {
  db,
  isDatabaseConfigured,
  withDbRetry,
  roles,
  users,
  userScopes,
} from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";
import { ensureSystemRoles, getAuthPasswordPolicy } from "@/lib/auth-policy";
import {
  generateTemporaryPassword,
  getSystemRoleName,
  validatePasswordPolicy,
  type SystemRoleSlug,
} from "@/lib/permissions";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";
import { recordAuditLog } from "@/lib/audit";

const SYSTEM_ROLE_ENUM = [
  "super_admin",
  "country_manager",
  "department_lead",
  "branch_manager",
  "content_editor",
  "auditor",
] as const;

const createUserOrScopeSchema = z.object({
  mode: z.enum(["create", "scope_only"]).default("create"),
  email: z.string().trim().email(),
  fullName: z.string().trim().min(2).max(150).optional(),
  temporaryPassword: z.string().min(6).max(128).optional(),
  role: z.enum(SYSTEM_ROLE_ENUM).optional(),
  roleId: z.string().uuid().nullable().optional(),
  countryId: z.string().uuid().nullable().optional(),
  branchId: z.string().uuid().nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
});

export async function GET() {
  await connection();
  const { errorResponse } = await requireAdminAccess({
    permission: "team:manage",
  });
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json({ users: [], roles: [] });
  }

  const [userRows, scopeRows, roleRows] = await Promise.all([
    withDbRetry(() => db.select().from(users).orderBy(desc(users.createdAt))),
    withDbRetry(() =>
      db.select().from(userScopes).orderBy(desc(userScopes.createdAt))
    ),
    ensureSystemRoles(),
  ]);

  const roleById = new Map(roleRows.map((r) => [r.id, r]));

  return Response.json({
    roles: roleRows,
    users: userRows.map((u) => ({
      ...u,
      scopes: scopeRows
        .filter((s) => s.userId === u.id)
        .map((s) => {
          const customRole = s.roleId ? roleById.get(s.roleId) : undefined;
          return {
            ...s,
            roleName: customRole?.name ?? getSystemRoleName(s.role),
            roleColor: customRole?.color ?? null,
          };
        }),
    })),
  });
}

export async function POST(request: Request) {
  const { session, errorResponse } = await requireAdminAccess({
    disallowAuditor: true,
    permission: "team:manage",
  });
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "DATABASE_URL is not configured yet." },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const parsed = createUserOrScopeSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        {
          error:
            parsed.error.issues[0]?.message || "Invalid user account payload",
        },
        { status: 400 }
      );
    }

    const normalizedEmail = parsed.data.email.toLowerCase();
    const roleRows = await ensureSystemRoles();

    // Resolve system role enum + custom roleId cleanly
    let resolvedRoleId: string | null = parsed.data.roleId ?? null;
    let resolvedEnumRole: SystemRoleSlug = parsed.data.role ?? "content_editor";

    if (resolvedRoleId) {
      const matched = roleRows.find((r) => r.id === resolvedRoleId);
      if (!matched) {
        const [fromDb] = await withDbRetry(() =>
          db.select().from(roles).where(eq(roles.id, resolvedRoleId!))
        );
        if (!fromDb) {
          return Response.json(
            { error: "Selected role does not exist." },
            { status: 400 }
          );
        }
        resolvedEnumRole = SYSTEM_ROLE_ENUM.includes(
          fromDb.slug as SystemRoleSlug
        )
          ? (fromDb.slug as SystemRoleSlug)
          : fromDb.permissions.includes("media:approve")
            ? "department_lead"
            : "content_editor";
      } else {
        resolvedEnumRole = SYSTEM_ROLE_ENUM.includes(
          matched.slug as SystemRoleSlug
        )
          ? (matched.slug as SystemRoleSlug)
          : matched.permissions.includes("media:approve")
            ? "department_lead"
            : "content_editor";
        if (matched.id.startsWith("sys-")) {
          resolvedRoleId = null;
        }
      }
    } else {
      const matchedSystem = roleRows.find((r) => r.slug === resolvedEnumRole);
      if (matchedSystem && !matchedSystem.id.startsWith("sys-")) {
        resolvedRoleId = matchedSystem.id;
      }
    }

    // Check existing Postgres user first
    let [existingUser] = await withDbRetry(() =>
      db.select().from(users).where(eq(users.email, normalizedEmail))
    );

    let issuedTempPassword: string | null = null;
    let createdNewAccount = false;

    if (!existingUser) {
      const fullName = parsed.data.fullName?.trim();
      if (!fullName || fullName.length < 2) {
        return Response.json(
          { error: "Full name is required when creating a new user account." },
          { status: 400 }
        );
      }

      const policy = await getAuthPasswordPolicy();
      const tempPassword =
        parsed.data.temporaryPassword?.trim() ||
        generateTemporaryPassword(Math.max(12, policy.minPasswordLength));

      const check = validatePasswordPolicy(tempPassword, policy);
      if (!check.valid) {
        return Response.json({ error: check.errors[0] }, { status: 400 });
      }

      let userId: string = crypto.randomUUID();

      if (isSupabaseAdminConfigured()) {
        const admin = createSupabaseAdminClient();
        const { data: listData } = await admin.auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        });
        const existingAuth = listData?.users?.find(
          (u) => u.email?.toLowerCase() === normalizedEmail
        );

        if (existingAuth) {
          const { data: updatedAuth, error: updateErr } =
            await admin.auth.admin.updateUserById(existingAuth.id, {
              password: tempPassword,
              email_confirm: true,
              ban_duration: "none",
              user_metadata: { full_name: fullName },
            });
          if (updateErr || !updatedAuth.user) {
            return Response.json(
              {
                error:
                  updateErr?.message ||
                  "Failed to update existing auth account",
              },
              { status: 500 }
            );
          }
          userId = updatedAuth.user.id;
        } else {
          const { data: createdAuth, error: createErr } =
            await admin.auth.admin.createUser({
              email: normalizedEmail,
              password: tempPassword,
              email_confirm: true,
              user_metadata: { full_name: fullName },
            });
          if (createErr || !createdAuth.user) {
            return Response.json(
              {
                error:
                  createErr?.message ||
                  "Failed to create authentication account",
              },
              { status: 500 }
            );
          }
          userId = createdAuth.user.id;
        }
      }

      const [createdUser] = await withDbRetry(() =>
        db
          .insert(users)
          .values({
            id: userId,
            email: normalizedEmail,
            fullName,
            isActive: true,
            mustChangePassword: true,
            passwordChangedAt: new Date(),
          })
          .returning()
      );

      existingUser = createdUser;
      issuedTempPassword = tempPassword;
      createdNewAccount = true;
    } else if (parsed.data.mode === "create" && parsed.data.temporaryPassword) {
      // Admin explicitly requested creating a duplicate email
      return Response.json(
        {
          error:
            "An account with this email already exists. Use 'Add Scope' or 'Reset Password' on the user card instead.",
        },
        { status: 409 }
      );
    }

    const [scope] = await withDbRetry(() =>
      db
        .insert(userScopes)
        .values({
          userId: existingUser.id,
          role: resolvedEnumRole,
          roleId: resolvedRoleId,
          countryId: parsed.data.countryId ?? null,
          branchId: parsed.data.branchId ?? null,
          departmentId: parsed.data.departmentId ?? null,
        })
        .returning()
    );

    await recordAuditLog({
      action: createdNewAccount
        ? "auth.user_created_temp_password"
        : "rbac.scope_assigned",
      entityType: createdNewAccount ? "user" : "user_scope",
      entityId: createdNewAccount ? existingUser.id : scope.id,
      userId: session.userId,
      metadata: {
        email: normalizedEmail,
        role: resolvedEnumRole,
        roleId: resolvedRoleId,
      },
    });

    return Response.json(
      {
        user: existingUser,
        scope,
        createdNewAccount,
        temporaryPassword: issuedTempPassword,
      },
      { status: 201 }
    );
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to provision user account",
      },
      { status: 500 }
    );
  }
}
