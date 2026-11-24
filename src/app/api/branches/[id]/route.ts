/**
 * @file src/app/api/branches/[id]/route.ts
 * @description Single-location CRUD endpoint (`PATCH` edit or activate/deactivate, `DELETE` remove).
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, isDatabaseConfigured, branches, withDbRetry } from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";
import { recordAuditLog } from "@/lib/audit";
import { broadcastFleetSignal } from "@/lib/realtime";

const dayHoursRuleSchema = z.object({
  open: z.boolean(),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
});

const holidayExceptionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  label: z.string().min(1).max(100),
  mode: z.enum(["closed", "open_override"]),
  start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  end: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

const operatingScheduleSchema = z
  .object({
    days: z.record(z.enum(["0", "1", "2", "3", "4", "5", "6"]), dayHoursRuleSchema),
    exceptions: z.array(holidayExceptionSchema).max(60).default([]),
  })
  .nullable()
  .optional();

const patchBranchSchema = z.object({
  countryId: z.string().uuid().optional(),
  code: z
    .string()
    .min(2)
    .max(32)
    .transform((v) => v.trim().toUpperCase())
    .optional(),
  name: z.string().min(2).max(150).optional(),
  branchType: z.enum(["showroom", "depot", "factory", "hq"]).optional(),
  city: z.string().min(2).max(100).optional(),
  address: z.string().max(300).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  openingTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  closingTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  operatingSchedule: operatingScheduleSchema,
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
    const parsed = patchBranchSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid location update", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const [updated] = await withDbRetry(() =>
      db
        .update(branches)
        .set({
          ...parsed.data,
          updatedAt: new Date(),
        })
        .where(eq(branches.id, id))
        .returning()
    );

    if (!updated) {
      return Response.json({ error: "Location not found" }, { status: 404 });
    }

    await Promise.all([
      broadcastFleetSignal("manifest_refresh", {
        reason: "branch_updated",
        branchId: id,
      }),
      recordAuditLog({
        action: "branch.updated",
        entityType: "branch",
        entityId: id,
        userId: session.userId,
        metadata: { code: updated.code, isActive: updated.isActive },
      }),
    ]);

    return Response.json({ branch: updated });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to update location" },
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
      db.delete(branches).where(eq(branches.id, id)).returning()
    );

    if (!deleted) {
      return Response.json({ error: "Location not found" }, { status: 404 });
    }

    await recordAuditLog({
      action: "branch.deleted",
      entityType: "branch",
      entityId: id,
      userId: session.userId,
      metadata: { code: deleted.code, name: deleted.name },
    });

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to delete location" },
      { status: 500 }
    );
  }
}
