"use client";

/**
 * @file src/components/player/multi-zone-frame.tsx
 * @description Crown Paints 3-zone Split Canvas layout with a crisp pure-white minimalist
 * showroom sidebar, an innovative 3D tilted product showcase carousel (17 official Crown
 * packshots, zero counter clutter), live EAT clock & Open-Meteo weather, Decorative Range
 * QR (`crownpaints.co.ke/product-category/decorative`), and a taller pure-white bottom
 * ticker anchored by the official Crown Paints logo.
 */

import { useEffect, useState } from "react";
import { CloudSun, Droplets, MapPin, Wind } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { PlaylistSidebarConfig } from "@/db/schema";
import {
  CROWN_DECORATIVE_QR_URL,
  CROWN_PRODUCT_SHOWCASE,
} from "@/lib/crown-products";
import type { EastAfricaWeather } from "@/lib/weather";
import { TickerBar } from "./ticker-bar";

interface MultiZoneFrameProps {
  children: React.ReactNode;
  branchName: string;
  city: string;
  countryCode: string;
  currencyCode: string;
  clockText: string;
  tickerMessages: string[];
  orientation?: "landscape" | "portrait";
  sidebarConfig?: PlaylistSidebarConfig | null;
  screenId?: string;
  branchId?: string;
}

const PRODUCT_SLIDE_INTERVAL_MS = 5500;

