"use client";

/**
 * @file src/components/player/sales-analytics-slide.tsx
 * @description Executive Recharts Sales Analytics slide rendered on `/player`: displays
 * 4 KPI cards, a Showroom Revenue vs. Target `BarChart`, and a Product Mix `PieChart` donut.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp, Award, Sparkles } from "lucide-react";
import type { QuickPostSlideConfig } from "@/db/schema";

interface SalesAnalyticsSlideProps {
  config: QuickPostSlideConfig;
  departmentName?: string;
  branchName?: string;
  countryCode?: string;
  compact?: boolean;
}

const DEFAULT_CHART_DATA = [
  { label: "Nairobi HQ", value: 14.2, target: 13.0 },
  { label: "Westlands", value: 11.8, target: 10.5 },
  { label: "Mombasa", value: 8.6, target: 8.2 },
  { label: "Kisumu", value: 5.4, target: 5.8 },
  { label: "Dar es Salaam", value: 7.9, target: 7.5 },
  { label: "Kampala", value: 6.7, target: 6.5 },
];

const DEFAULT_KPIS = [
  { label: "Network Sales", value: "54.6M", delta: "+18.4% YoY" },
  { label: "Target Attainment", value: "105.8%", delta: "Above Plan" },
  { label: "Top Showroom", value: "Westlands", delta: "112% Quota" },
  { label: "Top Finish", value: "Weatherguard", delta: "38% Volume" },
];

const DEFAULT_CATEGORY_MIX = [
  { name: "Weatherguard Ext.", value: 38, color: "#f59e0b" },
  { name: "Crown Silk Vinyl", value: 29, color: "#38bdf8" },
  { name: "Permacote Emulsion", value: 21, color: "#34d399" },
  { name: "Industrial Epoxies", value: 12, color: "#a78bfa" },
];

export function SalesAnalyticsSlide({
  config,
  departmentName,
  branchName,
  countryCode,
  compact = false,
}: SalesAnalyticsSlideProps) {
  const chartData =
    config.chartData && config.chartData.length > 0
      ? config.chartData
      : DEFAULT_CHART_DATA;
  const kpis =
    config.kpis && config.kpis.length > 0 ? config.kpis : DEFAULT_KPIS;
  const categoryMix =
    config.categoryMix && config.categoryMix.length > 0
      ? config.categoryMix
      : DEFAULT_CATEGORY_MIX;

  const isLight = config.backgroundTheme === "light";

  return (
    <div
      className={`relative flex h-full w-full flex-col justify-between overflow-hidden ${
        isLight
          ? "bg-gradient-to-br from-stone-50 via-white to-amber-50/70 text-slate-900"
          : "bg-gradient-to-br from-slate-950 via-[#0a1328] to-slate-950 text-white"
      } ${compact ? "rounded-xl p-4" : "p-10 md:p-14"}`}
    >
      {/* Ambient architectural glow */}
      <div className="pointer-events-none absolute -left-32 -top-32 size-96 rounded-full bg-amber-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 size-96 rounded-full bg-sky-500/10 blur-3xl" />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border font-bold uppercase tracking-wider ${
              isLight
                ? "border-amber-600/30 bg-amber-500/15 text-amber-800"
                : "border-amber-400/30 bg-amber-500/15 text-amber-300"
            } ${compact ? "px-2.5 py-0.5 text-[10px]" : "px-4 py-1.5 text-xs"}`}
          >
            <TrendingUp className={compact ? "size-3" : "size-4"} />
            {config.badgeText || "COMMERCIAL ANALYTICS"}
          </span>
          {countryCode && (
            <span
              className={`rounded-full border font-mono uppercase ${
                isLight
                  ? "border-slate-900/15 bg-slate-900/5 text-slate-700"
                  : "border-white/15 bg-white/5 text-slate-300"
              } ${compact ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs"}`}
            >
              {countryCode}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-right">
          <span className="inline-block size-2 rounded-full bg-emerald-500 animate-pulse" />
          <span
            className={`font-medium ${isLight ? "text-slate-600" : "text-slate-300"} ${
              compact ? "text-[10px]" : "text-sm"
            }`}
          >
            Live Data Feed • Crown Paints
          </span>
        </div>
      </div>

      {/* Headline */}
      <div className="relative z-10 mt-2">
        <h1
          className={`font-black tracking-tight ${
            compact ? "text-lg" : "text-3xl md:text-4xl"
          }`}
        >
          {config.headline}
        </h1>
        {config.subheadline && (
          <p
            className={`${isLight ? "text-slate-600" : "text-slate-300"} ${
              compact ? "text-xs" : "mt-1 text-base md:text-lg"
            }`}
          >
            {config.subheadline}
          </p>
        )}
      </div>

      {/* KPI Strip */}
      <div
        className={`relative z-10 grid grid-cols-4 ${
          compact ? "my-2 gap-2" : "my-4 gap-4"
        }`}
      >
        {kpis.slice(0, 4).map((kpi) => (
          <div
            key={kpi.label}
            className={`rounded-2xl border backdrop-blur-md ${
              isLight
                ? "border-slate-900/10 bg-white/90 shadow-sm"
                : "border-white/10 bg-white/[0.04]"
            } ${compact ? "p-2" : "p-4"}`}
          >
            <p
              className={`font-medium ${isLight ? "text-slate-500" : "text-slate-400"} ${
                compact ? "text-[9px]" : "text-xs uppercase tracking-wider"
              }`}
            >
              {kpi.label}
            </p>
            <p
              className={`font-black tabular-nums tracking-tight ${
                isLight ? "text-slate-900" : "text-white"
              } ${compact ? "mt-0.5 text-sm" : "mt-1 text-2xl md:text-3xl"}`}
            >
              {kpi.value}
            </p>
            {kpi.delta && (
              <span
                className={`inline-block font-semibold ${
                  isLight ? "text-emerald-700" : "text-emerald-400"
                } ${compact ? "text-[9px]" : "mt-1 text-xs"}`}
              >
                {kpi.delta}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div
        className={`relative z-10 grid flex-1 min-h-0 grid-cols-12 ${
          compact ? "gap-2" : "gap-5"
        }`}
      >
        {/* BarChart: Regional Revenue vs Target */}
        <div
          className={`col-span-8 flex flex-col rounded-2xl border backdrop-blur-md ${
            isLight
              ? "border-slate-900/10 bg-white/90 shadow-sm"
              : "border-white/10 bg-white/[0.03]"
          } ${compact ? "p-2.5" : "p-5"}`}
        >
          <div className="mb-2 flex items-center justify-between">
            <span
              className={`font-bold ${isLight ? "text-slate-800" : "text-slate-200"} ${
                compact ? "text-[11px]" : "text-base"
              }`}
            >
              Showroom Revenue vs Target (M)
            </span>
            <div
              className={`flex items-center gap-3 ${
                isLight ? "text-slate-600" : "text-slate-400"
              } ${compact ? "text-[9px]" : "text-xs"}`}
            >
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-sm bg-amber-400" />
                Actual
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className={`inline-block size-2.5 rounded-sm ${
                    isLight ? "bg-slate-400" : "bg-slate-600"
                  }`}
                />
                Target
              </span>
            </div>
          </div>
          <div className="flex-1 min-h-[120px] min-w-0 w-full">
            <ResponsiveContainer
              width="100%"
              height="100%"
              minWidth={0}
              minHeight={120}
              initialDimension={{ width: 560, height: 240 }}
            >
              <BarChart
                data={chartData}
                margin={{ top: 6, right: 8, left: -18, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={isLight ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.08)"}
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  stroke={isLight ? "#64748b" : "#94a3b8"}
                  fontSize={compact ? 9 : 12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke={isLight ? "#64748b" : "#94a3b8"}
                  fontSize={compact ? 9 : 12}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isLight ? "#ffffff" : "#0f172a",
                    borderColor: isLight ? "rgba(15,23,42,0.15)" : "rgba(255,255,255,0.15)",
                    borderRadius: "10px",
                    color: isLight ? "#0f172a" : "#f8fafc",
                    fontSize: "12px",
                  }}
                />
                <Bar
                  dataKey="target"
                  name="Target"
                  fill={isLight ? "#cbd5e1" : "#475569"}
                  radius={[6, 6, 0, 0]}
                  isAnimationActive={!compact}
                />
                <Bar
                  dataKey="value"
                  name="Actual"
                  fill="#f59e0b"
                  radius={[6, 6, 0, 0]}
                  isAnimationActive={!compact}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* PieChart Donut: Product Category Mix */}
        <div
          className={`col-span-4 flex flex-col justify-between rounded-2xl border backdrop-blur-md ${
            isLight
              ? "border-slate-900/10 bg-white/90 shadow-sm"
              : "border-white/10 bg-white/[0.03]"
          } ${compact ? "p-2.5" : "p-5"}`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`font-bold ${isLight ? "text-slate-800" : "text-slate-200"} ${
                compact ? "text-[11px]" : "text-base"
              }`}
            >
              Product Mix
            </span>
            <Award
              className={`${compact ? "size-3.5" : "size-4"} ${
                isLight ? "text-amber-600" : "text-amber-400"
              }`}
            />
          </div>

          <div className="flex-1 min-h-[100px] min-w-0 w-full">
            <ResponsiveContainer
              width="100%"
              height="100%"
              minWidth={0}
              minHeight={100}
              initialDimension={{ width: 260, height: 180 }}
            >
              <PieChart>
                <Pie
                  data={categoryMix}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={compact ? "48%" : "54%"}
                  outerRadius={compact ? "78%" : "82%"}
                  paddingAngle={3}
                  stroke="none"
                  isAnimationActive={!compact}
                >
                  {categoryMix.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: isLight ? "#ffffff" : "#0f172a",
                    borderColor: isLight ? "rgba(15,23,42,0.15)" : "rgba(255,255,255,0.15)",
                    borderRadius: "10px",
                    color: isLight ? "#0f172a" : "#f8fafc",
                    fontSize: "12px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className={compact ? "space-y-0.5" : "space-y-1.5"}>
            {categoryMix.map((cat) => (
              <div
                key={cat.name}
                className={`flex items-center justify-between ${
                  compact ? "text-[9px]" : "text-xs"
                }`}
              >
                <span
                  className={`flex items-center gap-1.5 truncate ${
                    isLight ? "text-slate-600" : "text-slate-300"
                  }`}
                >
                  <span
                    className="inline-block size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span className="truncate">{cat.name}</span>
                </span>
                <span
                  className={`font-bold tabular-nums ${
                    isLight ? "text-slate-900" : "text-white"
                  }`}
                >
                  {cat.value}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        className={`relative z-10 mt-2 flex items-center justify-between border-t pt-2 ${
          isLight
            ? "border-slate-900/10 text-slate-500"
            : "border-white/10 text-slate-400"
        } ${compact ? "text-[9px]" : "text-xs"}`}
      >
        <span className="flex items-center gap-1.5">
          <Sparkles className={`size-3 ${isLight ? "text-amber-600" : "text-amber-400"}`} />
          {branchName || "Crown Paints Commercial Network"}
        </span>
        <span>{departmentName || "Sales & Showrooms"}</span>
      </div>
    </div>
  );
}
