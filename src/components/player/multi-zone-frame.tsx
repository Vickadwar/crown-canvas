"use client";

/**
 * @file src/components/player/multi-zone-frame.tsx
 * @description Responsive Crown Canvas 3-zone Split Layout supporting Per-Playlist
 * Sidebar Profiles (custom theme, curated CMS Showcase Products, custom tracked QR,
 * clock/weather toggles) with fluid viewport scaling so product images always display
 * in natural, unsqueezed proportions across 32" 720p, 43"-65" 1080p/4K, ultrawide, and
 * portrait 9:16 TVs.
 */

import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { CloudSun, Droplets, MapPin, Wind } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { PlaylistSidebarConfig } from "@/db/schema";
import {
  CROWN_DECORATIVE_QR_URL,
  CROWN_OFFICIAL_LOGO_URL,
  CROWN_PRODUCT_SHOWCASE,
  type CrownProductItem,
} from "@/lib/crown-products";
import { resolveQrCodeValue } from "@/lib/qr-url";
import type { EastAfricaWeather } from "@/lib/weather";
import { TickerBar, type TickerPartnerLogo } from "./ticker-bar";

export interface ActiveSidebarProfile {
  id: string;
  name: string;
  theme?: string | null;
  displayName?: string | null;
  showClock?: boolean;
  showWeather?: boolean;
  showQr?: boolean;
  qrTitle?: string | null;
  promoLabel?: string | null;
  qrTargetUrl?: string | null;
  qrTrackingMode?: "direct" | "tracked" | string;
  qrShowLogo?: boolean;
  slideIntervalSeconds?: number;
}

interface MultiZoneFrameProps {
  children: React.ReactNode;
  branchName: string;
  city: string;
  countryCode: string;
  currencyCode: string;
  clockText: string;
  tickerMessages: string[];
  partnerLogos?: TickerPartnerLogo[];
  partnerTickerMode?: "pinned_right" | "inline_scroll" | "hidden" | string;
  orientation?: "landscape" | "portrait";
  sidebarSide?: "left" | "right";
  sidebarConfig?: PlaylistSidebarConfig | null;
  sidebarProfile?: ActiveSidebarProfile | null;
  showcaseProducts?: CrownProductItem[];
  qrSignatures?: Record<string, string>;
  screenId?: string;
  branchId?: string;
  /** When true (inbuilt Smart TV browser), disables heavy blur/drop-shadow GPU filters for razor-sharp rendering */
  isTvBrowser?: boolean;
  /** Optional per-screen HDMI overscan safe margin (0%, 2%, or 3%) for older showroom TVs */
  overscanPercent?: 0 | 2 | 3;
}

const THEME_MAP = {
  white_minimal: {
    asideBg: "bg-white border-zinc-200 text-zinc-950",
    cardBg: "border-zinc-200/90 bg-zinc-50/70",
    stageBg:
      "border-zinc-200/90 bg-gradient-to-b from-zinc-50/40 via-white to-amber-50/30",
    titleInk: "text-zinc-950",
    mutedInk: "text-zinc-500",
    badgeBg: "border-zinc-200 bg-white text-[#1e2a6e]",
    qrCardBg: "border-zinc-200/90 bg-zinc-50/70",
    linkInk: "text-[#1e2a6e]",
  },
  warm_editorial: {
    asideBg: "bg-[#faf7f2] border-amber-200/70 text-stone-950",
    cardBg: "border-amber-200/70 bg-white/80",
    stageBg:
      "border-amber-200/70 bg-gradient-to-b from-white via-[#fffdf9] to-amber-50/50",
    titleInk: "text-stone-950",
    mutedInk: "text-stone-500",
    badgeBg: "border-amber-200 bg-amber-50 text-amber-900",
    qrCardBg: "border-amber-200/70 bg-white/85",
    linkInk: "text-amber-900",
  },
  navy_dark: {
    asideBg: "bg-[#0a1329] border-white/10 text-white",
    cardBg: "border-white/10 bg-white/[0.06]",
    stageBg:
      "border-white/10 bg-gradient-to-b from-white/[0.08] via-white/[0.04] to-amber-500/[0.08]",
    titleInk: "text-white",
    mutedInk: "text-slate-300",
    badgeBg: "border-amber-400/30 bg-amber-500/15 text-amber-300",
    qrCardBg: "border-white/10 bg-white/[0.06]",
    linkInk: "text-amber-300",
  },
  slate_industrial: {
    asideBg: "bg-slate-900 border-slate-700/70 text-slate-50",
    cardBg: "border-slate-700/70 bg-slate-800/70",
    stageBg:
      "border-slate-700/70 bg-gradient-to-b from-slate-800/80 via-slate-900 to-slate-800/50",
    titleInk: "text-white",
    mutedInk: "text-slate-300",
    badgeBg: "border-sky-400/30 bg-sky-500/15 text-sky-300",
    qrCardBg: "border-slate-700/70 bg-slate-800/70",
    linkInk: "text-sky-300",
  },
} as const;

