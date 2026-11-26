"use client";

/**
 * @file src/components/player/quick-post-slide.tsx
 * @description Renders crisp Satoshi vector slides on `/player` and CMS previews for
 * Customer Service (paint swatches + QR), Marketing (`KES`/`TZS`/`UGX`), HR Spotlight,
 * SHE Safety PPE counter, ICT bulletins, and Recharts Sales Analytics.
 */

import { QRCodeSVG } from "qrcode.react";
import {
  Award,
  Cpu,
  HeartHandshake,
  Palette,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import type { QuickPostSlideConfig } from "@/db/schema";
import { CROWN_OFFICIAL_LOGO_URL } from "@/lib/crown-products";
import { resolveQrCodeValue } from "@/lib/qr-url";
import { CanvasRenderer } from "./canvas-renderer";
import { SalesAnalyticsSlide } from "./sales-analytics-slide";

interface QuickPostSlideProps {
  title?: string;
  departmentName?: string;
  templateType?: string;
  config: QuickPostSlideConfig;
  branchName?: string;
  countryCode?: string;
  screenId?: string;
  branchId?: string;
  quickPostId?: string;
  qrSignatures?: Record<string, string>;
  compact?: boolean;
}

const THEME_STYLES: Record<
  NonNullable<QuickPostSlideConfig["backgroundTheme"]>,
  string
> = {
  crown_navy:
    "bg-gradient-to-br from-[#060d1f] via-[#0c1e45] to-[#081226] text-white",
  crown_gold:
    "bg-gradient-to-br from-[#1f1304] via-[#3a2206] to-[#140d04] text-amber-50",
  she_emerald:
    "bg-gradient-to-br from-[#031d15] via-[#063a2a] to-[#041410] text-emerald-50",
  ict_slate:
    "bg-gradient-to-br from-[#0c0a24] via-[#17163b] to-[#090d1a] text-indigo-50",
  hr_violet:
    "bg-gradient-to-br from-[#1b0b2e] via-[#2e1052] to-[#120821] text-purple-50",
  light:
    "bg-gradient-to-br from-stone-50 via-white to-amber-50/60 text-slate-900",
};

const DEFAULT_SWATCHES = [
  { name: "Savannah Ochre", hex: "#D97706" },
  { name: "Kilimanjaro Slate", hex: "#334155" },
  { name: "Coastal Teal", hex: "#0D9488" },
  { name: "Serengeti Sand", hex: "#EAB308" },
  { name: "Crown Crimson", hex: "#DC2626" },
];

function getInitials(name?: string): string {
  if (!name) return "CP";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function QuickPostSlide({
  title,
  departmentName,
  templateType,
  config,
  branchName,
  countryCode,
  screenId,
  branchId,
  quickPostId,
  qrSignatures,
  compact = false,
}: QuickPostSlideProps) {
  if (config.canvasDoc && config.canvasDoc.elements.length > 0) {
    return (
      <CanvasRenderer
        doc={config.canvasDoc}
        screenId={screenId}
        branchId={branchId}
        quickPostId={quickPostId}
        slideTitle={title}
        qrSignatures={qrSignatures}
        className={compact ? "rounded-xl" : ""}
      />
    );
  }

  if (templateType === "kpi_chart") {
    return (
      <SalesAnalyticsSlide
        config={config}
        departmentName={departmentName}
        branchName={branchName}
        countryCode={countryCode}
        compact={compact}
      />
    );
  }

  const theme = THEME_STYLES[config.backgroundTheme ?? "crown_navy"];
  const isLight = config.backgroundTheme === "light";
  const hasQr = Boolean(config.qrUrl && config.qrUrl.trim().length > 0);
  const isHr = templateType === "hr_spotlight";
  const isShe = templateType === "she_safety";
  const isIct = templateType === "ict_notice";
  const isColourOrPromo =
    templateType === "customer_service_qr" ||
    templateType === "marketing_promo";
  const swatches =
    config.swatchColors && config.swatchColors.length > 0
      ? config.swatchColors
      : DEFAULT_SWATCHES;

  const borderMuted = isLight ? "border-slate-900/10" : "border-white/15";
  const surfaceGlass = isLight
    ? "bg-slate-900/[0.04] border-slate-900/10"
    : "bg-white/[0.07] border-white/15";

  const qrDestination = (() => {
    if (!config.qrUrl) return "";
    return resolveQrCodeValue({
      destinationUrl: config.qrUrl,
      mode: config.qrTrackingMode ?? "direct",
      kind: "slide",
      screenId,
      quickPostId,
      currentOrigin: typeof window !== "undefined" ? window.location.origin : "",
      configuredAppUrl: process.env.NEXT_PUBLIC_APP_URL,
    });
  })();

  return (
    <div
      className={`animate-crown-slide relative flex h-full w-full flex-col justify-between overflow-hidden ${theme} ${
        compact ? "rounded-xl p-5" : "p-12 md:p-16"
      }`}
    >
      {/* Architectural ambient paint-glow backdrops */}
      <div
        className={`pointer-events-none absolute -right-28 -top-28 size-[28rem] rounded-full blur-3xl ${
          isHr
            ? "bg-fuchsia-500/20"
            : isShe
              ? "bg-emerald-400/15"
              : isIct
                ? "bg-indigo-400/20"
                : "bg-amber-400/15"
        }`}
      />
      <div className="pointer-events-none absolute -bottom-32 -left-24 size-96 rounded-full bg-sky-400/10 blur-3xl" />

      {/* Top Crown Paint Ribbon */}
      {isColourOrPromo && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex h-1.5">
          {swatches.map((sw) => (
            <div
              key={sw.name}
              className="flex-1"
              style={{ backgroundColor: sw.hex }}
            />
          ))}
        </div>
      )}

      {/* Top Metadata Bar */}
      <div className="relative z-10 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-2 rounded-full border font-bold tracking-wider uppercase backdrop-blur-md ${surfaceGlass} ${
              compact ? "px-2.5 py-0.5 text-[10px]" : "px-4 py-1.5 text-xs"
            }`}
          >
            {isHr ? (
              <Users className={compact ? "size-3" : "size-4 text-fuchsia-300"} />
            ) : isShe ? (
              <ShieldCheck
                className={compact ? "size-3" : "size-4 text-emerald-300"}
              />
            ) : isIct ? (
              <Cpu className={compact ? "size-3" : "size-4 text-indigo-300"} />
            ) : (
              <Palette className={compact ? "size-3" : "size-4 text-amber-300"} />
            )}
            {config.badgeText || departmentName || "CROWN PAINTS"}
          </span>
          {countryCode && (
            <span
              className={`rounded-full border font-mono uppercase ${surfaceGlass} ${
                compact ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs"
              }`}
            >
              {countryCode}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Sparkles
            className={`${compact ? "size-3" : "size-4"} text-amber-400`}
          />
          <span
            className={`font-bold tracking-tight opacity-90 ${
              compact ? "text-xs" : "text-lg"
            }`}
          >
            Crown Paints
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 my-auto grid grid-cols-12 items-center gap-8">
        <div
          className={
            hasQr || isHr ? "col-span-8 space-y-4" : "col-span-12 space-y-5"
          }
        >
          {/* HR Person Spotlight Header */}
          {isHr && config.personName && (
            <div
              className={`inline-flex items-center gap-4 rounded-2xl border backdrop-blur-md ${surfaceGlass} ${
                compact ? "px-3 py-2" : "px-5 py-3"
              }`}
            >
              <div
                className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-400 to-purple-600 font-black text-white shadow-lg ${
                  compact ? "size-9 text-xs" : "size-14 text-xl"
                }`}
              >
                {getInitials(config.personName)}
              </div>
              <div>
                <p
                  className={`font-bold leading-tight ${
                    compact ? "text-sm" : "text-2xl"
                  }`}
                >
                  {config.personName}
                </p>
                <p
                  className={`opacity-80 ${
                    compact ? "text-[11px]" : "text-base"
                  }`}
                >
                  {[config.personRole, config.personBranch]
                    .filter(Boolean)
                    .join(" • ")}
                </p>
              </div>
            </div>
          )}

          <h1
            className={`font-black leading-[1.08] tracking-tight ${
              compact ? "text-xl" : "text-4xl md:text-6xl"
            }`}
          >
            {config.headline}
          </h1>

          {config.subheadline && (
            <p
              className={`font-medium opacity-90 ${
                compact ? "text-sm" : "text-xl md:text-2xl"
              }`}
            >
              {config.subheadline}
            </p>
          )}

          {config.body && (
            <p
              className={`max-w-3xl leading-relaxed opacity-80 ${
                compact ? "text-xs" : "text-lg md:text-xl"
              }`}
            >
              {config.body}
            </p>
          )}

          {/* Metric / Price Hero Pill */}
          {(config.metricValue || config.price) && (
            <div className="pt-2">
              <div
                className={`inline-flex items-baseline gap-4 rounded-2xl border backdrop-blur-md shadow-xl ${surfaceGlass} ${
                  compact ? "px-4 py-2" : "px-7 py-4"
                }`}
              >
                <span
                  className={`font-black tabular-nums tracking-tight ${
                    compact ? "text-2xl" : "text-4xl md:text-5xl"
                  }`}
                >
                  {config.price
                    ? `${config.currency ?? "KES"} ${config.price}`
                    : config.metricValue}
                </span>
                {config.metricLabel && (
                  <span
                    className={`font-medium opacity-85 ${
                      compact ? "text-xs" : "text-lg"
                    }`}
                  >
                    {config.metricLabel}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Architectural Paint Swatch Fan for Colour Studio & Marketing */}
          {isColourOrPromo && (
            <div
              className={`flex flex-wrap items-center gap-2 ${
                compact ? "pt-1" : "pt-3"
              }`}
            >
              {swatches.map((sw) => (
                <div
                  key={sw.name}
                  className={`flex items-center gap-2 rounded-full border backdrop-blur-sm ${surfaceGlass} ${
                    compact ? "px-2 py-1 text-[10px]" : "px-3 py-1.5 text-xs"
                  }`}
                >
                  <span
                    className={`rounded-full border border-white/30 ${
                      compact ? "size-2.5" : "size-3.5"
                    }`}
                    style={{ backgroundColor: sw.hex }}
                  />
                  <span className="font-medium">{sw.name}</span>
                </div>
              ))}
            </div>
          )}

          {/* SHE PPE Checklist Chips */}
          {isShe && (
            <div className="flex flex-wrap items-center gap-2 pt-2">
              {["Safety Goggles", "Respirator Mask", "Hi-Vis Vest", "Steel-Toe Boots"].map(
                (item) => (
                  <span
                    key={item}
                    className={`inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/15 font-semibold text-emerald-100 ${
                      compact ? "px-2 py-0.5 text-[10px]" : "px-3.5 py-1.5 text-xs"
                    }`}
                  >
                    <ShieldCheck className={compact ? "size-3" : "size-3.5"} />
                    {item}
                  </span>
                )
              )}
            </div>
          )}
        </div>

        {/* Right Showcase Column: QR Card or HR Recognition Crest */}
        {(hasQr || isHr) && (
          <div className="col-span-4 flex flex-col items-center justify-center">
            {hasQr && config.qrUrl ? (
              <div
                className={`flex flex-col items-center rounded-3xl border backdrop-blur-md shadow-2xl ${surfaceGlass} ${
                  compact ? "p-3" : "p-6"
                }`}
              >
                <div
                  className={`rounded-2xl bg-white shadow-lg ${
                    compact ? "p-2" : "p-4"
                  }`}
                >
                  <QRCodeSVG
                    value={qrDestination || config.qrUrl}
                    size={compact ? 88 : 196}
                    level="H"
                    marginSize={2}
                    bgColor="#ffffff"
                    fgColor="#000000"
                    imageSettings={
                      config.qrShowLogo !== false
                        ? {
                            src: CROWN_OFFICIAL_LOGO_URL,
                            height: compact ? 20 : 42,
                            width: compact ? 20 : 42,
                            excavate: true,
                          }
                        : undefined
                    }
                  />
                </div>
                <span
                  className={`mt-3 text-center font-semibold opacity-95 ${
                    compact ? "text-[11px]" : "text-base"
                  }`}
                >
                  {config.qrLabel || "Scan on Mobile"}
                </span>
              </div>
            ) : (
              <div
                className={`flex flex-col items-center justify-center rounded-3xl border text-center backdrop-blur-md ${surfaceGlass} ${
                  compact ? "p-4" : "p-8"
                }`}
              >
                <div
                  className={`flex items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white shadow-xl ${
                    compact ? "size-12" : "size-24"
                  }`}
                >
                  {isHr ? (
                    <HeartHandshake className={compact ? "size-6" : "size-12"} />
                  ) : (
                    <Award className={compact ? "size-6" : "size-12"} />
                  )}
                </div>
                <p
                  className={`mt-3 font-bold ${
                    compact ? "text-xs" : "text-xl"
                  }`}
                >
                  People &amp; Culture
                </p>
                <p
                  className={`opacity-75 ${
                    compact ? "text-[10px]" : "text-sm"
                  }`}
                >
                  One Crown Network
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className={`relative z-10 flex items-center justify-between border-t pt-3 opacity-80 ${borderMuted} ${
          compact ? "text-[10px]" : "text-sm"
        }`}
      >
        <span>{branchName || "Crown Canvas Digital Signage Network"}</span>
        <span>{departmentName || "Corporate Communications"}</span>
      </div>
    </div>
  );
}
