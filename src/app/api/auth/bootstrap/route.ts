/**
 * @file src/app/api/auth/bootstrap/route.ts
 * @description First-time Super Admin onboarding endpoint. Active ONLY when the `users`
 * table has 0 records; permanently returns HTTP 403 once the initial Super Admin exists.
 */

import { connection } from "next/server";
import { z } from "zod";
import { db, isDatabaseConfigured, withDbRetry, users, userScopes } from "@/db";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { isAuthEnforced } from "@/lib/auth-guard";
import { ensureSystemRoles, getAuthPasswordPolicy } from "@/lib/auth-policy";
import { validatePasswordPolicy } from "@/lib/permissions";
import { recordAuditLog } from "@/lib/audit";

const bootstrapSchema = z.object({
  fullName: z.string().trim().min(2).max(150),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
});

export async function GET() {
  await connection();
  const authConfigured = isSupabaseConfigured() && isSupabaseAdminConfigured();
  const dbReady = isDatabaseConfigured();
  const policy = await getAuthPasswordPolicy();

  if (!dbReady) {
    return Response.json({
      needsSetup: false,
      authEnforced: isAuthEnforced(),
      authConfigured,
      dbReady: false,
      policy,
    });
  }

  try {
    const existing = await withDbRetry(() =>
      db.select({ id: users.id }).from(users).limit(1)
    );
    return Response.json({
      needsSetup: existing.length === 0,
      authEnforced: isAuthEnforced(),
      authConfigured,
      dbReady: true,
      policy,
    });
  } catch {
    return Response.json({
      needsSetup: false,
      authEnforced: isAuthEnforced(),
      authConfigured,
      dbReady: false,
      policy,
    });
  }
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured() || !isSupabaseAdminConfigured()) {
    return Response.json(
      {
        error:
          "Database and Auth Admin credentials (SUPABASE_SERVICE_ROLE_KEY) must be configured first.",
      },
      { status: 503 }
    );
  }

  try {
    const existing = await withDbRetry(() =>
      db.select({ id: users.id }).from(users).limit(1)
    );
    if (existing.length > 0) {
      return Response.json(
        {
          error:
            "Initial Super Admin has already been configured. Sign in at /login.",
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = bootstrapSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Provide a valid full name, work email, and password." },
        { status: 400 }
      );
    }

    const policy = await getAuthPasswordPolicy();
    const check = validatePasswordPolicy(parsed.data.password, policy);
    if (!check.valid) {
      return Response.json({ error: check.errors[0] }, { status: 400 });
    }

    const normalizedEmail = parsed.data.email.toLowerCase();
    const fullName = parsed.data.fullName;
    const admin = createSupabaseAdminClient();

    // Check if Supabase Auth already has this email (e.g. created manually earlier)
    const { data: listData } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    let authUser = listData?.users?.find(
      (u) => u.email?.toLowerCase() === normalizedEmail
    );

    if (authUser) {
      const { data: updated, error: updateErr } =
        await admin.auth.admin.updateUserById(authUser.id, {
          password: parsed.data.password,
          email_confirm: true,
          ban_duration: "none",
          user_metadata: { full_name: fullName },
        });
      if (updateErr || !updated.user) {
        return Response.json(
          { error: updateErr?.message || "Failed to initialize auth account" },
          { status: 500 }
        );
      }
      authUser = updated.user;
    } else {
      const { data: created, error: createErr } =
        await admin.auth.admin.createUser({
          email: normalizedEmail,
          password: parsed.data.password,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });
      if (createErr || !created.user) {
        return Response.json(
          { error: createErr?.message || "Failed to create auth account" },
          { status: 500 }
        );
      }
      authUser = created.user;
    }

    const roleRows = await ensureSystemRoles();
    const superAdminRole = roleRows.find((r) => r.slug === "super_admin");

    await withDbRetry(async () => {
      await db
        .insert(users)
        .values({
          id: authUser.id,
          email: normalizedEmail,
          fullName,
          isActive: true,
          mustChangePassword: false,
          passwordChangedAt: new Date(),
          lastLoginAt: new Date(),
        })
        .onConflictDoNothing();

      await db.insert(userScopes).values({
        userId: authUser.id,
        role: "super_admin",
        roleId:
          superAdminRole && !superAdminRole.id.startsWith("sys-")
            ? superAdminRole.id
            : null,
      });
    });

    await recordAuditLog({
      action: "auth.bootstrap_super_admin",
      entityType: "user",
      entityId: authUser.id,
      userId: authUser.id,
      metadata: { email: normalizedEmail },
    });

    return Response.json(
      {
        ok: true,
        user: { id: authUser.id, email: normalizedEmail, fullName },
      },
      { status: 201 }
    );
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to initialize Super Admin account",
      },
      { status: 500 }
    );
  }
}
