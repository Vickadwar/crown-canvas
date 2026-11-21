/**
 * @file src/app/api/departments/[id]/route.ts
 * @description Single-department CRUD endpoint (`PATCH` edit/toggle active, `DELETE` remove).
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, isDatabaseConfigured, departments, withDbRetry } from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";
import { recordAuditLog } from "@/lib/audit";

const patchDepartmentSchema = z.object({
  code: z
    .string()
    .min(2)
    .max(32)
    .transform((v) => v.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, ""))
    .optional(),
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(400).nullable().optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  icon: z.string().min(1).max(48).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { session, errorResponse } = await requireAdminAccess({
    disallowAuditor: true,
  });
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = patchDepartmentSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid department update", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const [updated] = await withDbRetry(() =>
      db
        .update(departments)
        .set({
          ...(parsed.data.code ? { code: parsed.data.code } : {}),
          ...(parsed.data.name ? { name: parsed.data.name.trim() } : {}),
          ...(parsed.data.description !== undefined
            ? { description: parsed.data.description?.trim() || null }
            : {}),
          ...(parsed.data.accentColor
            ? { accentColor: parsed.data.accentColor }
            : {}),
          ...(parsed.data.icon ? { icon: parsed.data.icon } : {}),
          ...(parsed.data.isActive !== undefined
            ? { isActive: parsed.data.isActive }
            : {}),
        })
        .where(eq(departments.id, id))
        .returning()
    );

    if (!updated) {
      return Response.json({ error: "Department not found" }, { status: 404 });
    }

    await recordAuditLog({
      action: "department.updated",
      entityType: "department",
      entityId: id,
      userId: session.userId,
      metadata: { code: updated.code, isActive: updated.isActive },
    });

    return Response.json({ department: updated });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to update department" },
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
  });
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const { id } = await context.params;
    const [deleted] = await withDbRetry(() =>
      db.delete(departments).where(eq(departments.id, id)).returning()
    );

    if (!deleted) {
      return Response.json({ error: "Department not found" }, { status: 404 });
    }

    await recordAuditLog({
      action: "department.deleted",
      entityType: "department",
      entityId: id,
      userId: session.userId,
      metadata: { code: deleted.code, name: deleted.name },
    });

    return Response.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to delete department";
    const hasDependents = msg.toLowerCase().includes("foreign key") || msg.includes("23503");
    return Response.json(
      {
        error: hasDependents
          ? "This department still owns playlists, media, or slides. Reassign or deactivate it instead."
          : msg,
      },
      { status: hasDependents ? 409 : 500 }
    );
  }
}
