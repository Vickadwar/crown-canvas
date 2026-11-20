/**
 * @file src/app/api/player/manifest/route.ts
 * @description Authenticated TV manifest endpoint: resolves active emergency overrides,
 * timezone-aware schedules, batched playlist items (approved-only, zero N+1),
 * branch operating hours, custom ticker/sidebar settings, and ETag `304 Not Modified`.
 */

import crypto from "crypto";
import { and, asc, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import {
  db,
  isDatabaseConfigured,
  screens,
  branches,
  countries,
  layouts,
  playlists,
  playlistItems,
  mediaAssets,
  quickPosts,
  dataFeeds,
  departments,
  schedules,
  emergencyOverrides,
} from "@/db";
import { hashDeviceToken } from "@/lib/security";
import { resolveActiveSchedule } from "@/lib/schedule-resolver";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!bearer) {
    return Response.json(
      { error: "Missing device bearer token" },
      { status: 401 }
    );
  }

  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "DATABASE_URL is not configured." },
      { status: 503 }
    );
  }

  try {
    const tokenHash = hashDeviceToken(bearer);
    const [screen] = await db
      .select()
      .from(screens)
      .where(eq(screens.deviceTokenHash, tokenHash));

    if (!screen) {
      return Response.json({ error: "Invalid device token" }, { status: 401 });
    }

    const [branch] = await db
      .select()
      .from(branches)
      .where(eq(branches.id, screen.branchId));

    const [country] = branch
      ? await db
          .select()
          .from(countries)
          .where(eq(countries.id, branch.countryId))
      : [];

    const now = new Date();
    const [activeOverrides, allSchedules] = await Promise.all([
      db
        .select()
        .from(emergencyOverrides)
        .where(
          and(
            eq(emergencyOverrides.isActive, true),
            or(
              isNull(emergencyOverrides.expiresAt),
              gt(emergencyOverrides.expiresAt, now)
            )
          )
        )
        .orderBy(desc(emergencyOverrides.createdAt)),
      db.select().from(schedules).where(eq(schedules.isActive, true)),
    ]);

    const matchingOverride = activeOverrides.find((ov) => {
      if (ov.targetType === "global") return true;
      if (ov.targetType === "country" && country && ov.targetId === country.id)
        return true;
      if (ov.targetType === "branch" && ov.targetId === screen.branchId)
        return true;
      if (
        ov.targetType === "screen_group" &&
        screen.groupId &&
        ov.targetId === screen.groupId
      )
        return true;
      if (ov.targetType === "screen" && ov.targetId === screen.id) return true;
      return false;
    });

    const matchedSchedule = resolveActiveSchedule(
      allSchedules,
      {
        screenId: screen.id,
        branchId: screen.branchId,
        countryId: country?.id ?? null,
        groupId: screen.groupId,
        screenRole: screen.screenRole,
        timezone: country?.timezone ?? "Africa/Nairobi",
      },
      now
    );

    const targetPlaylistId =
      matchedSchedule?.playlistId ?? screen.activePlaylistId;

    let targetPlaylist = targetPlaylistId
      ? (
          await db
            .select()
            .from(playlists)
            .where(eq(playlists.id, targetPlaylistId))
        )[0]
      : undefined;

    if (!targetPlaylist) {
      const [fallback] = await db
        .select()
        .from(playlists)
        .where(eq(playlists.isActive, true))
        .orderBy(desc(playlists.updatedAt));
      targetPlaylist = fallback;
    }

    const [activeLayout] = targetPlaylist?.layoutId
      ? await db
          .select()
          .from(layouts)
          .where(eq(layouts.id, targetPlaylist.layoutId))
      : [];

    const rawItems = targetPlaylist
      ? await db
          .select()
          .from(playlistItems)
          .where(eq(playlistItems.playlistId, targetPlaylist.id))
          .orderBy(asc(playlistItems.sortOrder))
      : [];

    // Batched lookups (eliminates N+1 queries on playlists with many items)
    const mediaIds = Array.from(
      new Set(
        rawItems
          .filter((i) => i.itemKind === "media_asset" && i.mediaAssetId)
          .map((i) => i.mediaAssetId as string)
      )
    );
    const quickPostIds = Array.from(
      new Set(
        rawItems
          .filter((i) => i.itemKind === "quick_post" && i.quickPostId)
          .map((i) => i.quickPostId as string)
      )
    );

    const [allDepartments, allFeeds, assetRows, postRows] = await Promise.all([
      db.select().from(departments),
      db.select().from(dataFeeds),
      mediaIds.length > 0
        ? db.select().from(mediaAssets).where(inArray(mediaAssets.id, mediaIds))
        : Promise.resolve([]),
      quickPostIds.length > 0
        ? db
            .select()
            .from(quickPosts)
            .where(inArray(quickPosts.id, quickPostIds))
        : Promise.resolve([]),
    ]);

    const deptById = new Map(allDepartments.map((d) => [d.id, d]));
    const feedById = new Map(allFeeds.map((f) => [f.id, f]));
    const assetById = new Map(assetRows.map((a) => [a.id, a]));
    const postById = new Map(postRows.map((p) => [p.id, p]));

    const resolvedItems = [];
    for (const item of rawItems) {
      if (item.itemKind === "media_asset" && item.mediaAssetId) {
        const asset = assetById.get(item.mediaAssetId);
        if (
          asset &&
          !asset.isArchived &&
          asset.approvalStatus === "approved"
        ) {
          const dept = deptById.get(asset.departmentId);
          resolvedItems.push({
            id: item.id,
            kind: "media_asset" as const,
            assetId: asset.id,
            title: asset.title,
            mediaType: asset.mediaType,
            publicUrl: asset.publicUrl,
            mimeType: asset.mimeType,
            sha256Checksum: asset.sha256Checksum,
            durationSeconds:
              item.durationSeconds ??
              asset.durationSeconds ??
              targetPlaylist?.defaultDurationSeconds ??
              15,
            departmentCode: dept?.code ?? "GENERAL",
            departmentName: dept?.name ?? "General",
          });
        }
      } else if (item.itemKind === "quick_post" && item.quickPostId) {
        const post = postById.get(item.quickPostId);
        if (post && !post.isArchived && post.approvalStatus === "approved") {
          const dept = deptById.get(post.departmentId);
          const linkedFeed = post.dataFeedId
            ? feedById.get(post.dataFeedId)
            : undefined;
          const mergedSlideConfig = linkedFeed?.payload
            ? {
                ...post.slideConfig,
                ...(linkedFeed.payload as Partial<typeof post.slideConfig>),
              }
            : post.slideConfig;
          resolvedItems.push({
            id: item.id,
            kind: "quick_post" as const,
            quickPostId: post.id,
            title: post.title,
            templateType: post.templateType,
            slideConfig: mergedSlideConfig,
            durationSeconds:
              item.durationSeconds ??
              post.durationSeconds ??
              targetPlaylist?.defaultDurationSeconds ??
              15,
            departmentCode: dept?.code ?? "GENERAL",
            departmentName: dept?.name ?? "General",
            accentColor: dept?.accentColor ?? "#1d4ed8",
          });
        }
      }
    }

    const customTicker = targetPlaylist?.tickerText
      ? targetPlaylist.tickerText
          .split("|")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    const autoTicker = resolvedItems
      .map((it) => `${it.departmentName}: ${it.title}`)
      .slice(0, 8);

    const tickerMessages =
      customTicker.length > 0
        ? customTicker
        : autoTicker.length > 0
          ? autoTicker
          : [
              `Welcome to ${branch?.name ?? "Crown Paints"}`,
              "Precision Tinting • 1,000+ Designer Shades",
              "Zero Harm Starts With You • Crown Paints East Africa",
            ];

    const stablePayload = {
      screen: {
        id: screen.id,
        name: screen.name,
        orientation: screen.orientation,
        screenRole: screen.screenRole,
        hardwareType: screen.hardwareType,
      },
      branch: branch
        ? {
            id: branch.id,
            code: branch.code,
            name: branch.name,
            city: branch.city,
            openingTime: branch.openingTime,
            closingTime: branch.closingTime,
          }
        : null,
      country: country
        ? {
            id: country.id,
            code: country.code,
            name: country.name,
            currencyCode: country.currencyCode,
            timezone: country.timezone,
          }
        : null,
      playlist: targetPlaylist
        ? {
            id: targetPlaylist.id,
            name: targetPlaylist.name,
            version: targetPlaylist.version,
            tickerText: targetPlaylist.tickerText ?? null,
            sidebarConfig: targetPlaylist.sidebarConfig ?? null,
          }
        : null,
      schedule: matchedSchedule
        ? {
            id: matchedSchedule.id,
            name: matchedSchedule.name,
            priority: matchedSchedule.priority,
            daypartStart: matchedSchedule.daypartStart,
            daypartEnd: matchedSchedule.daypartEnd,
          }
        : null,
      layout: activeLayout
        ? {
            id: activeLayout.id,
            name: activeLayout.name,
            zonesConfig: activeLayout.zonesConfig,
          }
        : null,
      tickerMessages,
      emergencyOverride: matchingOverride ?? null,
      items: resolvedItems,
    };

    const etag = `"${crypto
      .createHash("sha1")
      .update(JSON.stringify(stablePayload))
      .digest("hex")}"`;

    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": "no-cache",
        },
      });
    }

    return Response.json(
      {
        ...stablePayload,
        generatedAt: now.toISOString(),
      },
      {
        headers: {
          ETag: etag,
          "Cache-Control": "no-cache",
        },
      }
    );
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to resolve manifest",
      },
      { status: 500 }
    );
  }
}
