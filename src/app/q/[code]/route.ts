/**
 * @file src/app/q/[code]/route.ts
 * @description QR-to-Mobile attribution redirect handler: logs showroom & screen scan
 * events into `qr_scan_events` before issuing a safe 302 redirect.
 */

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, isDatabaseConfigured, qrScanEvents, quickPosts } from "@/db";

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
  const { searchParams } = new URL(request.url);
  const screenId = searchParams.get("s");
  const branchId = searchParams.get("b");
  const quickPostId = searchParams.get("p");
  const rawTo = searchParams.get("to");

  let targetUrl =
    rawTo && isSafeHttpUrl(rawTo) ? rawTo : "https://www.crownpaints.co.ke";

  if (isDatabaseConfigured()) {
    try {
      if (!rawTo && quickPostId) {
        const [post] = await db
          .select()
          .from(quickPosts)
          .where(eq(quickPosts.id, quickPostId));
        if (post?.slideConfig?.qrUrl && isSafeHttpUrl(post.slideConfig.qrUrl)) {
          targetUrl = post.slideConfig.qrUrl;
        }
      }

      await db.insert(qrScanEvents).values({
        shortCode: code.slice(0, 32),
        screenId: screenId || null,
        branchId: branchId || null,
        quickPostId: quickPostId || null,
        targetUrl,
        userAgent: request.headers.get("user-agent") ?? undefined,
      });
    } catch {
      // Never block customer redirect if analytics write fails
    }
  }

  return NextResponse.redirect(targetUrl, { status: 302 });
}
