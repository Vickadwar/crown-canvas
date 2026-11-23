/**
 * @file src/lib/auth-guard.ts
 * @description Enterprise Supabase Auth + Custom/System Scoped RBAC guard with immediate
 * suspension lockout, forced first-login password change, and configurable password expiry.
 */

import { eq } from "drizzle-orm";
import {
  db,
  isDatabaseConfigured,
  withDbRetry,
  roles,
  userScopes,
  users,
} from "@/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { getAuthPasswordPolicy } from "@/lib/auth-policy";
import {
  ALL_PERMISSIONS,
  DEFAULT_PASSWORD_POLICY,
  computePasswordExpiryStatus,
  getSystemRoleName,
  hasPermission,
  resolveEffectivePermissions,
  type PasswordPolicyConfig,
  type RolePermission,
} from "@/lib/permissions";

export interface UserScopeEntry {
  id: string;
  role: string;
  roleId: string | null;
  roleName: string;
  countryId: string | null;
  branchId: string | null;
  departmentId: string | null;
}

export interface SessionAccessContext {
  enforceAuth: boolean;
  authenticated: boolean;
  userId: string | null;
  email: string | null;
  fullName: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  passwordExpired: boolean;
  passwordExpiresInDays: number | null;
  passwordPolicy: PasswordPolicyConfig;
  permissions: RolePermission[];
  scopes: UserScopeEntry[];
}

export function isAuthEnforced(): boolean {
  return process.env.NEXT_PUBLIC_REQUIRE_AUTH === "true";
}

function createAnonymousSession(
  enforceAuth: boolean,
  passwordPolicy: PasswordPolicyConfig
): SessionAccessContext {
  return {
    enforceAuth,
    authenticated: false,
    userId: null,
    email: null,
    fullName: null,
    isActive: true,
    mustChangePassword: false,
    passwordExpired: false,
    passwordExpiresInDays: null,
    passwordPolicy,
    permissions: enforceAuth ? [] : [...ALL_PERMISSIONS],
    scopes: [],
  };
}

