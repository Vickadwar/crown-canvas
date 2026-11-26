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
  showcaseProducts,
  sidebarProfiles,
  audioTracks,
  promotions,
  employeeRecognitions,
  partnerLogos,
} from "@/db";
import { hashDeviceToken } from "@/lib/security";
import {
  interleavePlaybackItems,
  matchesScreenTarget,
  resolveActiveRotationStep,
  resolveActiveSchedule,
} from "@/lib/schedule-resolver";
import { signQrRedirect } from "@/lib/url-security";
import {
  CROWN_DECORATIVE_QR_URL,
  CROWN_PRODUCT_SHOWCASE,
} from "@/lib/crown-products";

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
      if (
        ov.targetType === "screen" &&
        (ov.targetId === screen.id ||
          (Array.isArray(ov.targetScreenIds) &&
            ov.targetScreenIds.includes(screen.id)))
      ) {
        return true;
      }
      return false;
    });

    const screenCtx = {
      screenId: screen.id,
      branchId: screen.branchId,
      countryId: country?.id ?? null,
      groupId: screen.groupId,
      screenRole: screen.screenRole,
      timezone: country?.timezone ?? "Africa/Nairobi",
    };

    const matchedSchedule = resolveActiveSchedule(allSchedules, screenCtx, now);

    // Resolve chained Playlist / Promotions / Recognitions rotation sequence if configured
    const activeRotation = matchedSchedule
      ? resolveActiveRotationStep(
          matchedSchedule.rotationSequence,
          now,
          screenCtx.timezone
        )
      : null;

    const emergencyPlaylistId =
      matchingOverride?.overrideKind === "playlist" &&
      matchingOverride.playlistId
        ? matchingOverride.playlistId
        : null;

    const rotationPlaylistId =
      activeRotation?.step.kind === "playlist" && activeRotation.step.playlistId
        ? activeRotation.step.playlistId
        : null;

    const targetPlaylistId =
      emergencyPlaylistId ??
      rotationPlaylistId ??
      matchedSchedule?.playlistId ??
      screen.activePlaylistId;

    const [overrideMediaAsset] =
      matchingOverride?.overrideKind === "media_asset" &&
      matchingOverride.mediaAssetId
        ? await db
            .select()
            .from(mediaAssets)
            .where(eq(mediaAssets.id, matchingOverride.mediaAssetId))
        : [];

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
              "Precision Tinting • 1,800+ Designer Shades",
              "If you like it... Crown it!",
            ];

    // Resolve Per-Playlist Sidebar Profile, Showcase Products, Audio Tracks, Active Promotions,
    // Employee Recognitions & Official Partner Logos in parallel (additive-safe with `.catch(() => [])`)
    const [
      allSidebarProfiles,
      allShowcaseProducts,
      allAudioTracks,
      allPromotions,
      allRecognitions,
      allPartnerLogos,
    ] = await Promise.all([
      db
        .select()
        .from(sidebarProfiles)
        .orderBy(desc(sidebarProfiles.isDefault), desc(sidebarProfiles.updatedAt))
        .catch(() => []),
      db
        .select()
        .from(showcaseProducts)
        .where(eq(showcaseProducts.isActive, true))
        .orderBy(asc(showcaseProducts.sortOrder), asc(showcaseProducts.createdAt))
        .catch(() => []),
      db
        .select()
        .from(audioTracks)
        .where(eq(audioTracks.isActive, true))
        .catch(() => []),
      db
        .select()
        .from(promotions)
        .where(eq(promotions.isActive, true))
        .orderBy(desc(promotions.priority), desc(promotions.createdAt))
        .catch(() => []),
      db
        .select()
        .from(employeeRecognitions)
        .where(eq(employeeRecognitions.isActive, true))
        .orderBy(desc(employeeRecognitions.createdAt))
        .catch(() => []),
      db
        .select()
        .from(partnerLogos)
        .where(eq(partnerLogos.isActive, true))
        .orderBy(asc(partnerLogos.sortOrder), asc(partnerLogos.createdAt))
        .catch(() => []),
    ]);

    const audioById = new Map(allAudioTracks.map((a) => [a.id, a]));
    const playlistAudio = targetPlaylist?.audioTrackId
      ? audioById.get(targetPlaylist.audioTrackId) ?? null
      : null;

    // Filter active, in-date Promotions & Employee Recognitions matching this screen
    const matchedPromotions = allPromotions.filter((p) =>
      matchesScreenTarget(
        {
          targetType: p.targetType,
          targetId: p.targetId,
          targetScreenIds: p.targetScreenIds,
          startDate: p.startDate,
          endDate: p.endDate,
          isActive: p.isActive,
        },
        screenCtx,
        now
      )
    );

    const matchedRecognitions = allRecognitions.filter((r) =>
      matchesScreenTarget(
        {
          targetType: r.targetType,
          targetId: r.targetId,
          targetScreenIds: r.targetScreenIds,
          startDate: r.startDate,
          endDate: r.endDate,
          isActive: r.isActive,
        },
        screenCtx,
        now
      )
    );

    const promoPlaybackItems = matchedPromotions.map((p) => {
      const track = p.audioTrackId ? audioById.get(p.audioTrackId) : null;
      return {
        id: `promo-${p.id}`,
        kind: "media_asset" as const,
        assetId: p.id,
        isPromotion: true,
        promotionId: p.id,
        agencyName: p.agencyName,
        title: p.title,
        mediaType: p.mediaType,
        publicUrl: p.publicUrl,
        mimeType: p.mimeType,
        sha256Checksum: p.sha256Checksum || p.id,
        durationSeconds: Math.max(5, p.durationSeconds || 15),
        departmentCode: "PROMOTIONS",
        departmentName: p.agencyName || "Promotion",
        audioTrackUrl: track?.publicUrl ?? null,
        audioVolumePercent: track?.volumePercent ?? null,
      };
    });

    const recognitionPlaybackItems = matchedRecognitions.map((r) => {
      const track = r.audioTrackId ? audioById.get(r.audioTrackId) : null;
      return {
        id: `rec-${r.id}`,
        kind: "employee_recognition" as const,
        recognitionId: r.id,
        title: `${r.employeeName} — ${r.awardPeriodLabel}`,
        employeeName: r.employeeName,
        locationName: r.locationName,
        departmentName: r.departmentName,
        awardPeriodType: r.awardPeriodType,
        awardPeriodLabel: r.awardPeriodLabel,
        citation: r.citation,
        avatarStyle: r.avatarStyle,
        avatarSeed: r.avatarSeed,
        accentColor: r.accentColor,
        durationSeconds: Math.max(5, r.durationSeconds || 14),
        departmentCode: "HR",
        audioTrackUrl: track?.publicUrl ?? null,
        audioVolumePercent: track?.volumePercent ?? null,
      };
    });

    // Attach optional per-slide audio to quick_post slides
    const enrichedBaseItems = resolvedItems.map((it) => {
      if (it.kind === "quick_post") {
        const post = postById.get(it.quickPostId);
        const track = post?.audioTrackId ? audioById.get(post.audioTrackId) : null;
        return {
          ...it,
          audioTrackUrl: track?.publicUrl ?? null,
          audioVolumePercent: track?.volumePercent ?? null,
        };
      }
      return {
        ...it,
        audioTrackUrl: null as string | null,
        audioVolumePercent: null as number | null,
      };
    });

    // Determine final playback queue:
    //  - If chained rotation step is `"promotions"` (and active promos exist), air active promotions
    //  - If chained rotation step is `"recognitions"` (and active recognitions exist), air recognitions
    //  - Otherwise interleave active promotions (per `playlist.promoInjectEveryN`) and employee spotlights
    let finalPlaybackItems: Array<Record<string, unknown>>;
    if (
      !emergencyPlaylistId &&
      activeRotation?.step.kind === "promotions" &&
      promoPlaybackItems.length > 0
    ) {
      finalPlaybackItems = promoPlaybackItems;
    } else if (
      !emergencyPlaylistId &&
      activeRotation?.step.kind === "recognitions" &&
      recognitionPlaybackItems.length > 0
    ) {
      finalPlaybackItems = recognitionPlaybackItems;
    } else {
      const recEveryN =
        matchedRecognitions.length > 0
          ? Math.max(
              1,
              Math.min(
                ...matchedRecognitions.map((r) => r.injectEveryNSlides || 6)
              )
            )
          : 0;
      const promoEveryN = targetPlaylist?.promoInjectEveryN ?? 0;
      finalPlaybackItems = interleavePlaybackItems<Record<string, unknown>>({
        baseItems: enrichedBaseItems,
        promotions: promoPlaybackItems,
        promoEveryN,
        recognitions: recognitionPlaybackItems,
        recognitionEveryN: recEveryN,
      });
    }

    const resolvedSidebarProfile =
      (targetPlaylist?.sidebarProfileId
        ? allSidebarProfiles.find((p) => p.id === targetPlaylist.sidebarProfileId)
        : undefined) ??
      allSidebarProfiles.find((p) => p.isDefault) ??
      null;

    const activeCatalog =
      allShowcaseProducts.length > 0
        ? allShowcaseProducts.map((p) => ({
            id: p.id,
            name: p.name,
            category: p.badgeHeader,
            tagline: p.description,
            imageUrl: p.imageUrl,
          }))
        : CROWN_PRODUCT_SHOWCASE;

    let resolvedShowcaseProducts = activeCatalog;
    if (
      resolvedSidebarProfile &&
      Array.isArray(resolvedSidebarProfile.productIds) &&
      resolvedSidebarProfile.productIds.length > 0
    ) {
      const byId = new Map(activeCatalog.map((p) => [p.id, p]));
      const curated = resolvedSidebarProfile.productIds
        .map((id) => byId.get(id))
        .filter((p): p is NonNullable<typeof p> => Boolean(p));
      if (curated.length > 0) {
        resolvedShowcaseProducts = curated;
      }
    }

    // Generate server-side HMAC signatures for all QR codes (Sidebar + every Studio/QuickPost slide)
    const qrSignatures: Record<string, string> = {};
    const sidebarQrTarget =
      resolvedSidebarProfile?.qrTargetUrl?.trim() ||
      targetPlaylist?.sidebarConfig?.qrTargetUrl?.trim() ||
      CROWN_DECORATIVE_QR_URL;
    qrSignatures[`concierge|${sidebarQrTarget}`] = signQrRedirect(
      "concierge",
      sidebarQrTarget
    );

    for (const item of resolvedItems) {
      if (item.kind === "quick_post") {
        const shortCode = item.quickPostId.slice(0, 32);
        const directQr = item.slideConfig?.qrUrl?.trim();
        if (directQr) {
          qrSignatures[`${shortCode}|${directQr}`] = signQrRedirect(
            shortCode,
            directQr
          );
        }
        const elements = item.slideConfig?.canvasDoc?.elements ?? [];
        for (const el of elements) {
          if (el.type === "qr" && el.qrUrl?.trim()) {
            const url = el.qrUrl.trim();
            qrSignatures[`${shortCode}|${url}`] = signQrRedirect(shortCode, url);
            qrSignatures[`studio|${url}`] = signQrRedirect("studio", url);
          }
        }
      }
    }

    const stablePayload = {
      screenPaused: screen.isActive === false,
      screen: {
        id: screen.id,
        name: screen.name,
        orientation: screen.orientation,
        displayMode:
          typeof (screen.metadata as Record<string, unknown> | null)?.displayMode ===
          "string"
            ? String((screen.metadata as Record<string, unknown>).displayMode)
            : screen.orientation === "portrait"
              ? "portrait_9_16"
              : "landscape_16_9",
        screenRole: screen.screenRole,
        hardwareType: screen.hardwareType,
        isActive: screen.isActive,
      },
      branch: branch
        ? {
            id: branch.id,
            code: branch.code,
            name: branch.name,
            city: branch.city,
            openingTime: branch.openingTime,
            closingTime: branch.closingTime,
            operatingSchedule: branch.operatingSchedule ?? null,
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
            sidebarProfileId: targetPlaylist.sidebarProfileId ?? null,
            audioTrackUrl: playlistAudio?.publicUrl ?? null,
            audioVolumePercent: playlistAudio?.volumePercent ?? 35,
            showPartnerLogos: targetPlaylist.showPartnerLogos !== false,
            partnerTickerMode: targetPlaylist.partnerTickerMode || "pinned_right",
          }
        : null,
      partnerLogos: allPartnerLogos.map((p) => ({
        id: p.id,
        name: p.name,
        logoUrl: p.logoUrl,
        tagline: p.tagline,
      })),
      sidebarProfile: resolvedSidebarProfile
        ? {
            id: resolvedSidebarProfile.id,
            name: resolvedSidebarProfile.name,
            theme: resolvedSidebarProfile.theme,
            displayName: resolvedSidebarProfile.displayName,
            showClock: resolvedSidebarProfile.showClock,
            showWeather: resolvedSidebarProfile.showWeather,
            showQr: resolvedSidebarProfile.showQr,
            qrTitle: resolvedSidebarProfile.qrTitle,
            promoLabel: resolvedSidebarProfile.promoLabel,
            qrTargetUrl: resolvedSidebarProfile.qrTargetUrl,
            qrTrackingMode: resolvedSidebarProfile.qrTrackingMode ?? "direct",
            qrShowLogo: resolvedSidebarProfile.qrShowLogo !== false,
            slideIntervalSeconds: resolvedSidebarProfile.slideIntervalSeconds,
          }
        : null,
      showcaseProducts: resolvedShowcaseProducts,
      qrSignatures,
      schedule: matchedSchedule
        ? {
            id: matchedSchedule.id,
            name: matchedSchedule.name,
            priority: matchedSchedule.priority,
            daypartStart: matchedSchedule.daypartStart,
            daypartEnd: matchedSchedule.daypartEnd,
            activeRotationLabel: activeRotation?.step.label ?? null,
            activeRotationKind: activeRotation?.step.kind ?? null,
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
      emergencyOverride: matchingOverride
        ? {
            id: matchingOverride.id,
            title: matchingOverride.title,
            message: matchingOverride.message,
            overrideKind: matchingOverride.overrideKind ?? "alert",
            severity: matchingOverride.severity,
            playlistId: matchingOverride.playlistId ?? null,
            mediaAsset: overrideMediaAsset
              ? {
                  id: overrideMediaAsset.id,
                  title: overrideMediaAsset.title,
                  mediaType: overrideMediaAsset.mediaType,
                  publicUrl: overrideMediaAsset.publicUrl,
                  mimeType: overrideMediaAsset.mimeType,
                }
              : null,
          }
        : null,
      items: finalPlaybackItems,
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
