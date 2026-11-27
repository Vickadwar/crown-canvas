"use client";

/**
 * @file src/components/player/widescreen-pan-image.tsx
 * @description Smooth GPU-composited Widescreen Auto-Scroll viewer for portrait A4
 * corporate newsletters. Displays each 2200px HD page at ~88% TV stage width (~2x larger
 * readable typography), holds cleanly at the top, glides smoothly to the bottom half
 * (infographics / QR codes), and holds cleanly before the next slide.
 */

import { useEffect, useRef, useState } from "react";

interface WidescreenPanImageProps {
  src: string;
  alt: string;
  durationSeconds: number;
  pageRangeLabel?: string | null;
}

export function WidescreenPanImage({
  src,
  alt,
  durationSeconds,
  pageRangeLabel,
}: WidescreenPanImageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [overflowPx, setOverflowPx] = useState(0);
  const [panActive, setPanActive] = useState(false);

  const safeDurationSec = Math.max(8, durationSeconds || 18);
  const holdTopMs = Math.round(safeDurationSec * 0.28 * 1000);
  const panDurationMs = Math.max(2500, Math.round(safeDurationSec * 0.44 * 1000));

  const measureOverflow = () => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img) return;
    const cH = container.clientHeight;
    const iH = img.getBoundingClientRect().height;
    if (cH > 0 && iH > 0) {
      setOverflowPx(Math.max(0, Math.ceil(iH - cH)));
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measureOverflow());
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const startTimer = setTimeout(() => {
      setPanActive(true);
    }, holdTopMs);
    return () => clearTimeout(startTimer);
  }, [holdTopMs, src]);

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-start justify-center overflow-hidden bg-[#eef1f6]"
    >
      {/* Subtle bright ambient fill behind the crisp white newsletter sheet */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-35 blur-2xl"
      />

      {/* Zoomed 88% Stage-Width High-Res Page with Pure GPU translate3d Glide */}
      <div
        className="relative z-10 flex w-[88%] max-w-[92%] justify-center py-[calc(0.8*var(--u,1vw))]"
        style={{
          transform:
            panActive && overflowPx > 0
              ? `translate3d(0, -${overflowPx}px, 0)`
              : "translate3d(0, 0, 0)",
          transition:
            panActive && overflowPx > 0
              ? `transform ${panDurationMs}ms linear`
              : "none",
          willChange: overflowPx > 0 ? "transform" : undefined,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          onLoad={measureOverflow}
          className="h-auto w-full rounded-[calc(0.45*var(--u,1vw))] bg-white object-contain ring-1 ring-zinc-300/80 shadow-[0_14px_40px_rgba(15,23,42,0.16)]"
        />
      </div>

      {pageRangeLabel && (
        <span className="pointer-events-none absolute bottom-[calc(0.7*var(--u,1vw))] right-[calc(0.9*var(--u,1vw))] z-20 rounded-full bg-zinc-950/75 px-[calc(0.65*var(--u,1vw))] py-[calc(0.22*var(--u,1vw))] text-[calc(0.62*var(--u,1vw))] font-semibold tracking-wide text-white">
          {pageRangeLabel}
        </span>
      )}
    </div>
  );
}
