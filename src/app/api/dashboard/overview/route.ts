/**
 * @file src/app/api/dashboard/overview/route.ts
 * @description Aggregates Crown Canvas CMS state (East Africa countries, showrooms,
 * departments, screens, media, playlists, schedules, overrides, data feeds,
 * telemetry, audit logs, and RBAC users) with automatic 57P01 pool-reconnect retry.
 */

import { desc, eq } from "drizzle-orm";
import { connection } from "next/server";
import {
  db,
  isDatabaseConfigured,
  withDbRetry,
  countries,
  branches,
  departments,
  screenGroups,
  screens,
  mediaAssets,
  quickPosts,
  dataFeeds,
  layouts,
  playlists,
  playlistItems,
  studioTemplates,
  sidebarProfiles,
  studioBackgrounds,
  schedules,
  emergencyOverrides,
  pairingCodes,
  proofOfPlayLogs,
  qrScanEvents,
  auditLogs,
  users,
  userScopes,
} from "@/db";
import {
  canAutoApproveContent,
  matchesUserScopes,
  requireAdminAccess,
} from "@/lib/auth-guard";
import { ensureSystemRoles, getAuthPasswordPolicy } from "@/lib/auth-policy";
import { ensureShowcaseProducts } from "@/app/api/showcase-products/route";
import { getSystemRoleName } from "@/lib/permissions";
import { computeScreenHealth } from "@/lib/screen-health";
import {
  getActiveStorageProvider,
  getStorageQuotaBytes,
  isStorageConfigured,
} from "@/lib/storage-provider";
import {
  DEMO_BRANCHES,
  DEMO_COUNTRIES,
  DEMO_DEPARTMENTS,
  DEMO_QUICK_POSTS,
} from "@/lib/demo-data";