export function MultiZoneFrame({
  children,
  branchName,
  city,
  countryCode,
  currencyCode,
  clockText,
  tickerMessages,
  partnerLogos = [],
  partnerTickerMode = "pinned_right",
  orientation = "landscape",
  sidebarSide = "right",
  sidebarConfig,
  sidebarProfile,
  showcaseProducts,
  screenId,
  overscanPercent = 0,
}: MultiZoneFrameProps) {
  const [weather, setWeather] = useState<EastAfricaWeather | null>(null);
  const [productIndex, setProductIndex] = useState(0);

  const products = useMemo(
    () => (showcaseProducts !== undefined ? showcaseProducts : CROWN_PRODUCT_SHOWCASE),
    [showcaseProducts]
  );

  const slideIntervalMs = Math.max(
    3000,
    (sidebarProfile?.slideIntervalSeconds ?? 6) * 1000
  );

  useEffect(() => {
    let active = true;
    async function loadWeather() {
      try {
        const res = await fetch(
          `/api/widgets/weather?city=${encodeURIComponent(city || "Nairobi")}`
        );
        if (!res.ok) return;
        const json = (await res.json()) as EastAfricaWeather;
        if (active) setWeather(json);
      } catch {
        // Ignore offline weather errors
      }
    }
    void loadWeather();
    const timer = setInterval(loadWeather, 15 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [city]);

  // Smooth auto-rotating showcase carousel
  useEffect(() => {
    if (products.length <= 1) return;
    const timer = setInterval(() => {
      setProductIndex((prev) => (prev + 1) % products.length);
    }, slideIntervalMs);
    return () => clearInterval(timer);
  }, [products.length, slideIntervalMs]);

  const safeProductIndex =
    products.length > 0 ? productIndex % products.length : 0;
  const currentProduct = products[safeProductIndex] ?? null;

  const themeKey =
    sidebarProfile?.theme && sidebarProfile.theme in THEME_MAP
      ? (sidebarProfile.theme as keyof typeof THEME_MAP)
      : "white_minimal";
  const theme = THEME_MAP[themeKey];
  const isDarkTheme = themeKey === "navy_dark" || themeKey === "slate_industrial";

  const showClock =
    sidebarProfile?.showClock ?? (sidebarConfig?.showClock !== false);
  const showWeather =
    sidebarProfile?.showWeather ?? (sidebarConfig?.showWeather !== false);
  const showQr = sidebarProfile?.showQr ?? (sidebarConfig?.showQr !== false);

  const locationLabel =
    sidebarProfile?.displayName?.trim() ||
    sidebarConfig?.displayName?.trim() ||
    branchName;

  const dateText = new Intl.DateTimeFormat("en-KE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date());

  const tickerContent =
    tickerMessages.length > 0
      ? tickerMessages
      : [
        "If you like it... Crown it!",
        "Ask our Colour Specialists for precision tinting in 1,800+ shades",
        `Crown Paints • Local Showroom Pricing in ${currencyCode}`,
      ];

  const qrDestination =
    sidebarProfile?.qrTargetUrl?.trim() ||
    sidebarConfig?.qrTargetUrl?.trim() ||
    CROWN_DECORATIVE_QR_URL;

  const qrTitle = sidebarProfile?.qrTitle?.trim() || "Explore Decorative Range";
  const promoLabel =
    sidebarProfile?.promoLabel?.trim() ||
    sidebarConfig?.promoLabel?.trim() ||
    "Scan to browse Crown Decorative paints & shades.";

  // Resolve QR value according to mode:
  //  - "direct" (default): encodes real destination URL (e.g. crownpaints.co.ke) so smartphone
  //    cameras immediately preview the official brand domain before tapping.
  //  - "tracked": encodes compact `/q/sb?s=<screenId>` redirect (or custom domain) for scan analytics.
  const sidebarProfileId = sidebarProfile?.id;
  const qrTrackingMode = sidebarProfile?.qrTrackingMode ?? "direct";
  const showQrLogo = sidebarProfile?.qrShowLogo !== false;

  const qrValue = useMemo(() => {
    const currentOrigin =
      typeof window !== "undefined" ? window.location.origin : "";
    return resolveQrCodeValue({
      destinationUrl: qrDestination,
      mode: qrTrackingMode,
      kind: "sidebar",
      screenId,
      sidebarProfileId,
      currentOrigin,
      configuredAppUrl: process.env.NEXT_PUBLIC_APP_URL,
    });
  }, [qrDestination, qrTrackingMode, screenId, sidebarProfileId]);

  const qrDisplayHost = (() => {
    try {
      return new URL(qrDestination).hostname.replace(/^www\./, "");
    } catch {
      return "crownpaints.co.ke";
    }
  })();

  // Portrait (9:16) Vertical Showroom Totem Layout
  if (orientation === "portrait") {
    return (
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-white text-zinc-950">
        {/* Top Primary Stage */}
        <div className="relative min-h-0 flex-1 overflow-hidden bg-[#f4f6fa]">
          {children}
        </div>

        {/* Middle Showroom Info & Natural Product Showcase Strip */}
        <section
          className={`grid shrink-0 grid-cols-3 gap-3 border-t p-3.5 ${theme.asideBg}`}
        >
          {/* Showroom Location + Clock + Weather */}
          <div
            className={`flex flex-col justify-between rounded-2xl border p-3 ${theme.cardBg}`}
          >
            <div>
              <div className="flex items-center justify-between gap-1">
                <p className="flex items-center gap-1 truncate text-[11px] font-semibold">
                  <MapPin className="size-3 shrink-0 text-amber-500" />
                  <span className="truncate">{locationLabel}</span>
                </p>
                <span className="shrink-0 rounded-full border border-current/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold opacity-80">
                  {countryCode}
                </span>
              </div>
              {showClock && (
                <>
                  <p className="mt-1 font-mono text-2xl font-black tabular-nums">
                    {clockText}
                  </p>
                  <p className={`text-[10px] ${theme.mutedInk}`}>{dateText}</p>
                </>
              )}
            </div>
            {showWeather && (
              <div className="mt-2 flex items-center justify-between border-t border-current/10 pt-1.5 text-[10px]">
                <span className="flex items-center gap-1 truncate font-semibold">
                  <CloudSun className="size-3.5 text-amber-500" />
                  {weather ? `${weather.temperatureC}°C` : "24°C"}
                </span>
                <span className={`truncate ${theme.mutedInk}`}>
                  {weather?.city || city}
                </span>
              </div>
            )}
          </div>

          {/* Natural Proportions Product Card */}
          {currentProduct && (
            <div
              className={`relative flex items-center gap-3 overflow-hidden rounded-2xl border p-3 ${theme.stageBg}`}
            >
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-white/70 p-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={currentProduct.id}
                  src={currentProduct.imageUrl}
                  alt={currentProduct.name}
                  className="h-auto max-h-full w-auto max-w-full object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.16)]"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[9px] font-bold uppercase tracking-wider text-blue-600">
                  {currentProduct.category}
                </p>
                <p className={`truncate text-xs font-bold ${theme.titleInk}`}>
                  {currentProduct.name}
                </p>
                <p
                  className={`line-clamp-2 text-[10px] leading-tight ${theme.mutedInk}`}
                >
                  {currentProduct.tagline}
                </p>
              </div>
            </div>
          )}

          {/* Tracked QR Card */}
          {showQr && (
            <div
              className={`flex items-center gap-2.5 rounded-2xl border p-3 ${theme.qrCardBg}`}
            >
              <div className="shrink-0 rounded-lg border border-zinc-200 bg-white p-1.5 shadow-2xs">
                <QRCodeSVG
                  value={qrValue}
                  size={80}
                  level="H"
                  marginSize={2}
                  bgColor="#ffffff"
                  fgColor="#000000"
                  imageSettings={
                    showQrLogo
                      ? {
                        src: CROWN_OFFICIAL_LOGO_URL,
                        height: 18,
                        width: 18,
                        excavate: true,
                      }
                      : undefined
                  }
                />
              </div>
              <div className="min-w-0">
                <p className={`truncate text-[11px] font-bold ${theme.titleInk}`}>
                  {qrTitle}
                </p>
                <p
                  className={`mt-0.5 line-clamp-2 text-[10px] leading-tight ${theme.mutedInk}`}
                >
                  {promoLabel}
                </p>
              </div>
            </div>
          )}
        </section>

        <TickerBar
          messages={tickerContent}
          compact
          partnerLogos={partnerLogos}
          partnerMode={partnerTickerMode}
        />
      </div>
    );
  }

  const overscanFrameClass =
    overscanPercent === 3
      ? "bg-black p-[3%]"
      : overscanPercent === 2
        ? "bg-black p-[2%]"
        : "";
  const broadcastScaleStyle = {
    "--u": "min(1vw, 1.7778vh)",
  } as CSSProperties;

  // Landscape (16:9 / 4K / Ultrawide / 720p / Windows DPI-Scaled HDMI TVs)
  // Unified locked-16:9 broadcast scale (--u) + sleek 19% flat-composited sidebar
  return (
    <div
      style={broadcastScaleStyle}
      className={`flex h-screen w-screen flex-col overflow-hidden ${overscanFrameClass || "bg-white"} text-zinc-950`}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
        {/* Top Split Area: 81% Primary Broadcast Stage + Sleek 19% Crisp Flat Sidebar */}
        <div
          className={`flex min-h-0 flex-1 ${sidebarSide === "left" ? "flex-row-reverse" : "flex-row"
            }`}
        >
          {/* Main Primary Stage */}
          <div className="relative h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-[#f4f6fa]">
            {children}
          </div>

          {/* Sleek 19% Proportional Broadcast Sidebar: razor-sharp flat compositing across
              Windows DPI-scaled Sony HDMI TVs, 1366x768 PCs, Smart TV browsers & 4K */}
          <aside
            className={`flex h-full min-h-0 w-[calc(19*var(--u))] shrink-0 flex-col gap-[calc(0.55*var(--u))] p-[calc(0.65*var(--u))] antialiased ${sidebarSide === "left" ? "border-r" : "border-l"
              } ${theme.asideBg}`}
          >
            {/* 1. Compact Broadcast Clock, Location & Weather Card */}
            {(showClock || showWeather) && (
              <div
                className={`shrink-0 rounded-[calc(0.75*var(--u))] border p-[calc(0.65*var(--u))] ${theme.cardBg}`}
              >
                <div className="flex items-center justify-between gap-[calc(0.35*var(--u))]">
                  <p className="flex min-w-0 items-center gap-[calc(0.28*var(--u))] text-[calc(0.72*var(--u))] font-semibold leading-tight">
                    <MapPin className="size-[calc(0.78*var(--u))] shrink-0 text-amber-500" />
                    <span className="truncate">{locationLabel}</span>
                  </p>
                  <span className="shrink-0 rounded-full border border-current/20 px-[calc(0.35*var(--u))] py-[calc(0.08*var(--u))] font-mono text-[calc(0.56*var(--u))] font-bold uppercase opacity-80">
                    {countryCode}
                  </span>
                </div>

                {showClock && (
                  <div className="mt-[calc(0.32*var(--u))] flex items-baseline justify-between gap-[calc(0.35*var(--u))]">
                    <p className="font-mono text-[calc(1.55*var(--u))] font-black tabular-nums leading-none tracking-tight">
                      {clockText}
                    </p>
                    <p className={`truncate text-[calc(0.62*var(--u))] font-medium ${theme.mutedInk}`}>
                      {dateText}
                    </p>
                  </div>
                )}

                {showWeather && (
                  <div className="mt-[calc(0.36*var(--u))] flex items-center justify-between gap-[calc(0.3*var(--u))] border-t border-current/10 pt-[calc(0.32*var(--u))] text-[calc(0.62*var(--u))] leading-tight">
                    <div className="flex min-w-0 items-center gap-[calc(0.25*var(--u))]">
                      <CloudSun className="size-[calc(0.76*var(--u))] shrink-0 text-amber-500" />
                      <span className="font-bold tabular-nums">
                        {weather ? `${weather.temperatureC}°C` : "24°C"}
                      </span>
                      <span className={`truncate ${theme.mutedInk}`}>
                        {weather?.condition || "Partly Cloudy"}
                      </span>
                    </div>
                    <div
                      className={`flex shrink-0 items-center gap-[calc(0.35*var(--u))] text-[calc(0.56*var(--u))] ${theme.mutedInk}`}
                    >
                      <span className="flex items-center gap-[calc(0.14*var(--u))]">
                        <Droplets className="size-[calc(0.64*var(--u))] text-sky-500" />
                        {weather?.humidityPercent ?? 58}%
                      </span>
                      <span className="flex items-center gap-[calc(0.14*var(--u))]">
                        <Wind className="size-[calc(0.64*var(--u))] text-emerald-500" />
                        {weather?.windKmh ?? 12}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 2. Flat-Composited Upright Product Showcase Stage (Zero Blur/Drop-Shadow Softening) */}
            {currentProduct && (
              <div
                className={`relative flex min-h-0 flex-1 flex-col justify-between overflow-hidden rounded-[calc(0.75*var(--u))] border p-[calc(0.72*var(--u))] ${theme.stageBg}`}
              >
                {/* Badge Header Pill */}
                <div className="relative z-10 flex shrink-0 items-center justify-between">
                  <span
                    key={`cat-${currentProduct.id}`}
                    className={`animate-crown-slide inline-flex max-w-full items-center gap-[calc(0.3*var(--u))] truncate rounded-full border px-[calc(0.45*var(--u))] py-[calc(0.14*var(--u))] text-[calc(0.56*var(--u))] font-bold uppercase tracking-wider ${theme.badgeBg}`}
                  >
                    <span className="size-[calc(0.32*var(--u))] shrink-0 rounded-full bg-amber-500" />
                    <span className="truncate">{currentProduct.category}</span>
                  </span>
                </div>

                {/* Unobstructed Crisp Upright Product Packshot (Maximum Vertical Breathing Room) */}
                <div className="relative my-[calc(0.32*var(--u))] flex min-h-0 flex-1 items-center justify-center overflow-hidden p-[calc(0.2*var(--u))]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    key={`hero-${currentProduct.id}`}
                    src={currentProduct.imageUrl}
                    alt={currentProduct.name}
                    style={{ imageRendering: "auto" }}
                    className="animate-crown-slide relative z-10 max-h-[96%] max-w-[94%] h-auto w-auto object-contain object-center"
                  />
                </div>

                {/* Product Name + Description + Sweep Progress */}
                <div className="relative z-10 shrink-0 space-y-[calc(0.32*var(--u))]">
                  <div
                    key={`meta-${currentProduct.id}`}
                    className="animate-crown-slide"
                  >
                    <p
                      className={`truncate text-[calc(0.92*var(--u))] font-extrabold leading-tight tracking-tight ${theme.titleInk}`}
                    >
                      {currentProduct.name}
                    </p>
                    {currentProduct.tagline && (
                      <p
                        className={`mt-[calc(0.12*var(--u))] line-clamp-2 text-[calc(0.64*var(--u))] leading-snug ${theme.mutedInk}`}
                      >
                        {currentProduct.tagline}
                      </p>
                    )}
                  </div>
                  <div
                    className={`h-[max(2px,calc(0.18*var(--u)))] w-full overflow-hidden rounded-full ${isDarkTheme ? "bg-white/15" : "bg-zinc-200/90"
                      }`}
                  >
                    <div
                      key={`bar-${currentProduct.id}`}
                      className="animate-crown-progress h-full w-full rounded-full bg-gradient-to-r from-[#1e2a6e] via-amber-500 to-amber-400"
                      style={{
                        animationDuration: `${slideIntervalMs}ms`,
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 3. Proportionally-Locked Crisp Vector QR Card */}
            {showQr && (
              <div
                className={`flex shrink-0 items-center gap-[calc(0.55*var(--u))] rounded-[calc(0.75*var(--u))] border p-[calc(0.58*var(--u))] ${theme.qrCardBg}`}
              >
                <div className="size-[calc(5.1*var(--u))] shrink-0 rounded-[calc(0.5*var(--u))] border border-zinc-200 bg-white p-[calc(0.24*var(--u))]">
                  <QRCodeSVG
                    value={qrValue}
                    size={140}
                    level="H"
                    marginSize={2}
                    bgColor="#ffffff"
                    fgColor="#000000"
                    className="h-full w-full"
                    shapeRendering="crispEdges"
                    imageSettings={
                      showQrLogo
                        ? {
                          src: CROWN_OFFICIAL_LOGO_URL,
                          height: 30,
                          width: 30,
                          excavate: true,
                        }
                        : undefined
                    }
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-[calc(0.7*var(--u))] font-bold leading-tight ${theme.titleInk}`}
                  >
                    {qrTitle}
                  </p>
                  <p
                    className={`mt-[calc(0.14*var(--u))] line-clamp-2 text-[calc(0.6*var(--u))] leading-snug ${theme.mutedInk}`}
                  >
                    {promoLabel}
                  </p>
                  <p
                    className={`mt-[calc(0.2*var(--u))] truncate font-mono text-[calc(0.54*var(--u))] font-semibold ${theme.linkInk}`}
                  >
                    {qrDisplayHost}
                  </p>
                </div>
              </div>
            )}
          </aside>
        </div>

        {/* Bottom Ticker Zone (Right partner dock aligns pixel-flush with 19% Right Sidebar border) */}
        <TickerBar
          messages={tickerContent}
          partnerLogos={partnerLogos}
          partnerMode={partnerTickerMode}
          rightRailWidthClass={
            sidebarSide === "right" ? "w-[calc(19*var(--u))]" : undefined
          }
        />
      </div>
    </div>
  );
}
