"use client";

/**
 * @file src/components/player/pdf-signage-viewer.tsx
 * @description Toolbar-free, auto-flipping multi-page PDF renderer for digital signage TVs
 * powered by self-hosted Mozilla PDF.js (`pdfjs-dist` + `/pdf.worker.min.mjs`).
 * Automatically scales each page to natural aspect ratio and falls back to an iframe if
 * an external PDF host blocks cross-origin canvas reads.
 */

import { useEffect, useRef, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

interface PdfSignageViewerProps {
  url: string;
  title: string;
  durationSeconds: number;
}

export function PdfSignageViewer(props: PdfSignageViewerProps) {
  return <PdfSignageViewerInner key={props.url} {...props} />;
}

function PdfSignageViewerInner({
  url,
  title,
  durationSeconds,
}: PdfSignageViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [useIframeFallback, setUseIframeFallback] = useState(false);

  // Load PDF document & track total pages
  const pdfDocRef = useRef<{
    numPages: number;
    getPage: (n: number) => Promise<{
      getViewport: (opts: { scale: number }) => { width: number; height: number };
      render: (ctx: {
        canvasContext: CanvasRenderingContext2D;
        canvas: HTMLCanvasElement;
        viewport: { width: number; height: number };
      }) => { promise: Promise<void>; cancel?: () => void };
    }>;
    cleanup?: () => Promise<void>;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let loadingTaskRef: { destroy: () => Promise<void> } | null = null;

    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        const loadingTask = pdfjs.getDocument({
          url,
          withCredentials: false,
        });
        loadingTaskRef = loadingTask;
        const doc = await loadingTask.promise;
        if (cancelled) {
          await loadingTask.destroy();
          return;
        }
        pdfDocRef.current = doc as unknown as typeof pdfDocRef.current;
        setPageCount(doc.numPages);
        setCurrentPage(1);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setUseIframeFallback(true);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      const doc = pdfDocRef.current;
      pdfDocRef.current = null;
      void doc?.cleanup?.();
      void loadingTaskRef?.destroy();
    };
  }, [url]);

  // Auto-flip pages smoothly across the allocated slide duration
  useEffect(() => {
    if (pageCount <= 1 || useIframeFallback) return;
    const perPageMs = Math.max(
      3500,
      Math.floor((Math.max(durationSeconds, 10) * 1000) / pageCount)
    );
    const timer = setInterval(() => {
      setCurrentPage((prev) => (prev >= pageCount ? 1 : prev + 1));
    }, perPageMs);
    return () => clearInterval(timer);
  }, [pageCount, durationSeconds, useIframeFallback]);

  // Render active page onto high-DPI canvas with natural aspect ratio
  useEffect(() => {
    const doc = pdfDocRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!doc || !canvas || !container || pageCount === 0 || useIframeFallback) {
      return;
    }

    let cancelled = false;
    let activeRenderTask: { promise: Promise<void>; cancel?: () => void } | null =
      null;

    async function renderPage() {
      try {
        if (!doc || !canvas || !container) return;
        const page = await doc.getPage(currentPage);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const rect = container.getBoundingClientRect();
        const availW = Math.max(320, rect.width - 32);
        const availH = Math.max(240, rect.height - 32);

        const fitScale = Math.min(
          availW / baseViewport.width,
          availH / baseViewport.height
        );
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const viewport = page.getViewport({ scale: fitScale * dpr });

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
        canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        activeRenderTask = page.render({
          canvasContext: ctx,
          canvas,
          viewport,
        });
        await activeRenderTask.promise;
      } catch {
        // Ignore canceled renders during rapid transitions
      }
    }

    void renderPage();

    const onResize = () => {
      void renderPage();
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      activeRenderTask?.cancel?.();
    };
  }, [currentPage, pageCount, useIframeFallback]);

  if (useIframeFallback) {
    // Older Smart TV browsers (Samsung Tizen, LG webOS) often lack native inline PDF plugins
    // and would trigger a blank white iframe or unwanted download dialog. Render a crisp
    // scannable document card instead when inline PDF viewing is unavailable.
    const inlinePdfSupported =
      typeof navigator !== "undefined" &&
      (navigator as Navigator & { pdfViewerEnabled?: boolean })
        .pdfViewerEnabled !== false;

    if (!inlinePdfSupported) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center bg-[#FAFAFA] p-10 text-center text-zinc-950">
          <div className="flex max-w-xl flex-col items-center rounded-3xl border border-zinc-200 bg-white p-10 shadow-[0_12px_40px_rgba(0,0,0,0.06)]">
            <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <FileText className="size-7" />
            </div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">
              Document Preview
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-zinc-950">
              {title}
            </h2>
            <p className="mt-2 text-sm text-zinc-500">
              Scan this QR code with your phone to view or download the full PDF
              brochure.
            </p>
            <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs">
              <QRCodeSVG value={url} size={156} level="M" />
            </div>
          </div>
        </div>
      );
    }

    return (
      <iframe
        src={`${url}#toolbar=0&navpanes=0&scrollbar=0`}
        title={title}
        className="h-full w-full border-0 bg-white"
        referrerPolicy="no-referrer-when-downgrade"
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-zinc-100 p-4"
    >
      {loading && (
        <div className="flex flex-col items-center gap-2 text-zinc-500">
          <Loader2 className="size-7 animate-spin text-zinc-700" />
          <p className="text-xs font-medium">Loading PDF document...</p>
        </div>
      )}

      <canvas
        ref={canvasRef}
        className={`rounded-lg bg-white shadow-[0_12px_40px_rgba(0,0,0,0.12)] transition-opacity duration-300 ${
          loading ? "opacity-0" : "opacity-100"
        }`}
      />

      {pageCount > 1 && !loading && (
        <div className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white/95 px-3 py-1 text-xs font-semibold text-zinc-800 shadow-sm backdrop-blur">
          <FileText className="size-3.5 text-blue-600" />
          <span>
            Page {currentPage} / {pageCount}
          </span>
        </div>
      )}
    </div>
  );
}
