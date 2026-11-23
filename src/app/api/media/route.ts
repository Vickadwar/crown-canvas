/**
 * @file src/app/api/media/route.ts
 * @description Creates uploaded media or zero-disk external URL/PDF assets with scoped RBAC
 * checks and Maker-Checker approval defaults.
 */

import { z } from "zod";
import crypto from "crypto";
import { db, isDatabaseConfigured, mediaAssets } from "@/db";
import { canAutoApproveContent, requireAdminAccess } from "@/lib/auth-guard";
import { recordAuditLog } from "@/lib/audit";

const createMediaSchema = z.object({
  title: z.string().min(2).max(180),
  description: z.string().optional(),
  mediaType: z.enum(["video", "image", "web_url", "pdf"]),
  storagePath: z.string().min(1).optional(),
  publicUrl: z
    .string()
    .refine((v) => v.startsWith("/") || /^https?:\/\//.test(v), {
      message: "Must be an HTTP(S) URL or local /media path",
    }),
  mimeType: z.string().min(3).max(100).default("text/html"),
  fileSizeBytes: z.number().int().nonnegative().default(0),
  sha256Checksum: z.string().min(8).max(64).optional(),
  durationSeconds: z.number().int().min(3).max(3600).default(15),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  departmentId: z.string().uuid(),
  countryId: z.string().uuid().nullable().optional(),
});

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "DATABASE_URL is not configured in .env.local yet." },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const parsed = createMediaSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid media payload", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { session, errorResponse } = await requireAdminAccess({
      disallowAuditor: true,
      departmentId: parsed.data.departmentId,
      countryId: parsed.data.countryId ?? null,
    });
    if (errorResponse) return errorResponse;

    const autoApproved = canAutoApproveContent(session);
    const isExternal =
      !parsed.data.storagePath &&
      (parsed.data.mediaType === "web_url" || parsed.data.mediaType === "pdf");

    const computedChecksum =
      parsed.data.sha256Checksum ??
      crypto
        .createHash("sha256")
        .update(parsed.data.publicUrl)
        .digest("hex");

    const storagePath =
      parsed.data.storagePath ??
      (isExternal ? `external:${parsed.data.mediaType}` : parsed.data.publicUrl);

    const [asset] = await db
      .insert(mediaAssets)
      .values({
        title: parsed.data.title,
        description: parsed.data.description,
        mediaType: parsed.data.mediaType,
        storagePath,
        publicUrl: parsed.data.publicUrl,
        mimeType: parsed.data.mimeType,
        fileSizeBytes: isExternal ? 0 : parsed.data.fileSizeBytes,
        sha256Checksum: computedChecksum,
        durationSeconds: parsed.data.durationSeconds,
        width: parsed.data.width,
        height: parsed.data.height,
        departmentId: parsed.data.departmentId,
        countryId: parsed.data.countryId ?? null,
        uploadedBy: session.userId,
        approvalStatus: autoApproved ? "approved" : "pending_approval",
        approvedBy: autoApproved ? session.userId : null,
        approvedAt: autoApproved ? new Date() : null,
      })
      .returning();

    await recordAuditLog({
      action: autoApproved ? "media.created" : "media.submitted_for_approval",
      entityType: "media_asset",
      entityId: asset.id,
      userId: session.userId,
      metadata: {
        title: asset.title,
        mediaType: asset.mediaType,
        fileSizeBytes: asset.fileSizeBytes,
        approvalStatus: asset.approvalStatus,
      },
    });

    return Response.json({ asset }, { status: 201 });
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : "Failed to save media asset",
      },
      { status: 500 }
    );
  }
}
