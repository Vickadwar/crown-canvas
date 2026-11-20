import crypto from "crypto";
import { desc } from "drizzle-orm";
import { connection } from "next/server";
import { z } from "zod";
import { db, isDatabaseConfigured, dataFeeds } from "@/db";
import { hashDeviceToken } from "@/lib/security";
import { recordAuditLog } from "@/lib/audit";
import { requireAdminAccess } from "@/lib/auth-guard";

const createFeedSchema = z.object({
  key: z
    .string()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers, and hyphens only"),
  name: z.string().min(2).max(150),
  departmentId: z.string().uuid(),
  sourceType: z
    .enum(["push_webhook", "google_sheet", "manual_json"])
    .default("push_webhook"),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export async function GET() {
  await connection();
  if (!isDatabaseConfigured()) {
    return Response.json({ feeds: [] });
  }
  const rows = await db
    .select({
      id: dataFeeds.id,
      key: dataFeeds.key,
      name: dataFeeds.name,
      departmentId: dataFeeds.departmentId,
      sourceType: dataFeeds.sourceType,
      payload: dataFeeds.payload,
      lastSyncedAt: dataFeeds.lastSyncedAt,
      createdAt: dataFeeds.createdAt,
    })
    .from(dataFeeds)
    .orderBy(desc(dataFeeds.updatedAt));

  return Response.json({ feeds: rows });
}

export async function POST(request: Request) {
  const { errorResponse } = await requireAdminAccess({ disallowAuditor: true });
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "DATABASE_URL is not configured in .env.local yet." },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const parsed = createFeedSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid data feed payload", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const rawApiKey = `cp_feed_${crypto.randomBytes(24).toString("hex")}`;
    const apiKeyHash = hashDeviceToken(rawApiKey);

    const [created] = await db
      .insert(dataFeeds)
      .values({
        key: parsed.data.key,
        name: parsed.data.name,
        departmentId: parsed.data.departmentId,
        sourceType: parsed.data.sourceType,
        apiKeyHash,
        payload: parsed.data.payload,
        lastSyncedAt: new Date(),
      })
      .returning();

    await recordAuditLog({
      action: "data_feed.created",
      entityType: "data_feed",
      entityId: created.id,
      metadata: { key: created.key, sourceType: created.sourceType },
    });

    return Response.json(
      {
        feed: {
          id: created.id,
          key: created.key,
          name: created.name,
          departmentId: created.departmentId,
          sourceType: created.sourceType,
          payload: created.payload,
          lastSyncedAt: created.lastSyncedAt,
        },
        apiKey: rawApiKey, // Returned once upon creation
      },
      { status: 201 }
    );
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to create data feed",
      },
      { status: 500 }
    );
  }
}
