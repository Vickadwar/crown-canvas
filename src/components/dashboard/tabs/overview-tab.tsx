"use client";

/**
 * @file src/components/dashboard/tabs/overview-tab.tsx
 * @description Universal white-label Executive Overview dashboard with coloured semantic
 * KPI cards, live Fleet Health Donut chart, Top Locations Bar chart, Media Storage meter,
 * Governance Queue summary, and Quick Actions (zero internal vendor/infra jargon).
 */

import { useMemo } from "react";
import {
  Activity,
  Building2,
  Film,
  HardDrive,
  Monitor,
  QrCode,
  Radio,
  Shield,
  Sparkles,
  Store,
  Tv,
  Upload,
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { NavTab, OverviewPayload } from "../cms-types";

interface OverviewTabProps {
  data: OverviewPayload;
  onNavigate: (tab: NavTab) => void;
}

export function OverviewTab({ data, onNavigate }: OverviewTabProps) {
  const fleetBreakdown = useMemo(() => {
    let online = 0;
    let degraded = 0;
    let offline = 0;
    let paused = 0;
    for (const s of data.screens) {
      if (s.isActive === false) {
        paused++;
      } else if (s.healthStatus === "online" || s.isOnline) {
        online++;
      } else if (s.healthStatus === "degraded") {
        degraded++;
      } else {
        offline++;
      }
    }
    return { online, degraded, offline, paused };
  }, [data.screens]);

  const fleetDonutData = useMemo(() => {
    const slices = [
      { name: "Online", value: fleetBreakdown.online, color: "#10b981" },
      { name: "Degraded", value: fleetBreakdown.degraded, color: "#f59e0b" },
      { name: "Offline", value: fleetBreakdown.offline, color: "#f43f5e" },
      { name: "Paused", value: fleetBreakdown.paused, color: "#94a3b8" },
    ].filter((s) => s.value > 0);
    return slices.length > 0
      ? slices
      : [{ name: "No Screens Paired", value: 1, color: "#e4e4e7" }];
  }, [fleetBreakdown]);

  const locationChartData = useMemo(() => {
    const playsByBranch = new Map<string, number>();
    for (const p of data.telemetry.recentPlays) {
      playsByBranch.set(p.branchId, (playsByBranch.get(p.branchId) ?? 0) + 1);
    }
    return data.branches
      .map((b) => ({
        name: b.name.length > 16 ? `${b.name.slice(0, 15)}…` : b.name,
        Screens: data.screens.filter((s) => s.branchId === b.id).length,
        Plays: playsByBranch.get(b.id) ?? 0,
      }))
      .sort((a, b) => b.Screens - a.Screens || b.Plays - a.Plays)
      .slice(0, 8);
  }, [data.branches, data.screens, data.telemetry.recentPlays]);

  const activeOverrides = useMemo(
    () =>
      data.overrides.filter(
        (o) =>
          o.isActive && (!o.expiresAt || new Date(o.expiresAt) > new Date())
      ),
    [data.overrides]
  );

  const uptimePct =
    data.screens.length > 0
      ? Math.round((fleetBreakdown.online / data.screens.length) * 100)
      : 100;

  const usedMb = (data.storageStats?.totalBytesUsed ?? 0) / (1024 * 1024);
  const quotaMb = Math.max(
    1,
    Math.round((data.storageStats?.quotaBytes ?? 1073741824) / (1024 * 1024))
  );
  const storagePct = Math.min(100, (usedMb / quotaMb) * 100);

  return (
    <div className="space-y-6">
      {/* Live Emergency Broadcast Banner (only if active) */}
      {activeOverrides.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-rose-900">
          <div className="flex items-center gap-2.5">
            <span className="size-2.5 animate-pulse rounded-full bg-rose-600" />
            <Badge variant="danger">LIVE BROADCAST</Badge>
            <span className="text-sm font-semibold">
              {activeOverrides[0].title}
            </span>
            {activeOverrides.length > 1 && (
              <span className="text-xs text-rose-700">
                +{activeOverrides.length - 1} more active
              </span>
            )}
          </div>
          <Button
            size="xs"
            variant="destructive"
            onClick={() => onNavigate("broadcasts")}
          >
            Manage Broadcasts
          </Button>
        </div>
      )}

      {/* Primary KPI Strip with Coloured Icon Accents */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Connected Displays</CardDescription>
              <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <Tv className="size-4" />
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <CardTitle className="text-3xl font-bold tracking-tight">
                {data.screens.length}
              </CardTitle>
              <Badge variant={uptimePct >= 80 ? "success" : "warning"}>
                {uptimePct}% online
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="flex items-center justify-between text-xs text-zinc-500">
            <span>
              {fleetBreakdown.online} live • {data.pendingPairings.length} awaiting pair
            </span>
            <button
              type="button"
              onClick={() => onNavigate("fleet")}
              className="font-medium text-zinc-900 hover:underline"
            >
              View Fleet →
            </button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Locations &amp; Departments</CardDescription>
              <span className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <Store className="size-4" />
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <CardTitle className="text-3xl font-bold tracking-tight">
                {data.branches.length}
              </CardTitle>
              <Badge variant="info">{data.departments.length} Depts</Badge>
            </div>
          </CardHeader>
          <CardContent className="flex items-center justify-between text-xs text-zinc-500">
            <span>
              {data.branches.filter((b) => b.isActive !== false).length} active sites
            </span>
            <button
              type="button"
              onClick={() => onNavigate("showrooms")}
              className="font-medium text-zinc-900 hover:underline"
            >
              Manage →
            </button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Content &amp; Playlists</CardDescription>
              <span className="flex size-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                <Film className="size-4" />
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <CardTitle className="text-3xl font-bold tracking-tight">
                {data.mediaAssets.length + data.quickPosts.length}
              </CardTitle>
              <Badge variant="purple">{data.playlists.length} Playlists</Badge>
            </div>
          </CardHeader>
          <CardContent className="flex items-center justify-between text-xs text-zinc-500">
            <span>
              {data.mediaAssets.length} media • {data.quickPosts.length} studio slides
            </span>
            <button
              type="button"
              onClick={() => onNavigate("media")}
              className="font-medium text-zinc-900 hover:underline"
            >
              Library →
            </button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Playback &amp; Engagement</CardDescription>
              <span className="flex size-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <Activity className="size-4" />
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <CardTitle className="text-3xl font-bold tracking-tight">
                {data.telemetry.totalImpressions.toLocaleString()}
              </CardTitle>
              <Badge variant="warning">
                <QrCode className="size-3" />
                {data.telemetry.totalQrScans} scans
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="flex items-center justify-between text-xs text-zinc-500">
            <span>Verified proof-of-play impressions</span>
            <button
              type="button"
              onClick={() => onNavigate("analytics")}
              className="font-medium text-zinc-900 hover:underline"
            >
              Analytics →
            </button>
          </CardContent>
        </Card>
      </div>

      {/* Executive Analytics Charts Row */}
      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle>Display Distribution by Location</CardTitle>
              <CardDescription>
                Active paired screens &amp; recent play activity across top locations
              </CardDescription>
            </div>
            <Badge variant="info">Live Network</Badge>
          </CardHeader>
          <CardContent className="h-72 min-w-0">
            <ResponsiveContainer
              width="100%"
              height={264}
              minWidth={0}
              initialDimension={{ width: 520, height: 264 }}
            >
              <BarChart data={locationChartData} margin={{ top: 10, right: 12, left: -10, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
                <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 10,
                    border: "1px solid #e4e4e7",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="Screens" fill="#09090b" radius={[5, 5, 0, 0]} />
                <Bar dataKey="Plays" fill="#2563eb" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle>Fleet Health Status</CardTitle>
              <CardDescription>Real-time connectivity across all screens</CardDescription>
            </div>
            <Badge variant="success">{fleetBreakdown.online} Online</Badge>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <div className="h-48 w-full min-w-0">
              <ResponsiveContainer
                width="100%"
                height={188}
                minWidth={0}
                initialDimension={{ width: 320, height: 188 }}
              >
                <PieChart>
                  <Pie
                    data={fleetDonutData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={80}
                    paddingAngle={3}
                  >
                    {fleetDonutData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 text-xs">
              <div className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50/70 px-3 py-1.5">
                <span className="flex items-center gap-1.5 font-medium text-zinc-700">
                  <span className="size-2 rounded-full bg-emerald-500" />
                  Online
                </span>
                <span className="font-mono font-semibold">{fleetBreakdown.online}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50/70 px-3 py-1.5">
                <span className="flex items-center gap-1.5 font-medium text-zinc-700">
                  <span className="size-2 rounded-full bg-amber-500" />
                  Degraded
                </span>
                <span className="font-mono font-semibold">{fleetBreakdown.degraded}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50/70 px-3 py-1.5">
                <span className="flex items-center gap-1.5 font-medium text-zinc-700">
                  <span className="size-2 rounded-full bg-rose-500" />
                  Offline
                </span>
                <span className="font-mono font-semibold">{fleetBreakdown.offline}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50/70 px-3 py-1.5">
                <span className="flex items-center gap-1.5 font-medium text-zinc-700">
                  <span className="size-2 rounded-full bg-zinc-400" />
                  Paused
                </span>
                <span className="font-mono font-semibold">{fleetBreakdown.paused}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Operational Health & Quick Actions Strip */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>Media Storage Capacity</span>
              <HardDrive className="size-4 text-zinc-400" />
            </CardDescription>
            <CardTitle className="text-xl font-semibold tracking-tight">
              {usedMb.toFixed(1)} MB
              <span className="ml-1.5 text-xs font-normal text-zinc-500">
                / {quotaMb} MB
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-zinc-500">
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
              <div
                className={`h-full rounded-full transition-all ${
                  storagePct > 85
                    ? "bg-rose-500"
                    : storagePct > 65
                      ? "bg-amber-500"
                      : "bg-blue-600"
                }`}
                style={{ width: `${storagePct}%` }}
              />
            </div>
            <p>
              {data.storageStats?.uploadedCount ?? 0} stored files •{" "}
              {data.storageStats?.zeroDiskCount ?? 0} zero-disk embeds &amp; slides
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>Content Approval Queue</span>
              <Shield className="size-4 text-blue-500" />
            </CardDescription>
            <div className="flex items-center gap-2">
              <CardTitle className="text-xl font-semibold tracking-tight">
                {data.pendingApprovalsCount ?? 0} Pending
              </CardTitle>
              {(data.pendingApprovalsCount ?? 0) > 0 ? (
                <Badge variant="warning">Action Needed</Badge>
              ) : (
                <Badge variant="success">All Clear</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex items-center justify-between text-xs text-zinc-500">
            <span>Review &amp; publish submitted assets</span>
            <Button
              size="xs"
              variant="outline"
              onClick={() => onNavigate("analytics")}
            >
              Open Queue
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between">
              <span>Quick Operations</span>
              <Sparkles className="size-4 text-violet-500" />
            </CardDescription>
            <CardTitle className="text-base font-semibold">
              Common Workflows
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            <Button
              size="xs"
              variant="outline"
              className="justify-start"
              onClick={() => onNavigate("fleet")}
            >
              <Monitor className="size-3.5 text-emerald-600" />
              Pair Screen
            </Button>
            <Button
              size="xs"
              variant="outline"
              className="justify-start"
              onClick={() => onNavigate("media")}
            >
              <Upload className="size-3.5 text-blue-600" />
              Upload Media
            </Button>
            <Button
              size="xs"
              variant="outline"
              className="justify-start"
              onClick={() => onNavigate("studio")}
            >
              <Sparkles className="size-3.5 text-violet-600" />
              Design Slide
            </Button>
            <Button
              size="xs"
              variant="outline"
              className="justify-start"
              onClick={() => onNavigate("broadcasts")}
            >
              <Radio className="size-3.5 text-rose-600" />
              Broadcast
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Department Activity Summary */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle>Active Departments</CardTitle>
            <CardDescription>
              Content ownership and active screen assignment across departments
            </CardDescription>
          </div>
          <Button
            size="xs"
            variant="outline"
            onClick={() => onNavigate("departments")}
          >
            <Building2 className="size-3.5" />
            Manage Departments
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.departments.slice(0, 8).map((dept) => {
            const mediaCount = data.mediaAssets.filter(
              (m) => m.departmentId === dept.id
            ).length;
            const plCount = data.playlists.filter(
              (p) => p.departmentId === dept.id
            ).length;
            const scrCount = data.screens.filter(
              (s) => s.departmentId === dept.id
            ).length;
            return (
              <div
                key={dept.id}
                className="flex items-center justify-between rounded-xl border border-zinc-200/80 bg-zinc-50/40 px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: dept.accentColor }}
                    />
                    <p className="truncate text-xs font-semibold text-zinc-900">
                      {dept.name}
                    </p>
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {scrCount} TVs • {plCount} playlists • {mediaCount} media
                  </p>
                </div>
                <Badge variant="outline" className="ml-2 font-mono text-[10px]">
                  {dept.code}
                </Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
