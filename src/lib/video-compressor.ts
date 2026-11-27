/**
 * @file src/lib/video-compressor.ts
 * @description Hardware-accelerated in-browser video compressor powered by WebCodecs
 * via Mediabunny (`avc` H.264 + `aac` stereo MP4 with Fast Start). Streams large
 * agency exports (e.g. 332 MB / 2 min) from disk via BlobSource and automatically
 * targets crisp 1080p/720p signage MP4s (< 45 MB) at $0 server cost.
 */

export type VideoCompressionPreset =
  | "auto_fit"
  | "high_1080p"
  | "balanced_720p"
  | "passthrough";

export interface VideoCompressionPlan {
  shouldCompress: boolean;
  targetMaxBytes: number;
  targetWidth: number;
  targetHeight: number;
  videoBitrate: number;
  audioBitrate: number;
  estimatedOutputMb: number;
  reason: string;
}

export interface VideoCompressionProgress {
  percent: number;
  stage: "analyzing" | "compressing" | "retrying" | "finalizing";
  processedSeconds?: number;
  totalSeconds?: number;
}

export interface VideoCompressionResult {
  file: File;
  compressed: boolean;
  originalBytes: number;
  outputBytes: number;
  durationSeconds: number;
  width?: number;
  height?: number;
  savingsPercent: number;
}

const DEFAULT_MAX_UPLOAD_BYTES = 46 * 1024 * 1024; // 46 MB ceiling (keeps TV local caches fast)
const AUTO_FIT_TARGET_BYTES = 24 * 1024 * 1024; // 24 MB signage budget (2x more videos fit in TV cache)
const HIGH_1080P_TARGET_BYTES = 38 * 1024 * 1024; // 38 MB high-bitrate hero promos
const BALANCED_720P_TARGET_BYTES = 14 * 1024 * 1024; // 14 MB ultra-compact TV clips
const COMPACT_PASSTHROUGH_BYTES = 8 * 1024 * 1024; // Only truly tiny <=8 MB MP4s skip broadcast normalization

let aacEncoderRegistered = false;

function toEvenDimension(value: number): number {
  const clamped = Math.max(16, Math.round(value));
  return clamped % 2 === 0 ? clamped : clamped - 1;
}

function fitDimensions(
  sourceWidth: number,
  sourceHeight: number,
  maxLongEdge: number,
  maxShortEdge: number
): { width: number; height: number } {
  const isPortrait = sourceHeight > sourceWidth;
  const maxW = isPortrait ? maxShortEdge : maxLongEdge;
  const maxH = isPortrait ? maxLongEdge : maxShortEdge;
  const scale = Math.min(1, maxW / sourceWidth, maxH / sourceHeight);
  return {
    width: toEvenDimension(sourceWidth * scale),
    height: toEvenDimension(sourceHeight * scale),
  };
}

/**
 * Pure duration-aware planner calculating optimal resolution and H.264/AAC bitrates
 * to keep signage videos sharp on 1080p/4K TVs while fitting under cloud & TV cache limits.
 */