export async function getSessionAccess(): Promise<SessionAccessContext> {
  const enforceAuth = isAuthEnforced();
  const passwordPolicy = await getAuthPasswordPolicy();

  if (!isSupabaseConfigured()) {
    return createAnonymousSession(enforceAuth, passwordPolicy);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await Promise.race([
      supabase.auth.getUser(),
      new Promise<{ data: { user: null } }>((resolve) =>
        setTimeout(() => resolve({ data: { user: null } }), 5000)
      ),
    ]);

    if (!user) {
      return createAnonymousSession(enforceAuth, passwordPolicy);
    }

    let scopes: UserScopeEntry[] = [];
    let fullName =
      (user.user_metadata?.full_name as string) || user.email || "User";
    let isActive = true;
    let mustChangePassword = false;
    let passwordChangedAt: Date | string | null = null;
    let permissions: RolePermission[] = [];

    if (isDatabaseConfigured()) {
      await withDbRetry(async () => {
        let [dbUser] = await db
          .select()
          .from(users)
          .where(eq(users.id, user.id));

        const normalizedEmail = user.email?.trim().toLowerCase();

        // Reconcile any pre-staged user row created by email before Auth UUID sync
        if (!dbUser && normalizedEmail) {
          const [byEmail] = await db
            .select()
            .from(users)
            .where(eq(users.email, normalizedEmail));

          if (byEmail && byEmail.id !== user.id) {
            const oldId = byEmail.id;
            const oldScopes = await db
              .select()
              .from(userScopes)
              .where(eq(userScopes.userId, oldId));

            await db.delete(users).where(eq(users.id, oldId));

            const [recreated] = await db
              .insert(users)
              .values({
                id: user.id,
                email: normalizedEmail,
                fullName: byEmail.fullName,
                avatarUrl: byEmail.avatarUrl,
                isActive: byEmail.isActive,
                mustChangePassword: byEmail.mustChangePassword,
                passwordChangedAt: byEmail.passwordChangedAt,
                lastLoginAt: new Date(),
              })
              .returning();
            dbUser = recreated;

            if (oldScopes.length > 0 && recreated) {
              await db.insert(userScopes).values(
                oldScopes.map((s) => ({
                  userId: recreated.id,
                  role: s.role,
                  roleId: s.roleId,
                  countryId: s.countryId,
                  branchId: s.branchId,
                  departmentId: s.departmentId,
                }))
              );
            }
          }
        }

        // Auto-bootstrap first authenticated user as Super Admin if zero users exist
        if (!dbUser && normalizedEmail) {
          const existingCount = await db
            .select({ id: users.id })
            .from(users)
            .limit(1);

          const [inserted] = await db
            .insert(users)
            .values({
              id: user.id,
              email: normalizedEmail,
              fullName,
              isActive: true,
              mustChangePassword: false,
              passwordChangedAt: new Date(),
              lastLoginAt: new Date(),
            })
            .onConflictDoNothing()
            .returning();
          dbUser = inserted;

          if (existingCount.length === 0 && inserted) {
            await db.insert(userScopes).values({
              userId: inserted.id,
              role: "super_admin",
            });
          }
        }

        if (dbUser) {
          fullName = dbUser.fullName;
          isActive = dbUser.isActive;
          mustChangePassword = dbUser.mustChangePassword ?? false;
          passwordChangedAt = dbUser.passwordChangedAt ?? dbUser.createdAt;

          // Stamp lastLoginAt at most every 15 minutes to avoid DB write chatter
          const lastMs = dbUser.lastLoginAt ? dbUser.lastLoginAt.getTime() : 0;
          if (Date.now() - lastMs > 15 * 60 * 1000) {
            await db
              .update(users)
              .set({ lastLoginAt: new Date() })
              .where(eq(users.id, dbUser.id))
              .catch(() => undefined);
          }
        }

        const [dbScopes, roleRows] = await Promise.all([
          db.select().from(userScopes).where(eq(userScopes.userId, user.id)),
          db
            .select()
            .from(roles)
            .catch(() => []),
        ]);

        const roleById = new Map(roleRows.map((r) => [r.id, r]));

        scopes = dbScopes.map((s) => {
          const customRole = s.roleId ? roleById.get(s.roleId) : undefined;
          return {
            id: s.id,
            role: s.role,
            roleId: s.roleId ?? null,
            roleName: customRole?.name ?? getSystemRoleName(s.role),
            countryId: s.countryId,
            branchId: s.branchId,
            departmentId: s.departmentId,
          };
        });

        permissions = resolveEffectivePermissions(
          scopes,
          new Map(
            roleRows.map((r) => [
              r.id,
              { permissions: (r.permissions ?? []) as RolePermission[] },
            ])
          )
        );
      });
    }

    const expiry = computePasswordExpiryStatus(
      passwordChangedAt,
      passwordPolicy.passwordExpiryDays
    );

    return {
      enforceAuth,
      authenticated: true,
      userId: user.id,
      email: user.email ?? null,
      fullName,
      isActive,
      mustChangePassword,
      passwordExpired: expiry.expired,
      passwordExpiresInDays: expiry.expiresInDays,
      passwordPolicy,
      permissions: enforceAuth ? permissions : [...ALL_PERMISSIONS],
      scopes,
    };
  } catch {
    return createAnonymousSession(enforceAuth, DEFAULT_PASSWORD_POLICY);
  }
}

export interface AccessRequirement {
  countryId?: string | null;
  branchId?: string | null;
  departmentId?: string | null;
  disallowAuditor?: boolean;
  permission?: RolePermission;
  allowPendingPasswordChange?: boolean;
}

/**
 * Guards CMS mutation and admin APIs when `NEXT_PUBLIC_REQUIRE_AUTH=true`.
 * Enforces authentication, suspension lockout, mandatory password change/expiry,
 * granular role permissions, and organizational scopes.
 */
