/**
 * @file src/lib/auth-guard.ts
 * @description Enterprise Supabase Auth + scoped RBAC guard (`super_admin`, `country_manager`,
 * `department_lead`, `branch_manager`, `content_editor`, `auditor`) enforced when
 * `NEXT_PUBLIC_REQUIRE_AUTH=true`.
 */

import { eq } from "drizzle-orm";
import { db, isDatabaseConfigured, withDbRetry, userScopes, users } from "@/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";

export interface UserScopeEntry {
  id: string;
  role: string;
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
  scopes: UserScopeEntry[];
}

export function isAuthEnforced(): boolean {
  return process.env.NEXT_PUBLIC_REQUIRE_AUTH === "true";
}

export async function getSessionAccess(): Promise<SessionAccessContext> {
  const enforceAuth = isAuthEnforced();

  if (!isSupabaseConfigured()) {
    return {
      enforceAuth,
      authenticated: false,
      userId: null,
      email: null,
      fullName: null,
      scopes: [],
    };
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
      return {
        enforceAuth,
        authenticated: false,
        userId: null,
        email: null,
        fullName: null,
        scopes: [],
      };
    }

    let scopes: UserScopeEntry[] = [];
    let fullName =
      (user.user_metadata?.full_name as string) || user.email || "User";

    if (isDatabaseConfigured()) {
      await withDbRetry(async () => {
        const [existingUser] = await db
          .select()
          .from(users)
          .where(eq(users.id, user.id));
        let dbUser = existingUser;

        // Auto-bootstrap first authenticated user as Super Admin
        if (!dbUser && user.email) {
          const existingCount = await db
            .select({ id: users.id })
            .from(users)
            .limit(1);

          const [inserted] = await db
            .insert(users)
            .values({
              id: user.id,
              email: user.email,
              fullName,
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
        }

        const dbScopes = await db
          .select()
          .from(userScopes)
          .where(eq(userScopes.userId, user.id));

        scopes = dbScopes.map((s) => ({
          id: s.id,
          role: s.role,
          countryId: s.countryId,
          branchId: s.branchId,
          departmentId: s.departmentId,
        }));
      });
    }

    return {
      enforceAuth,
      authenticated: true,
      userId: user.id,
      email: user.email ?? null,
      fullName,
      scopes,
    };
  } catch {
    return {
      enforceAuth,
      authenticated: false,
      userId: null,
      email: null,
      fullName: null,
      scopes: [],
    };
  }
}

export interface AccessRequirement {
  countryId?: string | null;
  branchId?: string | null;
  departmentId?: string | null;
  disallowAuditor?: boolean;
}

/**
 * Guards CMS mutation and admin APIs when `NEXT_PUBLIC_REQUIRE_AUTH=true`.
 * Returns `null` if allowed, or an HTTP 401/403 `Response` if blocked.
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
        { error: "Authentication required. Please sign in at /login." },
        { status: 401 }
      ),
    };
  }

  if (session.scopes.length === 0) {
    return {
      session,
      errorResponse: Response.json(
        { error: "No RBAC role assigned to your account yet." },
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
    session.scopes.every((s) => s.role === "auditor")
  ) {
    return {
      session,
      errorResponse: Response.json(
        { error: "Auditors have read-only access." },
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
        { error: "Insufficient country, branch, or department scope." },
        { status: 403 }
      ),
    };
  }

  return { session, errorResponse: null };
}

/**
 * Maker-Checker approval helper:
 * `super_admin`, `country_manager`, and `department_lead` (or unauthenticated POC mode)
 * auto-approve their own uploads/slides; `branch_manager` and `content_editor` submit
 * into `pending_approval` for governance review.
 */
export function canAutoApproveContent(session: SessionAccessContext): boolean {
  if (!session.enforceAuth) return true;
  return session.scopes.some((s) =>
    ["super_admin", "country_manager", "department_lead"].includes(s.role)
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
