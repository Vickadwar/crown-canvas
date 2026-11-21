/**
 * @file src/app/api/reports/executive/route.ts
 * @description White-label Executive Proof-of-Play SLA, Fleet Health, QR Attribution
 * & Storage Report API plus 90-day Proof-of-Play retention pruning.
 */

import { eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  isDatabaseConfigured,
  withDbRetry,
  branches,
  departments,
  screens,
  mediaAssets,
  proofOfPlayLogs,
  qrScanEvents,
} from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";
import { computeScreenHealth } from "@/lib/screen-health";
import { recordAuditLog } from "@/lib/audit";
import { getActiveStorageProvider } from "@/lib/storage-provider";

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
    const [allBranches, allDepts, allScreens, popByDept, popByBranch, qrTotals, assetRows] =
      await withDbRetry(async () => {
        const b1 = await Promise.all([
          db.select().from(branches),
          db.select().from(departments),
          db.select().from(screens),
        ]);
        const b2 = await Promise.all([
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
        const assets = await db
          .select({
            mediaType: mediaAssets.mediaType,
            storagePath: mediaAssets.storagePath,
            fileSizeBytes: mediaAssets.fileSizeBytes,
          })
          .from(mediaAssets)
          .where(eq(mediaAssets.isArchived, false));
        return [...b1, ...b2, assets] as const;
      });

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

    const qrScansTotal = qrTotals.reduce((acc, q) => acc + q.scans, 0);

    const uniqueBytes = new Map<string, number>();
    let zeroDiskCount = 0;
    for (const a of assetRows) {
      if (a.mediaType === "web_url" || a.mediaType === "pdf" || a.fileSizeBytes === 0) {
        zeroDiskCount += 1;
      } else if (!uniqueBytes.has(a.storagePath)) {
        uniqueBytes.set(a.storagePath, a.fileSizeBytes);
      }
    }
    const totalBytesUsed = Array.from(uniqueBytes.values()).reduce(
      (sum, bytes) => sum + bytes,
      0
    );

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
          "Shared Signage",
        plays: row.plays,
        totalMinutes: Math.round((row.totalSeconds / 60) * 10) / 10,
      })),
      impressionsByBranch: popByBranch.map((row) => ({
        branchId: row.branchId,
        branchName: branchById.get(row.branchId)?.name ?? "Location",
        plays: row.plays,
        totalMinutes: Math.round((row.totalSeconds / 60) * 10) / 10,
        qrScans:
          qrTotals.find((q) => q.branchId === row.branchId)?.scans ?? 0,
      })),
      qrScansTotal,
      storageStats: {
        totalBytesUsed,
        quotaBytes: 1024 * 1024 * 1024,
        uploadedCount: uniqueBytes.size,
        zeroDiskCount,
        provider: getActiveStorageProvider(),
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

    const deleted = await withDbRetry(() =>
      db
        .delete(proofOfPlayLogs)
        .where(lt(proofOfPlayLogs.createdAt, cutoff))
        .returning({ id: proofOfPlayLogs.id })
    );

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
