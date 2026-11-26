/**
 * @file src/app/api/promotions/route.ts
 * @description Agency-ready Promotions campaign CRUD (`GET`, `POST`) with date-range
 * auto-expiry, multi-screen targeting, and optional background music attachment.
 */

import { desc } from "drizzle-orm";
import { connection } from "next/server";
import { z } from "zod";
import { db, isDatabaseConfigured, withDbRetry, promotions } from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";
import { broadcastFleetSignal } from "@/lib/realtime";
import { recordAuditLog } from "@/lib/audit";

const createPromotionSchema = z.object({
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(500).default(""),
  agencyName: z.string().trim().max(120).default("Campaign Agency"),
  campaignCode: z.string().trim().max(64).nullable().optional(),
  mediaType: z.enum(["image", "video", "pdf"]).default("image"),
  publicUrl: z.string().url(),
  storagePath: z.string().min(2).max(500),
  mimeType: z.string().max(100).default("image/webp"),
  fileSizeBytes: z.number().int().nonnegative().default(0),
  sha256Checksum: z.string().max(64).default(""),
  durationSeconds: z.number().int().min(5).max(300).default(15),
  audioTrackId: z.string().uuid().nullable().optional(),
  targetType: z
    .enum(["screen", "screen_group", "branch", "country", "screen_role", "global"])
    .default("global"),
  targetId: z.string().uuid().nullable().optional(),
  targetScreenIds: z.array(z.string().uuid()).max(200).nullable().optional(),
  priority: z.number().int().min(1).max(1000).default(50),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
});

export async function GET() {
  await connection();
  const { errorResponse } = await requireAdminAccess();
  if (errorResponse) return errorResponse;
  if (!isDatabaseConfigured()) return Response.json({ promotions: [] });

  try {
    const rows = await withDbRetry(() =>
      db
        .select()
        .from(promotions)
        .orderBy(desc(promotions.priority), desc(promotions.createdAt))
    );
    return Response.json({ promotions: rows });
  } catch {
    return Response.json({ promotions: [] });
  }
}

export async function POST(request: Request) {
  const { session, errorResponse } = await requireAdminAccess({
    disallowAuditor: true,
  });
  if (errorResponse) return errorResponse;
  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const parsed = createPromotionSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message || "Invalid promotion payload" },
        { status: 400 }
      );
    }

    const screenIds =
      parsed.data.targetScreenIds && parsed.data.targetScreenIds.length > 0
        ? parsed.data.targetScreenIds
        : null;

    const [created] = await withDbRetry(() =>
      db
        .insert(promotions)
        .values({
          title: parsed.data.title,
          description: parsed.data.description,
          agencyName: parsed.data.agencyName,
          campaignCode: parsed.data.campaignCode ?? null,
          mediaType: parsed.data.mediaType,
          publicUrl: parsed.data.publicUrl,
          storagePath: parsed.data.storagePath,
          mimeType: parsed.data.mimeType,
          fileSizeBytes: parsed.data.fileSizeBytes,
          sha256Checksum: parsed.data.sha256Checksum,
          durationSeconds: parsed.data.durationSeconds,
          audioTrackId: parsed.data.audioTrackId ?? null,
          targetType: screenIds ? "screen" : parsed.data.targetType,
          targetId: screenIds ? screenIds[0] : parsed.data.targetId ?? null,
          targetScreenIds: screenIds,
          priority: parsed.data.priority,
          startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
          endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
          isActive: parsed.data.isActive,
          createdBy: session.userId ?? null,
        })
        .returning()
    );

    await Promise.all([
      broadcastFleetSignal("manifest_refresh", {
        reason: "promotion_created",
        promotionId: created.id,
      }),
      recordAuditLog({
        action: "promotion.created",
        entityType: "promotion",
        entityId: created.id,
        userId: session.userId,
        metadata: { title: created.title, agencyName: created.agencyName },
      }),
    ]);

    return Response.json({ promotion: created }, { status: 201 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to save promotion" },
      { status: 500 }
    );
  }
}
