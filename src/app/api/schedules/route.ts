import { desc } from "drizzle-orm";
import { connection } from "next/server";
import { z } from "zod";
import { db, isDatabaseConfigured, schedules } from "@/db";
import { broadcastFleetSignal } from "@/lib/realtime";
import { recordAuditLog } from "@/lib/audit";
import { requireAdminAccess } from "@/lib/auth-guard";

const createScheduleSchema = z.object({
  name: z.string().min(2).max(150),
  playlistId: z.string().uuid(),
  targetType: z.enum([
    "screen",
    "screen_group",
    "branch",
    "country",
    "screen_role",
    "global",
  ]),
  targetId: z.string().uuid().nullable().optional(),
  targetScreenRole: z
    .enum(["showroom_customer", "back_office", "factory_floor", "reception"])
    .nullable()
    .optional(),
  priority: z.number().int().min(1).max(1000).default(20),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).default([0, 1, 2, 3, 4, 5, 6]),
  daypartStart: z.string().regex(/^\d{2}:\d{2}$/).default("08:00"),
  daypartEnd: z.string().regex(/^\d{2}:\d{2}$/).default("17:30"),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
});

export async function GET() {
  await connection();
  if (!isDatabaseConfigured()) {
    return Response.json({ schedules: [] });
  }
  const rows = await db
    .select()
    .from(schedules)
    .orderBy(desc(schedules.priority), desc(schedules.createdAt));
  return Response.json({ schedules: rows });
}

export async function POST(request: Request) {
  const { errorResponse } = await requireAdminAccess({ disallowAuditor: true });
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "DATABASE_URL is not configured in .env.local yet." },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const parsed = createScheduleSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid schedule payload", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const [created] = await db
      .insert(schedules)
      .values({
        name: parsed.data.name,
        playlistId: parsed.data.playlistId,
        targetType: parsed.data.targetType,
        targetId: parsed.data.targetId ?? null,
        targetScreenRole: parsed.data.targetScreenRole ?? null,
        priority: parsed.data.priority,
        daysOfWeek: parsed.data.daysOfWeek,
        daypartStart: parsed.data.daypartStart,
        daypartEnd: parsed.data.daypartEnd,
        startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
        endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
      })
      .returning();

    await broadcastFleetSignal("manifest_refresh", {
      reason: "schedule_created",
      scheduleId: created.id,
    });

    await recordAuditLog({
      action: "schedule.created",
      entityType: "schedule",
      entityId: created.id,
      metadata: { name: created.name, targetType: created.targetType },
    });

    return Response.json({ schedule: created }, { status: 201 });
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : "Failed to create schedule",
      },
      { status: 500 }
    );
  }
}
