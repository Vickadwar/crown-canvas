"use client";

/**
 * @file src/components/player/employee-spotlight-slide.tsx
 * @description Broadcast-grade Employee of the Month / Quarter / Year TV celebration
 * slide featuring deterministic illustrated vector avatars (zero photo-cropping overhead),
 * Crown Paints branding, department/location badges, and smooth GPU crossfade.
 */

import { Award, Building2, MapPin, Sparkles, Trophy } from "lucide-react";
import {
  generateEmployeeAvatarDataUri,
  type EmployeeAvatarStyle,
} from "@/lib/avatar-generator";
import { CROWN_OFFICIAL_LOGO_URL } from "@/lib/crown-products";

export interface EmployeeSpotlightSlideProps {
  employeeName: string;
  locationName: string;
  departmentName: string;
  awardPeriodType: "month" | "quarter" | "year" | "special";
  awardPeriodLabel: string;
  citation?: string;
  avatarStyle?: EmployeeAvatarStyle;
  avatarSeed?: string;
  accentColor?: string;
  compact?: boolean;
}

const AWARD_HEADING: Record<EmployeeSpotlightSlideProps["awardPeriodType"], string> = {
  month: "EMPLOYEE OF THE MONTH",
  quarter: "EMPLOYEE OF THE QUARTER",
  year: "EMPLOYEE OF THE YEAR",
  special: "STAR PERFORMER RECOGNITION",
};

