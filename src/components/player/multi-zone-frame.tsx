"use client";

/**
 * @file src/components/player/multi-zone-frame.tsx
 * @description Responsive Crown Canvas 3-zone Split Layout supporting Per-Playlist
 * Sidebar Profiles (custom theme, curated CMS Showcase Products, custom tracked QR,
 * clock/weather toggles) with fluid viewport scaling so product images always display
 * in natural, unsqueezed proportions across 32" 720p, 43"-65" 1080p/4K, ultrawide, and
 * portrait 9:16 TVs.
 */

import { useEffect, useMemo, useState } from "react";
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
        <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
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

  // Landscape (16:9 / 4K / Ultrawide / 720p) Fluid Responsive Split Layout
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white text-zinc-950">
      {/* Top Split Area: Fluid Primary Stage + Proportional Non-Squeezing Sidebar */}
      <div
        className={`flex min-h-0 flex-1 ${
          sidebarSide === "left" ? "flex-row-reverse" : "flex-row"
        }`}
      >
        {/* Main Primary Stage */}
        <div className="relative h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-black">
          {children}
        </div>

        {/* Responsive Showroom Sidebar: clamp width keeps 32" 720p & 65" 4K balanced */}
        <aside
          className={`flex h-full min-h-0 w-[clamp(260px,24vw,430px)] shrink-0 flex-col gap-2.5 p-3 xl:gap-3 xl:p-4 ${
            sidebarSide === "left" ? "border-r" : "border-l"
          } ${theme.asideBg}`}
        >
          {/* 1. Compact Clock, Location & Weather Card */}
          {(showClock || showWeather) && (
            <div
              className={`shrink-0 rounded-2xl border p-3 xl:p-3.5 ${theme.cardBg}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="flex min-w-0 items-center gap-1.5 text-[clamp(11px,0.85vw,13px)] font-semibold">
                  <MapPin className="size-3.5 shrink-0 text-amber-500" />
                  <span className="truncate">{locationLabel}</span>
                </p>
                <span className="shrink-0 rounded-full border border-current/15 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase opacity-80">
                  {countryCode}
                </span>
              </div>

              {showClock && (
                <div className="mt-1.5 flex items-baseline justify-between gap-2">
                  <p className="font-mono text-[clamp(22px,2vw,34px)] font-black tabular-nums leading-none tracking-tight">
                    {clockText}
                  </p>
                  <p className={`text-[11px] font-medium ${theme.mutedInk}`}>
                    {dateText}
                  </p>
                </div>
              )}

              {showWeather && (
                <div className="mt-2 flex items-center justify-between gap-2 border-t border-current/10 pt-1.5 text-[11px]">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <CloudSun className="size-3.5 shrink-0 text-amber-500" />
                    <span className="font-bold tabular-nums">
                      {weather ? `${weather.temperatureC}°C` : "24°C"}
                    </span>
                    <span className={`truncate ${theme.mutedInk}`}>
                      {weather?.condition || "Partly Cloudy"}
                    </span>
                  </div>
                  <div
                    className={`flex shrink-0 items-center gap-2 text-[10px] ${theme.mutedInk}`}
                  >
                    <span className="flex items-center gap-0.5">
                      <Droplets className="size-3 text-sky-500" />
                      {weather?.humidityPercent ?? 58}%
                    </span>
                    <span className="flex items-center gap-0.5">
                      <Wind className="size-3 text-emerald-500" />
                      {weather?.windKmh ?? 12}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 2. Natural-Proportion Product Showcase Stage (Zero Squeezing Across All TV Sizes) */}
          {currentProduct && (
          <div
            className={`relative flex min-h-[160px] flex-1 flex-col justify-between overflow-hidden rounded-2xl border p-3.5 xl:p-4 ${theme.stageBg}`}
          >
            {/* Subtle ambient spotlight */}
            <div className="pointer-events-none absolute -right-10 -top-10 size-36 rounded-full bg-amber-400/12 blur-2xl" />

            {/* Badge Header Pill */}
            <div className="relative z-10 flex shrink-0 items-center justify-between">
              <span
                key={`cat-${currentProduct.id}`}
                className={`animate-crown-slide inline-flex max-w-full items-center gap-1.5 truncate rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-2xs ${theme.badgeBg}`}
              >
                <span className="size-1.5 shrink-0 rounded-full bg-amber-500" />
                <span className="truncate">{currentProduct.category}</span>
              </span>
            </div>

            {/* Unobstructed Straight Upright Uniform Product Stage (0deg, Natural Proportions) */}
            <div className="relative my-2 flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl p-2">
              <div
                className={`pointer-events-none absolute bottom-1 h-3 w-3/5 max-w-[150px] rounded-full blur-md ${isDarkTheme ? "bg-black/45" : "bg-zinc-900/10"
                  }`}
              />
              <div className="relative z-10 flex aspect-square h-full max-h-[88%] max-w-[88%] items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={`hero-${currentProduct.id}`}
                  src={currentProduct.imageUrl}
                  alt={currentProduct.name}
                  className="animate-crown-slide h-full w-full object-contain object-center drop-shadow-[0_10px_18px_rgba(15,23,42,0.16)]"
                />
              </div>
            </div>

            {/* Product Name + Description + Sweep Progress */}
            <div className="relative z-10 shrink-0 space-y-2">
              <div
                key={`meta-${currentProduct.id}`}
                className="animate-crown-slide"
              >
                <p
                  className={`truncate text-[clamp(14px,1.15vw,18px)] font-extrabold tracking-tight ${theme.titleInk}`}
                >
                  {currentProduct.name}
                </p>
                {currentProduct.tagline && (
                  <p
                    className={`mt-0.5 line-clamp-2 text-[clamp(10px,0.78vw,12px)] leading-snug ${theme.mutedInk}`}
                  >
                    {currentProduct.tagline}
                  </p>
                )}
              </div>
              <div
                className={`h-[3px] w-full overflow-hidden rounded-full ${isDarkTheme ? "bg-white/15" : "bg-zinc-200/80"
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

          {/* 3. Ultra-Scannable Auto-Tracked QR Attribution Card */}
          {showQr && (
            <div
              className={`flex shrink-0 items-center gap-3 rounded-2xl border p-3 ${theme.qrCardBg}`}
            >
              <div className="shrink-0 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-2xs">
                <QRCodeSVG
                  value={qrValue}
                  size={104}
                  level="H"
                  marginSize={2}
                  bgColor="#ffffff"
                  fgColor="#000000"
                  imageSettings={
                    showQrLogo
                      ? {
                          src: CROWN_OFFICIAL_LOGO_URL,
                          height: 24,
                          width: 24,
                          excavate: true,
                        }
                      : undefined
                  }
                />
              </div>
              <div className="min-w-0">
                <p
                  className={`truncate text-xs font-bold ${theme.titleInk}`}
                >
                  {qrTitle}
                </p>
                <p
                  className={`mt-0.5 line-clamp-2 text-[11px] leading-snug ${theme.mutedInk}`}
                >
                  {promoLabel}
                </p>
                <p
                  className={`mt-1 truncate font-mono text-[9px] font-medium ${theme.linkInk}`}
                >
                  {qrDisplayHost}
                </p>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Bottom Ticker Zone (Right partner dock aligns flush with Right Sidebar vertical border) */}
      <TickerBar
        messages={tickerContent}
        partnerLogos={partnerLogos}
        partnerMode={partnerTickerMode}
        rightRailWidthClass={
          sidebarSide === "right" ? "w-[clamp(260px,24vw,430px)]" : undefined
        }
      />
    </div>
  );
}
