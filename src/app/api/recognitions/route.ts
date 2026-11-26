/**
 * @file src/app/api/recognitions/route.ts
 * @description Employee of the Month / Quarter / Year single & bulk Excel/CSV ingestion CRUD.
 */

import { desc } from "drizzle-orm";
import { connection } from "next/server";
import { z } from "zod";
import {
  db,
  isDatabaseConfigured,
  withDbRetry,
  employeeRecognitions,
} from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";
import { broadcastFleetSignal } from "@/lib/realtime";
import { recordAuditLog } from "@/lib/audit";

const singleRecognitionSchema = z.object({
  employeeName: z.string().trim().min(2).max(160),
  locationName: z.string().trim().min(1).max(150),
  branchId: z.string().uuid().nullable().optional(),
  departmentName: z.string().trim().min(1).max(120),
  awardPeriodType: z.enum(["month", "quarter", "year", "special"]).default("month"),
  awardPeriodLabel: z.string().trim().min(2).max(80),
  citation: z.string().trim().max(400).default(""),
  avatarStyle: z.enum(["illustrated", "geometric", "crown_badge"]).default("illustrated"),
  avatarSeed: z.string().trim().max(80).optional(),
  accentColor: z.string().trim().max(24).default("#2563eb"),
  audioTrackId: z.string().uuid().nullable().optional(),
  targetType: z
    .enum(["screen", "screen_group", "branch", "country", "screen_role", "global"])
    .default("global"),
  targetId: z.string().uuid().nullable().optional(),
  targetScreenIds: z.array(z.string().uuid()).max(200).nullable().optional(),
  injectEveryNSlides: z.number().int().min(1).max(50).default(6),
  durationSeconds: z.number().int().min(5).max(120).default(14),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
});

const bulkOrSingleSchema = z.union([
  z.object({ items: z.array(singleRecognitionSchema).min(1).max(200) }),
  singleRecognitionSchema,
]);

export async function GET() {
  await connection();
  const { errorResponse } = await requireAdminAccess();
  if (errorResponse) return errorResponse;
  if (!isDatabaseConfigured()) return Response.json({ recognitions: [] });

  try {
    const rows = await withDbRetry(() =>
      db
        .select()
        .from(employeeRecognitions)
        .orderBy(desc(employeeRecognitions.createdAt))
    );
    return Response.json({ recognitions: rows });
  } catch {
    return Response.json({ recognitions: [] });
  }
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
    const parsed = bulkOrSingleSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message || "Invalid employee recognition payload" },
        { status: 400 }
      );
    }

    const list = "items" in parsed.data ? parsed.data.items : [parsed.data];

    const values = list.map((item) => {
      const screenIds =
        item.targetScreenIds && item.targetScreenIds.length > 0
          ? item.targetScreenIds
          : null;
      return {
        employeeName: item.employeeName,
        locationName: item.locationName,
        branchId: item.branchId ?? null,
        departmentName: item.departmentName,
        awardPeriodType: item.awardPeriodType,
        awardPeriodLabel: item.awardPeriodLabel,
        citation: item.citation,
        avatarStyle: item.avatarStyle,
        avatarSeed: item.avatarSeed?.trim() || `${item.employeeName}-${item.departmentName}`,
        accentColor: item.accentColor,
        audioTrackId: item.audioTrackId ?? null,
        targetType: screenIds ? ("screen" as const) : item.targetType,
        targetId: screenIds ? screenIds[0] : item.targetId ?? null,
        targetScreenIds: screenIds,
        injectEveryNSlides: item.injectEveryNSlides,
        durationSeconds: item.durationSeconds,
        startDate: item.startDate ? new Date(item.startDate) : null,
        endDate: item.endDate ? new Date(item.endDate) : null,
        isActive: item.isActive,
        createdBy: session.userId ?? null,
      };
    });

    const created = await withDbRetry(() =>
      db.insert(employeeRecognitions).values(values).returning()
    );

    await Promise.all([
      broadcastFleetSignal("manifest_refresh", {
        reason: "recognitions_created",
        count: created.length,
      }),
      recordAuditLog({
        action: "recognitions.created",
        entityType: "employee_recognition",
        entityId: created[0]?.id ?? null,
        userId: session.userId,
        metadata: { count: created.length },
      }),
    ]);

    return Response.json({ recognitions: created }, { status: 201 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to save recognitions" },
      { status: 500 }
    );
  }
}
