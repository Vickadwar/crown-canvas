/**
 * @file src/app/api/recognitions/[id]/route.ts
 * @description Update or delete an Employee Recognition spotlight record.
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  isDatabaseConfigured,
  withDbRetry,
  employeeRecognitions,
} from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";
import { broadcastFleetSignal } from "@/lib/realtime";

const patchRecognitionSchema = z.object({
  employeeName: z.string().trim().min(2).max(160).optional(),
  locationName: z.string().trim().min(1).max(150).optional(),
  branchId: z.string().uuid().nullable().optional(),
  departmentName: z.string().trim().min(1).max(120).optional(),
  awardPeriodType: z.enum(["month", "quarter", "year", "special"]).optional(),
  awardPeriodLabel: z.string().trim().min(2).max(80).optional(),
  citation: z.string().trim().max(400).optional(),
  avatarStyle: z.enum(["illustrated", "geometric", "crown_badge"]).optional(),
  avatarSeed: z.string().trim().max(80).optional(),
  audioTrackId: z.string().uuid().nullable().optional(),
  targetType: z
    .enum(["screen", "screen_group", "branch", "country", "screen_role", "global"])
    .optional(),
  targetId: z.string().uuid().nullable().optional(),
  targetScreenIds: z.array(z.string().uuid()).max(200).nullable().optional(),
  injectEveryNSlides: z.number().int().min(1).max(50).optional(),
  durationSeconds: z.number().int().min(5).max(120).optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { errorResponse } = await requireAdminAccess({ disallowAuditor: true });
  if (errorResponse) return errorResponse;
  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = patchRecognitionSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid recognition update" }, { status: 400 });
    }

    const patchData: Record<string, unknown> = {
      ...parsed.data,
      updatedAt: new Date(),
    };
    if (parsed.data.startDate !== undefined) {
      patchData.startDate = parsed.data.startDate
        ? new Date(parsed.data.startDate)
        : null;
    }
    if (parsed.data.endDate !== undefined) {
      patchData.endDate = parsed.data.endDate ? new Date(parsed.data.endDate) : null;
    }

    const [updated] = await withDbRetry(() =>
      db
        .update(employeeRecognitions)
        .set(patchData)
        .where(eq(employeeRecognitions.id, id))
        .returning()
    );
    if (!updated) {
      return Response.json({ error: "Recognition not found" }, { status: 404 });
    }

    await broadcastFleetSignal("manifest_refresh", {
      reason: "recognition_updated",
      recognitionId: id,
    });
    return Response.json({ recognition: updated });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to update recognition" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { errorResponse } = await requireAdminAccess({ disallowAuditor: true });
  if (errorResponse) return errorResponse;
  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const { id } = await context.params;
    const [deleted] = await withDbRetry(() =>
      db
        .delete(employeeRecognitions)
        .where(eq(employeeRecognitions.id, id))
        .returning()
    );
    if (!deleted) {
      return Response.json({ error: "Recognition not found" }, { status: 404 });
    }

    await broadcastFleetSignal("manifest_refresh", {
      reason: "recognition_deleted",
      recognitionId: id,
    });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to delete recognition" },
      { status: 500 }
    );
  }
}
