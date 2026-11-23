"use client";

/**
 * @file src/components/dashboard/tabs/analytics-tab.tsx
 * @description Executive Signage Analytics dashboard with Recharts Area/Bar/Donut charts
 * (Playback Activity Trend, Department Share Donut, Top Locations Bar Chart, Content Mix),
 * Content Governance Approval Queue, White-Label Printable SLA Report, CSV Export, and Audit Trail.
 */

import { useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileBarChart2,
  Printer,
  QrCode,
  Search,
  Shield,
  Trash2,
  Tv,
} from "lucide-react";
import {
  Area,
  AreaChart,
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
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ModernSelect } from "@/components/ui/select";
import type { ExecutiveReportPayload, OverviewPayload } from "../cms-types";

interface AnalyticsTabProps {
  data: OverviewPayload;
  onRefresh: () => Promise<void>;
}

const CHART_PALETTE = [
  "#2563eb",
  "#10b981",
  "#f59e0b",
  "#7c3aed",
  "#e11d48",
  "#0891b2",
  "#ea580c",
  "#09090b",
];

export function AnalyticsTab({ data, onRefresh }: AnalyticsTabProps) {
  const [executiveReport, setExecutiveReport] =
    useState<ExecutiveReportPayload | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  // Paginated Audit Log state
  const [auditSearch, setAuditSearch] = useState("");
  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState(10);

  const filteredAuditLogs = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    if (!q) return data.auditLogs;
    return data.auditLogs.filter(
      (log) =>
        log.action.toLowerCase().includes(q) ||
        log.entityType.toLowerCase().includes(q) ||
        (log.metadata && JSON.stringify(log.metadata).toLowerCase().includes(q))
    );
  }, [data.auditLogs, auditSearch]);

  const auditTotalPages = Math.max(
    1,
    Math.ceil(filteredAuditLogs.length / auditPageSize)
  );
  const safeAuditPage = Math.min(auditPage, auditTotalPages);
  const pagedAuditLogs = useMemo(() => {
    const start = (safeAuditPage - 1) * auditPageSize;
    return filteredAuditLogs.slice(start, start + auditPageSize);
  }, [filteredAuditLogs, safeAuditPage, auditPageSize]);

  const branchById = useMemo(
    () => new Map(data.branches.map((b) => [b.id, b])),
    [data.branches]
  );
  const deptById = useMemo(
    () => new Map(data.departments.map((d) => [d.id, d])),
    [data.departments]
  );

  // 1. Daily Playback Activity Trend (Area Chart)
  const playTrendData = useMemo(() => {
    const byDay = new Map<string, { plays: number; minutes: number }>();
    for (const p of data.telemetry.recentPlays) {
      const day = p.startedAt.slice(0, 10);
      const curr = byDay.get(day) ?? { plays: 0, minutes: 0 };
      curr.plays += 1;
      curr.minutes += Math.round((p.durationPlayedSeconds || 15) / 60);
      byDay.set(day, curr);
    }
    const rows = Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([date, stats]) => ({
        date: date.slice(5),
        Impressions: stats.plays,
        Minutes: stats.minutes,
      }));
    return rows.length > 0
      ? rows
      : [{ date: "Today", Impressions: data.telemetry.totalImpressions, Minutes: 0 }];
  }, [data.telemetry]);

  // 2. Content Format Mix (Donut Chart)
  const contentMixData = useMemo(() => {
    const videos = data.mediaAssets.filter((m) => m.mediaType === "video").length;
    const images = data.mediaAssets.filter((m) => m.mediaType === "image").length;
    const embeds = data.mediaAssets.filter(
      (m) => m.mediaType === "web_url" || m.mediaType === "pdf"
    ).length;
    const slides = data.quickPosts.length;
    const slices = [
      { name: "Videos", value: videos, color: "#2563eb" },
      { name: "Images", value: images, color: "#10b981" },
      { name: "Studio Slides", value: slides, color: "#7c3aed" },
      { name: "Web / PDF", value: embeds, color: "#f59e0b" },
    ].filter((s) => s.value > 0);
    return slices.length > 0
      ? slices
      : [{ name: "No Content", value: 1, color: "#e4e4e7" }];
  }, [data.mediaAssets, data.quickPosts]);

  // 3. Top Performing Locations (Bar Chart)
  const branchImpressionsData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of data.telemetry.recentPlays) {
      counts.set(p.branchId, (counts.get(p.branchId) ?? 0) + 1);
    }
    const rows = data.branches
      .map((b) => ({
        name: b.name.length > 16 ? `${b.name.slice(0, 15)}…` : b.name,
        Plays: counts.get(b.id) ?? 0,
        Displays: data.screens.filter((s) => s.branchId === b.id).length,
      }))
      .sort((a, b) => b.Plays - a.Plays || b.Displays - a.Displays)
      .slice(0, 8);
    return rows;
  }, [data.branches, data.screens, data.telemetry.recentPlays]);

  // 4. Department Content & Play Share (Donut Chart)
  const departmentMixData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of data.telemetry.recentPlays) {
      if (p.departmentId) {
        counts.set(p.departmentId, (counts.get(p.departmentId) ?? 0) + 1);
      }
    }
    const rows = data.departments
      .map((d, idx) => ({
        name: d.code,
        fullName: d.name,
        value:
          counts.get(d.id) ??
          data.mediaAssets.filter((m) => m.departmentId === d.id).length +
            data.quickPosts.filter((q) => q.departmentId === d.id).length,
        color: d.accentColor || CHART_PALETTE[idx % CHART_PALETTE.length],
      }))
      .filter((r) => r.value > 0)
      .slice(0, 8);
    return rows.length > 0
      ? rows
      : [{ name: "GEN", fullName: "General", value: 1, color: "#94a3b8" }];
  }, [data.departments, data.mediaAssets, data.quickPosts, data.telemetry.recentPlays]);

  const totalPlayMinutes = useMemo(
    () =>
      Math.round(
        data.telemetry.recentPlays.reduce(
          (sum, p) => sum + (p.durationPlayedSeconds || 0),
          0
        ) / 60
      ),
    [data.telemetry.recentPlays]
  );

  const onlineScreens = data.screens.filter(
    (s) => s.isActive !== false && (s.healthStatus === "online" || s.isOnline)
  ).length;
  const uptimePct =
    data.screens.length > 0
      ? Math.round((onlineScreens / data.screens.length) * 100)
      : 100;

  const pendingMedia = data.mediaAssets.filter(
    (m) => m.approvalStatus === "pending_approval"
  );
  const pendingSlides = data.quickPosts.filter(
    (q) => q.approvalStatus === "pending_approval"
  );

  async function handleApprovalDecision(
    entityKind: "media_asset" | "quick_post",
    entityId: string,
    decision: "approved" | "rejected"
  ) {
    const res = await fetch("/api/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityKind, entityId, decision }),
    });
    const j = await res.json();
    if (!res.ok) {
      toast.error(j.error || "Approval action failed");
      return;
    }
    toast.success(
      decision === "approved"
        ? "Approved & pushed live to paired screens"
        : "Submission rejected"
    );
    await onRefresh();
  }

  async function handleGenerateReport() {
    setLoadingReport(true);
    try {
      const res = await fetch("/api/reports/executive");
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error || "Could not load executive report");
        return;
      }
      setExecutiveReport(j as ExecutiveReportPayload);
    } finally {
      setLoadingReport(false);
    }
  }

  async function handlePruneLogs() {
    const res = await fetch("/api/reports/executive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "prune_telemetry", retentionDays: 90 }),
    });
    const j = await res.json();
    if (!res.ok) {
      toast.error(j.error || "Log pruning failed");
      return;
    }
    toast.success(`Pruned ${j.deletedRows ?? 0} telemetry records older than 90 days`);
    await onRefresh();
  }

  function handleExportCsv() {
    const headers = [
      "Play ID",
      "Location",
      "Department",
      "Duration (sec)",
      "Started At",
    ];
    const rows = data.telemetry.recentPlays.map((p) => [
      p.id,
      branchById.get(p.branchId)?.name ?? p.branchId,
      (p.departmentId ? deptById.get(p.departmentId)?.name : null) ?? "General",
      String(p.durationPlayedSeconds),
      p.startedAt,
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `signage-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div>
          <h2 className="text-sm font-semibold text-zinc-950">
            Playback Analytics, Engagement &amp; Governance
          </h2>
          <p className="text-xs text-zinc-500">
            Verified proof-of-play impressions, QR conversions, fleet uptime, and audit history.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={loadingReport}
            onClick={() => void handleGenerateReport()}
          >
            <FileBarChart2 className="size-3.5" />
            {loadingReport ? "Loading..." : "Executive SLA Report"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleExportCsv}>
            <Download className="size-3.5" />
            Export CSV
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void handlePruneLogs()}
          >
            <Trash2 className="size-3.5 text-zinc-500" />
            Prune &gt;90d
          </Button>
        </div>
      </div>

      {/* 4 Coloured Analytics KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Total Impressions</CardDescription>
              <span className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <Activity className="size-4" />
              </span>
            </div>
            <CardTitle className="text-3xl font-bold">
              {data.telemetry.totalImpressions.toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-zinc-500">
            Verified playback completions logged
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>QR Code Scans</CardDescription>
              <span className="flex size-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <QrCode className="size-4" />
              </span>
            </div>
            <CardTitle className="text-3xl font-bold">
              {data.telemetry.totalQrScans.toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-zinc-500">
            Tracked showroom mobile conversions
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Fleet Uptime SLA</CardDescription>
              <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <Tv className="size-4" />
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <CardTitle className="text-3xl font-bold">{uptimePct}%</CardTitle>
              <Badge variant={uptimePct >= 85 ? "success" : "warning"}>
                {onlineScreens}/{data.screens.length} Live
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="text-xs text-zinc-500">
            Live connected screens right now
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Recent Airtime Logged</CardDescription>
              <span className="flex size-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                <Clock className="size-4" />
              </span>
            </div>
            <CardTitle className="text-3xl font-bold">
              {totalPlayMinutes.toLocaleString()} <span className="text-base font-normal text-zinc-500">min</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-zinc-500">
            From latest {data.telemetry.recentPlays.length} verified plays
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 1: Activity Trend Area Chart + Content Mix Donut */}
      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle>Playback Activity Trend</CardTitle>
              <CardDescription>
                Daily verified impressions across the signage network
              </CardDescription>
            </div>
            <Badge variant="info">Proof-of-Play</Badge>
          </CardHeader>
          <CardContent className="h-72 min-w-0">
            <ResponsiveContainer
              width="100%"
              height={264}
              minWidth={0}
              initialDimension={{ width: 580, height: 264 }}
            >
              <AreaChart
                data={playTrendData}
                margin={{ top: 10, right: 16, left: -10, bottom: 4 }}
              >
                <defs>
                  <linearGradient id="impFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
                <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 10,
                    border: "1px solid #e4e4e7",
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="Impressions"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  fill="url(#impFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader className="pb-2">
            <CardTitle>Content Format Mix</CardTitle>
            <CardDescription>Active media &amp; studio breakdown</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <div className="h-48 w-full min-w-0">
              <ResponsiveContainer
                width="100%"
                height={184}
                minWidth={0}
                initialDimension={{ width: 280, height: 184 }}
              >
                <PieChart>
                  <Pie
                    data={contentMixData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={76}
                    paddingAngle={3}
                  >
                    {contentMixData.map((s) => (
                      <Cell key={s.name} fill={s.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid w-full grid-cols-2 gap-1.5 text-xs">
              {contentMixData.map((s) => (
                <div
                  key={s.name}
                  className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50/70 px-2.5 py-1.5"
                >
                  <span className="flex items-center gap-1.5 truncate text-zinc-700">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                    {s.name}
                  </span>
                  <span className="font-mono font-semibold">{s.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2: Top Locations Bar Chart + Department Mix Donut */}
      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader className="pb-2">
            <CardTitle>Top Performing Locations</CardTitle>
            <CardDescription>
              Recent impressions and paired display count by site
            </CardDescription>
          </CardHeader>
          <CardContent className="h-72 min-w-0">
            <ResponsiveContainer
              width="100%"
              height={264}
              minWidth={0}
              initialDimension={{ width: 500, height: 264 }}
            >
              <BarChart
                data={branchImpressionsData}
                margin={{ top: 10, right: 12, left: -10, bottom: 4 }}
              >
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
                <Bar dataKey="Plays" fill="#10b981" radius={[5, 5, 0, 0]} />
                <Bar dataKey="Displays" fill="#09090b" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader className="pb-2">
            <CardTitle>Department Activity Share</CardTitle>
            <CardDescription>
              Content &amp; playback distribution across departments
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <div className="h-48 w-full min-w-0">
              <ResponsiveContainer
                width="100%"
                height={184}
                minWidth={0}
                initialDimension={{ width: 300, height: 184 }}
              >
                <PieChart>
                  <Pie
                    data={departmentMixData}
                    dataKey="value"
                    nameKey="fullName"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={76}
                    paddingAngle={3}
                  >
                    {departmentMixData.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid w-full grid-cols-2 gap-1.5 text-xs">
              {departmentMixData.map((d) => (
                <div
                  key={d.name}
                  className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50/70 px-2.5 py-1"
                >
                  <span className="flex items-center gap-1.5 truncate text-zinc-700">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: d.color }}
                    />
                    {d.name}
                  </span>
                  <span className="font-mono font-semibold">{d.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Content Governance Approval Queue */}
      {(pendingMedia.length > 0 || pendingSlides.length > 0) && (
        <Card className="border-amber-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="size-4 text-amber-600" />
              Content Approval Queue
              <Badge variant="warning">
                {pendingMedia.length + pendingSlides.length} Pending
              </Badge>
            </CardTitle>
            <CardDescription>
              Maker-Checker governance: approve or reject submitted media and slides before broadcast.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingMedia.map((m) => (
              <div
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50/60 px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{m.title}</span>
                  <Badge variant="info">{m.mediaType}</Badge>
                </div>
                {data.canApprove && (
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="xs"
                      onClick={() =>
                        void handleApprovalDecision("media_asset", m.id, "approved")
                      }
                    >
                      <CheckCircle2 className="size-3" />
                      Approve &amp; Air
                    </Button>
                    <Button
                      size="xs"
                      variant="destructive"
                      onClick={() =>
                        void handleApprovalDecision("media_asset", m.id, "rejected")
                      }
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {pendingSlides.map((q) => (
              <div
                key={q.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50/60 px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{q.title}</span>
                  <Badge variant="purple">Studio Slide</Badge>
                </div>
                {data.canApprove && (
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="xs"
                      onClick={() =>
                        void handleApprovalDecision("quick_post", q.id, "approved")
                      }
                    >
                      <CheckCircle2 className="size-3" />
                      Approve &amp; Air
                    </Button>
                    <Button
                      size="xs"
                      variant="destructive"
                      onClick={() =>
                        void handleApprovalDecision("quick_post", q.id, "rejected")
                      }
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* White-Label Printable Executive SLA Report */}
      {executiveReport && (
        <Card className="border-emerald-200">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Executive Fleet SLA &amp; Playback Summary</CardTitle>
              <CardDescription>
                Generated {new Date(executiveReport.generatedAt).toLocaleString()} • Live Uptime:{" "}
                {executiveReport.fleet.fleetUptimePercent}% ({executiveReport.fleet.online}/
                {executiveReport.fleet.totalScreens} screens online)
              </CardDescription>
            </div>
            <Button
              size="xs"
              variant="outline"
              onClick={() => window.print()}
            >
              <Printer className="size-3.5" />
              Print / PDF
            </Button>
          </CardHeader>
          <CardContent className="grid gap-4 text-xs md:grid-cols-2">
            <div className="space-y-1.5 rounded-xl border border-zinc-200 p-3.5">
              <p className="font-semibold text-zinc-700">
                Top Departments by Impressions
              </p>
              {executiveReport.impressionsByDepartment.slice(0, 6).map((d) => (
                <div
                  key={d.departmentName}
                  className="flex items-center justify-between border-b border-zinc-100 py-1 last:border-0"
                >
                  <span>{d.departmentName}</span>
                  <span className="font-mono font-semibold">
                    {d.plays.toLocaleString()} plays ({d.totalMinutes} min)
                  </span>
                </div>
              ))}
            </div>
            <div className="space-y-1.5 rounded-xl border border-zinc-200 p-3.5">
              <p className="font-semibold text-zinc-700">
                Top Locations by Impressions
              </p>
              {executiveReport.impressionsByBranch.slice(0, 6).map((b) => (
                <div
                  key={b.branchId}
                  className="flex items-center justify-between border-b border-zinc-100 py-1 last:border-0"
                >
                  <span>{b.branchName}</span>
                  <span className="font-mono font-semibold">
                    {b.plays.toLocaleString()} plays ({b.totalMinutes} min)
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Paginated Audit Trail Table */}
      <Card>
        <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">
              Recent Administrative Audit Log
            </CardTitle>
            <CardDescription>
              Immutable activity trail across displays, schedules, broadcasts, accounts, and content changes ({filteredAuditLogs.length} events)
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-56">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-zinc-400" />
              <Input
                className="h-8 pl-8 text-xs"
                placeholder="Filter action, entity, details..."
                value={auditSearch}
                onChange={(e) => {
                  setAuditSearch(e.target.value);
                  setAuditPage(1);
                }}
              />
            </div>
            <div className="w-28">
              <ModernSelect
                size="sm"
                value={String(auditPageSize)}
                onValueChange={(v) => {
                  setAuditPageSize(Number(v) || 10);
                  setAuditPage(1);
                }}
                options={[
                  { value: "10", label: "10 / page" },
                  { value: "25", label: "25 / page" },
                  { value: "50", label: "50 / page" },
                ]}
              />
            </div>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-y border-zinc-200 bg-zinc-50/80 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-2">Action</th>
                <th className="px-4 py-2">Entity</th>
                <th className="px-4 py-2">Details</th>
                <th className="px-4 py-2 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {pagedAuditLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                    {auditSearch.trim()
                      ? "No audit events match your filter."
                      : "No audit events logged yet."}
                  </td>
                </tr>
              ) : (
                pagedAuditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-zinc-50/60">
                    <td className="px-4 py-2.5">
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {log.action}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 font-medium text-zinc-700">
                      {log.entityType}
                    </td>
                    <td className="max-w-md truncate px-4 py-2.5 font-mono text-[11px] text-zinc-500">
                      {log.metadata ? JSON.stringify(log.metadata) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right text-[11px] text-zinc-400">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filteredAuditLogs.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 px-4 py-3 text-xs text-zinc-500">
            <span>
              Showing{" "}
              <strong className="text-zinc-900">
                {(safeAuditPage - 1) * auditPageSize + 1}–
                {Math.min(safeAuditPage * auditPageSize, filteredAuditLogs.length)}
              </strong>{" "}
              of <strong className="text-zinc-900">{filteredAuditLogs.length}</strong>{" "}
              audit records
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                size="xs"
                variant="outline"
                disabled={safeAuditPage <= 1}
                onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="size-3.5" />
                Prev
              </Button>
              <span className="px-2 font-mono text-[11px] text-zinc-700">
                Page {safeAuditPage} / {auditTotalPages}
              </span>
              <Button
                size="xs"
                variant="outline"
                disabled={safeAuditPage >= auditTotalPages}
                onClick={() =>
                  setAuditPage((p) => Math.min(auditTotalPages, p + 1))
                }
              >
                Next
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
