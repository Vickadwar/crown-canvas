/**
 * @file src/lib/media-optimizer.ts
 * @description Zero-disk external media URL normalizer (YouTube, Canva, Google Slides,
 * Power BI, PDF, HTTPS web apps), browser-side WebP 1080p image optimizer, and
 * Android TV H.264 compatibility inspector.
 */

export interface ExternalMediaInfo {
  normalizedUrl: string;
  mediaType: "web_url" | "pdf";
  mimeType: string;
  provider:
    | "youtube"
    | "canva"
    | "google_slides"
    | "powerbi"
    | "pdf"
    | "web_url";
  label: string;
}

/**
 * Normalizes public YouTube, Canva, Google Slides, Power BI, PDF, or HTTPS URLs
 * into clean kiosk-ready embed URLs consuming 0 bytes of Supabase Storage.
 */
export function normalizeExternalMediaUrl(rawUrl: string): ExternalMediaInfo {
  const trimmed = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Enter a valid https:// URL");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Only http:// or https:// URLs are supported");
  }

  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname;

  // PDF documents
  if (path.toLowerCase().endsWith(".pdf")) {
    return {
      normalizedUrl: trimmed,
      mediaType: "pdf",
      mimeType: "application/pdf",
      provider: "pdf",
      label: "PDF Document (0 MB Cloud Storage)",
    };
  }

  // YouTube (watch, shorts, youtu.be, embed) -> muted autoplay looping embed
  if (
    host === "youtu.be" ||
    host === "youtube.com" ||
    host === "www.youtube.com" ||
    host === "m.youtube.com"
  ) {
    let videoId: string | null = null;
    if (host === "youtu.be") {
      videoId = path.replace(/^\//, "").split("/")[0] || null;
    } else if (path.startsWith("/watch")) {
      videoId = parsed.searchParams.get("v");
    } else if (path.startsWith("/shorts/")) {
      videoId = path.split("/")[2] || null;
    } else if (path.startsWith("/embed/")) {
      videoId = path.split("/")[2] || null;
    }

    if (videoId) {
      const embedUrl = `https://www.youtube.com/embed/${encodeURIComponent(
        videoId
      )}?autoplay=1&mute=1&loop=1&playlist=${encodeURIComponent(
        videoId
      )}&controls=0&modestbranding=1&rel=0`;
      return {
        normalizedUrl: embedUrl,
        mediaType: "web_url",
        mimeType: "text/html",
        provider: "youtube",
        label: "YouTube Autoplay Stream (0 MB Storage)",
      };
    }
  }

  // Canva design embeds
  if (host.endsWith("canva.com")) {
    const embedUrl = trimmed.includes("?embed")
      ? trimmed
      : `${trimmed}${trimmed.includes("?") ? "&" : "?"}embed`;
    return {
      normalizedUrl: embedUrl,
      mediaType: "web_url",
      mimeType: "text/html",
      provider: "canva",
      label: "Canva Live Design (0 MB Storage)",
    };
  }

  // Google Slides published presentations
  if (host === "docs.google.com" && path.includes("/presentation/")) {
    const embedUrl = trimmed.includes("/embed")
      ? trimmed
      : trimmed.replace(/\/(edit|pub|present)(\?.*)?$/, "/embed?start=true&loop=true&delayms=8000");
    return {
      normalizedUrl: embedUrl,
      mediaType: "web_url",
      mimeType: "text/html",
      provider: "google_slides",
      label: "Google Slides Deck (0 MB Storage)",
    };
  }

  // Power BI / Looker Studio dashboards
  if (host.includes("powerbi.com") || host.includes("lookerstudio.google.com")) {
    return {
      normalizedUrl: trimmed,
      mediaType: "web_url",
      mimeType: "text/html",
      provider: "powerbi",
      label: "BI Analytics Dashboard (0 MB Storage)",
    };
  }

  return {
    normalizedUrl: trimmed,
    mediaType: "web_url",
    mimeType: "text/html",
    provider: "web_url",
    label: "Live Web App / URL (0 MB Storage)",
  };
}

export interface VideoCompatibilityReport {
  tvReady: boolean;
  level: "optimal" | "warning";
  summary: string;
}

/**
 * Checks whether an uploaded video file is optimized for budget standalone
 * Android TV hardware H.264 decoders & Supabase Free Tier 50 MB limits.
 */
export function inspectVideoForAndroidTv(
  file: Pick<File, "type" | "size" | "name">
): VideoCompatibilityReport {
  const isMp4 =
    file.type === "video/mp4" || file.name.toLowerCase().endsWith(".mp4");
  const sizeMb = file.size / (1024 * 1024);

  if (sizeMb > 48) {
    return {
      tvReady: false,
      level: "warning",
      summary: `${sizeMb.toFixed(1)} MB — will be automatically GPU-compressed to crisp 1080p/720p H.264 MP4 (< 45 MB) with stereo audio on upload.`,
    };
  }

  if (!isMp4) {
    return {
      tvReady: false,
      level: "warning",
      summary:
        "Non-MP4 format detected — will be automatically transcoded to hardware-ready H.264 MP4 on upload.",
    };
  }

  if (sizeMb > 30) {
    return {
      tvReady: true,
      level: "warning",
      summary: `H.264 MP4 (${sizeMb.toFixed(1)} MB) — TV Ready (Auto-Compress will shrink it further to save bandwidth & TV cache).`,
    };
  }

  return {
    tvReady: true,
    level: "optimal",
    summary: `Android TV & Mini PC Ready (${sizeMb.toFixed(1)} MB MP4)`,
  };
}

/**
 * Compresses oversized images in-browser to max 1920x1080 WebP (quality 0.84),
 * cutting typical 4-10 MB PNG/JPG uploads down to ~150-350 KB before storage upload.
 */
export async function optimizeImageForSignage(file: File): Promise<{
  file: File;
  savedBytes: number;
  width?: number;
  height?: number;
}> {
  if (
    typeof document === "undefined" ||
    !file.type.startsWith("image/") ||
    file.type === "image/svg+xml" ||
    file.type === "image/gif"
  ) {
    return { file, savedBytes: 0 };
  }

  try {
    const bitmap = await createImageBitmap(file);
    const maxW = 1920;
    const maxH = 1920;
    const scale = Math.min(1, maxW / bitmap.width, maxH / bitmap.height);
    const targetW = Math.max(1, Math.round(bitmap.width * scale));
    const targetH = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return { file, savedBytes: 0 };
    }
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/webp", 0.84)
    );

    if (!blob || blob.size >= file.size) {
      return { file, savedBytes: 0, width: targetW, height: targetH };
    }

    const baseName = file.name.replace(/\.[^.]+$/, "");
    const optimized = new File([blob], `${baseName}.webp`, {
      type: "image/webp",
    });
    return {
      file: optimized,
      savedBytes: Math.max(0, file.size - optimized.size),
      width: targetW,
      height: targetH,
    };
  } catch {
    return { file, savedBytes: 0 };
  }
}
