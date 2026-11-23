/**
 * @file src/app/api/integrations/feeds/[key]/route.ts
 * @description Hardened webhook & CMS snapshot ingestion endpoint for live KPI/SHE/ICT feeds.
 * External callers authenticate with constant-time HMAC-checked `x-feed-key` / `Bearer`.
 * Internal CMS edits (`fromCms: true`) enforce verified server-side admin RBAC (`feeds:manage`).
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, isDatabaseConfigured, withDbRetry, dataFeeds } from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";
import { constantTimeEquals, hashDeviceToken } from "@/lib/security";
import {
  checkRateLimit,
  getClientIp,
  rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { broadcastFleetSignal } from "@/lib/realtime";
import { recordAuditLog } from "@/lib/audit";

const pushPayloadSchema = z.object({
  payload: z.record(z.string(), z.unknown()),
  fromCms: z.boolean().optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ key: string }> }
) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`feed_push:${ip}`, 60, 60_000);
  if (!rl.allowed) {
    return rateLimitExceededResponse(rl.retryAfterSeconds);
  }

  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "DATABASE_URL is not configured yet." },
      { status: 503 }
    );
  }

  try {
    const { key } = await context.params;
    const [feed] = await withDbRetry(() =>
      db.select().from(dataFeeds).where(eq(dataFeeds.key, key))
    );

    if (!feed) {
      return Response.json({ error: "Data feed not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = pushPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid feed payload", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    let actorUserId: string | null = null;

    if (parsed.data.fromCms) {
      // NEVER trust client-supplied `fromCms: true` without verifying server-side session & RBAC
      const { session, errorResponse } = await requireAdminAccess({
        disallowAuditor: true,
        permission: "feeds:manage",
      });
      if (errorResponse) return errorResponse;
      actorUserId = session.userId;
    } else {
      const headerKey =
        request.headers.get("x-feed-key") ||
        (request.headers.get("authorization")?.startsWith("Bearer ")
          ? request.headers.get("authorization")?.slice(7).trim()
          : null);

      if (
        !feed.apiKeyHash ||
        !headerKey ||
        !constantTimeEquals(hashDeviceToken(headerKey), feed.apiKeyHash)
      ) {
        return Response.json(
          { error: "Invalid or missing x-feed-key credential" },
          { status: 401 }
        );
      }
    }

    const [updated] = await withDbRetry(() =>
      db
        .update(dataFeeds)
        .set({
          payload: parsed.data.payload,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(dataFeeds.id, feed.id))
        .returning()
    );

    await Promise.all([
      broadcastFleetSignal("manifest_refresh", {
        reason: "data_feed_updated",
        feedKey: key,
      }),
      recordAuditLog({
        action: "data_feed.synced",
        entityType: "data_feed",
        entityId: feed.id,
        userId: actorUserId,
        metadata: { key, via: parsed.data.fromCms ? "cms" : "webhook" },
      }),
    ]);

    return Response.json({
      ok: true,
      key: updated.key,
      lastSyncedAt: updated.lastSyncedAt,
    });
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : "Failed to ingest feed",
      },
      { status: 500 }
    );
  }
}
