/**
 * @file src/lib/storage-provider.ts
 * @description Pluggable object storage adapter defaulting to Supabase Storage
 * (`STORAGE_PROVIDER=supabase`) with a drop-in Cloudflare R2 (`$0` egress) extension point
 * for scaling beyond POC without rewriting upload or purge routes.
 */

import {
  createSupabaseAdminClient,
  getMediaBucketName,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";

export type StorageProviderKind = "supabase" | "r2";

export function getActiveStorageProvider(): StorageProviderKind {
  return process.env.STORAGE_PROVIDER === "r2" ? "r2" : "supabase";
}

export function isStorageConfigured(): boolean {
  if (getActiveStorageProvider() === "r2") {
    return Boolean(
      process.env.R2_ACCOUNT_ID &&
        process.env.R2_ACCESS_KEY_ID &&
        process.env.R2_SECRET_ACCESS_KEY &&
        process.env.R2_BUCKET_NAME &&
        process.env.R2_PUBLIC_BASE_URL
    );
  }
  return isSupabaseAdminConfigured();
}

export async function createSignedMediaUpload(objectPath: string): Promise<{
  signedUrl: string;
  token: string;
  storagePath: string;
  publicUrl: string;
  bucket: string;
  provider: StorageProviderKind;
}> {
  const provider = getActiveStorageProvider();

  if (provider === "r2") {
    throw new Error(
      "Cloudflare R2 adapter requires S3 signing credentials (set STORAGE_PROVIDER=supabase for POC or install @aws-sdk/client-s3 + @aws-sdk/s3-request-presigner)."
    );
  }

  const supabase = createSupabaseAdminClient();
  const bucket = getMediaBucketName();

  const { data: bucketInfo } = await supabase.storage.getBucket(bucket);
  if (!bucketInfo) {
    await supabase.storage.createBucket(bucket, { public: true });
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(objectPath);

  if (error || !data) {
    throw new Error(error?.message || "Failed to generate signed upload URL");
  }

  const { data: publicData } = supabase.storage
    .from(bucket)
    .getPublicUrl(objectPath);

  return {
    signedUrl: data.signedUrl,
    token: data.token,
    storagePath: objectPath,
    publicUrl: publicData.publicUrl,
    bucket,
    provider,
  };
}

/**
 * Permanently deletes an object from cloud storage to immediately reclaim
 * Supabase Free Tier (1 GB) or R2 bucket quota.
 */
export async function purgeMediaObject(storagePath: string): Promise<{
  purged: boolean;
  reason?: string;
}> {
  if (
    !storagePath ||
    storagePath.startsWith("external:") ||
    storagePath.startsWith("/")
  ) {
    return { purged: false, reason: "External or bundled path" };
  }

  if (!isStorageConfigured()) {
    return { purged: false, reason: "Storage provider not configured" };
  }

  const provider = getActiveStorageProvider();
  if (provider === "r2") {
    return { purged: false, reason: "R2 adapter not initialized" };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const bucket = getMediaBucketName();
    const { error } = await supabase.storage.from(bucket).remove([storagePath]);
    if (error) {
      return { purged: false, reason: error.message };
    }
    return { purged: true };
  } catch (err) {
    return {
      purged: false,
      reason: err instanceof Error ? err.message : "Unknown storage error",
    };
  }
}
