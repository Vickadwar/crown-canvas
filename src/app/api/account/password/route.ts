/**
 * @file src/app/api/account/password/route.ts
 * @description Verified password change endpoint powering all 3 flows:
 * 1) Forced temporary password change on first login / after admin reset
 * 2) Expired password renewal per organization expiry policy
 * 3) Voluntary self-service password change from My Account
 */

import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, isDatabaseConfigured, withDbRetry, users } from "@/db";
import { getSessionAccess } from "@/lib/auth-guard";
import { getAuthPasswordPolicy } from "@/lib/auth-policy";
import { validatePasswordPolicy } from "@/lib/permissions";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";
import {
  checkRateLimit,
  getClientIp,
  rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { recordAuditLog } from "@/lib/audit";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6).max(128),
});

export async function POST(request: Request) {
  const rl = checkRateLimit(`pwd_change:${getClientIp(request)}`, 10, 60_000);
  if (!rl.allowed) return rateLimitExceededResponse(rl.retryAfterSeconds);

  const session = await getSessionAccess();
  if (!session.authenticated || !session.userId || !session.email) {
    return Response.json(
      { error: "Please sign in before changing your password." },
      { status: 401 }
    );
  }

  if (!session.isActive) {
    return Response.json(
      { error: "Your account is suspended. Contact your administrator." },
      { status: 403 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey || !isSupabaseAdminConfigured()) {
    return Response.json(
      { error: "Authentication service is not configured." },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Enter both your current password and a valid new password." },
        { status: 400 }
      );
    }

    // 1. Validate against live organization password policy
    const policy = await getAuthPasswordPolicy();
    const policyCheck = validatePasswordPolicy(
      parsed.data.newPassword,
      policy,
      parsed.data.currentPassword
    );
    if (!policyCheck.valid) {
      return Response.json(
        { error: policyCheck.errors[0], errors: policyCheck.errors },
        { status: 400 }
      );
    }

    // 2. Verify current password using a stateless client (does not touch active cookies)
    const verifier = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: verifyErr } = await verifier.auth.signInWithPassword({
      email: session.email,
      password: parsed.data.currentPassword,
    });
    if (verifyErr) {
      return Response.json(
        { error: "Current password is incorrect." },
        { status: 400 }
      );
    }

    // 3. Apply new password via Admin API
    const admin = createSupabaseAdminClient();
    const { error: updateErr } = await admin.auth.admin.updateUserById(
      session.userId,
      { password: parsed.data.newPassword }
    );
    if (updateErr) {
      return Response.json(
        { error: updateErr.message || "Failed to update password." },
        { status: 500 }
      );
    }

    // 4. Clear forced-change flag & reset password expiry clock in Postgres
    const now = new Date();
    if (isDatabaseConfigured()) {
      await withDbRetry(() =>
        db
          .update(users)
          .set({
            mustChangePassword: false,
            passwordChangedAt: now,
            updatedAt: now,
          })
          .where(eq(users.id, session.userId!))
      );
    }

    await recordAuditLog({
      action: session.mustChangePassword
        ? "auth.temp_password_replaced"
        : session.passwordExpired
          ? "auth.expired_password_renewed"
          : "auth.password_changed",
      entityType: "user",
      entityId: session.userId,
      userId: session.userId,
      metadata: { email: session.email },
    });

    return Response.json({
      ok: true,
      passwordChangedAt: now.toISOString(),
    });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to change password",
      },
      { status: 500 }
    );
  }
}
