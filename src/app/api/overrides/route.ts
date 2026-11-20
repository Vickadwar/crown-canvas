import { desc } from "drizzle-orm";
import { connection } from "next/server";
import { z } from "zod";
import { db, isDatabaseConfigured, emergencyOverrides } from "@/db";
import { broadcastFleetSignal } from "@/lib/realtime";
import { recordAuditLog } from "@/lib/audit";
import { requireAdminAccess } from "@/lib/auth-guard";

const createOverrideSchema = z.object({
  title: z.string().min(2).max(180),
  message: z.string().min(2).max(1000),
  severity: z.enum(["info", "warning", "critical"]).default("warning"),
  departmentId: z.string().uuid().nullable().optional(),
  targetType: z
    .enum(["global", "country", "branch", "screen", "screen_group", "screen_role"])
    .default("global"),
  targetId: z.string().uuid().nullable().optional(),
  durationMinutes: z.number().int().min(1).max(1440).default(30),
});

export async function GET() {
  await connection();
  if (!isDatabaseConfigured()) {
    return Response.json({ overrides: [] });
  }
  const rows = await db
    .select()
    .from(emergencyOverrides)
    .orderBy(desc(emergencyOverrides.createdAt));
  return Response.json({ overrides: rows });
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
    const parsed = createOverrideSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid override payload", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const expiresAt = new Date(
      Date.now() + parsed.data.durationMinutes * 60 * 1000
    );

    const [created] = await db
      .insert(emergencyOverrides)
      .values({
        title: parsed.data.title,
        message: parsed.data.message,
        severity: parsed.data.severity,
        departmentId: parsed.data.departmentId ?? null,
        targetType: parsed.data.targetType,
        targetId: parsed.data.targetId ?? null,
        isActive: true,
        expiresAt,
      })
      .returning();

    await broadcastFleetSignal("emergency_override", {
      overrideId: created.id,
      active: true,
    });

    await recordAuditLog({
      action: "override.broadcast",
      entityType: "emergency_override",
      entityId: created.id,
      metadata: { title: created.title, severity: created.severity },
    });

    return Response.json({ override: created }, { status: 201 });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to trigger broadcast",
      },
      { status: 500 }
    );
  }
}
