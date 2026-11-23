/**
 * @file src/app/api/account/route.ts
 * @description Self-service profile inspection and display-name update for the signed-in user.
 */

import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { z } from "zod";
import { db, isDatabaseConfigured, withDbRetry, users } from "@/db";
import { getSessionAccess } from "@/lib/auth-guard";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";
import { recordAuditLog } from "@/lib/audit";

const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(150),
});

export async function GET() {
  await connection();
  const session = await getSessionAccess();
  if (!session.authenticated) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }
  return Response.json({ session });
}

export async function PATCH(request: Request) {
  const session = await getSessionAccess();
  if (!session.authenticated || !session.userId) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!session.isActive) {
    return Response.json({ error: "Account suspended" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Full name must be at least 2 characters." },
        { status: 400 }
      );
    }

    if (isDatabaseConfigured()) {
      await withDbRetry(() =>
        db
          .update(users)
          .set({
            fullName: parsed.data.fullName,
            updatedAt: new Date(),
          })
          .where(eq(users.id, session.userId!))
      );
    }

    if (isSupabaseAdminConfigured()) {
      const admin = createSupabaseAdminClient();
      await admin.auth.admin
        .updateUserById(session.userId, {
          user_metadata: { full_name: parsed.data.fullName },
        })
        .catch(() => undefined);
    }

    await recordAuditLog({
      action: "account.profile_updated",
      entityType: "user",
      entityId: session.userId,
      userId: session.userId,
      metadata: { fullName: parsed.data.fullName },
    });

    return Response.json({ ok: true, fullName: parsed.data.fullName });
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : "Failed to update profile",
      },
      { status: 500 }
    );
  }
}
