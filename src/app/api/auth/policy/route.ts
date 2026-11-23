/**
 * @file src/app/api/auth/policy/route.ts
 * @description Read and update organization-wide password expiry & complexity policy.
 */

import { connection } from "next/server";
import { z } from "zod";
import { db, isDatabaseConfigured, withDbRetry, authSettings } from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";
import { getAuthPasswordPolicy } from "@/lib/auth-policy";
import { recordAuditLog } from "@/lib/audit";

const policySchema = z.object({
  passwordExpiryDays: z.number().int().min(0).max(3650),
  minPasswordLength: z.number().int().min(6).max(32),
  requireUppercase: z.boolean(),
  requireNumber: z.boolean(),
});

export async function GET() {
  await connection();
  const policy = await getAuthPasswordPolicy();
  return Response.json({ policy });
}

export async function PATCH(request: Request) {
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
    const parsed = policySchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid password policy values", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const [saved] = await withDbRetry(() =>
      db
        .insert(authSettings)
        .values({
          id: "default",
          passwordExpiryDays: parsed.data.passwordExpiryDays,
          minPasswordLength: parsed.data.minPasswordLength,
          requireUppercase: parsed.data.requireUppercase,
          requireNumber: parsed.data.requireNumber,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: authSettings.id,
          set: {
            passwordExpiryDays: parsed.data.passwordExpiryDays,
            minPasswordLength: parsed.data.minPasswordLength,
            requireUppercase: parsed.data.requireUppercase,
            requireNumber: parsed.data.requireNumber,
            updatedAt: new Date(),
          },
        })
        .returning()
    );

    await recordAuditLog({
      action: "auth.policy_updated",
      entityType: "auth_settings",
      userId: session.userId,
      metadata: parsed.data,
    });

    return Response.json({
      policy: {
        passwordExpiryDays: saved.passwordExpiryDays,
        minPasswordLength: saved.minPasswordLength,
        requireUppercase: saved.requireUppercase,
        requireNumber: saved.requireNumber,
      },
    });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to save password policy (run npm run db:push if schema is not synced yet).",
      },
      { status: 500 }
    );
  }
}