export function MultiZoneFrame({
  children,
  branchName,
  city,
  countryCode,
  currencyCode,
  clockText,
  tickerMessages,
  orientation = "landscape",
  sidebarConfig,
  screenId,
  branchId,
}: MultiZoneFrameProps) {
  const [weather, setWeather] = useState<EastAfricaWeather | null>(null);
  const [productIndex, setProductIndex] = useState(0);

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

  // Smooth auto-rotating 3D tilted Crown Paints product showcase
  useEffect(() => {
    const timer = setInterval(() => {
      setProductIndex((prev) => (prev + 1) % CROWN_PRODUCT_SHOWCASE.length);
    }, PRODUCT_SLIDE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const currentProduct = CROWN_PRODUCT_SHOWCASE[productIndex];
  const nextProduct =
    CROWN_PRODUCT_SHOWCASE[(productIndex + 1) % CROWN_PRODUCT_SHOWCASE.length];

  const locationLabel = sidebarConfig?.displayName?.trim() || branchName;

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
          `Crown Paints East Africa • Local Showroom Pricing in ${currencyCode}`,
        ];

  const qrDestination =
    sidebarConfig?.qrTargetUrl?.trim() || CROWN_DECORATIVE_QR_URL;

  const qrValue =
    screenId && branchId && typeof window !== "undefined"
      ? `${window.location.origin}/q/concierge?s=${encodeURIComponent(screenId)}&b=${encodeURIComponent(branchId)}&to=${encodeURIComponent(qrDestination)}`
      : qrDestination;

  const promoLabel =
    sidebarConfig?.promoLabel ||
    "Scan to browse Crown Decorative paints & shades.";

  // Portrait (9:16) Vertical Showroom Totem Layout
  if (orientation === "portrait") {
    return (
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-white text-zinc-950">
        {/* Top Primary Stage */}
        <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
          {children}
        </div>

        {/* Middle Pure-White Showroom Info & Tilted Product Showcase Strip */}
        <section className="grid shrink-0 grid-cols-3 gap-3 border-t border-zinc-200 bg-white p-3.5">
          {/* Showroom Location + Clock + Weather */}
          <div className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3">
            <div>
              <div className="flex items-center justify-between gap-1">
                <p className="flex items-center gap-1 truncate text-[11px] font-semibold text-zinc-700">
                  <MapPin className="size-3 shrink-0 text-amber-600" />
                  <span className="truncate">{locationLabel}</span>
                </p>
                <span className="shrink-0 rounded-full border border-zinc-200 bg-white px-1.5 py-0.5 font-mono text-[9px] font-semibold text-zinc-600">
                  {countryCode}
                </span>
              </div>
              <p className="mt-1 font-mono text-2xl font-black tabular-nums text-zinc-950">
                {clockText}{" "}
                <span className="text-[10px] font-semibold text-zinc-400">
                  EAT
                </span>
              </p>
              <p className="text-[10px] text-zinc-500">{dateText}</p>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-zinc-200 pt-1.5 text-[10px] text-zinc-600">
              <span className="flex items-center gap-1 truncate font-semibold text-zinc-900">
                <CloudSun className="size-3.5 text-amber-500" />
                {weather ? `${weather.temperatureC}°C` : "24°C"}
              </span>
              <span className="truncate text-zinc-500">
                {weather?.city || city}
              </span>
            </div>
          </div>

          {/* Tilted Crown Product Card */}
          <div className="relative flex items-center gap-2.5 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-3 shadow-2xs">
            <div className="relative flex h-16 w-14 shrink-0 items-center justify-center">
              <div className="absolute bottom-0 h-2.5 w-11 rounded-full bg-zinc-900/15 blur-sm" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={currentProduct.id}
                src={currentProduct.imageUrl}
                alt={currentProduct.name}
                className="animate-crown-product-hero relative z-10 max-h-16 w-auto object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.18)]"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[9px] font-bold uppercase tracking-wider text-blue-700">
                {currentProduct.category}
              </p>
              <p className="truncate text-xs font-bold text-zinc-950">
                {currentProduct.name}
              </p>
              <p className="line-clamp-2 text-[10px] leading-tight text-zinc-500">
                {currentProduct.tagline}
              </p>
            </div>
          </div>

          {/* Decorative Range QR */}
          <div className="flex items-center gap-2.5 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3">
            <div className="shrink-0 rounded-lg border border-zinc-200 bg-white p-1.5 shadow-2xs">
              <QRCodeSVG value={qrValue} size={50} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-zinc-950">
                Decorative Range
              </p>
              <p className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-zinc-500">
                {promoLabel}
              </p>
            </div>
          </div>
        </section>

        {/* Crisp Pure-White Bottom Ticker with Official Crown Paints Logo & Icons */}
        <TickerBar messages={tickerContent} compact />
      </div>
    );
  }

  // Landscape (16:9) Crisp Pure-White Showroom Split Canvas Layout
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white text-zinc-950">
      {/* Top Split Area */}
      <div className="grid min-h-0 flex-1 grid-cols-12">
        {/* Main Zone (75% = 9 cols) */}
        <div className="relative col-span-9 h-full min-h-0 overflow-hidden bg-black">
          {children}
        </div>

        {/* Right Pure-White Minimalist Showroom Sidebar (25% = 3 cols) */}
        <aside className="col-span-3 flex h-full min-h-0 flex-col gap-3 border-l border-zinc-200 bg-white p-4">
          {/* 1. Clean Clock, Location & Weather Card (No Playlist Name) */}
          {(sidebarConfig?.showClock !== false ||
            sidebarConfig?.showWeather !== false) && (
            <div className="shrink-0 rounded-2xl border border-zinc-200/90 bg-zinc-50/70 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <p className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-zinc-700">
                  <MapPin className="size-3.5 shrink-0 text-amber-600" />
                  <span className="truncate">{locationLabel}</span>
                </p>
                <span className="shrink-0 rounded-full border border-zinc-200 bg-white px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-zinc-600">
                  {countryCode}
                </span>
              </div>

              {sidebarConfig?.showClock !== false && (
                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <p className="font-mono text-3xl font-black tabular-nums tracking-tight text-zinc-950">
                    {clockText}
                    <span className="ml-1.5 text-[11px] font-semibold text-zinc-400">
                      EAT
                    </span>
                  </p>
                  <p className="text-[11px] font-medium text-zinc-500">
                    {dateText}
                  </p>
                </div>
              )}

              {sidebarConfig?.showWeather !== false && (
                <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-zinc-200/80 pt-2 text-[11px] text-zinc-600">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <CloudSun className="size-4 shrink-0 text-amber-500" />
                    <span className="font-bold tabular-nums text-zinc-950">
                      {weather ? `${weather.temperatureC}°C` : "24°C"}
                    </span>
                    <span className="truncate text-zinc-500">
                      {weather?.condition || "Partly Cloudy"}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-[10px] text-zinc-500">
                    <span className="flex items-center gap-0.5">
                      <Droplets className="size-3 text-sky-500" />
                      {weather?.humidityPercent ?? 58}%
                    </span>
                    <span className="flex items-center gap-0.5">
                      <Wind className="size-3 text-emerald-600" />
                      {weather?.windKmh ?? 12}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 2. Innovative 3D Tilted Crown Paints Product Showcase (Pure White, Zero Counter Clutter) */}
          <div className="relative flex min-h-0 flex-1 flex-col justify-between overflow-hidden rounded-2xl border border-zinc-200/90 bg-gradient-to-b from-zinc-50/50 via-white to-amber-50/35 p-4">
            {/* Subtle decorative editorial spotlight halo */}
            <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-amber-400/12 blur-2xl" />
            <div className="pointer-events-none absolute -left-8 bottom-14 size-32 rounded-full bg-blue-900/5 blur-2xl" />

            {/* Category Eyebrow Pill (no 1/17 counter) */}
            <div className="relative z-10 flex items-center justify-between">
              <span
                key={`cat-${currentProduct.id}`}
                className="animate-crown-slide inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#1e2a6e] shadow-2xs"
              >
                <span className="size-1.5 rounded-full bg-amber-500" />
                {currentProduct.category}
              </span>
            </div>

            {/* Layered 3D Slanted Gallery Stage */}
            <div className="relative my-2 flex min-h-0 flex-1 items-center justify-center">
              {/* Soft elliptical studio floor shadow */}
              <div className="pointer-events-none absolute bottom-1 h-4 w-36 rounded-full bg-zinc-900/12 blur-md" />

              {/* Soft abstract blurred silhouette of next product for ambient depth (unreadable) */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={`peek-${nextProduct.id}`}
                src={nextProduct.imageUrl}
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute right-0 max-h-[60%] max-w-[48%] translate-x-8 translate-y-3 rotate-[14deg] scale-75 object-contain opacity-[0.1] blur-[8px] saturate-50 transition-all duration-700"
              />

              {/* Active hero paint tin in signature slanted levitation */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={`hero-${currentProduct.id}`}
                src={currentProduct.imageUrl}
                alt={currentProduct.name}
                className="animate-crown-product-hero relative z-10 max-h-[92%] max-w-[78%] object-contain drop-shadow-[0_18px_24px_rgba(15,23,42,0.22)]"
              />
            </div>

            {/* Crisp Editorial Product Caption + Thin Sweep Bar */}
            <div className="relative z-10 space-y-2">
              <div
                key={`meta-${currentProduct.id}`}
                className="animate-crown-slide"
              >
                <p className="truncate text-[16px] font-extrabold tracking-tight text-zinc-950">
                  {currentProduct.name}
                </p>
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-zinc-500">
                  {currentProduct.tagline}
                </p>
              </div>
              <div className="h-[3px] w-full overflow-hidden rounded-full bg-zinc-100">
                <div
                  key={`bar-${currentProduct.id}`}
                  className="animate-crown-progress h-full w-full rounded-full bg-gradient-to-r from-[#1e2a6e] via-amber-500 to-amber-400"
                  style={{
                    animationDuration: `${PRODUCT_SLIDE_INTERVAL_MS}ms`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* 3. Decorative Range QR Card (Pure White) */}
          {sidebarConfig?.showQr !== false && (
            <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-zinc-200/90 bg-zinc-50/70 p-3">
              <div className="shrink-0 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-2xs">
                <QRCodeSVG value={qrValue} size={62} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-zinc-950">
                  Explore Decorative Range
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">
                  {promoLabel}
                </p>
                <p className="mt-1 truncate font-mono text-[9px] font-medium text-[#1e2a6e]">
                  crownpaints.co.ke
                </p>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Bottom Ticker Zone — Crisp Pure White Bar (64px) with Official Logo & Rich Icons */}
      <TickerBar messages={tickerContent} />
    </div>
  );
}