export function EmployeeSpotlightSlide({
  employeeName,
  locationName,
  departmentName,
  awardPeriodType,
  awardPeriodLabel,
  citation,
  avatarStyle = "illustrated",
  avatarSeed,
  compact = false,
}: EmployeeSpotlightSlideProps) {
  const avatarUri = generateEmployeeAvatarDataUri({
    name: employeeName,
    seed: avatarSeed || `${employeeName}-${departmentName}`,
    style: avatarStyle,
  });

  const heading = AWARD_HEADING[awardPeriodType] ?? "EMPLOYEE OF THE MONTH";

  return (
    <div
      className={`animate-crown-slide relative flex h-full w-full flex-col justify-between overflow-hidden bg-gradient-to-br from-[#071129] via-[#0e1f4a] to-[#081226] text-white select-none ${
        compact ? "rounded-xl p-5" : "p-10 md:p-14"
      }`}
    >
      {/* Celebratory ambient golden & royal-blue light blooms */}
      <div className="pointer-events-none absolute -right-24 -top-24 size-[26rem] rounded-full bg-amber-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -left-24 size-[24rem] rounded-full bg-sky-500/20 blur-3xl" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500" />

      {/* Top Header */}
      <div className="relative z-10 flex items-center justify-between gap-4">
        <div
          className={`inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-400/15 font-extrabold tracking-widest text-amber-200 uppercase backdrop-blur-md ${
            compact ? "px-3 py-1 text-[10px]" : "px-5 py-2 text-xs md:text-sm"
          }`}
        >
          <Trophy className={compact ? "size-3 text-amber-300" : "size-4 text-amber-300"} />
          <span>{heading}</span>
        </div>

        <div
          className={`inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 font-mono font-bold text-white/95 backdrop-blur-md ${
            compact ? "px-2.5 py-1 text-[10px]" : "px-4 py-1.5 text-xs md:text-sm"
          }`}
        >
          <Sparkles className={compact ? "size-3 text-amber-300" : "size-4 text-amber-300"} />
          <span>{awardPeriodLabel}</span>
        </div>
      </div>

      {/* Main Spotlight Stage */}
      <div
        className={`relative z-10 my-auto flex flex-col items-center justify-center text-center md:flex-row md:text-left ${
          compact ? "gap-5" : "gap-10 md:gap-14"
        }`}
      >
        {/* Crisp Vector Avatar with Golden Halo */}
        <div className="relative shrink-0">
          <div className="pointer-events-none absolute -inset-3 rounded-full bg-gradient-to-tr from-amber-400/35 via-yellow-200/20 to-sky-400/30 blur-xl" />
          <div
            className={`relative overflow-hidden rounded-full border-4 border-amber-300/80 bg-[#0c1a3a] shadow-[0_20px_50px_rgba(0,0,0,0.45)] ${
              compact ? "size-24" : "size-48 md:size-64"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={avatarUri}
              alt={employeeName}
              className="h-full w-full object-cover"
            />
          </div>
        </div>

        {/* Employee Details */}
        <div className="min-w-0 max-w-3xl space-y-4">
          <p
            className={`font-bold uppercase tracking-[0.22em] text-amber-300 ${
              compact ? "text-[10px]" : "text-xs md:text-sm"
            }`}
          >
            Congratulations &amp; Thank You For Your Excellence
          </p>

          <h1
            className={`font-black leading-[1.06] tracking-tight text-white ${
              compact ? "text-2xl" : "text-4xl md:text-6xl"
            }`}
          >
            {employeeName}
          </h1>

          <div className="flex flex-wrap items-center justify-center gap-2.5 md:justify-start">
            <span
              className={`inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 font-semibold text-white backdrop-blur-md ${
                compact ? "px-2.5 py-1 text-xs" : "px-4 py-2 text-base md:text-lg"
              }`}
            >
              <Building2 className={compact ? "size-3.5 text-sky-300" : "size-5 text-sky-300"} />
              <span>{departmentName}</span>
            </span>
            <span
              className={`inline-flex items-center gap-2 rounded-xl border border-amber-300/25 bg-amber-400/10 font-semibold text-amber-100 backdrop-blur-md ${
                compact ? "px-2.5 py-1 text-xs" : "px-4 py-2 text-base md:text-lg"
              }`}
            >
              <MapPin className={compact ? "size-3.5 text-amber-300" : "size-5 text-amber-300"} />
              <span>{locationName}</span>
            </span>
          </div>

          {citation && citation.trim().length > 0 && (
            <p
              className={`max-w-2xl leading-relaxed text-slate-200/90 ${
                compact ? "line-clamp-2 text-xs" : "text-lg md:text-xl"
              }`}
            >
              &ldquo;{citation.trim()}&rdquo;
            </p>
          )}
        </div>
      </div>

      {/* Brand Footer */}
      <div className="relative z-10 flex items-center justify-between border-t border-white/15 pt-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-white px-3 py-1 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={CROWN_OFFICIAL_LOGO_URL}
              alt="Crown Paints"
              className={compact ? "h-5 w-auto object-contain" : "h-8 w-auto object-contain"}
            />
          </div>
          <span
            className={`font-semibold text-slate-300 ${
              compact ? "text-[10px]" : "text-sm"
            }`}
          >
            Celebrating Outstanding Teamwork &amp; Customer Excellence
          </span>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 font-mono font-semibold text-amber-300 ${
            compact ? "text-[10px]" : "text-xs"
          }`}
        >
          <Award className="size-4" />
          People Excellence
        </span>
      </div>
    </div>
  );
}

export interface RecognitionWallEmployee {
  id: string;
  employeeName: string;
  locationName: string;
  departmentName: string;
  awardPeriodType: "month" | "quarter" | "year" | "special";
  awardPeriodLabel: string;
  citation?: string;
  avatarStyle?: EmployeeAvatarStyle;
  avatarSeed?: string;
}

export interface EmployeeRecognitionWallSlideProps {
  page: number;
  totalPages: number;
  totalEmployees: number;
  awardPeriodType: "month" | "quarter" | "year" | "special";
  awardPeriodLabel: string;
  employees: RecognitionWallEmployee[];
  orientation?: "landscape" | "portrait";
}

/**
 * Multi-employee Recognition Wall displaying up to 10 honorees per slide in a crisp
 * 5×2 landscape (or 2×5 portrait) TV grid, cycling cleanly Page 1 -> Page N.
 */
