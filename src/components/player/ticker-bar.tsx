"use client";

/**
 * @file src/components/player/ticker-bar.tsx
 * @description Crisp pure-white bottom running tagline bar anchored by the official
 * Crown Paints logo, rendering multiple taglines with inline SVG Google Play, App Store,
 * WhatsApp, and corporate vector icons.
 */

import { useEffect, useState } from "react";
import {
  Award,
  Globe,
  MessageCircle,
  Paintbrush,
  Phone,
  ShieldCheck,
  Sparkles,
  Tag,
  Truck,
} from "lucide-react";
import { CROWN_OFFICIAL_LOGO_URL } from "@/lib/crown-products";
import { parseTickerItem, type TickerIconKey } from "@/lib/ticker-parser";

export interface TickerPartnerLogo {
  id: string;
  name: string;
  logoUrl: string;
  tagline?: string | null;
}

interface TickerBarProps {
  messages: string[];
  compact?: boolean;
  partnerLogos?: TickerPartnerLogo[];
  partnerMode?: "pinned_right" | "inline_scroll" | "hidden" | string;
  /** Optional exact width class (e.g. `w-[clamp(260px,24vw,430px)]`) so the right logo dock border aligns flush with the right sidebar above it */
  rightRailWidthClass?: string;
}

function GooglePlayBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-950 px-2.5 py-1 text-[11px] font-semibold leading-none text-white shadow-2xs">
      <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" aria-hidden="true">
        <path fill="#34A853" d="M3.6 2.4c-.3.3-.5.8-.5 1.4v16.4c0 .6.2 1.1.5 1.4l.1.1 9.2-9.2v-.2L3.7 2.3l-.1.1z" />
        <path fill="#4285F4" d="M16 15.6l-3.1-3.1v-.2L16 9.2l.1.1 3.6 2.1c1 .6 1 1.6 0 2.2l-3.6 2.1-.1-.1z" />
        <path fill="#FBBC05" d="M16.1 15.5L12.9 12.3 3.6 21.6c.4.4 1 .4 1.7 0l10.8-6.1z" />
        <path fill="#EA4335" d="M16.1 9.3L5.3 3.2c-.7-.4-1.3-.3-1.7.1l9.3 9.3 3.2-3.3z" />
      </svg>
      <span>Google Play</span>
    </span>
  );
}

function AppStoreBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-950 px-2.5 py-1 text-[11px] font-semibold leading-none text-white shadow-2xs">
      <svg viewBox="0 0 24 24" className="size-3.5 shrink-0 fill-current" aria-hidden="true">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.96 6.33c.67-.81 1.12-1.94 1-3.08-.96.04-2.13.64-2.82 1.45-.61.7-.15 1.86-1.01 2.97 1.07.08 2.16-.54 2.83-1.34z" />
      </svg>
      <span>App Store</span>
    </span>
  );
}

export function TickerIconBadge({ icon }: { icon: TickerIconKey }) {
  switch (icon) {
    case "appstores":
      return (
        <span className="inline-flex items-center gap-1.5">
          <GooglePlayBadge />
          <AppStoreBadge />
        </span>
      );
    case "playstore":
      return <GooglePlayBadge />;
    case "appstore":
      return <AppStoreBadge />;
    case "whatsapp":
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold leading-none text-white">
          <MessageCircle className="size-3" />
          WhatsApp
        </span>
      );
    case "paint":
      return (
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <Paintbrush className="size-3.5" />
        </span>
      );
    case "sparkles":
      return (
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-blue-100 text-blue-700">
          <Sparkles className="size-3.5" />
        </span>
      );
    case "tag":
      return (
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-rose-100 text-rose-700">
          <Tag className="size-3.5" />
        </span>
      );
    case "shield":
      return (
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <ShieldCheck className="size-3.5" />
        </span>
      );
    case "phone":
      return (
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-zinc-100 text-zinc-800">
          <Phone className="size-3.5" />
        </span>
      );
    case "globe":
      return (
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-sky-100 text-sky-700">
          <Globe className="size-3.5" />
        </span>
      );
    case "truck":
      return (
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
          <Truck className="size-3.5" />
        </span>
      );
    case "award":
      return (
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <Award className="size-3.5" />
        </span>
      );
    default:
      return <span className="size-2 rounded-full bg-amber-500" />;
  }
}

