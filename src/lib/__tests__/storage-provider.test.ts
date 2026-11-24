import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildR2PublicUrl,
  getMaxUploadBytes,
  getStorageQuotaBytes,
  isR2StorageUrl,
  isSupabaseStorageUrl,
  resolvePurgeProvider,
  R2_FREE_TIER_QUOTA_BYTES,
  R2_MAX_UPLOAD_BYTES,
  SUPABASE_FREE_TIER_QUOTA_BYTES,
  SUPABASE_MAX_UPLOAD_BYTES,
} from "../storage-provider";

describe("storage-provider dual Cloudflare R2 / Supabase adapter", () => {
  it("reports accurate quota and single-file upload limits per provider", () => {
    assert.equal(getStorageQuotaBytes("r2"), R2_FREE_TIER_QUOTA_BYTES);
    assert.equal(getStorageQuotaBytes("supabase"), SUPABASE_FREE_TIER_QUOTA_BYTES);
    assert.equal(getMaxUploadBytes("r2"), R2_MAX_UPLOAD_BYTES);
    assert.equal(getMaxUploadBytes("supabase"), SUPABASE_MAX_UPLOAD_BYTES);
    assert.ok(getStorageQuotaBytes("r2") === 10 * 1024 * 1024 * 1024);
  });

  it("constructs clean R2 public URLs without double slashes", () => {
    assert.equal(
      buildR2PublicUrl(
        "/marketing/1234-promo.mp4",
        "https://pub-demo123.r2.dev///"
      ),
      "https://pub-demo123.r2.dev/marketing/1234-promo.mp4"
    );
  });

  it("correctly classifies Supabase Storage vs Cloudflare R2 URLs for cross-provider purging", () => {
    const sbUrl =
      "https://dllufyfgfupbczrcwayl.supabase.co/storage/v1/object/public/signage-media/cs/clip.mp4";
    const r2Url =
      "https://pub-3487573cd6b4470384d010b0b24aefbb.r2.dev/cs/clip.mp4";

    assert.equal(isSupabaseStorageUrl(sbUrl), true);
    assert.equal(isR2StorageUrl(sbUrl), false);
    assert.equal(resolvePurgeProvider(sbUrl, "r2"), "supabase");

    assert.equal(isR2StorageUrl(r2Url), true);
    assert.equal(isSupabaseStorageUrl(r2Url), false);
    assert.equal(resolvePurgeProvider(r2Url, "supabase"), "r2");

    assert.equal(resolvePurgeProvider(null, "r2"), "r2");
    assert.equal(resolvePurgeProvider(null, "supabase"), "supabase");
  });
});
