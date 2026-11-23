"use client";

/**
 * @file src/components/player/canvas-renderer.tsx
 * @description Figma/Canva-grade pixel-identical vector renderer for Crown Studio
 * `StudioCanvasDoc` designs. Scales a virtual 1920x1080 (landscape) or 1080x1920 (portrait)
 * canvas across Templates thumbnails, interactive Studio editor (8-handle resize, drag-rotate,
 * smart snap guides, inline text editing, TV safe-zone), and 1080p/4K `/player` screens.
 */

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Anchor,
  ArrowDownToLine,
  ArrowUpToLine,
  Award,
  Car,
  Check,
  CheckCircle2,
  Clock,
  CloudRain,
  Cog,
  Copy,
  Cpu,
  Droplets,
  Factory,
  Flame,
  Gauge,
  Globe,
  Hammer,
  HardHat,
  HeartHandshake,
  Home,
  Layers,
  Lock,
  Megaphone,
  Package,
  Paintbrush,
  PaintBucket,
  Palette,
  Phone,
  RotateCw,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  Sun,
  Trash2,
  TrendingUp,
  Truck,
  Unlock,
  Users,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { QRCodeSVG } from "qrcode.react";
import type { StudioCanvasDoc, StudioCanvasElement } from "@/db/schema";
import { getStudioFontFamily } from "@/lib/studio-assets";
import { CROWN_OFFICIAL_LOGO_URL } from "@/lib/crown-products";

const ICON_COMPONENTS: Record<string, LucideIcon> = {
  Paintbrush,
  PaintBucket,
  Palette,
  Droplets,
  Sparkles,
  Sun,
  CloudRain,
  Home,
  Layers,
  Car,
  Gauge,
  Factory,
  Wrench,
  Hammer,
  Package,
  Truck,
  Cog,
  Anchor,
  ShieldCheck,
  HardHat,
  AlertTriangle,
  Flame,
  CheckCircle2,
  HeartHandshake,
  TrendingUp,
  Award,
  Users,
  Cpu,
  Wifi,
  Megaphone,
  Store,
  Phone,
  Globe,
  Clock,
  Star,
  Zap,
};