export function computeVideoCompressionPlan(params: {
  fileSizeBytes: number;
  durationSeconds: number;
  mimeType: string;
  fileName: string;
  sourceWidth?: number;
  sourceHeight?: number;
  preset?: VideoCompressionPreset;
  maxUploadBytes?: number;
}): VideoCompressionPlan {
  const preset = params.preset ?? "auto_fit";
  const maxUploadBytes = params.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES;
  const duration = Math.max(5, params.durationSeconds || 15);
  const srcW = params.sourceWidth && params.sourceWidth > 0 ? params.sourceWidth : 1920;
  const srcH = params.sourceHeight && params.sourceHeight > 0 ? params.sourceHeight : 1080;

  const isMp4 =
    params.mimeType === "video/mp4" ||
    params.fileName.toLowerCase().endsWith(".mp4");

  if (
    preset === "passthrough" &&
    isMp4 &&
    params.fileSizeBytes <= maxUploadBytes
  ) {
    return {
      shouldCompress: false,
      targetMaxBytes: maxUploadBytes,
      targetWidth: toEvenDimension(srcW),
      targetHeight: toEvenDimension(srcH),
      videoBitrate: 0,
      audioBitrate: 0,
      estimatedOutputMb: Number((params.fileSizeBytes / (1024 * 1024)).toFixed(1)),
      reason: "Original MP4 passthrough selected",
    };
  }

  if (
    preset === "auto_fit" &&
    isMp4 &&
    params.fileSizeBytes <= COMPACT_PASSTHROUGH_BYTES &&
    Math.max(srcW, srcH) <= 1920
  ) {
    return {
      shouldCompress: false,
      targetMaxBytes: maxUploadBytes,
      targetWidth: toEvenDimension(srcW),
      targetHeight: toEvenDimension(srcH),
      videoBitrate: 0,
      audioBitrate: 0,
      estimatedOutputMb: Number((params.fileSizeBytes / (1024 * 1024)).toFixed(1)),
      reason: "Already compact TV-ready MP4",
    };
  }

  const audioBitrate = duration > 240 ? 96_000 : 128_000;
  const presetBudget =
    preset === "high_1080p"
      ? HIGH_1080P_TARGET_BYTES
      : preset === "balanced_720p"
        ? BALANCED_720P_TARGET_BYTES
        : AUTO_FIT_TARGET_BYTES;
  const targetBudgetBytes = Math.min(
    presetBudget,
    Math.round(maxUploadBytes * 0.87)
  );
  const totalBudgetBps = (targetBudgetBytes * 8) / duration;
  const rawVideoBps = Math.floor(totalBudgetBps - audioBitrate);

  let minVideoBps = 450_000;
  let maxVideoBps = 2_000_000; // Crisp 1080p signage bitrate (~15-20 MB for 2-min promos)
  if (preset === "high_1080p") {
    minVideoBps = 800_000;
    maxVideoBps = 3_600_000;
  } else if (preset === "balanced_720p") {
    minVideoBps = 400_000;
    maxVideoBps = 1_300_000;
  }

  const videoBitrate = Math.max(minVideoBps, Math.min(maxVideoBps, rawVideoBps));

  // Step down to 720p when bitrate per pixel would starve 1080p (typically > ~2.5 min clips)
  const use720p = preset === "balanced_720p" || videoBitrate < 1_350_000;
  const fitted = fitDimensions(
    srcW,
    srcH,
    use720p ? 1280 : 1920,
    use720p ? 720 : 1080
  );

  // Account for ~4% MP4 container muxing overhead
  const estimatedBytes = ((videoBitrate + audioBitrate) / 8) * duration * 1.04;
  const estimatedOutputMb = Number((estimatedBytes / (1024 * 1024)).toFixed(1));

  const reason = !isMp4
    ? `Transcoding to hardware-ready H.264 MP4 (${fitted.width}x${fitted.height})`
    : `Compressing ${(params.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB → ~${estimatedOutputMb} MB (${fitted.width}x${fitted.height} H.264)`;

  return {
    shouldCompress: true,
    targetMaxBytes: maxUploadBytes,
    targetWidth: fitted.width,
    targetHeight: fitted.height,
    videoBitrate,
    audioBitrate,
    estimatedOutputMb,
    reason,
  };
}

export function isWebCodecsSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.VideoEncoder === "function" &&
    typeof window.VideoDecoder === "function"
  );
}

async function runSinglePass(args: {
  file: File;
  width: number;
  height: number;
  videoBitrate: number;
  audioBitrate: number;
  durationSeconds: number;
  stage: "compressing" | "retrying";
  onProgress?: (p: VideoCompressionProgress) => void;
  signal?: AbortSignal;
}): Promise<ArrayBuffer> {
  const mediabunny = await import("mediabunny");
  const {
    Input,
    ALL_FORMATS,
    BlobSource,
    Output,
    BufferTarget,
    Mp4OutputFormat,
    Conversion,
    canEncodeAudio,
  } = mediabunny;

  if (!aacEncoderRegistered) {
    const nativeAac = await canEncodeAudio("aac").catch(() => false);
    if (!nativeAac) {
      const { registerAacEncoder } = await import("@mediabunny/aac-encoder");
      registerAacEncoder();
    }
    aacEncoderRegistered = true;
  }

  const input = new Input({
    source: new BlobSource(args.file),
    formats: ALL_FORMATS,
  });

  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target,
  });

  const conversion = await Conversion.init({
    input,
    output,
    tracks: "primary",
    showWarnings: false,
    video: {
      codec: "avc",
      width: args.width,
      height: args.height,
      fit: "contain",
      frameRate: 30,
      bitrate: args.videoBitrate,
      keyFrameInterval: 2,
      forceTranscode: true,
    },
    audio: {
      codec: "aac",
      bitrate: args.audioBitrate,
      sampleRate: 48_000,
      numberOfChannels: 2,
      forceTranscode: true,
    },
  });

  if (!conversion.isValid) {
    input.dispose();
    const reasons = conversion.discardedTracks
      .map((d) => `${d.track.type}:${d.reason}`)
      .join(", ");
    throw new Error(
      `Browser could not transcode this video format (${reasons || "unsupported codec"}).`
    );
  }

  conversion.onProgress = (progress, processedTime) => {
    args.onProgress?.({
      percent: Math.min(99, Math.max(1, Math.round(progress * 100))),
      stage: args.stage,
      processedSeconds: Math.round(processedTime),
      totalSeconds: Math.round(args.durationSeconds),
    });
  };

  const onAbort = () => {
    void conversion.cancel();
  };
  args.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    await conversion.execute();
    args.onProgress?.({
      percent: 100,
      stage: "finalizing",
      processedSeconds: Math.round(args.durationSeconds),
      totalSeconds: Math.round(args.durationSeconds),
    });

    if (!target.buffer) {
      throw new Error("Video compression produced an empty output buffer.");
    }
    return target.buffer;
  } finally {
    args.signal?.removeEventListener("abort", onAbort);
    input.dispose();
  }
}

