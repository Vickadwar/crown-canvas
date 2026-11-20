/**
 * @file src/app/api/reports/executive/route.ts
 * @description Executive Proof-of-Play SLA, QR Attribution & TCO Cost-Savings Report API
 * plus 90-day Proof-of-Play retention pruning to keep Postgres comfortably inside Free/Pro limits.
 */

import { lt, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  isDatabaseConfigured,
  branches,
  departments,
  screens,
  proofOfPlayLogs,
  qrScanEvents,
} from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";
import { computeScreenHealth } from "@/lib/screen-health";
import { recordAuditLog } from "@/lib/audit";

const pruneSchema = z.object({
  action: z.literal("prune_telemetry"),
  retentionDays: z.number().int().min(7).max(365).default(90),
});

export async function GET() {
  const { errorResponse } = await requireAdminAccess();
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const [allBranches, allDepts, allScreens, popByDept, popByBranch, qrTotals] =
      await Promise.all([
        db.select().from(branches),
        db.select().from(departments),
        db.select().from(screens),
        db
          .select({
            departmentId: proofOfPlayLogs.departmentId,
            plays: sql<number>`count(*)::int`,
            totalSeconds: sql<number>`coalesce(sum(${proofOfPlayLogs.durationPlayedSeconds}), 0)::int`,
          })
          .from(proofOfPlayLogs)
          .groupBy(proofOfPlayLogs.departmentId),
        db
          .select({
            branchId: proofOfPlayLogs.branchId,
            plays: sql<number>`count(*)::int`,
            totalSeconds: sql<number>`coalesce(sum(${proofOfPlayLogs.durationPlayedSeconds}), 0)::int`,
          })
          .from(proofOfPlayLogs)
          .groupBy(proofOfPlayLogs.branchId),
        db
          .select({
            branchId: qrScanEvents.branchId,
            scans: sql<number>`count(*)::int`,
          })
          .from(qrScanEvents)
          .groupBy(qrScanEvents.branchId),
      ]);

    const branchById = new Map(allBranches.map((b) => [b.id, b]));
    const deptById = new Map(allDepts.map((d) => [d.id, d]));

    const nowMs = Date.now();
    const healthBreakdown = allScreens.reduce(
      (acc, scr) => {
        const h = computeScreenHealth(scr.lastHeartbeatAt, nowMs);
        acc[h.healthStatus] += 1;
        return acc;
      },
      { online: 0, degraded: 0, offline: 0 }
    );

    const totalScreens = allScreens.length;
    const fleetUptimePercent =
      totalScreens > 0
        ? Math.round((healthBreakdown.online / totalScreens) * 1000) / 10
        : 100;

    // Commercial TCO ROI Calculator (compare against ScreenCloud Core $20/mo & Pro $30/mo per screen)
    const modeledScreenCount = Math.max(totalScreens, 15);
    const screenCloudCoreAnnualUsd = modeledScreenCount * 20 * 12;
    const screenCloudProAnnualUsd = modeledScreenCount * 30 * 12;
    const yodeckEnterpriseAnnualUsd = modeledScreenCount * 16 * 12;
    const crownCanvasOneOffUsd = 3000;
    const crownCanvasAnnualInfraUsd = 300; // $25/mo Supabase Pro at scale

    return Response.json({
      generatedAt: new Date().toISOString(),
      fleet: {
        totalScreens,
        ...healthBreakdown,
        fleetUptimePercent,
      },
      impressionsByDepartment: popByDept.map((row) => ({
        departmentId: row.departmentId,
        departmentName:
          (row.departmentId && deptById.get(row.departmentId)?.name) ||
          "Showroom Shared",
        plays: row.plays,
        totalMinutes: Math.round((row.totalSeconds / 60) * 10) / 10,
      })),
      impressionsByBranch: popByBranch.map((row) => ({
        branchId: row.branchId,
        branchName: branchById.get(row.branchId)?.name ?? "Showroom",
        plays: row.plays,
        totalMinutes: Math.round((row.totalSeconds / 60) * 10) / 10,
        qrScans:
          qrTotals.find((q) => q.branchId === row.branchId)?.scans ?? 0,
      })),
      roiComparison: {
        modeledScreenCount,
        screenCloudCoreAnnualUsd,
        screenCloudProAnnualUsd,
        yodeckEnterpriseAnnualUsd,
        crownCanvasOneOffUsd,
        crownCanvasAnnualInfraUsd,
        threeYearSavingsVsScreenCloudProUsd:
          screenCloudProAnnualUsd * 3 -
          (crownCanvasOneOffUsd + crownCanvasAnnualInfraUsd * 3),
      },
    });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to build executive report",
      },
      { status: 500 }
    );
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
    const parsed = pruneSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid prune request", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const cutoff = new Date(
      Date.now() - parsed.data.retentionDays * 24 * 60 * 60 * 1000
    );

    const deleted = await db
      .delete(proofOfPlayLogs)
      .where(lt(proofOfPlayLogs.createdAt, cutoff))
      .returning({ id: proofOfPlayLogs.id });

    await recordAuditLog({
      action: "telemetry.pruned",
      entityType: "proof_of_play_logs",
      userId: session.userId,
      metadata: {
        retentionDays: parsed.data.retentionDays,
        deletedRows: deleted.length,
      },
    });

    return Response.json({
      ok: true,
      deletedRows: deleted.length,
      retentionDays: parsed.data.retentionDays,
    });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to prune telemetry logs",
      },
      { status: 500 }
    );
  }
}