export async function GET() {
  await connection();
  const { session, errorResponse } = await requireAdminAccess();
  if (errorResponse) return errorResponse;

  const dbReady = isDatabaseConfigured();
  const supabaseReady = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const storageReady = isStorageConfigured();

  if (!dbReady) {
    return Response.json({
      configured: false,
      session,
      supabaseReady,
      storageReady,
      countries: DEMO_COUNTRIES,
      branches: DEMO_BRANCHES,
      departments: DEMO_DEPARTMENTS,
      screenGroups: [],
      screens: [],
      pendingPairings: [],
      mediaAssets: [],
      quickPosts: DEMO_QUICK_POSTS,
      customTemplates: [],
      canApprove: true,
      pendingApprovalsCount: 0,
      storageStats: {
        totalBytesUsed: 0,
        quotaBytes: getStorageQuotaBytes(),
        uploadedCount: 0,
        zeroDiskCount: 0,
        provider: getActiveStorageProvider(),
      },
      layouts: [
        {
          id: "lay-full",
          name: "Full Screen Video / Slide",
          description: "100% edge-to-edge customer service video or full-bleed slide.",
          orientation: "landscape",
          zonesConfig: [
            { id: "main", label: "Full Screen", xPercent: 0, yPercent: 0, wPercent: 100, hPercent: 100, role: "primary_media" },
          ],
        },
        {
          id: "lay-split",
          name: "Crown Showroom Split (75/25 + Ticker)",
          description: "Main media + Weather/QR sidebar + bottom announcement ticker.",
          orientation: "landscape",
          zonesConfig: [
            { id: "main", label: "Primary Video", xPercent: 0, yPercent: 0, wPercent: 75, hPercent: 88, role: "primary_media" },
            { id: "sidebar", label: "Promo & QR Sidebar", xPercent: 75, yPercent: 0, wPercent: 25, hPercent: 88, role: "qr_promo" },
            { id: "ticker", label: "Bottom Ticker", xPercent: 0, yPercent: 88, wPercent: 100, hPercent: 12, role: "ticker" },
          ],
        },
      ],
      schedules: [],
      overrides: [],
      dataFeeds: [
        {
          id: "feed-demo-sales",
          key: "showroom-sales-q4",
          name: "Showroom Sales Performance Feed",
          departmentId: "dept-sales",
          sourceType: "push_webhook",
          payload: {
            kpis: [
              { label: "Network YTD", value: "$1.42M", delta: "+18.4% YoY" },
              { label: "Quota Attainment", value: "105.8%", delta: "Above Plan" },
            ],
          },
          lastSyncedAt: new Date().toISOString(),
        },
      ],
      telemetry: {
        totalImpressions: 0,
        totalQrScans: 0,
        recentPlays: [],
        recentQrScans: [],
      },
      auditLogs: [],
      teamUsers: [],
      playlists: [
        {
          id: "pl-demo-1",
          name: "Showroom Default Loop",
          description: "Starter customer service & brand loop (preview mode).",
          departmentId: "dept-cs",
          layoutId: "lay-split",
          isActive: true,
          version: 1,
          itemCount: DEMO_QUICK_POSTS.length,
          items: DEMO_QUICK_POSTS.map((qp, idx) => ({
            id: `pli-${idx}`,
            itemKind: "quick_post",
            sortOrder: idx,
            durationSeconds: qp.durationSeconds,
            title: qp.title,
          })),
        },
      ],
    });
  }

  try {
    const [
      countryRows,
      branchRows,
      departmentRows,
      screenRows,
      assetRows,
      postRows,
      feedRows,
      layoutRows,
      playlistRows,
      itemRows,
      scheduleRows,
      overrideRows,
      pairingRows,
      playRows,
      qrRows,
      auditRows,
      userRows,
      scopeRows,
      groupRows,
      customTemplateRows,
    ] = await withDbRetry(async () => {
      // Run in small batches of 3 (with max_pipeline: 1) for Supavisor Transaction Pooler
      const b1 = await Promise.all([
        db.select().from(countries),
        db.select().from(branches),
        db.select().from(departments),
      ]);
      const b2 = await Promise.all([
        db.select().from(screens).orderBy(desc(screens.updatedAt)),
        db
          .select()
          .from(mediaAssets)
          .where(eq(mediaAssets.isArchived, false))
          .orderBy(desc(mediaAssets.createdAt)),
        db
          .select()
          .from(quickPosts)
          .where(eq(quickPosts.isArchived, false))
          .orderBy(desc(quickPosts.createdAt)),
      ]);
      const b3 = await Promise.all([
        db
          .select({
            id: dataFeeds.id,
            key: dataFeeds.key,
            name: dataFeeds.name,
            departmentId: dataFeeds.departmentId,
            sourceType: dataFeeds.sourceType,
            payload: dataFeeds.payload,
            lastSyncedAt: dataFeeds.lastSyncedAt,
          })
          .from(dataFeeds)
          .orderBy(desc(dataFeeds.updatedAt)),
        db.select().from(layouts),
        db.select().from(playlists).orderBy(desc(playlists.updatedAt)),
      ]);
      const b4 = await Promise.all([
        db.select().from(playlistItems).orderBy(playlistItems.sortOrder),
        db.select().from(schedules).orderBy(desc(schedules.priority)),
        db
          .select()
          .from(emergencyOverrides)
          .orderBy(desc(emergencyOverrides.createdAt)),
      ]);
      const b5 = await Promise.all([
        db
          .select({
            id: pairingCodes.id,
            code: pairingCodes.code,
            hardwareType: pairingCodes.hardwareType,
            resolution: pairingCodes.resolution,
            expiresAt: pairingCodes.expiresAt,
            claimedAt: pairingCodes.claimedAt,
          })
          .from(pairingCodes)
          .orderBy(desc(pairingCodes.createdAt)),
        db
          .select()
          .from(proofOfPlayLogs)
          .orderBy(desc(proofOfPlayLogs.createdAt))
          .limit(50),
        db
          .select()
          .from(qrScanEvents)
          .orderBy(desc(qrScanEvents.scannedAt))
          .limit(500),
      ]);
      const b6 = await Promise.all([
        db
          .select()
          .from(auditLogs)
          .orderBy(desc(auditLogs.createdAt))
          .limit(200),
        db.select().from(users).orderBy(desc(users.createdAt)),
        db.select().from(userScopes).orderBy(desc(userScopes.createdAt)),
      ]);
      const b7 = await Promise.all([
        db.select().from(screenGroups).orderBy(desc(screenGroups.createdAt)),
        db
          .select()
          .from(studioTemplates)
          .orderBy(desc(studioTemplates.updatedAt))
          .catch(() => []),
      ]);

      return [...b1, ...b2, ...b3, ...b4, ...b5, ...b6, ...b7] as const;
    });

    const branchById = new Map(branchRows.map((b) => [b.id, b]));
    const scopedBranches = branchRows.filter((b) =>
      matchesUserScopes(session, { countryId: b.countryId, branchId: b.id })
    );
    const nowMs = Date.now();
    const scopedScreens = screenRows
      .filter((scr) => {
        const br = branchById.get(scr.branchId);
        return matchesUserScopes(session, {
          countryId: br?.countryId ?? null,
          branchId: scr.branchId,
          departmentId: scr.departmentId,
        });
      })
      .map((scr) => {
        const health = computeScreenHealth(scr.lastHeartbeatAt, nowMs);
        return {
          ...scr,
          isOnline: health.isOnline,
          healthStatus: health.healthStatus,
          lastSeenSeconds: health.ageSeconds,
        };
      });

    const scopedMediaAssets = assetRows.filter((a) =>
      matchesUserScopes(session, {
        countryId: a.countryId,
        departmentId: a.departmentId,
      })
    );
    const scopedQuickPosts = postRows.filter((p) =>
      matchesUserScopes(session, {
        countryId: p.countryId,
        departmentId: p.departmentId,
      })
    );
    const scopedPlaylists = playlistRows.filter((pl) =>
      matchesUserScopes(session, {
        countryId: pl.countryId,
        departmentId: pl.departmentId,
      })
    );
    const scopedGroups = groupRows.filter((g) =>
      matchesUserScopes(session, {
        countryId: g.countryId,
        branchId: g.branchId,
        departmentId: g.departmentId,
      })
    );

    const itemsByPlaylist = new Map<string, typeof itemRows>();
    for (const item of itemRows) {
      const list = itemsByPlaylist.get(item.playlistId) ?? [];
      list.push(item);
      itemsByPlaylist.set(item.playlistId, list);
    }

    const now = new Date();
    const pendingPairings = pairingRows.filter(
      (p) => !p.claimedAt && p.expiresAt > now
    );

    // Storage telemetry calculated across all non-archived organization assets
    const uniqueStorageBytes = new Map<string, number>();
    let zeroDiskCount = 0;
    for (const asset of assetRows) {
      if (asset.mediaType === "web_url" || asset.fileSizeBytes === 0) {
        zeroDiskCount += 1;
      } else if (!uniqueStorageBytes.has(asset.storagePath)) {
        uniqueStorageBytes.set(asset.storagePath, asset.fileSizeBytes);
      }
    }
    const totalBytesUsed = Array.from(uniqueStorageBytes.values()).reduce(
      (sum, bytes) => sum + bytes,
      0
    );

    const pendingApprovalsCount =
      scopedMediaAssets.filter((a) => a.approvalStatus === "pending_approval")
        .length +
      scopedQuickPosts.filter((p) => p.approvalStatus === "pending_approval")
        .length;

    const [
      roleRows,
      authPolicy,
      showcaseProductRows,
      sidebarProfileRows,
      studioBackgroundRows,
    ] = await Promise.all([
      ensureSystemRoles(),
      getAuthPasswordPolicy(),
      ensureShowcaseProducts(),
      withDbRetry(() =>
        db
          .select()
          .from(sidebarProfiles)
          .orderBy(desc(sidebarProfiles.isDefault), desc(sidebarProfiles.updatedAt))
      ).catch(() => []),
      withDbRetry(() =>
        db
          .select()
          .from(studioBackgrounds)
          .orderBy(desc(studioBackgrounds.createdAt))
      ).catch(() => []),
    ]);
    const roleById = new Map(roleRows.map((r) => [r.id, r]));

    return Response.json({
      configured: true,
      session,
      canApprove: canAutoApproveContent(session),
      pendingApprovalsCount,
      supabaseReady,
      storageReady,
      authPolicy,
      showcaseProducts: showcaseProductRows,
      sidebarProfiles: sidebarProfileRows,
      studioBackgrounds: studioBackgroundRows,
      roles: roleRows.map((r) => ({
        ...r,
        memberCount: new Set(
          scopeRows
            .filter((s) =>
              r.isSystem
                ? s.roleId === r.id || (!s.roleId && s.role === r.slug)
                : s.roleId === r.id
            )
            .map((s) => s.userId)
        ).size,
      })),
      storageStats: {
        totalBytesUsed,
        quotaBytes: getStorageQuotaBytes(),
        uploadedCount: uniqueStorageBytes.size,
        zeroDiskCount,
        provider: getActiveStorageProvider(),
      },
      countries: countryRows,
      branches: scopedBranches,
      departments: departmentRows,
      screenGroups: scopedGroups,
      screens: scopedScreens,
      pendingPairings,
      mediaAssets: scopedMediaAssets,
      quickPosts: scopedQuickPosts,
      customTemplates: customTemplateRows,
      dataFeeds: feedRows,
      layouts: layoutRows,
      schedules: scheduleRows,
      overrides: overrideRows,
      telemetry: {
        totalImpressions: playRows.length,
        totalQrScans: qrRows.length,
        recentPlays: playRows,
        recentQrScans: qrRows,
      },
      auditLogs: auditRows,
      teamUsers: userRows.map((u) => ({
        ...u,
        scopes: scopeRows
          .filter((s) => s.userId === u.id)
          .map((s) => {
            const customRole = s.roleId ? roleById.get(s.roleId) : undefined;
            return {
              ...s,
              roleName: customRole?.name ?? getSystemRoleName(s.role),
              roleColor: customRole?.color ?? null,
            };
          }),
      })),
      playlists: scopedPlaylists.map((pl) => ({
        ...pl,
        items: itemsByPlaylist.get(pl.id) ?? [],
      })),
    });
  } catch (err) {
    console.error("Failed to fetch dashboard overview:", err);
    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Database query failed. Ensure schema is pushed (`npx drizzle-kit push`).",
      },
      { status: 500 }
    );
  }
}
