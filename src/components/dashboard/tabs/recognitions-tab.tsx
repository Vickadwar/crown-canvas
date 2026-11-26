"use client";

/**
 * @file src/components/dashboard/tabs/recognitions-tab.tsx
 * @description Employee of the Month / Quarter / Year ingestion & management workspace.
 * Supports 1-click downloadable Excel template (`.xlsx`), drag-and-drop Excel/CSV bulk
 * import, deterministic cool vector avatars (zero employee photo cropping), multi-screen
 * targeting, display cadence, date windows, and optional celebration music.
 */

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  Award,
  Building2,
  Check,
  CheckSquare,
  Download,
  FileSpreadsheet,
  MapPin,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Square,
  Trash2,
  Trophy,
  Upload,
  X,
} from "lucide-react";
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
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { ModernSelect } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  generateEmployeeAvatarDataUri,
  type EmployeeAvatarStyle,
} from "@/lib/avatar-generator";
import type {
  EmployeeRecognitionItem,
  OverviewPayload,
} from "../cms-types";

interface RecognitionsTabProps {
  data: OverviewPayload;
  onRefresh: () => Promise<void>;
}

interface ParsedRecognitionDraft {
  employeeName: string;
  locationName: string;
  departmentName: string;
  awardPeriodType: "month" | "quarter" | "year" | "special";
  awardPeriodLabel: string;
  citation: string;
  avatarStyle: EmployeeAvatarStyle;
  avatarSeed: string;
}

const AVATAR_STYLES: EmployeeAvatarStyle[] = [
  "illustrated",
  "geometric",
  "crown_badge",
];

function normalizeAwardType(
  raw: string
): "month" | "quarter" | "year" | "special" {
  const s = raw.trim().toLowerCase();
  if (s.includes("year") || s.includes("annual")) return "year";
  if (s.includes("quarter") || /^q[1-4]/i.test(s)) return "quarter";
  if (s.includes("special") || s.includes("star")) return "special";
  return "month";
}

