/**
 * @file src/app/api/feeds/[id]/route.ts
 * @description Single Data Feed CRUD endpoint (`PATCH` edit / rotate API key / remote JSON URL sync, `DELETE` remove).
 */

import crypto from "crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, isDatabaseConfigured, dataFeeds, withDbRetry } from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";
import { hashDeviceToken } from "@/lib/security";
import { broadcastFleetSignal } from "@/lib/realtime";
import { recordAuditLog } from "@/lib/audit";

const patchFeedSchema = z.object({
  name: z.string().min(2).max(150).optional(),
  departmentId: z.string().uuid().optional(),
  sourceType: z.enum(["push_webhook", "google_sheet", "manual_json"]).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  rotateApiKey: z.boolean().optional(),
  pullUrl: z.string().url().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { session, errorResponse } = await requireAdminAccess({
    disallowAuditor: true,
  });
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = patchFeedSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid feed update", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    let pulledPayload: Record<string, unknown> | undefined;
    if (parsed.data.pullUrl) {
      const targetUrl = new URL(parsed.data.pullUrl);
      if (targetUrl.protocol !== "https:" && targetUrl.protocol !== "http:") {
        return Response.json(
          { error: "Only HTTP/HTTPS URLs are supported for pull sync." },
          { status: 400 }
        );
      }
      const remoteRes = await fetch(targetUrl.toString(), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!remoteRes.ok) {
        return Response.json(
          { error: `Remote endpoint responded with HTTP ${remoteRes.status}` },
          { status: 502 }
        );
      }
      const json = (await remoteRes.json()) as unknown;
      if (!json || typeof json !== "object" || Array.isArray(json)) {
        pulledPayload = { items: json };
      } else {
        pulledPayload = json as Record<string, unknown>;
      }
    }

    let newRawApiKey: string | undefined;
    let apiKeyHash: string | undefined;
    if (parsed.data.rotateApiKey) {
      newRawApiKey = `cp_feed_${crypto.randomBytes(24).toString("hex")}`;
      apiKeyHash = hashDeviceToken(newRawApiKey);
    }

    const nextPayload = pulledPayload ?? parsed.data.payload;

    const [updated] = await withDbRetry(() =>
      db
        .update(dataFeeds)
        .set({
          ...(parsed.data.name ? { name: parsed.data.name.trim() } : {}),
          ...(parsed.data.departmentId
            ? { departmentId: parsed.data.departmentId }
            : {}),
          ...(parsed.data.sourceType
            ? { sourceType: parsed.data.sourceType }
            : {}),
          ...(apiKeyHash ? { apiKeyHash } : {}),
          ...(nextPayload !== undefined
            ? { payload: nextPayload, lastSyncedAt: new Date() }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(dataFeeds.id, id))
        .returning()
    );

    if (!updated) {
      return Response.json({ error: "Data feed not found" }, { status: 404 });
    }

    await Promise.all([
      broadcastFleetSignal("manifest_refresh", {
        reason: "data_feed_updated",
        feedKey: updated.key,
      }),
      recordAuditLog({
        action: parsed.data.pullUrl
          ? "data_feed.pulled"
          : parsed.data.rotateApiKey
            ? "data_feed.key_rotated"
            : "data_feed.updated",
        entityType: "data_feed",
        entityId: id,
        userId: session.userId,
        metadata: { key: updated.key },
      }),
    ]);

    return Response.json({
      feed: {
        id: updated.id,
        key: updated.key,
        name: updated.name,
        departmentId: updated.departmentId,
        sourceType: updated.sourceType,
        payload: updated.payload,
        lastSyncedAt: updated.lastSyncedAt,
      },
      ...(newRawApiKey ? { apiKey: newRawApiKey } : {}),
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to update feed" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { session, errorResponse } = await requireAdminAccess({
    disallowAuditor: true,
  });
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const { id } = await context.params;
    const [deleted] = await withDbRetry(() =>
      db.delete(dataFeeds).where(eq(dataFeeds.id, id)).returning()
    );

    if (!deleted) {
      return Response.json({ error: "Data feed not found" }, { status: 404 });
    }

    await recordAuditLog({
      action: "data_feed.deleted",
      entityType: "data_feed",
      entityId: id,
      userId: session.userId,
      metadata: { key: deleted.key, name: deleted.name },
    });

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to delete feed" },
      { status: 500 }
    );
  }
}