/**
 * Compresses an uploaded video in-browser using WebCodecs GPU acceleration.
 * Streams the source file from disk via BlobSource so 300-600 MB files convert smoothly.
 */
export async function compressVideoInBrowser(
  file: File,
  options?: {
    preset?: VideoCompressionPreset;
    maxUploadBytes?: number;
    onProgress?: (p: VideoCompressionProgress) => void;
    signal?: AbortSignal;
  }
): Promise<VideoCompressionResult> {
  const maxUploadBytes = options?.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES;
  const preset = options?.preset ?? "auto_fit";

  if (!isWebCodecsSupported()) {
    throw new Error(
      "Your browser does not support hardware WebCodecs video compression. Please use Chrome or Edge on desktop."
    );
  }

  options?.onProgress?.({ percent: 2, stage: "analyzing" });

  const { Input, ALL_FORMATS, BlobSource } = await import("mediabunny");
  const probeInput = new Input({
    source: new BlobSource(file),
    formats: ALL_FORMATS,
  });

  let durationSeconds = 15;
  let sourceWidth = 1920;
  let sourceHeight = 1080;

  try {
    const [dur, vTrack] = await Promise.all([
      probeInput.computeDuration().catch(() => 15),
      probeInput.getPrimaryVideoTrack().catch(() => null),
    ]);
    if (Number.isFinite(dur) && dur > 0) {
      durationSeconds = dur;
    }
    if (vTrack) {
      sourceWidth = vTrack.displayWidth || vTrack.codedWidth || 1920;
      sourceHeight = vTrack.displayHeight || vTrack.codedHeight || 1080;
    }
  } finally {
    probeInput.dispose();
  }

  const plan = computeVideoCompressionPlan({
    fileSizeBytes: file.size,
    durationSeconds,
    mimeType: file.type,
    fileName: file.name,
    sourceWidth,
    sourceHeight,
    preset,
    maxUploadBytes,
  });

  if (!plan.shouldCompress) {
    return {
      file,
      compressed: false,
      originalBytes: file.size,
      outputBytes: file.size,
      durationSeconds: Math.max(5, Math.round(durationSeconds)),
      width: sourceWidth,
      height: sourceHeight,
      savingsPercent: 0,
    };
  }

  let outputBuffer = await runSinglePass({
    file,
    width: plan.targetWidth,
    height: plan.targetHeight,
    videoBitrate: plan.videoBitrate,
    audioBitrate: plan.audioBitrate,
    durationSeconds,
    stage: "compressing",
    onProgress: options?.onProgress,
    signal: options?.signal,
  });

  let finalWidth = plan.targetWidth;
  let finalHeight = plan.targetHeight;

  // Safety 2nd pass: if high-motion footage spiked slightly over the 46 MB ceiling, step down cleanly
  if (outputBuffer.byteLength > maxUploadBytes && !options?.signal?.aborted) {
    const tighterScale = fitDimensions(sourceWidth, sourceHeight, 1280, 720);
    const ratio = (maxUploadBytes * 0.82) / outputBuffer.byteLength;
    const retryVideoBps = Math.max(
      380_000,
      Math.floor(plan.videoBitrate * Math.min(0.75, ratio))
    );
    finalWidth = tighterScale.width;
    finalHeight = tighterScale.height;

    outputBuffer = await runSinglePass({
      file,
      width: finalWidth,
      height: finalHeight,
      videoBitrate: retryVideoBps,
      audioBitrate: 96_000,
      durationSeconds,
      stage: "retrying",
      onProgress: options?.onProgress,
      signal: options?.signal,
    });
  }

  const baseName = file.name.replace(/\.[^.]+$/, "");
  const compressedFile = new File([outputBuffer], `${baseName}.mp4`, {
    type: "video/mp4",
  });

  // Only keep original if it was already MP4, smaller than compressed, AND under maxUploadBytes
  const isOriginalMp4 =
    file.type === "video/mp4" || file.name.toLowerCase().endsWith(".mp4");
  if (
    isOriginalMp4 &&
    file.size <= compressedFile.size &&
    file.size <= maxUploadBytes
  ) {
    return {
      file,
      compressed: false,
      originalBytes: file.size,
      outputBytes: file.size,
      durationSeconds: Math.max(5, Math.round(durationSeconds)),
      width: sourceWidth,
      height: sourceHeight,
      savingsPercent: 0,
    };
  }

  const savingsPercent = Math.max(
    0,
    Math.round(((file.size - compressedFile.size) / Math.max(1, file.size)) * 100)
  );

  return {
    file: compressedFile,
    compressed: true,
    originalBytes: file.size,
    outputBytes: compressedFile.size,
    durationSeconds: Math.max(5, Math.round(durationSeconds)),
    width: finalWidth,
    height: finalHeight,
    savingsPercent,
  };
}