export function RecognitionsTab({ data, onRefresh }: RecognitionsTabProps) {
  const confirm = useConfirm();
  const recognitions = useMemo(
    () => data.employeeRecognitions ?? [],
    [data.employeeRecognitions]
  );
  const audioTracks = useMemo(() => data.audioTracks ?? [], [data.audioTracks]);
  const screenById = useMemo(
    () => new Map(data.screens.map((s) => [s.id, s])),
    [data.screens]
  );

  // Shared Schedule/Target Settings for Bulk Import or Single Create
  const [targetMode, setTargetMode] = useState<
    "global" | "branch" | "country" | "screens"
  >("global");
  const [targetId, setTargetId] = useState("");
  const [selectedScreenIds, setSelectedScreenIds] = useState<string[]>([]);
  const [screenSearch, setScreenSearch] = useState("");
  const [injectEveryN, setInjectEveryN] = useState(5);
  const [durationSeconds, setDurationSeconds] = useState(14);
  const [audioTrackId, setAudioTrackId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Excel Bulk Import Preview Queue
  const [drafts, setDrafts] = useState<ParsedRecognitionDraft[]>([]);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [importing, setImporting] = useState(false);

  // Bulk Cleanup & Cycle Management
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedPeriodToDelete, setSelectedPeriodToDelete] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  const periodCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of recognitions) {
      const label = (r.awardPeriodLabel || "").trim();
      if (!label) continue;
      map.set(label, (map.get(label) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([label, count]) => ({
      label,
      count,
    }));
  }, [recognitions]);

  const effectiveDeletePeriod = useMemo(() => {
    if (
      selectedPeriodToDelete &&
      periodCounts.some((p) => p.label === selectedPeriodToDelete)
    ) {
      return selectedPeriodToDelete;
    }
    return periodCounts[0]?.label ?? "";
  }, [selectedPeriodToDelete, periodCounts]);

  const activeRecognitionsCount = useMemo(
    () => recognitions.filter((r) => r.isActive).length,
    [recognitions]
  );

  const validSelectedIds = useMemo(() => {
    const existingSet = new Set(recognitions.map((r) => r.id));
    return selectedIds.filter((id) => existingSet.has(id));
  }, [recognitions, selectedIds]);

  // Single Manual Add Drawer
  const [showManual, setShowManual] = useState(false);
  const [empName, setEmpName] = useState("");
  const [empLocation, setEmpLocation] = useState(data.branches[0]?.name ?? "");
  const [empDepartment, setEmpDepartment] = useState(
    data.departments[0]?.name ?? "Sales & Showrooms"
  );
  const [empPeriodType, setEmpPeriodType] = useState<
    "month" | "quarter" | "year" | "special"
  >("month");
  const [empPeriodLabel, setEmpPeriodLabel] = useState("November 2026");
  const [empCitation, setEmpCitation] = useState("");
  const [empAvatarStyle, setEmpAvatarStyle] =
    useState<EmployeeAvatarStyle>("illustrated");

  const filteredScreens = useMemo(() => {
    const q = screenSearch.trim().toLowerCase();
    if (!q) return data.screens;
    return data.screens.filter((s) => s.name.toLowerCase().includes(q));
  }, [data.screens, screenSearch]);

  function handleDownloadTemplate() {
    const sampleRows = [
      {
        Name: "Grace Wanjiku",
        Location: data.branches[0]?.name || "Nairobi Likoni Rd HQ",
        Department: "Customer Service",
        "Award Type": "Month",
        Period: "November 2026",
        "Achievement Note":
          "Exceeded showroom colour consultation targets with 99% customer satisfaction.",
      },
      {
        Name: "David Ochieng",
        Location: data.branches[1]?.name || "Mombasa Showroom",
        Department: "Industrial & Trade",
        "Award Type": "Quarter",
        Period: "Q4 2026",
        "Achievement Note":
          "Led zero-defect delivery across major coastal contractor projects.",
      },
      {
        Name: "Amina Hassan",
        Location: data.branches[0]?.name || "Westlands Showroom",
        Department: "Operations & Logistics",
        "Award Type": "Year",
        Period: "2026",
        "Achievement Note":
          "Champion of safety excellence and 100% on-time dispatch reliability.",
      },
    ];

    const ws = XLSX.utils.json_to_sheet(sampleRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employee Recognition");
    XLSX.writeFile(wb, "Crown-Canvas-Employee-Recognition-Template.xlsx");
    toast.success("Downloaded ready Excel template (.xlsx)");
  }

  async function handleFileUpload(file: File) {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const firstSheet = wb.SheetNames[0];
      if (!firstSheet) {
        toast.error("The spreadsheet has no sheets.");
        return;
      }
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        wb.Sheets[firstSheet],
        { defval: "" }
      );
      const parsed: ParsedRecognitionDraft[] = [];

      for (const row of rows) {
        const lowerMap = new Map<string, string>();
        for (const [k, v] of Object.entries(row)) {
          lowerMap.set(k.trim().toLowerCase(), String(v ?? "").trim());
        }

        const name =
          lowerMap.get("name") ||
          lowerMap.get("employee") ||
          lowerMap.get("employee name") ||
          lowerMap.get("full name") ||
          "";
        const location =
          lowerMap.get("location") ||
          lowerMap.get("branch") ||
          lowerMap.get("showroom") ||
          "Head Office";
        const department =
          lowerMap.get("department") ||
          lowerMap.get("dept") ||
          lowerMap.get("team") ||
          "Crown Paints Team";
        const rawType =
          lowerMap.get("award type") ||
          lowerMap.get("type") ||
          lowerMap.get("category") ||
          "month";
        const period =
          lowerMap.get("period") ||
          lowerMap.get("month") ||
          lowerMap.get("quarter") ||
          lowerMap.get("year") ||
          new Date().toLocaleDateString("en-US", {
            month: "long",
            year: "numeric",
          });
        const note =
          lowerMap.get("achievement note") ||
          lowerMap.get("citation") ||
          lowerMap.get("note") ||
          lowerMap.get("reason") ||
          "";

        if (name.length >= 2) {
          parsed.push({
            employeeName: name,
            locationName: location,
            departmentName: department,
            awardPeriodType: normalizeAwardType(rawType),
            awardPeriodLabel: period,
            citation: note,
            avatarStyle: "illustrated",
            avatarSeed: `${name}-${department}`,
          });
        }
      }

      if (parsed.length === 0) {
        toast.error(
          "No valid employee rows found. Ensure columns include Name, Location, Department."
        );
        return;
      }

      setDrafts(parsed);
      toast.success(
        `Parsed ${parsed.length} employee spotlight(s) — review avatars & click Publish!`
      );
    } catch {
      toast.error("Could not parse file. Upload a valid .xlsx, .xls, or .csv file.");
    }
  }

  function matchBranchId(locationName: string): string | null {
    const clean = locationName.trim().toLowerCase();
    const found = data.branches.find(
      (b) =>
        b.name.toLowerCase().includes(clean) ||
        clean.includes(b.name.toLowerCase()) ||
        b.city.toLowerCase() === clean
    );
    return found?.id ?? null;
  }

  async function publishItems(
    items: ParsedRecognitionDraft[],
    options?: { replaceExisting?: boolean }
  ) {
    if (targetMode === "screens" && selectedScreenIds.length === 0) {
      toast.error("Select at least one target screen.");
      return;
    }
    setImporting(true);
    try {
      const payload = {
        replaceExisting: Boolean(options?.replaceExisting),
        items: items.map((d) => ({
          employeeName: d.employeeName,
          locationName: d.locationName,
          branchId: matchBranchId(d.locationName),
          departmentName: d.departmentName,
          awardPeriodType: d.awardPeriodType,
          awardPeriodLabel: d.awardPeriodLabel,
          citation: d.citation,
          avatarStyle: d.avatarStyle,
          avatarSeed: d.avatarSeed,
          audioTrackId: audioTrackId || null,
          targetType: targetMode === "screens" ? "screen" : targetMode,
          targetId:
            targetMode === "global" || targetMode === "screens"
              ? null
              : targetId || null,
          targetScreenIds:
            targetMode === "screens" ? selectedScreenIds : null,
          injectEveryNSlides: Math.max(1, Number(injectEveryN) || 5),
          durationSeconds: Math.max(5, Number(durationSeconds) || 14),
          startDate: startDate
            ? new Date(`${startDate}T00:00:00`).toISOString()
            : null,
          endDate: endDate
            ? new Date(`${endDate}T23:59:59`).toISOString()
            : null,
        })),
      };

      const res = await fetch("/api/recognitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(json.error || "Could not publish recognitions");
        return;
      }

      toast.success(
        options?.replaceExisting
          ? `Replaced previous cycle & published ${items.length} Employee Spotlight(s)!`
          : `Published ${items.length} Employee Spotlight(s) live to TVs!`
      );
      setDrafts([]);
      setReplaceExisting(false);
      setShowManual(false);
      setEmpName("");
      setEmpCitation("");
      await onRefresh();
    } finally {
      setImporting(false);
    }
  }

  async function handleToggle(r: EmployeeRecognitionItem) {
    const res = await fetch(`/api/recognitions/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !r.isActive }),
    });
    if (!res.ok) {
      toast.error("Failed to update spotlight");
      return;
    }
    toast.success(
      r.isActive
        ? `Paused "${r.employeeName}"`
        : `Activated "${r.employeeName}"`
    );
    await onRefresh();
  }

  async function handleDelete(r: EmployeeRecognitionItem) {
    const ok = await confirm({
      title: `Remove "${r.employeeName}" spotlight?`,
      description:
        "This permanently removes this employee recognition from rotation on paired screens.",
      confirmLabel: "Remove Spotlight",
      variant: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/recognitions/${r.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to remove spotlight");
      return;
    }
    setSelectedIds((prev) => prev.filter((id) => id !== r.id));
    toast.success(`Removed "${r.employeeName}"`);
    await onRefresh();
  }

  async function runBulkDelete(
    body: { ids?: string[]; awardPeriodLabel?: string; clearAll?: boolean },
    successMessage: string
  ) {
    setBulkBusy(true);
    try {
      const res = await fetch("/api/recognitions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        error?: string;
        deletedCount?: number;
      };
      if (!res.ok) {
        toast.error(json.error || "Bulk delete failed");
        return;
      }
      setSelectedIds([]);
      toast.success(
        `${successMessage} (${json.deletedCount ?? 0} removed)`
      );
      await onRefresh();
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkDeleteSelected() {
    if (validSelectedIds.length === 0) return;
    const ok = await confirm({
      title: `Delete ${validSelectedIds.length} selected spotlight(s)?`,
      description:
        "Selected employee recognitions will be permanently removed from all paired TVs.",
      confirmLabel: `Delete ${validSelectedIds.length} Selected`,
      variant: "danger",
    });
    if (!ok) return;
    await runBulkDelete(
      { ids: validSelectedIds },
      "Deleted selected spotlights"
    );
  }

  async function handleDeleteByPeriod() {
    if (!effectiveDeletePeriod) return;
    const periodInfo = periodCounts.find(
      (p) => p.label === effectiveDeletePeriod
    );
    const ok = await confirm({
      title: `Delete all "${effectiveDeletePeriod}" recognitions?`,
      description: `This permanently clears ${periodInfo?.count ?? "all"} spotlight(s) tagged "${effectiveDeletePeriod}" so outdated award cycles no longer air on TVs.`,
      confirmLabel: `Clear "${effectiveDeletePeriod}"`,
      variant: "danger",
    });
    if (!ok) return;
    await runBulkDelete(
      { awardPeriodLabel: effectiveDeletePeriod },
      `Cleared "${effectiveDeletePeriod}" cycle`
    );
  }

  async function handleClearAll() {
    if (recognitions.length === 0) return;
    const ok = await confirm({
      title: `Clear all ${recognitions.length} employee recognitions?`,
      description:
        "This removes every active and paused spotlight from the recognition wall so you can upload a fresh cycle.",
      confirmLabel: "Clear All Spotlights",
      variant: "danger",
    });
    if (!ok) return;
    await runBulkDelete({ clearAll: true }, "Cleared all spotlights");
  }

  return (
    <div className="space-y-5">
      {/* Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-zinc-950">
              Employee of the Month / Quarter / Year
            </h2>
            <Badge variant="info">{recognitions.length} Spotlights</Badge>
            {activeRecognitionsCount > 1 && (
              <Badge variant="secondary">
                {Math.ceil(activeRecognitionsCount / 10)} TV Wall Slide
                {Math.ceil(activeRecognitionsCount / 10) === 1 ? "" : "s"} (10/slide)
              </Badge>
            )}
          </div>
          <p className="text-xs text-zinc-500">
            Ingest HR spreadsheets (.xlsx / .csv) with Location, Name &amp; Department — displays up to 10 winners per 5×2 TV wall slide and auto-cycles through every page!
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleDownloadTemplate}>
            <Download className="size-3.5 text-emerald-600" />
            Excel Template (.xlsx)
          </Button>
          <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-zinc-950 px-3 text-xs font-medium text-white shadow-2xs transition hover:bg-zinc-800">
            <FileSpreadsheet className="size-3.5 text-amber-300" />
            Import Excel / CSV
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFileUpload(f);
                e.currentTarget.value = "";
              }}
            />
          </label>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowManual((v) => !v)}
          >
            <Plus className="size-3.5" />
            Add Single
          </Button>
        </div>
      </div>

      {/* Shared Targeting, Cadence & Timing Controls (visible during Import or Manual Add) */}
      {(drafts.length > 0 || showManual) && (
        <Card className="border-amber-300 bg-white">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Sparkles className="size-4 text-amber-500" />
              Broadcast Timing, Cadence &amp; Screen Targeting
            </CardTitle>
            <CardDescription className="text-xs">
              Choose which screens display these spotlights, how often they rotate into playlists, and optional active dates.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-12">
            <div className="space-y-1 md:col-span-3">
              <Label className="text-xs">Target Displays</Label>
              <ModernSelect
                size="sm"
                value={targetMode}
                onValueChange={(v) => {
                  setTargetMode(v as typeof targetMode);
                  setTargetId("");
                }}
                options={[
                  { value: "global", label: "All Paired Displays" },
                  { value: "screens", label: "Specific Multiple Displays" },
                  { value: "branch", label: "Specific Location" },
                  { value: "country", label: "Operating Region" },
                ]}
              />
            </div>

            {targetMode === "branch" && (
              <div className="space-y-1 md:col-span-3">
                <Label className="text-xs">Location</Label>
                <ModernSelect
                  size="sm"
                  value={targetId}
                  onValueChange={setTargetId}
                  options={data.branches.map((b) => ({
                    value: b.id,
                    label: b.name,
                  }))}
                />
              </div>
            )}
            {targetMode === "country" && (
              <div className="space-y-1 md:col-span-3">
                <Label className="text-xs">Region</Label>
                <ModernSelect
                  size="sm"
                  value={targetId}
                  onValueChange={setTargetId}
                  options={data.countries.map((c) => ({
                    value: c.id,
                    label: `${c.name} (${c.code})`,
                  }))}
                />
              </div>
            )}

            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs">Show Every N Slides</Label>
              <Input
                type="number"
                min={1}
                max={30}
                className="h-8 text-xs"
                value={injectEveryN}
                onChange={(e) => setInjectEveryN(Number(e.target.value) || 5)}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs">Display Time (sec)</Label>
              <Input
                type="number"
                min={5}
                max={60}
                className="h-8 text-xs"
                value={durationSeconds}
                onChange={(e) => setDurationSeconds(Number(e.target.value) || 14)}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs">Start Date</Label>
              <DatePicker
                value={startDate}
                onChange={setStartDate}
                placeholder="Start date"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs">End Date</Label>
              <DatePicker
                value={endDate}
                onChange={setEndDate}
                placeholder="End date"
                align="right"
              />
            </div>
            <div className="space-y-1 md:col-span-3">
              <Label className="text-xs">Celebration Audio (Optional)</Label>
              <ModernSelect
                size="sm"
                value={audioTrackId}
                onValueChange={setAudioTrackId}
                options={[
                  { value: "", label: "Use Playlist Audio / Silent" },
                  ...audioTracks.map((a) => ({
                    value: a.id,
                    label: `♪ ${a.title}`,
                  })),
                ]}
              />
            </div>

            {targetMode === "screens" && (
              <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 md:col-span-12">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs font-semibold">
                    Select Target Screens ({selectedScreenIds.length} selected)
                  </Label>
                  <div className="relative w-48">
                    <Search className="pointer-events-none absolute left-2 top-2 size-3 text-zinc-400" />
                    <Input
                      className="h-7 bg-white pl-7 text-xs"
                      placeholder="Filter screens..."
                      value={screenSearch}
                      onChange={(e) => setScreenSearch(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid max-h-36 gap-1.5 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                  {filteredScreens.map((scr) => {
                    const checked = selectedScreenIds.includes(scr.id);
                    return (
                      <button
                        key={scr.id}
                        type="button"
                        onClick={() =>
                          setSelectedScreenIds((prev) =>
                            checked
                              ? prev.filter((id) => id !== scr.id)
                              : [...prev, scr.id]
                          )
                        }
                        className={`flex items-center justify-between rounded-md border px-2.5 py-1.5 text-left text-xs ${
                          checked
                            ? "border-zinc-950 bg-white font-semibold"
                            : "border-zinc-200 bg-white/70 text-zinc-600"
                        }`}
                      >
                        <span className="truncate">{scr.name}</span>
                        {checked && (
                          <Check className="size-3.5 shrink-0 text-emerald-600" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Bulk Excel Import Preview */}
      {drafts.length > 0 && (
        <Card className="border-emerald-300 bg-emerald-50/30">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">
                Ready to Publish — {drafts.length} Parsed Employee Spotlight(s)
              </CardTitle>
              <CardDescription className="text-xs">
                Click any avatar below to cycle between Illustrated, Geometric, and Crown Badge styles before publishing.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              {recognitions.length > 0 && (
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-950">
                  <input
                    type="checkbox"
                    checked={replaceExisting}
                    onChange={(e) => setReplaceExisting(e.target.checked)}
                    className="size-3.5 rounded border-amber-400 accent-zinc-950"
                  />
                  Replace existing ({recognitions.length})
                </label>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setDrafts([]);
                  setReplaceExisting(false);
                }}
              >
                Clear
              </Button>
              <Button
                size="sm"
                disabled={importing}
                onClick={() =>
                  void publishItems(drafts, { replaceExisting })
                }
              >
                <Upload className="size-3.5" />
                {importing
                  ? "Publishing..."
                  : replaceExisting
                    ? `Replace & Publish (${drafts.length})`
                    : `Publish All (${drafts.length})`}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {drafts.map((d, idx) => {
              const avatar = generateEmployeeAvatarDataUri({
                name: d.employeeName,
                seed: d.avatarSeed,
                style: d.avatarStyle,
              });
              return (
                <div
                  key={`${idx}-${d.employeeName}`}
                  className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3"
                >
                  <button
                    type="button"
                    title="Click to switch avatar style"
                    onClick={() =>
                      setDrafts((prev) =>
                        prev.map((item, i) =>
                          i === idx
                            ? {
                                ...item,
                                avatarStyle:
                                  AVATAR_STYLES[
                                    (AVATAR_STYLES.indexOf(item.avatarStyle) + 1) %
                                      AVATAR_STYLES.length
                                  ],
                              }
                            : item
                        )
                      )
                    }
                    className="relative size-14 shrink-0 overflow-hidden rounded-full ring-2 ring-amber-400 transition hover:scale-105"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={avatar}
                      alt={d.employeeName}
                      className="h-full w-full object-cover"
                    />
                  </button>
                  <div className="min-w-0 flex-1 text-xs">
                    <p className="truncate font-bold text-zinc-950">
                      {d.employeeName}
                    </p>
                    <p className="truncate text-[11px] text-zinc-600">
                      {d.departmentName} • {d.locationName}
                    </p>
                    <Badge variant="warning" className="mt-1 text-[10px]">
                      {d.awardPeriodType.toUpperCase()} • {d.awardPeriodLabel}
                    </Badge>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setDrafts((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-rose-500"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Single Manual Add Form */}
      {showManual && (
        <Card className="border-blue-300 bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Add Employee Spotlight</CardTitle>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => setShowManual(false)}
            >
              <X className="size-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!empName.trim()) return;
                void publishItems([
                  {
                    employeeName: empName.trim(),
                    locationName: empLocation.trim() || "Head Office",
                    departmentName: empDepartment.trim() || "Crown Paints",
                    awardPeriodType: empPeriodType,
                    awardPeriodLabel: empPeriodLabel.trim() || "2026",
                    citation: empCitation.trim(),
                    avatarStyle: empAvatarStyle,
                    avatarSeed: `${empName.trim()}-${empDepartment.trim()}`,
                  },
                ]);
              }}
              className="grid gap-3 md:grid-cols-12"
            >
              <div className="flex items-center gap-3 md:col-span-4">
                <button
                  type="button"
                  title="Cycle cool avatar style"
                  onClick={() =>
                    setEmpAvatarStyle(
                      AVATAR_STYLES[
                        (AVATAR_STYLES.indexOf(empAvatarStyle) + 1) %
                          AVATAR_STYLES.length
                      ]
                    )
                  }
                  className="relative size-14 shrink-0 overflow-hidden rounded-full ring-2 ring-amber-400"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={generateEmployeeAvatarDataUri({
                      name: empName || "Star Performer",
                      seed: `${empName}-${empDepartment}`,
                      style: empAvatarStyle,
                    })}
                    alt="Avatar preview"
                    className="h-full w-full object-cover"
                  />
                </button>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Employee Full Name</Label>
                  <Input
                    className="h-8 text-xs"
                    placeholder="e.g. Grace Wanjiku"
                    value={empName}
                    onChange={(e) => setEmpName(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-1 md:col-span-3">
                <Label className="text-xs">Location / Showroom</Label>
                <Input
                  className="h-8 text-xs"
                  value={empLocation}
                  onChange={(e) => setEmpLocation(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1 md:col-span-3">
                <Label className="text-xs">Department</Label>
                <Input
                  className="h-8 text-xs"
                  value={empDepartment}
                  onChange={(e) => setEmpDepartment(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label className="text-xs">Award Category</Label>
                <ModernSelect
                  size="sm"
                  value={empPeriodType}
                  onValueChange={(v) =>
                    setEmpPeriodType(v as typeof empPeriodType)
                  }
                  options={[
                    { value: "month", label: "Of the Month" },
                    { value: "quarter", label: "Of the Quarter" },
                    { value: "year", label: "Of the Year" },
                    { value: "special", label: "Star Performer" },
                  ]}
                />
              </div>

              <div className="space-y-1 md:col-span-3">
                <Label className="text-xs">Award Period Label</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="e.g. November 2026 / Q4 2026"
                  value={empPeriodLabel}
                  onChange={(e) => setEmpPeriodLabel(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1 md:col-span-6">
                <Label className="text-xs">Achievement Citation (Optional)</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="Short praise line shown on the TV spotlight..."
                  value={empCitation}
                  onChange={(e) => setEmpCitation(e.target.value)}
                />
              </div>
              <div className="flex items-end justify-end gap-2 md:col-span-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setEmpAvatarStyle(
                      AVATAR_STYLES[
                        (AVATAR_STYLES.indexOf(empAvatarStyle) + 1) %
                          AVATAR_STYLES.length
                      ]
                    )
                  }
                >
                  <RefreshCw className="size-3.5" />
                  Avatar
                </Button>
                <Button type="submit" size="sm" disabled={importing}>
                  <Trophy className="size-3.5" />
                  Publish
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Active Spotlights Grid */}
      {recognitions.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-xs text-zinc-500">
            No Employee Recognition spotlights active yet. Download the{" "}
            <strong>Excel Template (.xlsx)</strong>, paste your winners, and upload to celebrate your team across TVs with cool vector avatars!
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {/* Cycle Cleanup & Bulk Selection Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={bulkBusy}
                onClick={() => {
                  if (validSelectedIds.length === recognitions.length) {
                    setSelectedIds([]);
                  } else {
                    setSelectedIds(recognitions.map((r) => r.id));
                  }
                }}
              >
                {validSelectedIds.length === recognitions.length ? (
                  <CheckSquare className="size-3.5 text-zinc-900" />
                ) : (
                  <Square className="size-3.5 text-zinc-400" />
                )}
                {validSelectedIds.length === recognitions.length
                  ? "Deselect All"
                  : `Select All (${recognitions.length})`}
              </Button>
              {validSelectedIds.length > 0 && (
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={bulkBusy}
                  onClick={() => void handleBulkDeleteSelected()}
                >
                  <Trash2 className="size-3.5" />
                  Delete Selected ({validSelectedIds.length})
                </Button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {periodCounts.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="w-44">
                    <ModernSelect
                      size="sm"
                      value={effectiveDeletePeriod}
                      onValueChange={setSelectedPeriodToDelete}
                      options={periodCounts.map((p) => ({
                        value: p.label,
                        label: `${p.label} (${p.count})`,
                      }))}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={bulkBusy || !effectiveDeletePeriod}
                    onClick={() => void handleDeleteByPeriod()}
                    className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                  >
                    <Trash2 className="size-3.5" />
                    Delete Period
                  </Button>
                </div>
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={bulkBusy}
                onClick={() => void handleClearAll()}
                className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
              >
                Clear All
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {recognitions.map((r) => {
              const avatar = generateEmployeeAvatarDataUri({
                name: r.employeeName,
                seed: r.avatarSeed,
                style: r.avatarStyle,
              });
              const isSelected = validSelectedIds.includes(r.id);
              const targetSummary =
                r.targetScreenIds && r.targetScreenIds.length > 0
                  ? r.targetScreenIds
                      .map((id) => screenById.get(id)?.name)
                      .filter(Boolean)
                      .slice(0, 2)
                      .join(", ")
                  : r.targetType === "global"
                    ? "All Displays"
                    : r.targetType;
              return (
                <Card
                  key={r.id}
                  className={`overflow-hidden bg-white transition ${
                    isSelected
                      ? "border-zinc-950 ring-2 ring-zinc-950/15"
                      : "border-zinc-200"
                  }`}
                >
                  <div className="relative flex items-center gap-3.5 bg-gradient-to-r from-[#071129] to-[#0e1f4a] p-4 text-white">
                    <button
                      type="button"
                      title={
                        isSelected
                          ? "Deselect spotlight"
                          : "Select for bulk delete"
                      }
                      onClick={() =>
                        setSelectedIds((prev) =>
                          prev.includes(r.id)
                            ? prev.filter((id) => id !== r.id)
                            : [...prev, r.id]
                        )
                      }
                      className={`absolute right-2.5 top-2.5 flex size-5 items-center justify-center rounded border transition ${
                        isSelected
                          ? "border-amber-300 bg-amber-400 text-zinc-950"
                          : "border-white/30 bg-white/10 text-transparent hover:border-white/60"
                      }`}
                    >
                      <Check className="size-3 stroke-[3]" />
                    </button>
                    <div className="size-16 shrink-0 overflow-hidden rounded-full border-2 border-amber-300 shadow-md">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={avatar}
                        alt={r.employeeName}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1 pr-6">
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-200">
                        <Award className="size-2.5" />
                        Employee of the {r.awardPeriodType} • {r.awardPeriodLabel}
                      </span>
                      <p className="mt-1 truncate text-base font-black">
                        {r.employeeName}
                      </p>
                      <p className="flex items-center gap-2 truncate text-[11px] text-slate-300">
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="size-3 text-sky-300" />
                          {r.departmentName}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3 text-amber-300" />
                          {r.locationName}
                        </span>
                      </p>
                    </div>
                  </div>

                  <CardContent className="space-y-2.5 p-3.5 text-xs">
                    {r.citation && (
                      <p className="line-clamp-2 italic text-zinc-600">
                        &ldquo;{r.citation}&rdquo;
                      </p>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={r.isActive ? "success" : "secondary"}>
                          {r.isActive ? "Live" : "Paused"}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          Every {r.injectEveryNSlides} slides • {r.durationSeconds}s
                        </Badge>
                        <Badge variant="info" className="text-[10px]">
                          {targetSummary}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          title={r.isActive ? "Pause" : "Activate"}
                          onClick={() => void handleToggle(r)}
                        >
                          {r.isActive ? (
                            <PauseCircle className="size-4 text-amber-600" />
                          ) : (
                            <PlayCircle className="size-4 text-emerald-600" />
                          )}
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          title="Delete"
                          onClick={() => void handleDelete(r)}
                        >
                          <Trash2 className="size-3.5 text-rose-500" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
