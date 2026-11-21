/**
 * @file src/lib/__tests__/video-compressor.test.ts
 * @description Unit tests for duration-aware browser video compression planning.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeVideoCompressionPlan } from "../video-compressor";

describe("video-compressor plan", () => {
  it("skips compression for already compact H.264 MP4 videos in auto_fit mode", () => {
    const plan = computeVideoCompressionPlan({
      fileSizeBytes: 12 * 1024 * 1024,
      durationSeconds: 45,
      mimeType: "video/mp4",
      fileName: "promo-clean.mp4",
      sourceWidth: 1920,
      sourceHeight: 1080,
      preset: "auto_fit",
    });
    assert.equal(plan.shouldCompress, false);
  });

  it("targets crisp 1080p ~38-42 MB output for a 332 MB 2-minute showroom video", () => {
    const plan = computeVideoCompressionPlan({
      fileSizeBytes: 332 * 1024 * 1024,
      durationSeconds: 120,
      mimeType: "video/mp4",
      fileName: "agency-export.mp4",
      sourceWidth: 1920,
      sourceHeight: 1080,
      preset: "auto_fit",
    });
    assert.equal(plan.shouldCompress, true);
    assert.equal(plan.targetWidth, 1920);
    assert.equal(plan.targetHeight, 1080);
    assert.equal(plan.audioBitrate, 128_000);
    assert.ok(plan.videoBitrate >= 2_200_000 && plan.videoBitrate <= 3_000_000);
    assert.ok(plan.estimatedOutputMb <= 42);
  });

  it("preserves portrait 9:16 orientation with even H.264 dimensions", () => {
    const plan = computeVideoCompressionPlan({
      fileSizeBytes: 210 * 1024 * 1024,
      durationSeconds: 90,
      mimeType: "video/quicktime",
      fileName: "vertical-totem.mov",
      sourceWidth: 2160,
      sourceHeight: 3840,
      preset: "auto_fit",
    });
    assert.equal(plan.shouldCompress, true);
    assert.ok(plan.targetHeight > plan.targetWidth);
    assert.equal(plan.targetWidth % 2, 0);
    assert.equal(plan.targetHeight % 2, 0);
    assert.ok(plan.targetHeight <= 1920);
  });

  it("steps down to 720p for 5-minute videos to keep visual sharpness under 44 MB", () => {
    const plan = computeVideoCompressionPlan({
      fileSizeBytes: 420 * 1024 * 1024,
      durationSeconds: 300,
      mimeType: "video/mp4",
      fileName: "long-corporate-feature.mp4",
      sourceWidth: 1920,
      sourceHeight: 1080,
      preset: "auto_fit",
    });
    assert.equal(plan.shouldCompress, true);
    assert.equal(plan.targetWidth, 1280);
    assert.equal(plan.targetHeight, 720);
    assert.equal(plan.audioBitrate, 96_000);
    assert.ok(plan.estimatedOutputMb <= 44);
  });

  it("transcodes non-MP4 files (WebM/MOV) even when already small", () => {
    const plan = computeVideoCompressionPlan({
      fileSizeBytes: 9 * 1024 * 1024,
      durationSeconds: 20,
      mimeType: "video/webm",
      fileName: "clip.webm",
      sourceWidth: 1920,
      sourceHeight: 1080,
      preset: "auto_fit",
    });
    assert.equal(plan.shouldCompress, true);
  });
});