export function TickerBar({
  messages,
  compact = false,
  partnerLogos = [],
  partnerMode = "pinned_right",
  rightRailWidthClass,
}: TickerBarProps) {
  const [partnerStep, setPartnerStep] = useState(0);
  const activePartners = partnerLogos.filter((p) => Boolean(p.logoUrl));
  const shouldRotatePairs =
    partnerMode !== "hidden" &&
    partnerMode !== "inline_scroll" &&
    activePartners.length > 2;

  // Rotate cleanly 2 logos at a time every 6s so the tagline bar keeps maximum horizontal space
  useEffect(() => {
    if (!shouldRotatePairs) return;
    const timer = setInterval(() => {
      setPartnerStep((prev) => prev + 1);
    }, 6000);
    return () => clearInterval(timer);
  }, [shouldRotatePairs]);

  const parsed = messages
    .map((m) => parseTickerItem(m))
    .filter((item) => item.text.length > 0);

  const items =
    parsed.length > 0
      ? parsed
      : [
          { icon: "none" as const, text: "If you like it... Crown it!" },
          {
            icon: "paint" as const,
            text: "Precision Colour Tinting in 1,800+ Designer Shades",
          },
        ];

  const showPinnedPartners =
    partnerMode !== "hidden" &&
    partnerMode !== "inline_scroll" &&
    activePartners.length > 0;
  const showInlinePartners =
    partnerMode === "inline_scroll" && activePartners.length > 0;

  // Always render 2 balanced logos when >2 exist (wrapping cleanly on odd counts so width never jumps)
  const pinnedSlice: TickerPartnerLogo[] = (() => {
    const count = activePartners.length;
    if (count <= 2) return activePartners;
    const startIdx = (partnerStep * 2) % count;
    return [activePartners[startIdx], activePartners[(startIdx + 1) % count]];
  })();

  return (
    <footer
      className={`relative flex shrink-0 items-center overflow-hidden border-t border-zinc-200 bg-white ${
        compact
          ? "h-[clamp(38px,5.2vh,54px)]"
          : "h-[clamp(42px,5.8vh,62px)]"
      }`}
    >
      <div
        className={`z-10 flex h-full shrink-0 items-center border-r border-zinc-200 bg-white ${
          compact ? "px-3" : "px-[clamp(10px,1.3vw,20px)]"
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={CROWN_OFFICIAL_LOGO_URL}
          alt="Crown Paints"
          className={
            compact
              ? "h-[clamp(24px,3.6vh,38px)] w-auto object-contain"
              : "h-[clamp(26px,4.1vh,46px)] w-auto object-contain"
          }
        />
      </div>

      <div className="min-w-0 flex-1 overflow-hidden">
        <div
          className={`animate-crown-ticker items-center gap-[clamp(24px,3vw,48px)] px-[clamp(12px,1.5vw,24px)] font-semibold text-zinc-900 ${
            compact
              ? "text-[clamp(11px,1.35vh,13px)]"
              : "text-[clamp(12px,1.55vh,15px)]"
          }`}
        >
          {[...items, ...items].map((item, i) => (
            <span
              key={`${i}-${item.icon}-${item.text}`}
              className="inline-flex items-center gap-3"
            >
              <TickerIconBadge icon={item.icon} />
              <span>{item.text}</span>
              {showInlinePartners &&
                activePartners.length > 0 &&
                i % Math.max(1, Math.floor(items.length / activePartners.length)) === 0 && (() => {
                  const partner = activePartners[i % activePartners.length];
                  return (
                    <span className="ml-4 inline-flex items-center rounded-lg border border-zinc-200/90 bg-zinc-50 px-2.5 py-1 shadow-2xs">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={partner.logoUrl}
                        alt={partner.name}
                        className={
                          compact
                            ? "h-6 w-auto max-w-[90px] object-contain"
                            : "h-8 w-auto max-w-[116px] object-contain"
                        }
                      />
                    </span>
                  );
                })()}
            </span>
          ))}
        </div>
      </div>

      {/* Pinned Compact 2-Logo Rotating Showcase Rail (Aligned flush with Right Sidebar border when present) */}
      {showPinnedPartners && (
        <div
          className={`z-10 flex h-full shrink-0 items-center justify-center border-l border-zinc-200 bg-gradient-to-l from-zinc-50 via-white to-white ${
            rightRailWidthClass
              ? `${rightRailWidthClass} px-3 xl:px-4`
              : compact
                ? "px-2.5"
                : "px-3.5"
          }`}
        >
          <div
            key={`logo-pair-${pinnedSlice.map((p) => p.id).join("-")}`}
            className={`animate-crown-slide flex w-full items-center justify-center gap-2 ${
              rightRailWidthClass ? "" : "w-auto"
            }`}
          >
            {pinnedSlice.map((partner) => (
              <div
                key={partner.id}
                title={partner.name}
                className={`flex items-center justify-center rounded-lg border border-zinc-200/80 bg-white px-2 shadow-2xs ${
                  rightRailWidthClass
                    ? "h-[clamp(28px,4.1vh,44px)] min-w-0 flex-1 max-w-[172px]"
                    : compact
                      ? "h-[clamp(26px,3.6vh,36px)] w-[clamp(70px,7vw,92px)]"
                      : "h-[clamp(28px,4.1vh,44px)] w-[clamp(78px,8vw,112px)]"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={partner.logoUrl}
                  alt={partner.name}
                  className={
                    compact
                      ? "h-[clamp(18px,2.5vh,26px)] w-auto max-w-[78px] object-contain"
                      : "h-[clamp(20px,2.9vh,32px)] w-auto max-w-full object-contain"
                  }
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </footer>
  );
}
