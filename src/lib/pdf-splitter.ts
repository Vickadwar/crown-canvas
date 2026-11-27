"use client";

/**
 * @file src/lib/pdf-splitter.ts
 * @description Browser-side multi-page PDF-to-WebP slide splitter powered by self-hosted
 * Mozilla PDF.js (`pdfjs-dist` + `/pdf.worker.min.mjs`). Converts every page of a corporate
 * newsletter (e.g. a 3-page IMPACT ESG PDF) into crisp, lightweight HD WebP slides so Smart
 * TV browsers display 1 page per slide with zero PDF.js CPU/RAM overhead and zero black bars.
 */

export interface RenderedPdfPageDraft {
  pageNumber: number;
  file: File;
  previewDataUrl: string;
  width: number;
  height: number;
  durationSeconds: number;
  included: boolean;
}

export interface PdfSplitProgress {
  currentPage: number;
  totalPages: number;
}

/**
 * Splits a multi-page PDF file in the admin's browser into crisp WebP `File` slides
 * (max dimension 1920px, WebP quality 0.88 for razor-sharp readable newsletter text).
 */
export async function splitPdfIntoWebpSlides(
  pdfFile: File,
  options: {
    maxPages?: number;
    defaultDurationSeconds?: number;
    maxDimensionPx?: number;
    onProgress?: (progress: PdfSplitProgress) => void;
  } = {}
): Promise<RenderedPdfPageDraft[]> {
  const maxPages = Math.min(40, Math.max(1, options.maxPages ?? 25));
  const defaultDuration = Math.max(5, options.defaultDurationSeconds ?? 15);
  const maxDim = Math.max(1080, Math.min(2400, options.maxDimensionPx ?? 1920));

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const arrayBuffer = await pdfFile.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
  const doc = await loadingTask.promise;

  const totalPages = Math.min(doc.numPages, maxPages);
  const baseSlug = pdfFile.name
    .replace(/\.pdf$/i, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "newsletter";

  const results: RenderedPdfPageDraft[] = [];

  try {
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      options.onProgress?.({ currentPage: pageNum, totalPages });
      const page = await doc.getPage(pageNum);
      const baseViewport = page.getViewport({ scale: 1 });
      const longestSide = Math.max(baseViewport.width, baseViewport.height, 1);
      // Scale cleanly to crisp HD (~1920px longest side) so newsletter body text & QR codes stay sharp
      const scale = Math.min(3, Math.max(1.5, maxDim / longestSide));
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;

      // Crisp white paper background (prevents transparent PDF pages turning dark)
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({
        canvasContext: ctx,
        canvas,
        viewport,
      }).promise;

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/webp", 0.88)
      );

      if (!blob) continue;

      const slideFile = new File(
        [blob],
        `${baseSlug}-page-${String(pageNum).padStart(2, "0")}.webp`,
        { type: "image/webp" }
      );

      // Lightweight preview thumbnail for the CMS page strip
      const thumbCanvas = document.createElement("canvas");
      const thumbScale = Math.min(1, 360 / Math.max(canvas.width, canvas.height));
      thumbCanvas.width = Math.max(1, Math.round(canvas.width * thumbScale));
      thumbCanvas.height = Math.max(1, Math.round(canvas.height * thumbScale));
      const tctx = thumbCanvas.getContext("2d");
      if (tctx) {
        tctx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
      }
      const previewDataUrl = thumbCanvas.toDataURL("image/webp", 0.78);

      results.push({
        pageNumber: pageNum,
        file: slideFile,
        previewDataUrl,
        width: canvas.width,
        height: canvas.height,
        durationSeconds: defaultDuration,
        included: true,
      });

      // Release canvas RAM immediately after each page
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    await doc.cleanup?.().catch(() => {});
    await loadingTask.destroy().catch(() => {});
  }

  return results;
}
