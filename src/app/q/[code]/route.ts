/**
 * @file src/app/q/[code]/route.ts
 * @description Hardened QR-to-Mobile attribution redirect handler: verifies HMAC-signed
 * redirect targets (preventing open-redirect phishing), validates UUIDs, filters crawler
 * bots, applies sliding-window rate limiting, logs `qr_scan_events` (sourceType +
 * campaignLabel + screen + branch + device UA), and issues a safe 302 redirect.
 */

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  db,
  isDatabaseConfigured,
  withDbRetry,
  qrScanEvents,
  quickPosts,
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
  const rawTo = searchParams.get("to");
  const sig = searchParams.get("sig");
  const rawSource = searchParams.get("src");
  const rawLabel = searchParams.get("lbl");

  const screenId = isValidUuid(rawScreenId) ? rawScreenId : null;
  const branchId = isValidUuid(rawBranchId) ? rawBranchId : null;
  const quickPostId = isValidUuid(rawQuickPostId) ? rawQuickPostId : null;

  const sourceType =
    rawSource === "studio_slide" || rawSource === "quick_post" || rawSource === "sidebar"
      ? rawSource
      : quickPostId
        ? "studio_slide"
        : "sidebar";
  const campaignLabel = rawLabel?.trim().slice(0, 160) || null;

  let targetUrl = CROWN_DECORATIVE_QR_URL;

  // 1. Accept signed `?to=` redirects (signed server-side inside player manifest)
  if (rawTo && isSafeHttpUrl(rawTo) && verifyQrRedirect(cleanCode, rawTo, sig)) {
    targetUrl = rawTo;
  } else if (quickPostId && isDatabaseConfigured()) {
    // 2. Otherwise resolve verified destination directly from Postgres quick_posts
    try {
      const [post] = await withDbRetry(() =>
        db.select().from(quickPosts).where(eq(quickPosts.id, quickPostId))
      );
      if (post) {
        const directUrl = post.slideConfig?.qrUrl;
        const canvasUrls =
          post.slideConfig?.canvasDoc?.elements
            .filter((el) => el.type === "qr" && el.qrUrl)
            .map((el) => el.qrUrl!) ?? [];

        if (rawTo && isSafeHttpUrl(rawTo) && (rawTo === directUrl || canvasUrls.includes(rawTo))) {
          targetUrl = rawTo;
        } else if (directUrl && isSafeHttpUrl(directUrl)) {
          targetUrl = directUrl;
        } else if (canvasUrls[0] && isSafeHttpUrl(canvasUrls[0])) {
          targetUrl = canvasUrls[0];
        }
      }
    } catch {
      // Fall back to safe default URL
    }
  } else if (rawTo && isSafeHttpUrl(rawTo)) {
    // 3. Only allow unsigned redirects to official Crown Paints domain (prevents phishing)
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
          campaignLabel,
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
