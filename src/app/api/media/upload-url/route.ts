/**
 * @file src/app/api/media/upload-url/route.ts
 * @description Issues signed cloud upload URLs with SHA-256 deduplication (zero duplicate
 * bytes stored) and Supabase Free Tier 48 MB safety guardrail.
 */

import { z } from "zod";
import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { db, isDatabaseConfigured, mediaAssets } from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";
import {
  createSignedMediaUpload,
  getActiveStorageProvider,
  getMaxUploadBytes,
  isStorageConfigured,
} from "@/lib/storage-provider";

const uploadRequestSchema = z.object({
  fileName: z.string().min(1).max(200),
  mimeType: z.string().min(3).max(100),
  departmentCode: z.string().min(2).max(32).default("GENERAL"),
  sha256Checksum: z.string().min(16).max(64).optional(),
  fileSizeBytes: z.number().int().nonnegative().optional(),
});

export async function POST(request: Request) {
  const { errorResponse } = await requireAdminAccess({ disallowAuditor: true });
  if (errorResponse) return errorResponse;

  const activeProvider = getActiveStorageProvider();

  if (!isStorageConfigured()) {
    return Response.json(
      {
        error:
          activeProvider === "r2"
            ? "Cloudflare R2 storage is not fully configured. Verify R2_ACCOUNT_ID/S3_API, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, and R2_PUBLIC_BASE_URL."
            : "Cloud storage is not configured. Check your environment variables.",
      },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const parsed = uploadRequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid upload request", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const maxUploadBytes = getMaxUploadBytes(activeProvider);
    if (
      parsed.data.fileSizeBytes &&
      parsed.data.fileSizeBytes > maxUploadBytes
    ) {
      const maxMb = Math.round(maxUploadBytes / (1024 * 1024));
      return Response.json(
        {
          error: `File exceeds the ${maxMb} MB single-file upload limit. Enable Auto-Compress (Balanced 720p for longer videos) or link an external URL.`,
        },
        { status: 413 }
      );
    }

    // SHA-256 Deduplication: reuse already uploaded file instead of consuming extra disk quota
    if (parsed.data.sha256Checksum && isDatabaseConfigured()) {
      const [existing] = await db
        .select()
        .from(mediaAssets)
        .where(
          and(
            eq(mediaAssets.sha256Checksum, parsed.data.sha256Checksum),
            eq(mediaAssets.isArchived, false)
          )
        )
        .limit(1);

      if (existing) {
        return Response.json({
          deduplicated: true,
          existingAsset: existing,
          storagePath: existing.storagePath,
          publicUrl: existing.publicUrl,
        });
      }
    }

    const safeFileName = parsed.data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const objectPath = `${parsed.data.departmentCode.toLowerCase()}/${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${safeFileName}`;

    const signed = await createSignedMediaUpload(objectPath, parsed.data.mimeType);

    return Response.json({
      deduplicated: false,
      ...signed,
    });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to prepare upload URL",
      },
      { status: 500 }
    );
  }
}