export function EmployeeRecognitionWallSlide({
  page,
  totalPages,
  totalEmployees,
  awardPeriodType,
  awardPeriodLabel,
  employees,
  orientation = "landscape",
}: EmployeeRecognitionWallSlideProps) {
  const heading = AWARD_HEADING[awardPeriodType] ?? "EMPLOYEE OF THE MONTH";
  const count = employees.length;
  const gridColsClass =
    orientation === "portrait"
      ? "grid-cols-2"
      : count <= 4
        ? "grid-cols-2"
        : count <= 6
          ? "grid-cols-3"
          : count <= 8
            ? "grid-cols-4"
            : "grid-cols-5";

  return (
    <div className="animate-crown-slide relative flex h-full w-full flex-col justify-between overflow-hidden bg-gradient-to-br from-[#071129] via-[#0e1f4a] to-[#081226] p-6 text-white select-none md:p-8">
      {/* Ambient celebratory light blooms */}
      <div className="pointer-events-none absolute -right-24 -top-24 size-[24rem] rounded-full bg-amber-400/18 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-24 size-[22rem] rounded-full bg-sky-500/18 blur-3xl" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500" />

      {/* Header */}
      <div className="relative z-10 flex shrink-0 items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-400/15 px-4 py-1.5 text-xs font-extrabold tracking-widest text-amber-200 uppercase backdrop-blur-md">
            <Trophy className="size-4 text-amber-300" />
            <span>{heading}</span>
          </div>
          <span className="hidden text-sm font-semibold text-slate-300 md:inline">
            Celebrating {totalEmployees} Outstanding Team Member{totalEmployees === 1 ? "" : "s"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3.5 py-1 font-mono text-xs font-bold text-white backdrop-blur-md">
            <Sparkles className="size-3.5 text-amber-300" />
            {awardPeriodLabel}
          </span>
          {totalPages > 1 && (
            <span className="rounded-full border border-amber-300/35 bg-amber-400/15 px-3 py-1 font-mono text-xs font-bold text-amber-200">
              Page {page} / {totalPages}
            </span>
          )}
        </div>
      </div>

      {/* 5x2 (Up to 10 per slide) Employee Grid */}
      <div
        className={`relative z-10 my-4 grid min-h-0 flex-1 content-center gap-3 md:gap-4 ${gridColsClass}`}
      >
        {employees.map((emp) => {
          const avatarUri = generateEmployeeAvatarDataUri({
            name: emp.employeeName,
            seed: emp.avatarSeed || `${emp.employeeName}-${emp.departmentName}`,
            style: emp.avatarStyle ?? "illustrated",
          });
          return (
            <div
              key={emp.id}
              className="flex flex-col items-center justify-center rounded-2xl border border-white/15 bg-white/[0.07] p-3 text-center shadow-lg backdrop-blur-md md:p-4"
            >
              <div className="relative mb-2.5 size-16 shrink-0 overflow-hidden rounded-full border-2 border-amber-300/85 bg-[#0c1a3a] shadow-md md:size-20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={avatarUri}
                  alt={emp.employeeName}
                  className="h-full w-full object-cover"
                />
              </div>
              <p className="w-full truncate text-sm font-extrabold tracking-tight text-white md:text-base">
                {emp.employeeName}
              </p>
              <p className="mt-1 inline-flex max-w-full items-center justify-center gap-1 truncate rounded-full bg-sky-400/15 px-2.5 py-0.5 text-[11px] font-semibold text-sky-200">
                <Building2 className="size-3 shrink-0" />
                <span className="truncate">{emp.departmentName}</span>
              </p>
              <p className="mt-1 inline-flex max-w-full items-center justify-center gap-1 truncate text-[11px] font-medium text-amber-200/90">
                <MapPin className="size-3 shrink-0 text-amber-300" />
                <span className="truncate">{emp.locationName}</span>
              </p>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="relative z-10 flex shrink-0 items-center justify-between border-t border-white/15 pt-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-white px-2.5 py-1 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={CROWN_OFFICIAL_LOGO_URL}
              alt="Crown Paints"
              className="h-6 w-auto object-contain"
            />
          </div>
          <span className="text-xs font-semibold text-slate-300">
            Congratulations to Our Top Performers — People Excellence
          </span>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalPages }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i + 1 === page ? "w-6 bg-amber-400" : "w-1.5 bg-white/25"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
