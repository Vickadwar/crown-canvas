/**
 * @file src/lib/storage-provider.ts
 * @description Unified cloud object storage adapter supporting Cloudflare R2
 * (`STORAGE_PROVIDER=r2` — 10 GB Free Tier, $0 unlimited egress) and Supabase Storage
 * (`STORAGE_PROVIDER=supabase` fallback). Handles presigned direct browser uploads with
 * 1-year immutable `Cache-Control` headers and smart cross-provider object purging.
 */

import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  createSupabaseAdminClient,
  getMediaBucketName,
  isSupabaseAdminConfigured,
} from "./supabase/admin";

export type StorageProviderKind = "supabase" | "r2";

export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
export const R2_FREE_TIER_QUOTA_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB Free Tier
export const SUPABASE_FREE_TIER_QUOTA_BYTES = 1024 * 1024 * 1024; // 1 GB Free Tier
export const R2_MAX_UPLOAD_BYTES = 150 * 1024 * 1024; // 150 MB safety cap on R2
export const SUPABASE_MAX_UPLOAD_BYTES = 48 * 1024 * 1024; // 48 MB safety cap below Supabase 50 MB limit

let cachedR2Client: S3Client | null = null;
let cachedR2Key = "";

export function getActiveStorageProvider(): StorageProviderKind {
  return process.env.STORAGE_PROVIDER === "r2" ? "r2" : "supabase";
}

export function getR2Endpoint(): string | null {
  const explicit = process.env.S3_API?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  if (!accountId) return null;
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

export function getR2PublicBaseUrl(): string | null {
  const base = process.env.R2_PUBLIC_BASE_URL?.trim();
  if (!base) return null;
  return base.replace(/\/+$/, "");
}

export function isR2Configured(): boolean {
  return Boolean(
    getR2Endpoint() &&
    process.env.R2_ACCESS_KEY_ID?.trim() &&
    process.env.R2_SECRET_ACCESS_KEY?.trim() &&
    process.env.R2_BUCKET_NAME?.trim() &&
    getR2PublicBaseUrl()
  );
}

export function isStorageConfigured(): boolean {
  if (getActiveStorageProvider() === "r2") {
    return isR2Configured();
  }
  return isSupabaseAdminConfigured();
}

export function getStorageQuotaBytes(
  provider: StorageProviderKind = getActiveStorageProvider()
): number {
  return provider === "r2"
    ? R2_FREE_TIER_QUOTA_BYTES
    : SUPABASE_FREE_TIER_QUOTA_BYTES;
}

export function getMaxUploadBytes(
  provider: StorageProviderKind = getActiveStorageProvider()
): number {
  return provider === "r2" ? R2_MAX_UPLOAD_BYTES : SUPABASE_MAX_UPLOAD_BYTES;
}

export function buildR2PublicUrl(
  objectPath: string,
  baseUrlOverride?: string
): string {
  const base = (baseUrlOverride ?? getR2PublicBaseUrl() ?? "").replace(/\/+$/, "");
  const cleanKey = objectPath.replace(/^\/+/, "");
  return `${base}/${cleanKey}`;
}

export function isSupabaseStorageUrl(url?: string | null): boolean {
  if (!url) return false;
  return /supabase\.(co|in)\/storage\/v1\/object\//i.test(url);
}

export function isR2StorageUrl(url?: string | null): boolean {
  if (!url) return false;
  const r2Base = getR2PublicBaseUrl();
  if (r2Base && url.startsWith(r2Base)) return true;
  return /\.(r2\.dev|r2\.cloudflarestorage\.com)(\/|$)/i.test(url);
}

export function resolvePurgeProvider(
  publicUrl?: string | null,
  activeProvider: StorageProviderKind = getActiveStorageProvider()
): StorageProviderKind {
  if (isSupabaseStorageUrl(publicUrl)) return "supabase";
  if (isR2StorageUrl(publicUrl)) return "r2";
  return activeProvider;
}

export function createR2Client(): S3Client {
  const endpoint = getR2Endpoint();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Cloudflare R2 credentials missing. Set R2_ACCOUNT_ID (or S3_API), R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY."
    );
  }

  const cacheKey = `${endpoint}|${accessKeyId}`;
  if (cachedR2Client && cachedR2Key === cacheKey) {
    return cachedR2Client;
  }

  cachedR2Client = new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
  cachedR2Key = cacheKey;
  return cachedR2Client;
}

