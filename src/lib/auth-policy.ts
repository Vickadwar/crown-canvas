/**
 * @file src/lib/auth-policy.ts
 * @description Server-side helpers for reading/updating organization password policy
 * (`auth_settings`) and idempotently syncing the 6 built-in system roles in `roles`.
 */

import { eq } from "drizzle-orm";
import { db, isDatabaseConfigured, withDbRetry, authSettings, roles } from "@/db";
import {
  DEFAULT_PASSWORD_POLICY,
  SYSTEM_ROLE_DEFINITIONS,
  type PasswordPolicyConfig,
  type RolePermission,
} from "@/lib/permissions";

export async function getAuthPasswordPolicy(): Promise<PasswordPolicyConfig> {
  if (!isDatabaseConfigured()) return { ...DEFAULT_PASSWORD_POLICY };

  try {
    const rows = await withDbRetry(() =>
      db
        .select()
        .from(authSettings)
        .where(eq(authSettings.id, "default"))
        .limit(1)
    );
    const row = rows[0];
    if (!row) {
      return { ...DEFAULT_PASSWORD_POLICY };
    }
    return {
      passwordExpiryDays: row.passwordExpiryDays,
      minPasswordLength: row.minPasswordLength,
      requireUppercase: row.requireUppercase,
      requireNumber: row.requireNumber,
    };
  } catch {
    // Graceful fallback before `npm run db:push` creates `auth_settings`
    return { ...DEFAULT_PASSWORD_POLICY };
  }
}

export async function ensureSystemRoles(): Promise<
  Array<{
    id: string;
    slug: string;
    name: string;
    description: string | null;
    color: string;
    isSystem: boolean;
    permissions: RolePermission[];
  }>
> {
  if (!isDatabaseConfigured()) {
    return SYSTEM_ROLE_DEFINITIONS.map((r) => ({
      id: `sys-${r.slug}`,
      slug: r.slug,
      name: r.name,
      description: r.description,
      color: r.color,
      isSystem: true,
      permissions: r.permissions,
    }));
  }

  try {
    return await withDbRetry(async () => {
      const existing = await db.select().from(roles);
      const existingSlugs = new Set(existing.map((r) => r.slug));

      const missing = SYSTEM_ROLE_DEFINITIONS.filter(
        (def) => !existingSlugs.has(def.slug)
      );

      if (missing.length > 0) {
        await db
          .insert(roles)
          .values(
            missing.map((def) => ({
              slug: def.slug,
              name: def.name,
              description: def.description,
              color: def.color,
              isSystem: true,
              permissions: def.permissions,
            }))
          )
          .onConflictDoNothing();
        return await db.select().from(roles);
      }

      return existing;
    });
  } catch {
    // Graceful fallback before `npm run db:push` creates `roles`
    return SYSTEM_ROLE_DEFINITIONS.map((r) => ({
      id: `sys-${r.slug}`,
      slug: r.slug,
      name: r.name,
      description: r.description,
      color: r.color,
      isSystem: true,
      permissions: r.permissions,
    }));
  }
}