export async function requireAdminAccess(
  req?: AccessRequirement
): Promise<{ session: SessionAccessContext; errorResponse: Response | null }> {
  const session = await getSessionAccess();
  if (!session.enforceAuth) {
    return { session, errorResponse: null };
  }

  if (!session.authenticated) {
    return {
      session,
      errorResponse: Response.json(
        {
          code: "UNAUTHENTICATED",
          error: "Authentication required. Please sign in at /login.",
        },
        { status: 401 }
      ),
    };
  }

  if (!session.isActive) {
    return {
      session,
      errorResponse: Response.json(
        {
          code: "ACCOUNT_SUSPENDED",
          error: "Your account has been suspended. Contact your administrator.",
        },
        { status: 403 }
      ),
    };
  }

  if (
    !req?.allowPendingPasswordChange &&
    (session.mustChangePassword || session.passwordExpired)
  ) {
    return {
      session,
      errorResponse: Response.json(
        {
          code: "PASSWORD_CHANGE_REQUIRED",
          reason: session.mustChangePassword ? "temporary" : "expired",
          error: session.mustChangePassword
            ? "You must replace your temporary password before continuing."
            : "Your password has expired. Please set a new password to continue.",
        },
        { status: 428 }
      ),
    };
  }

  if (session.scopes.length === 0) {
    return {
      session,
      errorResponse: Response.json(
        {
          code: "NO_ROLE",
          error: "No role assigned to your account yet. Contact your administrator.",
        },
        { status: 403 }
      ),
    };
  }

  const isSuperAdmin = session.scopes.some((s) => s.role === "super_admin");
  if (isSuperAdmin) {
    return { session, errorResponse: null };
  }

  if (
    req?.disallowAuditor &&
    session.scopes.every((s) => s.role === "auditor" && !s.roleId)
  ) {
    return {
      session,
      errorResponse: Response.json(
        { error: "Auditors have read-only access." },
        { status: 403 }
      ),
    };
  }

  if (req?.permission && !hasPermission(session.permissions, req.permission)) {
    return {
      session,
      errorResponse: Response.json(
        {
          error: `Missing required permission (${req.permission}). Contact your administrator.`,
        },
        { status: 403 }
      ),
    };
  }

  const matchesScope = session.scopes.some((s) => {
    if (req?.countryId && s.countryId && s.countryId !== req.countryId) {
      return false;
    }
    if (req?.branchId && s.branchId && s.branchId !== req.branchId) {
      return false;
    }
    if (
      req?.departmentId &&
      s.departmentId &&
      s.departmentId !== req.departmentId
    ) {
      return false;
    }
    return true;
  });

  if (!matchesScope) {
    return {
      session,
      errorResponse: Response.json(
        { error: "Insufficient region, location, or department scope." },
        { status: 403 }
      ),
    };
  }

  return { session, errorResponse: null };
}

/**
 * Maker-Checker approval helper:
 * Users with `media:approve` (Super Admin, Regional Manager, Department Lead,
 * or custom approver roles) auto-approve their uploads/slides.
 */
export function canAutoApproveContent(session: SessionAccessContext): boolean {
  if (!session.enforceAuth) return true;
  return (
    hasPermission(session.permissions, "media:approve") ||
    session.scopes.some((s) =>
      ["super_admin", "country_manager", "department_lead"].includes(s.role)
    )
  );
}

export function isSuperAdminSession(session: SessionAccessContext): boolean {
  if (!session.enforceAuth) return true;
  return session.scopes.some((s) => s.role === "super_admin");
}

export function matchesUserScopes(
  session: SessionAccessContext,
  entity: {
    countryId?: string | null;
    branchId?: string | null;
    departmentId?: string | null;
  }
): boolean {
  if (isSuperAdminSession(session)) return true;
  if (session.scopes.length === 0) return false;

  return session.scopes.some((s) => {
    if (s.countryId && entity.countryId && s.countryId !== entity.countryId) {
      return false;
    }
    if (s.branchId && entity.branchId && s.branchId !== entity.branchId) {
      return false;
    }
    if (
      s.departmentId &&
      entity.departmentId &&
      s.departmentId !== entity.departmentId
    ) {
      return false;
    }
    return true;
  });
}