export async function createSignedMediaUpload(
  objectPath: string,
  contentType = "application/octet-stream"
): Promise<{
  signedUrl: string;
  token?: string;
  uploadHeaders: Record<string, string>;
  storagePath: string;
  publicUrl: string;
  bucket: string;
  provider: StorageProviderKind;
}> {
  const provider = getActiveStorageProvider();
  const cleanKey = objectPath.replace(/^\/+/, "");

  if (provider === "r2") {
    const bucket = process.env.R2_BUCKET_NAME?.trim();
    if (!bucket || !getR2PublicBaseUrl()) {
      throw new Error(
        "Missing R2_BUCKET_NAME or R2_PUBLIC_BASE_URL environment variables."
      );
    }

    const client = createR2Client();
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: cleanKey,
      ContentType: contentType,
      CacheControl: IMMUTABLE_CACHE_CONTROL,
    });

    const signedUrl = await getSignedUrl(client, command, { expiresIn: 900 });
    return {
      signedUrl,
      uploadHeaders: {
        "Content-Type": contentType,
        "Cache-Control": IMMUTABLE_CACHE_CONTROL,
      },
      storagePath: cleanKey,
      publicUrl: buildR2PublicUrl(cleanKey),
      bucket,
      provider: "r2",
    };
  }

  const supabase = createSupabaseAdminClient();
  const bucket = getMediaBucketName();

  const { data: bucketInfo } = await supabase.storage.getBucket(bucket);
  if (!bucketInfo) {
    await supabase.storage.createBucket(bucket, { public: true });
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(cleanKey);

  if (error || !data) {
    throw new Error(error?.message || "Failed to generate signed upload URL");
  }

  const { data: publicData } = supabase.storage
    .from(bucket)
    .getPublicUrl(cleanKey);

  return {
    signedUrl: data.signedUrl,
    token: data.token,
    uploadHeaders: {
      "Content-Type": contentType,
      "cache-control": "31536000",
    },
    storagePath: cleanKey,
    publicUrl: publicData.publicUrl,
    bucket,
    provider: "supabase",
  };
}

/**
 * Permanently deletes an object from the exact cloud storage provider where it lives
 * (Cloudflare R2 or legacy Supabase Storage) to immediately reclaim bucket quota.
 */
export async function purgeMediaObject(
  storagePath: string,
  publicUrl?: string | null
): Promise<{
  purged: boolean;
  provider?: StorageProviderKind;
  reason?: string;
}> {
  if (
    !storagePath ||
    storagePath.startsWith("external:") ||
    storagePath.startsWith("/")
  ) {
    return { purged: false, reason: "External or bundled path" };
  }

  const targetProvider = resolvePurgeProvider(publicUrl);
  const cleanKey = storagePath.replace(/^\/+/, "");

  if (targetProvider === "r2") {
    if (!isR2Configured()) {
      return { purged: false, provider: "r2", reason: "R2 not configured" };
    }
    try {
      const client = createR2Client();
      const bucket = process.env.R2_BUCKET_NAME!.trim();
      await client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: cleanKey,
        })
      );
      return { purged: true, provider: "r2" };
    } catch (err) {
      return {
        purged: false,
        provider: "r2",
        reason: err instanceof Error ? err.message : "R2 delete error",
      };
    }
  }

  if (!isSupabaseAdminConfigured()) {
    return {
      purged: false,
      provider: "supabase",
      reason: "Supabase Storage not configured",
    };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const bucket = getMediaBucketName();
    const { error } = await supabase.storage.from(bucket).remove([cleanKey]);
    if (error) {
      return { purged: false, provider: "supabase", reason: error.message };
    }
    return { purged: true, provider: "supabase" };
  } catch (err) {
    return {
      purged: false,
      provider: "supabase",
      reason: err instanceof Error ? err.message : "Unknown storage error",
    };
  }
}