export function StudioVectorIcon({
  name,
  className,
  style,
}: {
  name?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const IconComp = (name && ICON_COMPONENTS[name]) || Sparkles;
  return <IconComp className={className} style={style} />;
}

type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

interface CanvasRendererProps {
  doc: StudioCanvasDoc;
  screenId?: string;
  branchId?: string;
  quickPostId?: string;
  slideTitle?: string;
  qrSignatures?: Record<string, string>;
  interactive?: boolean;
  selectedId?: string | null;
  zoom?: number | "fit";
  showSafeZone?: boolean;
  showGrid?: boolean;
  snapEnabled?: boolean;
  onSelectElement?: (id: string | null) => void;
  onUpdateElement?: (id: string, patch: Partial<StudioCanvasElement>) => void;
  onCommitHistory?: () => void;
  onDuplicateElement?: (id: string) => void;
  onDeleteElement?: (id: string) => void;
  onMoveLayer?: (id: string, dir: "front" | "back") => void;
  canvasExportRef?: React.RefObject<HTMLDivElement | null>;
  className?: string;
}

export function CanvasRenderer({
  doc,
  screenId,
  branchId,
  quickPostId,
  slideTitle,
  qrSignatures,
  interactive = false,
  selectedId = null,
  zoom = "fit",
  showSafeZone = false,
  showGrid = false,
  snapEnabled = true,
  onSelectElement,
  onUpdateElement,
  onCommitHistory,
  onDuplicateElement,
  onDeleteElement,
  onMoveLayer,
  canvasExportRef,
  className = "",
}: CanvasRendererProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState<{ w: number; h: number }>({
    w: 960,
    h: 540,
  });
  const [snapGuides, setSnapGuides] = useState<{
    v: number | null;
    h: number | null;
  }>({ v: null, h: null });
  const [rotatingAngle, setRotatingAngle] = useState<number | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  const virtualW = doc.orientation === "portrait" ? 1080 : 1920;
  const virtualH = doc.orientation === "portrait" ? 1920 : 1080;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setStageSize({ w: rect.width, h: rect.height });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fitScale = Math.min(stageSize.w / virtualW, stageSize.h / virtualH);
  const scale = zoom === "fit" ? fitScale : fitScale * zoom;
  const sortedElements = [...doc.elements].sort((a, b) => a.zIndex - b.zIndex);
  const selectedEl = doc.elements.find((e) => e.id === selectedId) ?? null;

  function startMoveDrag(e: React.PointerEvent, el: StudioCanvasElement) {
    if (!interactive || el.locked || !onUpdateElement || editingTextId === el.id) {
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    onSelectElement?.(el.id);

    const startX = e.clientX;
    const startY = e.clientY;
    const initX = el.x;
    const initY = el.y;
    const renderW = virtualW * scale;
    const renderH = virtualH * scale;
    const siblings = doc.elements.filter((s) => s.id !== el.id);
    let moved = false;

    const onMove = (ev: PointerEvent) => {
      const dxPct = ((ev.clientX - startX) / Math.max(1, renderW)) * 100;
      const dyPct = ((ev.clientY - startY) / Math.max(1, renderH)) * 100;
      if (Math.abs(dxPct) > 0.15 || Math.abs(dyPct) > 0.15) moved = true;

      let nextX = Math.max(-15, Math.min(100, Number((initX + dxPct).toFixed(1))));
      let nextY = Math.max(-15, Math.min(100, Number((initY + dyPct).toFixed(1))));
      let vGuide: number | null = null;
      let hGuide: number | null = null;

      if (snapEnabled) {
        const snapThreshold = 1.0;
        // Center canvas snap
        if (Math.abs(nextX + el.w / 2 - 50) < snapThreshold) {
          nextX = Number((50 - el.w / 2).toFixed(1));
          vGuide = 50;
        }
        if (Math.abs(nextY + el.h / 2 - 50) < snapThreshold) {
          nextY = Number((50 - el.h / 2).toFixed(1));
          hGuide = 50;
        }
        // Sibling left/center/right & top/middle/bottom snap
        for (const s of siblings) {
          if (vGuide === null) {
            if (Math.abs(nextX - s.x) < snapThreshold) {
              nextX = s.x;
              vGuide = s.x;
            } else if (Math.abs(nextX + el.w / 2 - (s.x + s.w / 2)) < snapThreshold) {
              nextX = Number((s.x + s.w / 2 - el.w / 2).toFixed(1));
              vGuide = Number((s.x + s.w / 2).toFixed(1));
            } else if (Math.abs(nextX + el.w - (s.x + s.w)) < snapThreshold) {
              nextX = Number((s.x + s.w - el.w).toFixed(1));
              vGuide = Number((s.x + s.w).toFixed(1));
            }
          }
          if (hGuide === null) {
            if (Math.abs(nextY - s.y) < snapThreshold) {
              nextY = s.y;
              hGuide = s.y;
            } else if (Math.abs(nextY + el.h / 2 - (s.y + s.h / 2)) < snapThreshold) {
              nextY = Number((s.y + s.h / 2 - el.h / 2).toFixed(1));
              hGuide = Number((s.y + s.h / 2).toFixed(1));
            } else if (Math.abs(nextY + el.h - (s.y + s.h)) < snapThreshold) {
              nextY = Number((s.y + s.h - el.h).toFixed(1));
              hGuide = Number((s.y + s.h).toFixed(1));
            }
          }
        }
      }

      setSnapGuides({ v: vGuide, h: hGuide });
      onUpdateElement(el.id, { x: nextX, y: nextY });
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setSnapGuides({ v: null, h: null });
      if (moved) onCommitHistory?.();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function startResizeDrag(
    e: React.PointerEvent,
    el: StudioCanvasElement,
    handle: ResizeHandle
  ) {
    if (!interactive || el.locked || !onUpdateElement) return;
    e.stopPropagation();
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const { x: initX, y: initY, w: initW, h: initH } = el;
    const renderW = virtualW * scale;
    const renderH = virtualH * scale;
    let changed = false;

    const onMove = (ev: PointerEvent) => {
      const dxPct = ((ev.clientX - startX) / Math.max(1, renderW)) * 100;
      const dyPct = ((ev.clientY - startY) / Math.max(1, renderH)) * 100;
      if (Math.abs(dxPct) > 0.1 || Math.abs(dyPct) > 0.1) changed = true;

      let nextX = initX;
      let nextY = initY;
      let nextW = initW;
      let nextH = initH;

      if (handle.includes("e")) {
        nextW = Math.max(1.5, Math.min(100, initW + dxPct));
      }
      if (handle.includes("s")) {
        nextH = Math.max(1.0, Math.min(100, initH + dyPct));
      }
      if (handle.includes("w")) {
        const clamped = Math.min(initW - 1.5, dxPct);
        nextX = initX + clamped;
        nextW = initW - clamped;
      }
      if (handle.includes("n")) {
        const clamped = Math.min(initH - 1.0, dyPct);
        nextY = initY + clamped;
        nextH = initH - clamped;
      }

      onUpdateElement(el.id, {
        x: Number(nextX.toFixed(1)),
        y: Number(nextY.toFixed(1)),
        w: Number(nextW.toFixed(1)),
        h: Number(nextH.toFixed(1)),
      });
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (changed) onCommitHistory?.();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function startRotateDrag(e: React.PointerEvent, el: StudioCanvasElement) {
    if (!interactive || el.locked || !onUpdateElement) return;
    e.stopPropagation();
    e.preventDefault();

    const box = (e.currentTarget.parentElement as HTMLElement | null)?.getBoundingClientRect();
    if (!box) return;
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    let changed = false;

    const onMove = (ev: PointerEvent) => {
      changed = true;
      const rad = Math.atan2(ev.clientY - cy, ev.clientX - cx);
      let deg = Math.round((rad * 180) / Math.PI - 90);
      if (deg > 180) deg -= 360;
      if (deg < -180) deg += 360;
      if (ev.shiftKey) {
        deg = Math.round(deg / 15) * 15;
      }
      setRotatingAngle(deg);
      onUpdateElement(el.id, { rotation: deg });
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setRotatingAngle(null);
      if (changed) onCommitHistory?.();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function buildQrValue(rawUrl?: string, qrLabel?: string): string {
    const target = rawUrl?.trim() || "https://www.crownpaints.co.ke";
    if (!screenId || !branchId || typeof window === "undefined") return target;
    const shortCode = quickPostId ? quickPostId.slice(0, 32) : "studio";
    const params = new URLSearchParams({
      s: screenId,
      b: branchId,
      src: "studio_slide",
      lbl: (qrLabel?.trim() || slideTitle?.trim() || "Studio Slide QR").slice(0, 120),
      to: target,
    });
    if (quickPostId) params.set("p", quickPostId);
    const sig =
      qrSignatures?.[`${shortCode}|${target}`] ??
      qrSignatures?.[`studio|${target}`];
    if (sig) params.set("sig", sig);
    return `${window.location.origin}/q/${encodeURIComponent(shortCode)}?${params.toString()}`;
  }

  function renderShapeBody(el: StudioCanvasElement) {
    const fill = el.fill || "rgba(255,255,255,0.12)";
    const stroke = el.borderColor || "rgba(255,255,255,0.28)";
    const strokeW = el.borderWidth ?? 0;

    if (el.shapeKind === "triangle") {
      return (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
          <polygon
            points="50,4 96,96 4,96"
            fill={fill}
            stroke={strokeW > 0 ? stroke : "none"}
            strokeWidth={strokeW}
          />
        </svg>
      );
    }
    if (el.shapeKind === "diamond") {
      return (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
          <polygon
            points="50,2 98,50 50,98 2,50"
            fill={fill}
            stroke={strokeW > 0 ? stroke : "none"}
            strokeWidth={strokeW}
          />
        </svg>
      );
    }
    if (el.shapeKind === "arrow_right") {
      return (
        <svg viewBox="0 0 120 60" preserveAspectRatio="none" className="h-full w-full">
          <polygon
            points="0,18 76,18 76,2 120,30 76,58 76,42 0,42"
            fill={fill}
            stroke={strokeW > 0 ? stroke : "none"}
            strokeWidth={strokeW}
          />
        </svg>
      );
    }
    if (el.shapeKind === "chevron") {
      return (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
          <polygon
            points="10,4 56,4 92,50 56,96 10,96 46,50"
            fill={fill}
          />
        </svg>
      );
    }
    if (el.shapeKind === "star") {
      return (
        <svg viewBox="0 0 100 100" className="h-full w-full">
          <polygon
            points="50,4 63,36 98,38 71,60 80,94 50,75 20,94 29,60 2,38 37,36"
            fill={fill}
          />
        </svg>
      );
    }
    if (el.shapeKind === "ring") {
      return (
        <div
          className="h-full w-full rounded-full"
          style={{
            border: `${Math.max(4, el.borderWidth ?? 10)}px solid ${fill}`,
            background: "transparent",
          }}
        />
      );
    }

    const isCircle = el.shapeKind === "circle";
    const isPill = el.shapeKind === "pill";
    const isLine = el.shapeKind === "line";
    return (
      <div
        className="h-full w-full"
        style={{
          background: fill,
          borderRadius:
            isCircle || isPill
              ? "9999px"
              : isLine
                ? "4px"
                : `${el.borderRadius ?? 16}px`,
          border: strokeW > 0 ? `${strokeW}px solid ${stroke}` : undefined,
        }}
      />
    );
  }

  function renderElementBody(el: StudioCanvasElement) {
    const fontFamily = getStudioFontFamily(el.fontFamily);
    const isEditingThis = interactive && editingTextId === el.id;

    switch (el.type) {
      case "shape":
        return renderShapeBody(el);

      case "separator": {
        const isVertical = el.separatorOrientation === "vertical";
        const thickness = el.lineThickness ?? 3;
        const color = el.color || el.fill || "rgba(148,163,184,0.45)";
        const style = el.separatorStyle ?? "solid";

        if (style === "gradient") {
          return (
            <div className="flex h-full w-full items-center justify-center">
              <div
                style={{
                  width: isVertical ? `${thickness}px` : "100%",
                  height: isVertical ? "100%" : `${thickness}px`,
                  background: isVertical
                    ? `linear-gradient(180deg, transparent 0%, ${color} 50%, transparent 100%)`
                    : `linear-gradient(90deg, transparent 0%, ${color} 50%, transparent 100%)`,
                  borderRadius: "999px",
                }}
              />
            </div>
          );
        }

        return (
          <div className="flex h-full w-full items-center justify-center">
            <div
              style={{
                width: isVertical ? "0px" : "100%",
                height: isVertical ? "100%" : "0px",
                borderTop: !isVertical ? `${thickness}px ${style} ${color}` : undefined,
                borderLeft: isVertical ? `${thickness}px ${style} ${color}` : undefined,
              }}
            />
          </div>
        );
      }

      case "step_number": {
        const stepStyle = el.stepStyle ?? "circle";
        const badgeFill = el.fill || "#09090b";
        const badgeInk = el.color || "#ffffff";
        const bodyInk = el.borderColor || el.color || "#0f172a";
        return (
          <div className="flex h-full w-full items-start gap-6">
            <div
              className="flex size-[92px] shrink-0 items-center justify-center font-mono text-[38px] font-black tracking-tight"
              style={{
                borderRadius:
                  stepStyle === "circle" ? "9999px" : "20px",
                background:
                  stepStyle === "outline" ? "transparent" : badgeFill,
                color:
                  stepStyle === "outline" ? badgeFill : badgeInk,
                border:
                  stepStyle === "outline"
                    ? `4px solid ${badgeFill}`
                    : undefined,
              }}
            >
              {el.stepNumber || "01"}
            </div>
            <div className="min-w-0 flex-1 pt-1">
              <p
                className="font-bold leading-tight"
                style={{
                  fontFamily,
                  fontSize: `${el.fontSize ?? 34}px`,
                  color: bodyInk,
                }}
              >
                {el.text || "Step Headline"}
              </p>
              {el.subtext && (
                <p
                  className="mt-2 leading-snug opacity-80"
                  style={{
                    fontFamily,
                    fontSize: `${Math.max(18, Math.round((el.fontSize ?? 34) * 0.65))}px`,
                    color: bodyInk,
                  }}
                >
                  {el.subtext}
                </p>
              )}
            </div>
          </div>
        );
      }

      case "list_block": {
        const items = el.listItems && el.listItems.length > 0
          ? el.listItems
          : ["First key highlight", "Second specification", "Third showroom benefit"];
        const listStyle = el.listStyle ?? "numbered";
        const accent = el.fill || "#2563eb";
        return (
          <div
            className="flex h-full w-full flex-col justify-center gap-5"
            style={{
              fontFamily,
              fontSize: `${el.fontSize ?? 26}px`,
              color: el.color || "#ffffff",
            }}
          >
            {items.map((item, idx) => (
              <div key={`${idx}-${item}`} className="flex items-start gap-4">
                {listStyle === "numbered" ? (
                  <span
                    className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-lg font-mono text-[20px] font-bold"
                    style={{ background: accent, color: "#ffffff" }}
                  >
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                ) : listStyle === "check" ? (
                  <span
                    className="mt-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full"
                    style={{ background: accent, color: "#ffffff" }}
                  >
                    <Check className="size-5" />
                  </span>
                ) : (
                  <span
                    className="mt-3 inline-block size-3.5 shrink-0 rounded-full"
                    style={{ background: accent }}
                  />
                )}
                <span className="leading-snug font-medium">{item}</span>
              </div>
            ))}
          </div>
        );
      }

      case "chart_bar": {
        const series =
          el.chartSeries && el.chartSeries.length > 0
            ? el.chartSeries
            : [
                { label: "Nairobi", value: 14.2, target: 13.0 },
                { label: "Westlands", value: 11.8, target: 10.5 },
                { label: "Mombasa", value: 8.6, target: 8.2 },
                { label: "Dar", value: 9.4, target: 8.8 },
              ];
        const hasTarget = series.some((s) => s.target !== undefined);
        const ink = el.color || "#ffffff";
        return (
          <div
            className="flex h-full w-full flex-col rounded-[24px] border p-7"
            style={{
              background: el.fill || "rgba(255,255,255,0.05)",
              borderColor: el.borderColor || "rgba(148,163,184,0.22)",
              color: ink,
            }}
          >
            <div className="mb-4 flex items-center justify-between">
              <p
                className="font-bold tracking-tight"
                style={{ fontFamily, fontSize: "28px" }}
              >
                {el.chartTitle || "Performance Comparison"}
              </p>
              <div className="flex items-center gap-5 text-[18px] opacity-80">
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block size-3.5 rounded-sm"
                    style={{ background: el.barColor || "#2563eb" }}
                  />
                  Actual
                </span>
                {hasTarget && (
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block size-3.5 rounded-sm"
                      style={{ background: el.secondaryColor || "#94a3b8" }}
                    />
                    Target
                  </span>
                )}
              </div>
            </div>
            <div className="flex min-h-0 flex-1 w-full items-center justify-center overflow-hidden">
              <BarChart
                width={Math.max(220, Math.round((el.w / 100) * virtualW - 64))}
                height={Math.max(150, Math.round((el.h / 100) * virtualH - 120))}
                data={series}
                margin={{ top: 10, right: 16, left: 0, bottom: 4 }}
              >
                {el.showGrid !== false && (
                  <CartesianGrid
                    strokeDasharray="4 4"
                    stroke="rgba(148,163,184,0.2)"
                    vertical={false}
                  />
                )}
                <XAxis
                  dataKey="label"
                  stroke={ink}
                  tick={{ fill: ink, fontSize: 18, opacity: 0.85 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  stroke={ink}
                  tick={{ fill: ink, fontSize: 18, opacity: 0.7 }}
                  axisLine={false}
                  tickLine={false}
                />
                {hasTarget && (
                  <Bar
                    dataKey="target"
                    fill={el.secondaryColor || "#94a3b8"}
                    radius={[8, 8, 0, 0]}
                    isAnimationActive={false}
                  />
                )}
                <Bar
                  dataKey="value"
                  fill={el.barColor || "#2563eb"}
                  radius={[8, 8, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </div>
          </div>
        );
      }

      case "chart_donut": {
        const slices =
          el.donutSlices && el.donutSlices.length > 0
            ? el.donutSlices
            : [
                { name: "Decorative", value: 58, color: "#2563eb" },
                { name: "Automotive", value: 24, color: "#f59e0b" },
                { name: "Industrial", value: 18, color: "#10b981" },
              ];
        const ink = el.color || "#ffffff";
        return (
          <div
            className="flex h-full w-full flex-col justify-between rounded-[24px] border p-7"
            style={{
              background: el.fill || "rgba(255,255,255,0.05)",
              borderColor: el.borderColor || "rgba(148,163,184,0.22)",
              color: ink,
            }}
          >
            <p
              className="font-bold tracking-tight"
              style={{ fontFamily, fontSize: "26px" }}
            >
              {el.chartTitle || "Portfolio Mix"}
            </p>
            <div className="relative flex min-h-0 flex-1 w-full items-center justify-center overflow-hidden">
              {(() => {
                const pieSize = Math.max(
                  150,
                  Math.min(
                    Math.round((el.w / 100) * virtualW - 64),
                    Math.round((el.h / 100) * virtualH - 220)
                  )
                );
                return (
                  <PieChart width={pieSize} height={pieSize}>
                    <Pie
                      data={slices}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius="56%"
                      outerRadius="86%"
                      paddingAngle={3}
                      stroke="none"
                      isAnimationActive={false}
                    >
                      {slices.map((s) => (
                        <Cell key={s.name} fill={s.color} />
                      ))}
                    </Pie>
                  </PieChart>
                );
              })()}
              {(el.centerValue || el.centerLabel) && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="font-mono text-[38px] font-black leading-none">
                    {el.centerValue || "100%"}
                  </span>
                  {el.centerLabel && (
                    <span className="mt-1 text-[16px] font-semibold opacity-75">
                      {el.centerLabel}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="mt-3 space-y-2">
              {slices.map((s) => (
                <div
                  key={s.name}
                  className="flex items-center justify-between text-[19px]"
                >
                  <span className="flex items-center gap-2.5 opacity-90">
                    <span
                      className="inline-block size-3.5 rounded-full"
                      style={{ background: s.color }}
                    />
                    {s.name}
                  </span>
                  <span className="font-mono font-bold">{s.value}%</span>
                </div>
              ))}
            </div>
          </div>
        );
      }

      case "chart_progress": {
        const val = Math.max(0, el.progressValue ?? 88);
        const max = Math.max(1, el.progressMax ?? 100);
        const pct = Math.min(100, Math.round((val / max) * 100));
        const fill = el.barColor || el.fill || "#2563eb";
        const track = el.trackColor || "rgba(148,163,184,0.22)";
        const ink = el.color || "#ffffff";

        if (el.progressStyle === "ring") {
          const r = 74;
          const circ = 2 * Math.PI * r;
          const offset = circ * (1 - pct / 100);
          return (
            <div
              className="flex h-full w-full flex-col items-center justify-center rounded-[24px] border p-5 text-center"
              style={{
                background: el.fill || "rgba(255,255,255,0.05)",
                borderColor: el.borderColor || "rgba(148,163,184,0.22)",
                color: ink,
              }}
            >
              <div className="relative size-[185px]">
                <svg viewBox="0 0 180 180" className="size-full -rotate-90">
                  <circle
                    cx="90"
                    cy="90"
                    r={r}
                    fill="none"
                    stroke={track}
                    strokeWidth="16"
                  />
                  <circle
                    cx="90"
                    cy="90"
                    r={r}
                    fill="none"
                    stroke={fill}
                    strokeWidth="16"
                    strokeLinecap="round"
                    strokeDasharray={circ}
                    strokeDashoffset={offset}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-mono text-[42px] font-black leading-none">
                    {pct}%
                  </span>
                </div>
              </div>
              <p
                className="mt-3 font-bold"
                style={{ fontFamily, fontSize: "24px" }}
              >
                {el.text || "Target Attainment"}
              </p>
              {el.subtext && (
                <p className="mt-1 text-[17px] opacity-75">{el.subtext}</p>
              )}
            </div>
          );
        }

        return (
          <div
            className="flex h-full w-full flex-col justify-center rounded-[20px] border p-6"
            style={{
              background: el.fill || "rgba(255,255,255,0.05)",
              borderColor: el.borderColor || "rgba(148,163,184,0.22)",
              color: ink,
            }}
          >
            <div className="mb-3 flex items-baseline justify-between gap-4">
              <span
                className="font-bold"
                style={{ fontFamily, fontSize: "26px" }}
              >
                {el.text || "KPI Progress"}
              </span>
              <span className="font-mono text-[32px] font-black">{pct}%</span>
            </div>
            <div
              className="h-6 w-full overflow-hidden rounded-full"
              style={{ background: track }}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, background: fill }}
              />
            </div>
            {el.subtext && (
              <p className="mt-2.5 text-[18px] opacity-75">{el.subtext}</p>
            )}
          </div>
        );
      }

      case "table_spec": {
        const headers =
          el.tableHeaders && el.tableHeaders.length > 0
            ? el.tableHeaders
            : ["Specification", "Standard", "Value"];
        const rows =
          el.tableRows && el.tableRows.length > 0
            ? el.tableRows
            : [
                ["Pack Sizes", "Retail & Trade", "1L / 4L / 20L"],
                ["Coverage Rate", "2-Coat System", "14–16 m² / L"],
                ["Dry Time", "@ 25°C Ambient", "2 Hours"],
              ];
        const ink = el.color || "#0f172a";
        return (
          <div
            className="flex h-full w-full flex-col overflow-hidden rounded-[22px] border"
            style={{
              background: el.fill || "rgba(255,255,255,0.96)",
              borderColor: el.borderColor || "rgba(148,163,184,0.3)",
              color: ink,
              fontFamily,
            }}
          >
            <div
              className="grid border-b px-6 py-4 text-[20px] font-bold uppercase tracking-wider opacity-85"
              style={{
                gridTemplateColumns: `repeat(${headers.length}, minmax(0, 1fr))`,
                borderColor: el.borderColor || "rgba(148,163,184,0.25)",
                background: el.barColor || "rgba(15,23,42,0.06)",
              }}
            >
              {headers.map((h, i) => (
                <span key={`${i}-${h}`} className="truncate">
                  {h}
                </span>
              ))}
            </div>
            <div className="flex flex-1 flex-col divide-y divide-slate-400/20">
              {rows.map((row, rIdx) => (
                <div
                  key={rIdx}
                  className="grid flex-1 items-center px-6 py-3 text-[22px]"
                  style={{
                    gridTemplateColumns: `repeat(${headers.length}, minmax(0, 1fr))`,
                  }}
                >
                  {row.map((cell, cIdx) => (
                    <span
                      key={cIdx}
                      className={`truncate ${
                        cIdx === 0
                          ? "font-bold"
                          : cIdx === row.length - 1
                            ? "font-mono font-semibold"
                            : "opacity-85"
                      }`}
                    >
                      {cell}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        );
      }

      case "text":
        if (isEditingThis && onUpdateElement) {
          return (
            <textarea
              autoFocus
              value={el.text ?? ""}
              onChange={(e) => onUpdateElement(el.id, { text: e.target.value })}
              onBlur={() => {
                setEditingTextId(null);
                onCommitHistory?.();
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setEditingTextId(null);
                  onCommitHistory?.();
                }
              }}
              className="h-full w-full resize-none bg-transparent outline-none"
              style={{
                fontFamily,
                fontSize: `${el.fontSize ?? 48}px`,
                fontWeight: el.fontWeight ?? "700",
                lineHeight: el.lineHeight ?? 1.12,
                color: el.color || "#ffffff",
                textAlign: el.textAlign ?? "left",
                textTransform: el.uppercase ? "uppercase" : "none",
                letterSpacing:
                  el.letterSpacing !== undefined ? `${el.letterSpacing}px` : undefined,
              }}
            />
          );
        }
        return (
          <div
            onDoubleClick={(e) => {
              if (!interactive || el.locked) return;
              e.stopPropagation();
              setEditingTextId(el.id);
            }}
            className="flex h-full w-full items-start overflow-hidden whitespace-pre-wrap"
            style={{
              fontFamily,
              fontSize: `${el.fontSize ?? 48}px`,
              fontWeight: el.fontWeight ?? "700",
              lineHeight: el.lineHeight ?? 1.12,
              color: el.color || "#ffffff",
              textAlign: el.textAlign ?? "left",
              justifyContent:
                el.textAlign === "center"
                  ? "center"
                  : el.textAlign === "right"
                    ? "flex-end"
                    : "flex-start",
              textTransform: el.uppercase ? "uppercase" : "none",
              letterSpacing:
                el.letterSpacing !== undefined ? `${el.letterSpacing}px` : undefined,
            }}
          >
            {el.text || "Double-click to edit text"}
          </div>
        );

      case "badge":
        return (
          <div
            className="flex h-full w-full items-center justify-center rounded-full px-6 text-center"
            style={{
              fontFamily,
              fontSize: `${el.fontSize ?? 20}px`,
              fontWeight: el.fontWeight ?? "800",
              color: el.color || "#ffffff",
              background: el.fill || "rgba(9,9,11,0.85)",
              border: `2px solid ${el.borderColor || "rgba(255,255,255,0.2)"}`,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            <span className="truncate">{el.text || "CROWN PAINTS"}</span>
          </div>
        );

      case "icon":
        return (
          <div className="flex h-full w-full items-center justify-center">
            <StudioVectorIcon
              name={el.iconName}
              className="h-full w-full"
              style={{ color: el.color || "#2563eb" }}
            />
          </div>
        );

      case "swatch":
        return (
          <div
            className="flex h-full w-full flex-col justify-between overflow-hidden rounded-[22px] border p-4 shadow-md"
            style={{
              background: el.fill || "rgba(255,255,255,0.08)",
              borderColor: el.borderColor || "rgba(148,163,184,0.28)",
            }}
          >
            <div
              className="w-full flex-1 rounded-[14px] border border-black/10 shadow-inner"
              style={{ backgroundColor: el.swatchHex || "#0D9488" }}
            />
            <div className="mt-3 px-1">
              <p
                className="truncate font-bold leading-tight"
                style={{
                  fontFamily,
                  fontSize: "24px",
                  color: el.color || "#ffffff",
                }}
              >
                {el.text || "Coastal Teal"}
              </p>
              <p
                className="mt-0.5 font-mono text-[17px] opacity-75"
                style={{ color: el.color || "#cbd5e1" }}
              >
                {el.swatchCode || el.swatchHex || "CP-402"}
              </p>
            </div>
          </div>
        );

      case "price_tag":
        return (
          <div
            className="flex h-full w-full flex-col items-center justify-center rounded-[26px] p-6 text-center shadow-xl"
            style={{
              background: el.fill || "#09090b",
              color: el.color || "#ffffff",
            }}
          >
            <span
              className="font-bold uppercase tracking-widest opacity-75"
              style={{ fontFamily, fontSize: "20px" }}
            >
              {el.subtext || "SHOWROOM OFFER"}
            </span>
            <div
              className="mt-2 flex items-baseline gap-2 font-black tracking-tight"
              style={{ fontFamily, fontSize: "72px", lineHeight: 1 }}
            >
              <span style={{ fontSize: "30px" }}>{el.currency || "KES"}</span>
              <span>{el.text || "4,850"}</span>
            </div>
          </div>
        );

      case "emblem":
        return (
          <div className="flex h-full w-full items-center gap-4">
            <div className="flex h-full shrink-0 items-center justify-center rounded-[16px] bg-white px-4 py-2 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={CROWN_OFFICIAL_LOGO_URL}
                alt="Crown Paints"
                className="h-full w-auto max-w-[220px] object-contain"
              />
            </div>
            {el.subtext && (
              <div className="min-w-0 border-l-2 border-current/20 pl-4">
                <p
                  className="truncate font-mono font-bold uppercase tracking-[0.18em] opacity-85"
                  style={{
                    fontFamily,
                    fontSize: "17px",
                    color: el.color || "#ffffff",
                  }}
                >
                  {el.subtext}
                </p>
              </div>
            )}
          </div>
        );

      case "image":
        return el.imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={el.imageUrl}
            alt={el.label}
            crossOrigin="anonymous"
            className="h-full w-full"
            style={{
              objectFit: el.objectFit || "cover",
              borderRadius: `${el.borderRadius ?? 18}px`,
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-2xl border-2 border-dashed border-zinc-400/50 bg-zinc-500/10 text-2xl font-semibold text-zinc-400">
            Select Image or Stock Photo
          </div>
        );

      case "qr":
        return (
          <div
            className="flex h-full w-full flex-col items-center justify-center gap-4 rounded-[24px] border p-5 text-center shadow-lg"
            style={{
              background: el.fill || "rgba(255,255,255,0.08)",
              borderColor: el.borderColor || "rgba(148,163,184,0.25)",
            }}
          >
            <div className="rounded-[18px] bg-white p-4 shadow-sm">
              <QRCodeSVG value={buildQrValue(el.qrUrl, el.qrLabel)} size={200} />
            </div>
            <p
              className="truncate font-bold"
              style={{
                fontFamily,
                fontSize: "22px",
                color: el.color || "#ffffff",
              }}
            >
              {el.qrLabel || "Scan QR Code"}
            </p>
          </div>
        );
    }
  }

  const handles: Array<{ id: ResizeHandle; pos: string; cursor: string }> = [
    { id: "nw", pos: "-top-2.5 -left-2.5", cursor: "cursor-nwse-resize" },
    { id: "n", pos: "-top-2.5 left-1/2 -translate-x-1/2", cursor: "cursor-ns-resize" },
    { id: "ne", pos: "-top-2.5 -right-2.5", cursor: "cursor-nesw-resize" },
    { id: "e", pos: "top-1/2 -right-2.5 -translate-y-1/2", cursor: "cursor-ew-resize" },
    { id: "se", pos: "-bottom-2.5 -right-2.5", cursor: "cursor-nwse-resize" },
    { id: "s", pos: "-bottom-2.5 left-1/2 -translate-x-1/2", cursor: "cursor-ns-resize" },
    { id: "sw", pos: "-bottom-2.5 -left-2.5", cursor: "cursor-nesw-resize" },
    { id: "w", pos: "top-1/2 -left-2.5 -translate-y-1/2", cursor: "cursor-ew-resize" },
  ];

  return (
    <div
      ref={containerRef}
      onPointerDown={() => {
        if (interactive) {
          setEditingTextId(null);
          onSelectElement?.(null);
        }
      }}
      className={`relative flex h-full w-full items-center justify-center overflow-hidden select-none ${className}`}
    >
      <div
        className="relative overflow-visible"
        style={{
          width: `${virtualW * scale}px`,
          height: `${virtualH * scale}px`,
        }}
      >
        <div
          ref={canvasExportRef}
          className="relative origin-top-left overflow-hidden shadow-xl"
          style={{
            width: `${virtualW}px`,
            height: `${virtualH}px`,
            transform: `scale(${scale})`,
            background: doc.backgroundColor || doc.backgroundCss,
          }}
        >
          {doc.backgroundImageUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={doc.backgroundImageUrl}
              alt=""
              crossOrigin="anonymous"
              className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            />
          )}

          {/* Optional Studio Grid Overlay */}
          {interactive && showGrid && (
            <div
              className="pointer-events-none absolute inset-0 z-[400]"
              style={{
                backgroundImage:
                  "linear-gradient(to right, rgba(37,99,235,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(37,99,235,0.12) 1px, transparent 1px)",
                backgroundSize: "96px 96px",
              }}
            />
          )}

          {/* Optional TV 5% Overscan Safe-Zone Guide */}
          {interactive && showSafeZone && (
            <div className="pointer-events-none absolute inset-[5%] z-[405] border-2 border-dashed border-blue-500/60">
              <span className="absolute -top-8 left-2 rounded bg-blue-600 px-2.5 py-0.5 font-mono text-[16px] font-bold text-white">
                TV 5% SAFE ZONE
              </span>
            </div>
          )}

          {/* Live Smart Snap Alignment Guides */}
          {interactive && snapGuides.v !== null && (
            <div
              className="pointer-events-none absolute inset-y-0 z-[450] w-[2px] bg-pink-500"
              style={{ left: `${snapGuides.v}%` }}
            />
          )}
          {interactive && snapGuides.h !== null && (
            <div
              className="pointer-events-none absolute inset-x-0 z-[450] h-[2px] bg-pink-500"
              style={{ top: `${snapGuides.h}%` }}
            />
          )}

          {sortedElements.map((el) => {
            const isSelected = interactive && selectedId === el.id;
            const transforms: string[] = [];
            if (el.rotation) transforms.push(`rotate(${el.rotation}deg)`);
            if (el.flipX) transforms.push("scaleX(-1)");
            if (el.flipY) transforms.push("scaleY(-1)");

            return (
              <div
                key={el.id}
                onPointerDown={(e) => startMoveDrag(e, el)}
                className={`absolute ${
                  interactive
                    ? el.locked
                      ? "cursor-not-allowed"
                      : editingTextId === el.id
                        ? "cursor-text"
                        : "cursor-move"
                    : ""
                }`}
                style={{
                  left: `${el.x}%`,
                  top: `${el.y}%`,
                  width: `${el.w}%`,
                  height: `${el.h}%`,
                  zIndex: el.zIndex,
                  opacity: el.opacity ?? 1,
                  transform: transforms.length > 0 ? transforms.join(" ") : undefined,
                  outline: isSelected
                    ? "3px solid #2563eb"
                    : interactive
                      ? "1px solid transparent"
                      : undefined,
                  outlineOffset: isSelected ? "2px" : undefined,
                }}
              >
                {renderElementBody(el)}

                {/* Figma-style 8-Handle Resize Bounding Box + Rotate Handle */}
                {isSelected && !el.locked && (
                  <>
                    {handles.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        aria-label={`Resize ${h.id}`}
                        onPointerDown={(e) => startResizeDrag(e, el, h.id)}
                        className={`absolute ${h.pos} ${h.cursor} z-20 size-5 rounded-sm border-[3px] border-blue-600 bg-white shadow`}
                      />
                    ))}

                    {/* Drag-to-Rotate Handle */}
                    <div className="pointer-events-none absolute -bottom-14 left-1/2 flex -translate-x-1/2 flex-col items-center">
                      <div className="h-5 w-[2px] bg-blue-600" />
                      <button
                        type="button"
                        aria-label="Rotate element"
                        onPointerDown={(e) => startRotateDrag(e, el)}
                        className="pointer-events-auto flex size-9 cursor-grab items-center justify-center rounded-full border-[3px] border-blue-600 bg-white text-blue-600 shadow-md active:cursor-grabbing"
                      >
                        <RotateCw className="size-4" />
                      </button>
                      {rotatingAngle !== null && (
                        <span className="mt-1 rounded bg-zinc-950 px-2 py-0.5 font-mono text-[16px] font-bold text-white shadow">
                          {rotatingAngle}°
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Floating Quick-Action Context Pill above selected element (unscaled crisp UI) */}
        {interactive && selectedEl && (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute z-30 flex items-center gap-0.5 rounded-lg border border-zinc-200 bg-white p-1 text-zinc-700 shadow-lg"
            style={{
              left: `${Math.min(82, Math.max(2, selectedEl.x))}%`,
              top: `${Math.max(0, selectedEl.y - 8)}%`,
              transform: "translateY(-100%)",
            }}
          >
            <button
              type="button"
              title="Duplicate (Ctrl+D)"
              onClick={() => onDuplicateElement?.(selectedEl.id)}
              className="rounded p-1 hover:bg-zinc-100 hover:text-zinc-950"
            >
              <Copy className="size-3.5" />
            </button>
            <button
              type="button"
              title="Bring to Front"
              onClick={() => onMoveLayer?.(selectedEl.id, "front")}
              className="rounded p-1 hover:bg-zinc-100 hover:text-zinc-950"
            >
              <ArrowUpToLine className="size-3.5" />
            </button>
            <button
              type="button"
              title="Send to Back"
              onClick={() => onMoveLayer?.(selectedEl.id, "back")}
              className="rounded p-1 hover:bg-zinc-100 hover:text-zinc-950"
            >
              <ArrowDownToLine className="size-3.5" />
            </button>
            <button
              type="button"
              title={selectedEl.locked ? "Unlock" : "Lock"}
              onClick={() => {
                onUpdateElement?.(selectedEl.id, { locked: !selectedEl.locked });
                onCommitHistory?.();
              }}
              className="rounded p-1 hover:bg-zinc-100 hover:text-zinc-950"
            >
              {selectedEl.locked ? (
                <Lock className="size-3.5 text-blue-600" />
              ) : (
                <Unlock className="size-3.5" />
              )}
            </button>
            <span className="mx-0.5 h-3.5 w-px bg-zinc-200" />
            <button
              type="button"
              title="Delete (Del)"
              onClick={() => onDeleteElement?.(selectedEl.id)}
              className="rounded p-1 text-red-600 hover:bg-red-50"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
