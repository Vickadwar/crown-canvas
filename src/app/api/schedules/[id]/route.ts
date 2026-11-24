import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, isDatabaseConfigured, schedules } from "@/db";
import { broadcastFleetSignal } from "@/lib/realtime";
import { requireAdminAccess } from "@/lib/auth-guard";

const patchSchema = z.object({
  name: z.string().min(2).max(160).optional(),
  playlistId: z.string().uuid().optional(),
  targetType: z
    .enum(["global", "country", "branch", "screen_group", "screen", "screen_role"])
    .optional(),
  targetId: z.string().uuid().nullable().optional(),
  targetScreenRole: z
    .enum(["showroom_customer", "back_office", "factory_floor", "reception"])
    .nullable()
    .optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).optional(),
  isActive: z.boolean().optional(),
  priority: z.number().int().min(1).max(1000).optional(),
  daypartStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  daypartEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
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

  const { id } = await context.params;
  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid schedule update", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const [updated] = await db
    .update(schedules)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(schedules.id, id))
    .returning();

  if (!updated) {
    return Response.json({ error: "Schedule not found" }, { status: 404 });
  }

  await broadcastFleetSignal("manifest_refresh", {
    reason: "schedule_updated",
    scheduleId: id,
  });

  return Response.json({ schedule: updated });
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

  const { id } = await context.params;
  await db.delete(schedules).where(eq(schedules.id, id));
  await broadcastFleetSignal("manifest_refresh", {
    reason: "schedule_deleted",
    scheduleId: id,
  });
  return Response.json({ ok: true });
}
