/**
 * @file src/app/q/[code]/route.ts
 * @description Ultra-short, tamper-proof QR-to-Mobile attribution redirect handler.
 * Supports compact showroom-scannable URLs:
 *   - `/q/sb?s=<screenId>` (Sidebar QR — resolves screen -> branch -> playlist -> sidebarProfile destination from Postgres)
 *   - `/q/sl?p=<quickPostId>&s=<screenId>` (Studio Slide / Quick Post QR — resolves destination from Postgres)
 *   - Legacy HMAC-signed `/q/[code]?to=...&sig=...`
 * Logs verified scans to `qr_scan_events` (sourceType, campaignLabel, screen, branch, UA)
 * while filtering bots and enforcing per-IP rate limiting.
 */

import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  db,
  isDatabaseConfigured,
  withDbRetry,
  playlists,
  qrScanEvents,
  quickPosts,
  screens,
  sidebarProfiles,
} from "@/db";
import { CROWN_DECORATIVE_QR_URL } from "@/lib/crown-products";
import {
  isBotUserAgent,
  isValidUuid,
  verifyQrRedirect,
} from "@/lib/url-security";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

function isSafeHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params;
  const cleanCode = code.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "qr";
  const { searchParams } = new URL(request.url);

  const rawScreenId = searchParams.get("s");
  const rawBranchId = searchParams.get("b");
  const rawQuickPostId = searchParams.get("p");
  const rawProfileId = searchParams.get("sp");
  const rawElementIdx = searchParams.get("i");
  const rawTo = searchParams.get("to");
  const sig = searchParams.get("sig");
  const rawSource = searchParams.get("src");
  const rawLabel = searchParams.get("lbl");

  const screenId = isValidUuid(rawScreenId) ? rawScreenId : null;
  let branchId = isValidUuid(rawBranchId) ? rawBranchId : null;
  const quickPostId = isValidUuid(rawQuickPostId) ? rawQuickPostId : null;
  const profileId = isValidUuid(rawProfileId) ? rawProfileId : null;
  const elementIdx = rawElementIdx ? Math.max(0, Number.parseInt(rawElementIdx, 10) || 0) : 0;

  let sourceType: "sidebar" | "studio_slide" | "quick_post" =
    rawSource === "studio_slide" || rawSource === "quick_post" || rawSource === "sidebar"
      ? rawSource
      : cleanCode === "sl" || quickPostId
        ? "studio_slide"
        : "sidebar";
  let campaignLabel: string | null = rawLabel?.trim().slice(0, 160) || null;
  let targetUrl = CROWN_DECORATIVE_QR_URL;

  // Resolve screen -> branchId + activePlaylistId server-side for ultra-short QR URLs
  let screenPlaylistId: string | null = null;
  if (screenId && isDatabaseConfigured()) {
    try {
      const [scr] = await withDbRetry(() =>
        db
          .select({
            branchId: screens.branchId,
            activePlaylistId: screens.activePlaylistId,
          })
          .from(screens)
          .where(eq(screens.id, screenId))
          .limit(1)
      );
      if (scr) {
        if (!branchId) branchId = scr.branchId;
        screenPlaylistId = scr.activePlaylistId;
      }
    } catch {
      // Continue safely
    }
  }

  // 1. Compact Sidebar Short Link (`/q/sb?s=<screenId>` or `&sp=<profileId>`)
  if ((cleanCode === "sb" || cleanCode === "concierge") && !rawTo && isDatabaseConfigured()) {
    sourceType = "sidebar";
    try {
      let resolvedProfileId = profileId;
      let playlistQrUrl: string | null = null;

      if (!resolvedProfileId && screenPlaylistId) {
        const [pl] = await withDbRetry(() =>
          db
            .select({
              sidebarProfileId: playlists.sidebarProfileId,
              sidebarConfig: playlists.sidebarConfig,
            })
            .from(playlists)
            .where(eq(playlists.id, screenPlaylistId!))
            .limit(1)
        );
        resolvedProfileId = pl?.sidebarProfileId ?? null;
        playlistQrUrl = pl?.sidebarConfig?.qrTargetUrl?.trim() ?? null;
      }

      const profileRows = await withDbRetry(() =>
        resolvedProfileId
          ? db
            .select()
            .from(sidebarProfiles)
            .where(eq(sidebarProfiles.id, resolvedProfileId))
            .limit(1)
          : db
            .select()
            .from(sidebarProfiles)
            .orderBy(desc(sidebarProfiles.isDefault), desc(sidebarProfiles.updatedAt))
            .limit(1)
      );
      const prof = profileRows[0] ?? null;
      const profUrl = prof?.qrTargetUrl?.trim();

      if (profUrl && isSafeHttpUrl(profUrl)) {
        targetUrl = profUrl;
      } else if (playlistQrUrl && isSafeHttpUrl(playlistQrUrl)) {
        targetUrl = playlistQrUrl;
      }
      if (!campaignLabel) {
        campaignLabel = prof?.qrTitle?.trim() || prof?.name || "Sidebar Showcase QR";
      }
    } catch {
      // Fall back safely to default decorative catalog URL
    }
  } else if (rawTo && isSafeHttpUrl(rawTo) && verifyQrRedirect(cleanCode, rawTo, sig)) {
    // 2. Signed `?to=` redirects
    targetUrl = rawTo;
  } else if (quickPostId && isDatabaseConfigured()) {
    // 3. Compact Studio Slide / Quick Post Short Link (`/q/sl?p=<quickPostId>&s=<screenId>&i=<idx>`)
    try {
      const [post] = await withDbRetry(() =>
        db.select().from(quickPosts).where(eq(quickPosts.id, quickPostId)).limit(1)
      );
      if (post) {
        sourceType = post.slideConfig?.canvasDoc ? "studio_slide" : "quick_post";
        const directUrl = post.slideConfig?.qrUrl?.trim();
        const canvasQrEls =
          post.slideConfig?.canvasDoc?.elements.filter(
            (el) => el.type === "qr" && el.qrUrl?.trim()
          ) ?? [];

        const matchedEl = canvasQrEls[elementIdx] ?? canvasQrEls[0];
        if (rawTo && isSafeHttpUrl(rawTo) && (rawTo === directUrl || canvasQrEls.some((e) => e.qrUrl?.trim() === rawTo))) {
          targetUrl = rawTo;
        } else if (matchedEl?.qrUrl && isSafeHttpUrl(matchedEl.qrUrl.trim())) {
          targetUrl = matchedEl.qrUrl.trim();
        } else if (directUrl && isSafeHttpUrl(directUrl)) {
          targetUrl = directUrl;
        }
        if (!campaignLabel) {
          campaignLabel = matchedEl?.qrLabel?.trim() || post.title || "Studio Slide QR";
        }
      }
    } catch {
      // Fall back to safe default URL
    }
  } else if (rawTo && isSafeHttpUrl(rawTo)) {
    // 4. Only allow unsigned redirects to official Crown Paints domain
    try {
      const host = new URL(rawTo).hostname.toLowerCase();
      if (host === "crownpaints.co.ke" || host.endsWith(".crownpaints.co.ke")) {
        targetUrl = rawTo;
      }
    } catch {
      // Reject malformed host
    }
  }

  const ua = request.headers.get("user-agent") ?? undefined;
  const ip = getClientIp(request);
  const rl = checkRateLimit(`qr_scan:${ip}:${cleanCode}`, 30, 60_000);

  if (isDatabaseConfigured() && rl.allowed && !isBotUserAgent(ua)) {
    try {
      await withDbRetry(() =>
        db.insert(qrScanEvents).values({
          shortCode: cleanCode,
          sourceType,
          campaignLabel: campaignLabel || (sourceType === "sidebar" ? "Sidebar Showcase QR" : "Slide QR"),
          screenId,
          branchId,
          quickPostId,
          targetUrl,
          userAgent: ua,
        })
      );
    } catch {
      // Never block customer redirect if analytics write fails
    }
  }

  return NextResponse.redirect(targetUrl, {
    status: 302,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
