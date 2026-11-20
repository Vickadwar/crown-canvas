import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, isDatabaseConfigured, dataFeeds } from "@/db";
import { hashDeviceToken } from "@/lib/security";
import { broadcastFleetSignal } from "@/lib/realtime";
import { recordAuditLog } from "@/lib/audit";

const pushPayloadSchema = z.object({
  payload: z.record(z.string(), z.unknown()),
  fromCms: z.boolean().optional(),
});

/**
 * Webhook & CMS snapshot ingestion endpoint for live Recharts / SHE / ICT feeds.
 * External ERP / POS / Google Apps Scripts authenticate with `x-feed-key: cp_feed_...`
 * or `Authorization: Bearer cp_feed_...`.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ key: string }> }
) {
  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "DATABASE_URL is not configured in .env.local yet." },
      { status: 503 }
    );
  }

  try {
    const { key } = await context.params;
    const [feed] = await db
      .select()
      .from(dataFeeds)
      .where(eq(dataFeeds.key, key));

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

    // Verify API key for external webhook calls (if key hash is set and not internal CMS edit)
    const headerKey =
      request.headers.get("x-feed-key") ||
      (request.headers.get("authorization")?.startsWith("Bearer ")
        ? request.headers.get("authorization")?.slice(7).trim()
        : null);

    if (!parsed.data.fromCms && feed.apiKeyHash) {
      if (!headerKey || hashDeviceToken(headerKey) !== feed.apiKeyHash) {
        return Response.json(
          { error: "Invalid or missing x-feed-key credential" },
          { status: 401 }
        );
      }
    }

    const [updated] = await db
      .update(dataFeeds)
      .set({
        payload: parsed.data.payload,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(dataFeeds.id, feed.id))
      .returning();

    await broadcastFleetSignal("manifest_refresh", {
      reason: "data_feed_updated",
      feedKey: key,
    });

    await recordAuditLog({
      action: "data_feed.synced",
      entityType: "data_feed",
      entityId: feed.id,
      metadata: { key, via: parsed.data.fromCms ? "cms" : "webhook" },
    });

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
