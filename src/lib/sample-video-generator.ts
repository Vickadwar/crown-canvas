"use client";

/**
 * @file src/lib/sample-video-generator.ts
 * @description Generates a lightweight, 6-second 1280x720 animated Crown Paints
 * Customer Service & Colour Studio video directly in the browser using HTML5 Canvas
 * + MediaRecorder (zero ffmpeg or server transcoder required for POC).
 */

const SWATCHES = [
  { name: "Savannah Ochre", hex: "#D97706" },
  { name: "Coastal Teal", hex: "#0D9488" },
  { name: "Royal Blue", hex: "#2563EB" },
  { name: "Crown Crimson", hex: "#DC2626" },
  { name: "Serengeti Gold", hex: "#EAB308" },
];

export async function generateCrownSampleVideoFile(): Promise<File> {
  if (typeof document === "undefined" || typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is not supported in this browser.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not initialize 2D canvas.");

  const preferredMimeTypes = [
    "video/mp4;codecs=avc1.42E01E",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  const mimeType =
    preferredMimeTypes.find((t) => MediaRecorder.isTypeSupported(t)) ||
    "video/webm";
  const ext = mimeType.includes("mp4") ? "mp4" : "webm";

  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 1_800_000,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const durationMs = 6000;
  const startTime = performance.now();

  return new Promise<File>((resolve, reject) => {
    recorder.onerror = () => reject(new Error("Video recording failed"));
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType.split(";")[0] });
      resolve(
        new File([blob], `crown-showroom-intro.${ext}`, {
          type: mimeType.split(";")[0],
        })
      );
    };

    recorder.start(250);

    function drawFrame(now: number) {
      if (!ctx) return;
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);

      // Deep Navy Architectural Gradient
      const grad = ctx.createLinearGradient(0, 0, 1280, 720);
      grad.addColorStop(0, "#050a18");
      grad.addColorStop(0.55, "#0c1f4a");
      grad.addColorStop(1, "#071124");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1280, 720);

      // Animated ambient glow
      const glowX = 240 + Math.sin(progress * Math.PI * 2) * 140;
      const glow = ctx.createRadialGradient(glowX, 220, 20, glowX, 220, 380);
      glow.addColorStop(0, "rgba(245, 158, 11, 0.24)");
      glow.addColorStop(1, "rgba(245, 158, 11, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, 1280, 720);

      // Top animated paint-swatch bar
      SWATCHES.forEach((sw, idx) => {
        const w = 1280 / SWATCHES.length;
        ctx.fillStyle = sw.hex;
        ctx.fillRect(idx * w, 0, w, 12);
      });

      // Badge
      ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
      ctx.beginPath();
      ctx.roundRect(80, 82, 390, 44, 22);
      ctx.fill();
      ctx.fillStyle = "#FCD34D";
      ctx.font = "bold 18px sans-serif";
      ctx.fillText("CROWN PAINTS • CUSTOMER SERVICE", 104, 110);

      // Headline
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "900 64px sans-serif";
      ctx.fillText("1,000+ Designer Shades", 80, 230);
      ctx.fillText("Precision Tinted in Minutes", 80, 308);

      // Subheadline
      ctx.fillStyle = "rgba(226, 232, 240, 0.88)";
      ctx.font = "500 28px sans-serif";
      ctx.fillText(
        "Weatherguard Exterior • Crown Silk Vinyl • Permacote Emulsion",
        80,
        374
      );

      // Animated Colour Chips Row
      SWATCHES.forEach((sw, idx) => {
        const x = 80 + idx * 224;
        const bounce = Math.sin(progress * Math.PI * 4 + idx * 0.7) * 8;
        ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
        ctx.beginPath();
        ctx.roundRect(x, 450 + bounce, 204, 130, 18);
        ctx.fill();

        ctx.fillStyle = sw.hex;
        ctx.beginPath();
        ctx.roundRect(x + 14, 464 + bounce, 176, 62, 12);
        ctx.fill();

        ctx.fillStyle = "#F8FAFC";
        ctx.font = "bold 17px sans-serif";
        ctx.fillText(sw.name, x + 16, 558 + bounce);
      });

      // Bottom Progress Bar
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      ctx.fillRect(80, 650, 1120, 8);
      ctx.fillStyle = "#F59E0B";
      ctx.fillRect(80, 650, 1120 * progress, 8);

      ctx.fillStyle = "rgba(148, 163, 184, 0.9)";
      ctx.font = "500 18px sans-serif";
      ctx.fillText("Kenya • Tanzania • Uganda Showrooms", 80, 690);

      if (elapsed < durationMs) {
        requestAnimationFrame(drawFrame);
      } else {
        recorder.stop();
      }
    }

    requestAnimationFrame(drawFrame);
  });
}
