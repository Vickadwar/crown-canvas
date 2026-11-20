import crypto from "crypto";
import { desc, eq } from "drizzle-orm";
import { connection } from "next/server";
import { z } from "zod";
import { db, isDatabaseConfigured, users, userScopes } from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";
import { recordAuditLog } from "@/lib/audit";

const assignScopeSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2).max(150),
  role: z.enum([
    "super_admin",
    "country_manager",
    "department_lead",
    "branch_manager",
    "content_editor",
    "auditor",
  ]),
  countryId: z.string().uuid().nullable().optional(),
  branchId: z.string().uuid().nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
});

export async function GET() {
  await connection();
  const { errorResponse } = await requireAdminAccess();
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json({ users: [], scopes: [] });
  }

  const [userRows, scopeRows] = await Promise.all([
    db.select().from(users).orderBy(desc(users.createdAt)),
    db.select().from(userScopes).orderBy(desc(userScopes.createdAt)),
  ]);

  return Response.json({
    users: userRows.map((u) => ({
      ...u,
      scopes: scopeRows.filter((s) => s.userId === u.id),
    })),
  });
}

export async function POST(request: Request) {
  const { session, errorResponse } = await requireAdminAccess({
    disallowAuditor: true,
  });
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "DATABASE_URL is not configured in .env.local yet." },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const parsed = assignScopeSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid user scope payload", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const normalizedEmail = parsed.data.email.trim().toLowerCase();
    let [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail));

    if (!existingUser) {
      const [createdUser] = await db
        .insert(users)
        .values({
          id: crypto.randomUUID(),
          email: normalizedEmail,
          fullName: parsed.data.fullName.trim(),
        })
        .returning();
      existingUser = createdUser;
    }

    const [scope] = await db
      .insert(userScopes)
      .values({
        userId: existingUser.id,
        role: parsed.data.role,
        countryId: parsed.data.countryId ?? null,
        branchId: parsed.data.branchId ?? null,
        departmentId: parsed.data.departmentId ?? null,
      })
      .returning();

    await recordAuditLog({
      action: "rbac.scope_assigned",
      entityType: "user_scope",
      entityId: scope.id,
      userId: session.userId,
      metadata: { email: normalizedEmail, role: parsed.data.role },
    });

    return Response.json({ user: existingUser, scope }, { status: 201 });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to assign RBAC scope",
      },
      { status: 500 }
    );
  }
}
