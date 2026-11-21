/**
 * @file src/app/api/departments/route.ts
 * @description CRUD collection endpoint for Departments (`GET`, `POST`).
 */

import { asc } from "drizzle-orm";
import { connection } from "next/server";
import { z } from "zod";
import { db, isDatabaseConfigured, departments, withDbRetry } from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";
import { recordAuditLog } from "@/lib/audit";

const createDepartmentSchema = z.object({
  code: z
    .string()
    .min(2)
    .max(32)
    .transform((v) => v.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "")),
  name: z.string().min(2).max(120),
  description: z.string().max(400).optional().nullable(),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex colour")
    .default("#2563eb"),
  icon: z.string().min(1).max(48).default("Building2"),
});

export async function GET() {
  await connection();
  if (!isDatabaseConfigured()) {
    return Response.json({ departments: [] });
  }
  const rows = await withDbRetry(() =>
    db.select().from(departments).orderBy(asc(departments.name))
  );
  return Response.json({ departments: rows });
}

export async function POST(request: Request) {
  const { session, errorResponse } = await requireAdminAccess({
    disallowAuditor: true,
  });
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const parsed = createDepartmentSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid department payload", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    if (parsed.data.code.length < 2) {
      return Response.json(
        { error: "Department code must have at least 2 letters or digits" },
        { status: 400 }
      );
    }

    const [created] = await withDbRetry(() =>
      db
        .insert(departments)
        .values({
          code: parsed.data.code,
          name: parsed.data.name.trim(),
          description: parsed.data.description?.trim() || null,
          accentColor: parsed.data.accentColor,
          icon: parsed.data.icon,
          isActive: true,
        })
        .returning()
    );

    await recordAuditLog({
      action: "department.created",
      entityType: "department",
      entityId: created.id,
      userId: session.userId,
      metadata: { code: created.code, name: created.name },
    });

    return Response.json({ department: created }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create department";
    const isDuplicate = msg.toLowerCase().includes("unique");
    return Response.json(
      { error: isDuplicate ? "A department with that code already exists." : msg },
      { status: isDuplicate ? 409 : 500 }
    );
  }
}
