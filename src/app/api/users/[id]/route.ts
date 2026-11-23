/**
 * @file src/app/api/users/[id]/route.ts
 * @description User lifecycle management: edit profile name, suspend/reactivate with
 * immediate session revocation, admin temporary-password reset (forcing change on next
 * login), and permanent user deletion with self-lockout and last-Super-Admin guards.
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, isDatabaseConfigured, withDbRetry, users, userScopes } from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";
import { getAuthPasswordPolicy } from "@/lib/auth-policy";
import {
  generateTemporaryPassword,
  validatePasswordPolicy,
} from "@/lib/permissions";
import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";
import { recordAuditLog } from "@/lib/audit";

const patchUserSchema = z.object({
  action: z.enum(["update_profile", "toggle_active", "reset_password"]).optional(),
  fullName: z.string().trim().min(2).max(150).optional(),
  isActive: z.boolean().optional(),
  temporaryPassword: z.string().min(6).max(128).optional(),
});

async function countActiveSuperAdmins(excludeUserId?: string): Promise<number> {
  const [allUsers, allScopes] = await withDbRetry(() =>
    Promise.all([db.select().from(users), db.select().from(userScopes)])
  );
  const superAdminIds = new Set(
    allScopes.filter((s) => s.role === "super_admin").map((s) => s.userId)
  );
  return allUsers.filter(
    (u) =>
      u.isActive &&
      superAdminIds.has(u.id) &&
      (!excludeUserId || u.id !== excludeUserId)
  ).length;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { session, errorResponse } = await requireAdminAccess({
    disallowAuditor: true,
    permission: "team:manage",
  });
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const { id } = await context.params;
    const [target] = await withDbRetry(() =>
      db.select().from(users).where(eq(users.id, id))
    );
    if (!target) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = patchUserSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message || "Invalid user update" },
        { status: 400 }
      );
    }

    // 1. Admin Temporary Password Reset (forces change on next login)
    if (parsed.data.action === "reset_password") {
      if (!isSupabaseAdminConfigured()) {
        return Response.json(
          { error: "Auth Admin service key is not configured." },
          { status: 503 }
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

      const admin = createSupabaseAdminClient();
      const { error: updateErr } = await admin.auth.admin.updateUserById(id, {
        password: tempPassword,
        email_confirm: true,
      });
      if (updateErr) {
        return Response.json(
          { error: updateErr.message || "Failed to reset user password" },
          { status: 500 }
        );
      }

      // Immediately revoke existing sessions so the user must sign in with the new temp password
      await admin.auth.admin.signOut(id, "global").catch(() => undefined);

      await withDbRetry(() =>
        db
          .update(users)
          .set({
            mustChangePassword: true,
            updatedAt: new Date(),
          })
          .where(eq(users.id, id))
      );

      await recordAuditLog({
        action: "auth.admin_password_reset",
        entityType: "user",
        entityId: id,
        userId: session.userId,
        metadata: { email: target.email },
      });

      return Response.json({
        ok: true,
        email: target.email,
        fullName: target.fullName,
        temporaryPassword: tempPassword,
      });
    }

    // 2. Suspend / Reactivate User
    if (
      parsed.data.action === "toggle_active" ||
      typeof parsed.data.isActive === "boolean"
    ) {
      const nextActive = parsed.data.isActive ?? !target.isActive;

      if (!nextActive && session.userId === id) {
        return Response.json(
          { error: "You cannot suspend your own account." },
          { status: 400 }
        );
      }

      if (!nextActive) {
        const remainingSupers = await countActiveSuperAdmins(id);
        if (remainingSupers === 0) {
          return Response.json(
            { error: "Cannot suspend the last active Super Admin." },
            { status: 400 }
          );
        }
      }

      if (isSupabaseAdminConfigured()) {
        const admin = createSupabaseAdminClient();
        await admin.auth.admin
          .updateUserById(id, {
            ban_duration: nextActive ? "none" : "876000h",
          })
          .catch(() => undefined);

        if (!nextActive) {
          await admin.auth.admin.signOut(id, "global").catch(() => undefined);
        }
      }

      const [updated] = await withDbRetry(() =>
        db
          .update(users)
          .set({ isActive: nextActive, updatedAt: new Date() })
          .where(eq(users.id, id))
          .returning()
      );

      await recordAuditLog({
        action: nextActive ? "auth.user_reactivated" : "auth.user_suspended",
        entityType: "user",
        entityId: id,
        userId: session.userId,
        metadata: { email: target.email },
      });

      return Response.json({ user: updated });
    }

    // 3. Edit Full Name
    if (parsed.data.fullName) {
      const [updated] = await withDbRetry(() =>
        db
          .update(users)
          .set({ fullName: parsed.data.fullName, updatedAt: new Date() })
          .where(eq(users.id, id))
          .returning()
      );

      if (isSupabaseAdminConfigured()) {
        const admin = createSupabaseAdminClient();
        await admin.auth.admin
          .updateUserById(id, {
            user_metadata: { full_name: parsed.data.fullName },
          })
          .catch(() => undefined);
      }

      await recordAuditLog({
        action: "auth.user_updated",
        entityType: "user",
        entityId: id,
        userId: session.userId,
        metadata: { email: target.email, fullName: parsed.data.fullName },
      });

      return Response.json({ user: updated });
    }

    return Response.json({ user: target });
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : "Failed to update user",
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
    permission: "team:manage",
  });
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const { id } = await context.params;
    const [target] = await withDbRetry(() =>
      db.select().from(users).where(eq(users.id, id))
    );
    if (!target) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    if (session.userId === id) {
      return Response.json(
        { error: "You cannot delete your own account." },
        { status: 400 }
      );
    }

    const remainingSupers = await countActiveSuperAdmins(id);
    if (remainingSupers === 0) {
      return Response.json(
        { error: "Cannot delete the last active Super Admin." },
        { status: 400 }
      );
    }

    if (isSupabaseAdminConfigured()) {
      const admin = createSupabaseAdminClient();
      await admin.auth.admin.signOut(id, "global").catch(() => undefined);
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }

    await withDbRetry(() => db.delete(users).where(eq(users.id, id)));

    await recordAuditLog({
      action: "auth.user_deleted",
      entityType: "user",
      entityId: id,
      userId: session.userId,
      metadata: { email: target.email },
    });

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : "Failed to delete user",
      },
      { status: 500 }
    );
  }
}
