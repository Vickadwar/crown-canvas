"use client";

/**
 * @file src/components/dashboard/tabs/fleet-tab.tsx
 * @description Scalable 100+ Fleet & Pairing workspace featuring searchable/filterable
 * paginated Data Table & Card Grid views, collapsible Pair New Screen panel, full CRUD
 * (Edit, Activate/Deactivate pause, Delete), verified Screen Groups & Bulk Fleet Actions.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eraser,
  Layers,
  LayoutGrid,
  List,
  Monitor,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Tv,
  Wifi,
  WifiOff,
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
import { Label } from "@/components/ui/label";
import { ModernSelect } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { computeScreenHealth } from "@/lib/screen-health";
import type { OverviewPayload, ScreenItem } from "../cms-types";

interface FleetTabProps {
  data: OverviewPayload;
  onRefresh: () => Promise<void>;
  onSilentRefresh?: () => Promise<void>;
  lastSyncedAt?: number | null;
}

function formatAgeLabel(ageSeconds: number | null): string {
  if (ageSeconds === null || !Number.isFinite(ageSeconds)) {
    return "Never connected";
  }
  if (ageSeconds < 10) return "Just now";
  if (ageSeconds < 60) return `${ageSeconds}s ago`;
  const mins = Math.floor(ageSeconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function FleetTab({
  data,
  onRefresh,
  onSilentRefresh,
  lastSyncedAt,
}: FleetTabProps) {
  const confirm = useConfirm();
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [syncingNow, setSyncingNow] = useState(false);

  // Live 5-second local clock so "Seen Xs ago" & Online -> Degraded -> Offline badges tick live
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);
  // Search, Filters, View & Pagination (handles 100s of screens smoothly)
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "online" | "degraded" | "offline" | "paused"
  >("all");
  const [branchFilter, setBranchFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Collapsible Drawers
  const [showPairPanel, setShowPairPanel] = useState(
    data.pendingPairings.length > 0 || data.screens.length === 0
  );
  const [showGroupsPanel, setShowGroupsPanel] = useState(false);

  // Pair Screen Form
  const [pairCode, setPairCode] = useState("");
  const [screenName, setScreenName] = useState("");
  const [pairBranchId, setPairBranchId] = useState(data.branches[0]?.id ?? "");
  const [pairDeptId, setPairDeptId] = useState(data.departments[0]?.id ?? "");
  const [pairRole, setPairRole] = useState<
    "showroom_customer" | "back_office" | "factory_floor" | "reception"
  >("showroom_customer");
  const [pairPlaylistId, setPairPlaylistId] = useState(
    data.playlists[0]?.id ?? ""
  );
  const [submittingPair, setSubmittingPair] = useState(false);

  // Edit Screen State
  const [editingScreen, setEditingScreen] = useState<ScreenItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editBranchId, setEditBranchId] = useState("");
  const [editDeptId, setEditDeptId] = useState("");
  const [editGroupId, setEditGroupId] = useState("");
  const [editRole, setEditRole] = useState("showroom_customer");
  const [editOrientation, setEditOrientation] = useState("landscape");
  const [savingEdit, setSavingEdit] = useState(false);

  // Screen Groups & Bulk Actions
  const [newGroupName, setNewGroupName] = useState("");
  const [groupDesc, setGroupDesc] = useState("");
  const [bulkPlaylistId, setBulkPlaylistId] = useState(
    data.playlists[0]?.id ?? ""
  );
  const [runningBulk, setRunningBulk] = useState(false);

  const branchById = useMemo(
    () => new Map(data.branches.map((b) => [b.id, b])),
    [data.branches]
  );
  const groupById = useMemo(
    () => new Map(data.screenGroups.map((g) => [g.id, g])),
    [data.screenGroups]
  );
  const playlistById = useMemo(
    () => new Map(data.playlists.map((p) => [p.id, p])),
    [data.playlists]
  );

  // Evaluate live screen health against current wall clock (respecting explicit offline disconnect)
  const screenLiveHealth = useMemo(() => {
    const map = new Map<
      string,
      {
        status: "online" | "degraded" | "offline" | "paused";
        ageSeconds: number | null;
      }
    >();
    for (const s of data.screens) {
      if (s.isActive === false) {
        map.set(s.id, { status: "paused", ageSeconds: s.lastSeenSeconds ?? null });
        continue;
      }
      const computed = computeScreenHealth(s.lastHeartbeatAt, nowMs);
      if (s.isOnline === false) {
        map.set(s.id, { status: "offline", ageSeconds: computed.ageSeconds });
      } else {
        map.set(s.id, {
          status: computed.healthStatus,
          ageSeconds: computed.ageSeconds,
        });
      }
    }
    return map;
  }, [data.screens, nowMs]);

  const filteredScreens = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.screens.filter((scr) => {
      const health = screenLiveHealth.get(scr.id)?.status ?? "offline";
      if (statusFilter !== "all" && health !== statusFilter) return false;
      if (branchFilter && scr.branchId !== branchFilter) return false;
      if (groupFilter && (scr.groupId ?? "") !== groupFilter) return false;
      if (!q) return true;
      const brName = branchById.get(scr.branchId)?.name?.toLowerCase() ?? "";
      const plName =
        (scr.activePlaylistId
          ? playlistById.get(scr.activePlaylistId)?.name?.toLowerCase()
          : "") ?? "";
      return (
        scr.name.toLowerCase().includes(q) ||
        brName.includes(q) ||
        plName.includes(q) ||
        (scr.currentItemTitle?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [
    data.screens,
    screenLiveHealth,
    search,
    statusFilter,
    branchFilter,
    groupFilter,
    branchById,
    playlistById,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredScreens.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageScreens = useMemo(
    () =>
      filteredScreens.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredScreens, safePage, pageSize]
  );

  const counts = useMemo(() => {
    let online = 0;
    let degraded = 0;
    let offline = 0;
    let paused = 0;
    for (const s of data.screens) {
      const status = screenLiveHealth.get(s.id)?.status ?? "offline";
      if (status === "paused") paused++;
      else if (status === "online") online++;
      else if (status === "degraded") degraded++;
      else offline++;
    }
    return { all: data.screens.length, online, degraded, offline, paused };
  }, [data.screens, screenLiveHealth]);

  function openEditScreen(scr: ScreenItem) {
    setEditingScreen(scr);
    setEditName(scr.name);
    setEditBranchId(scr.branchId);
    setEditDeptId(scr.departmentId ?? "");
    setEditGroupId(scr.groupId ?? "");
    setEditRole(scr.screenRole);
    const metaMode =
      typeof scr.metadata?.displayMode === "string"
        ? scr.metadata.displayMode
        : scr.orientation === "portrait"
          ? "portrait_9_16"
          : "landscape_16_9";
    setEditOrientation(metaMode);
  }

  async function handleClaimPairing(e: React.FormEvent) {
    e.preventDefault();
    if (!pairCode || !screenName || !pairBranchId) {
      toast.error("Enter the 6-digit PIN, screen name, and location.");
      return;
    }
    setSubmittingPair(true);
    try {
      const res = await fetch("/api/player/pair/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: pairCode.trim(),
          name: screenName.trim(),
          branchId: pairBranchId,
          departmentId: pairDeptId || null,
          screenRole: pairRole,
          activePlaylistId: pairPlaylistId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Could not claim pairing code");
        return;
      }
      toast.success(`Paired "${screenName.trim()}" successfully`);
      setPairCode("");
      setScreenName("");
      await onRefresh();
    } finally {
      setSubmittingPair(false);
    }
  }

  async function handleSaveScreenEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingScreen || !editName.trim()) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/screens/${editingScreen.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          branchId: editBranchId,
          departmentId: editDeptId || null,
          groupId: editGroupId || null,
          screenRole: editRole,
          orientation: editOrientation.startsWith("portrait")
            ? "portrait"
            : "landscape",
          displayMode: editOrientation,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error || "Failed to update display");
        return;
      }
      toast.success(`Updated "${editName.trim()}"`);
      setEditingScreen(null);
      await onRefresh();
    } finally {
      setSavingEdit(false);
    }
  }

  async function handlePatchScreen(
    screenId: string,
    payload: Record<string, unknown>,
    successMsg: string
  ) {
    const res = await fetch(`/api/screens/${screenId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      toast.error("Failed to update screen");
      return;
    }
    toast.success(successMsg);
    await onRefresh();
  }

  async function handleSendCommand(
    screenId: string,
    command: "reload" | "clear_cache" | "identify" | "screenshot"
  ) {
    const res = await fetch(`/api/screens/${screenId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command }),
    });
    if (!res.ok) {
      toast.error("Failed to dispatch command");
      return;
    }
    toast.success(`Sent "${command.replace("_", " ")}" command`);
    if (command === "screenshot") {
      setTimeout(() => void onRefresh(), 3500);
    }
  }

  async function handleRemoveScreen(scr: ScreenItem) {
    const ok = await confirm({
      title: `Unpair and remove "${scr.name}"?`,
      description:
        "The display will immediately return to the 6-digit pairing screen and stop showing scheduled content.",
      confirmLabel: "Remove Display",
      variant: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/screens/${scr.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to remove screen");
      return;
    }
    setSelectedIds((prev) => prev.filter((id) => id !== scr.id));
    toast.success(`Removed "${scr.name}"`);
    await onRefresh();
  }

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    const res = await fetch("/api/screen-groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newGroupName.trim(),
        description: groupDesc.trim() || undefined,
      }),
    });
    const j = await res.json();
    if (!res.ok) {
      toast.error(j.error || "Failed to create screen group");
      return;
    }
    toast.success(`Created group "${newGroupName.trim()}"`);
    setNewGroupName("");
    setGroupDesc("");
    await onRefresh();
  }

  async function handleDeleteGroup(groupId: string) {
    const res = await fetch(`/api/screen-groups/${groupId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Failed to delete group");
      return;
    }
    toast.success("Screen group deleted");
    await onRefresh();
  }

  async function handleGroupBulkAction(
    groupId: string,
    action: "assign_playlist" | "reload" | "identify" | "clear_cache" | "screenshot"
  ) {
    setRunningBulk(true);
    try {
      const res = await fetch("/api/screen-groups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId,
          action,
          playlistId: action === "assign_playlist" ? bulkPlaylistId || null : null,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error || "Bulk group action failed");
        return;
      }
      toast.success(
        `Applied "${action.replace("_", " ")}" to ${j.affectedScreens ?? 0} screen(s)`
      );
      await onRefresh();
    } finally {
      setRunningBulk(false);
    }
  }

  async function handleSelectedBulkAction(
    action:
      | "assign_playlist"
      | "reload"
      | "clear_cache"
      | "identify"
      | "pause"
      | "activate"
  ) {
    if (selectedIds.length === 0) return;
    setRunningBulk(true);
    try {
      await Promise.all(
        selectedIds.map((id) => {
          if (action === "assign_playlist") {
            return fetch(`/api/screens/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                activePlaylistId: bulkPlaylistId || null,
              }),
            });
          }
          if (action === "pause" || action === "activate") {
            return fetch(`/api/screens/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ isActive: action === "activate" }),
            });
          }
          return fetch(`/api/screens/${id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ command: action }),
          });
        })
      );
      toast.success(
        `Applied "${action.replace("_", " ")}" to ${selectedIds.length} selected screen(s)`
      );
      setSelectedIds([]);
      await onRefresh();
    } finally {
      setRunningBulk(false);
    }
  }

  function renderStatusBadge(scr: ScreenItem, showAge = true) {
    const live = screenLiveHealth.get(scr.id) ?? {
      status: scr.isActive === false ? "paused" : "offline",
      ageSeconds: scr.lastSeenSeconds ?? null,
    };
    const ageText = formatAgeLabel(live.ageSeconds);
    if (live.status === "paused") {
      return (
        <div className="space-y-0.5">
          <Badge variant="secondary">Paused</Badge>
          {showAge && (
            <p className="text-[10px] text-zinc-400">Seen {ageText}</p>
          )}
        </div>
      );
    }
    if (live.status === "online") {
      return (
        <div className="space-y-0.5">
          <Badge variant="success">
            <Wifi className="size-3" />
            Online
          </Badge>
          {showAge && (
            <p className="text-[10px] text-emerald-700/80">{ageText}</p>
          )}
        </div>
      );
    }
    if (live.status === "degraded") {
      return (
        <div className="space-y-0.5">
          <Badge variant="warning">Degraded</Badge>
          {showAge && (
            <p className="text-[10px] text-amber-700/80">Seen {ageText}</p>
          )}
        </div>
      );
    }
    return (
      <div className="space-y-0.5">
        <Badge variant="danger">
          <WifiOff className="size-3" />
          Offline
        </Badge>
        {showAge && (
          <p className="text-[10px] text-zinc-400">
            {live.ageSeconds !== null ? `Seen ${ageText}` : "Never connected"}
          </p>
        )}
      </div>
    );
  }

  async function handleManualLiveSync() {
    setSyncingNow(true);
    try {
      if (onSilentRefresh) {
        await onSilentRefresh();
      } else {
        await onRefresh();
      }
      setNowMs(Date.now());
    } finally {
      setSyncingNow(false);
    }
  }

  const allOnPageSelected =
    pageScreens.length > 0 &&
    pageScreens.every((s) => selectedIds.includes(s.id));

  return (
    <div className="space-y-5">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-zinc-400" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search screens, locations, playlists..."
              className="h-8 pl-8 text-xs"
            />
          </div>
          <div className="w-44">
            <ModernSelect
              size="sm"
              value={branchFilter}
              onValueChange={(v) => {
                setBranchFilter(v);
                setPage(1);
              }}
              options={[
                { value: "", label: "All Locations" },
                ...data.branches.map((b) => ({ value: b.id, label: b.name })),
              ]}
            />
          </div>
          {data.screenGroups.length > 0 && (
            <div className="w-44">
              <ModernSelect
                size="sm"
                value={groupFilter}
                onValueChange={(v) => {
                  setGroupFilter(v);
                  setPage(1);
                }}
                options={[
                  { value: "", label: "All Groups" },
                  ...data.screenGroups.map((g) => ({
                    value: g.id,
                    label: g.name,
                  })),
                ]}
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${viewMode === "table"
                ? "bg-white text-zinc-950 shadow-2xs"
                : "text-zinc-500 hover:text-zinc-900"
                }`}
            >
              <List className="size-3.5" />
              Table
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${viewMode === "grid"
                ? "bg-white text-zinc-950 shadow-2xs"
                : "text-zinc-500 hover:text-zinc-900"
                }`}
            >
              <LayoutGrid className="size-3.5" />
              Grid
            </button>
          </div>

          <Button
            size="sm"
            variant={showGroupsPanel ? "secondary" : "outline"}
            onClick={() => setShowGroupsPanel((v) => !v)}
          >
            <Layers className="size-3.5" />
            Groups ({data.screenGroups.length})
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={() => setShowPairPanel((v) => !v)}
          >
            <Plus className="size-3.5" />
            Pair Screen
            {data.pendingPairings.length > 0 && (
              <span className="ml-1 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {data.pendingPairings.length}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Status Filter Pills + Live Auto-Refresh Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: "all", label: `All Displays (${counts.all})`, badge: "outline" },
              { id: "online", label: `Online (${counts.online})`, badge: "success" },
              { id: "degraded", label: `Degraded (${counts.degraded})`, badge: "warning" },
              { id: "offline", label: `Offline (${counts.offline})`, badge: "danger" },
              { id: "paused", label: `Paused (${counts.paused})`, badge: "secondary" },
            ] as const
          ).map((pill) => (
            <button
              key={pill.id}
              type="button"
              onClick={() => {
                setStatusFilter(pill.id);
                setPage(1);
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${statusFilter === pill.id
                ? "bg-zinc-950 text-white"
                : "border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-950"
                }`}
            >
              {pill.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50/70 px-2.5 py-1 text-[11px] font-medium text-emerald-800">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
            Live Auto-Sync (10s)
            {lastSyncedAt && (
              <span className="text-emerald-700/70">
                • {formatAgeLabel(Math.max(0, Math.round((nowMs - lastSyncedAt) / 1000)))}
              </span>
            )}
          </span>
          <Button
            size="xs"
            variant="outline"
            disabled={syncingNow}
            onClick={() => void handleManualLiveSync()}
            title="Pull latest live TV telemetry now"
          >
            <RefreshCw className={`size-3 ${syncingNow ? "animate-spin" : ""}`} />
            Sync Now
          </Button>
        </div>
      </div>

      {/* Collapsible Pair New Screen Panel */}
      {showPairPanel && (
        <Card className="border-zinc-300">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Pair New Display</CardTitle>
              <CardDescription>
                Open <code>/player</code> on any Android TV or Mini PC and enter its 6-digit pairing code.
              </CardDescription>
            </div>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => setShowPairPanel(false)}
            >
              <X className="size-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.pendingPairings.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3">
                <span className="text-xs font-semibold text-emerald-800">
                  Awaiting Pairing:
                </span>
                {data.pendingPairings.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPairCode(p.code)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-2.5 py-1 font-mono text-xs font-bold text-zinc-950 shadow-2xs hover:bg-emerald-100"
                  >
                    {p.code}
                    <span className="font-sans text-[10px] font-medium text-zinc-500">
                      ({p.hardwareType === "android_tv" ? "Android TV" : "Kiosk"})
                    </span>
                  </button>
                ))}
              </div>
            )}

            <form
              onSubmit={handleClaimPairing}
              className="grid gap-3 md:grid-cols-6"
            >
              <div className="space-y-1">
                <Label className="text-xs">6-Digit PIN</Label>
                <Input
                  placeholder="482910"
                  maxLength={6}
                  className="h-8 font-mono text-sm tracking-widest"
                  value={pairCode}
                  onChange={(e) => setPairCode(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label className="text-xs">Display Name</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="e.g. Main Entrance Display 01"
                  value={screenName}
                  onChange={(e) => setScreenName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Location</Label>
                <ModernSelect
                  size="sm"
                  value={pairBranchId}
                  onValueChange={setPairBranchId}
                  options={data.branches.map((b) => ({
                    value: b.id,
                    label: b.name,
                  }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Initial Playlist</Label>
                <ModernSelect
                  size="sm"
                  value={pairPlaylistId}
                  onValueChange={setPairPlaylistId}
                  options={[
                    { value: "", label: "Assign Later" },
                    ...data.playlists.map((pl) => ({
                      value: pl.id,
                      label: pl.name,
                    })),
                  ]}
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="submit"
                  size="sm"
                  className="w-full"
                  disabled={submittingPair}
                >
                  <Tv className="size-3.5" />
                  {submittingPair ? "Pairing..." : "Claim Screen"}
                </Button>
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label className="text-xs">Department (Optional)</Label>
                <ModernSelect
                  size="sm"
                  value={pairDeptId}
                  onValueChange={setPairDeptId}
                  options={[
                    { value: "", label: "General / All" },
                    ...data.departments.map((d) => ({
                      value: d.id,
                      label: d.name,
                    })),
                  ]}
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label className="text-xs">Display Role</Label>
                <ModernSelect
                  size="sm"
                  value={pairRole}
                  onValueChange={(v) =>
                    setPairRole(v as typeof pairRole)
                  }
                  options={[
                    { value: "showroom_customer", label: "Showroom Customer" },
                    { value: "reception", label: "Reception" },
                    { value: "factory_floor", label: "Factory / Operations" },
                    { value: "back_office", label: "Back Office" },
                  ]}
                />
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Collapsible Screen Groups & Bulk Fleet Actions Panel */}
      {showGroupsPanel && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">
                Screen Groups &amp; Bulk Fleet Operations
              </CardTitle>
              <CardDescription>
                Group screens by zone or location to swap playlists or issue commands across dozens of TVs in one click.
              </CardDescription>
            </div>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => setShowGroupsPanel(false)}
            >
              <X className="size-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              onSubmit={handleCreateGroup}
              className="flex flex-wrap items-center gap-2"
            >
              <Input
                className="h-8 w-56 text-xs"
                placeholder="New group name (e.g. Flagship Entrances)"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                required
              />
              <Input
                className="h-8 flex-1 min-w-[180px] text-xs"
                placeholder="Description (optional)"
                value={groupDesc}
                onChange={(e) => setGroupDesc(e.target.value)}
              />
              <Button type="submit" size="sm">
                <Plus className="size-3.5" />
                Create Group
              </Button>
            </form>

            {data.screenGroups.length === 0 ? (
              <p className="rounded-lg border border-dashed border-zinc-200 p-4 text-center text-xs text-zinc-500">
                No screen groups yet. Create a group above, then assign screens to it from the table below.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {data.screenGroups.map((grp) => {
                  const members = data.screens.filter(
                    (s) => s.groupId === grp.id
                  );
                  return (
                    <div
                      key={grp.id}
                      className="space-y-2.5 rounded-xl border border-zinc-200 bg-zinc-50/50 p-3.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold">{grp.name}</p>
                            <Badge variant="info">
                              {members.length} screen{members.length === 1 ? "" : "s"}
                            </Badge>
                          </div>
                          {grp.description && (
                            <p className="mt-0.5 text-xs text-zinc-500">
                              {grp.description}
                            </p>
                          )}
                        </div>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => void handleDeleteGroup(grp.id)}
                        >
                          <Trash2 className="size-3.5 text-rose-500" />
                        </Button>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <div className="w-44">
                          <ModernSelect
                            size="xs"
                            value={bulkPlaylistId}
                            onValueChange={setBulkPlaylistId}
                            options={data.playlists.map((pl) => ({
                              value: pl.id,
                              label: pl.name,
                            }))}
                          />
                        </div>
                        <Button
                          size="xs"
                          disabled={runningBulk || members.length === 0}
                          onClick={() =>
                            void handleGroupBulkAction(grp.id, "assign_playlist")
                          }
                        >
                          Push Playlist
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          disabled={runningBulk || members.length === 0}
                          onClick={() =>
                            void handleGroupBulkAction(grp.id, "reload")
                          }
                        >
                          Reload All
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          disabled={runningBulk || members.length === 0}
                          onClick={() =>
                            void handleGroupBulkAction(grp.id, "identify")
                          }
                        >
                          Identify
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          disabled={runningBulk || members.length === 0}
                          onClick={() =>
                            void handleGroupBulkAction(grp.id, "clear_cache")
                          }
                        >
                          Clear Cache
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Multi-Select Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Badge variant="info">{selectedIds.length} Selected</Badge>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="text-xs font-medium text-blue-700 hover:underline"
            >
              Clear selection
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-44">
              <ModernSelect
                size="xs"
                value={bulkPlaylistId}
                onValueChange={setBulkPlaylistId}
                options={data.playlists.map((pl) => ({
                  value: pl.id,
                  label: pl.name,
                }))}
              />
            </div>
            <Button
              size="xs"
              disabled={runningBulk}
              onClick={() => void handleSelectedBulkAction("assign_playlist")}
            >
              Assign Playlist
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={runningBulk}
              onClick={() => void handleSelectedBulkAction("reload")}
            >
              Reload
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={runningBulk}
              onClick={() => void handleSelectedBulkAction("pause")}
            >
              Pause
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={runningBulk}
              onClick={() => void handleSelectedBulkAction("activate")}
            >
              Activate
            </Button>
          </div>
        </div>
      )}

      {/* Edit Screen Inline Card */}
      {editingScreen && (
        <Card className="border-blue-300 bg-blue-50/20">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">
              Edit Display — {editingScreen.name}
            </CardTitle>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => setEditingScreen(null)}
            >
              <X className="size-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleSaveScreenEdit}
              className="grid gap-3 md:grid-cols-3"
            >
              <div className="space-y-1">
                <Label className="text-xs">Display Name</Label>
                <Input
                  className="h-8 text-xs"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Location</Label>
                <ModernSelect
                  size="sm"
                  value={editBranchId}
                  onValueChange={setEditBranchId}
                  options={data.branches.map((b) => ({
                    value: b.id,
                    label: b.name,
                  }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Department</Label>
                <ModernSelect
                  size="sm"
                  value={editDeptId}
                  onValueChange={setEditDeptId}
                  options={[
                    { value: "", label: "General / None" },
                    ...data.departments.map((d) => ({
                      value: d.id,
                      label: d.name,
                    })),
                  ]}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Screen Group</Label>
                <ModernSelect
                  size="sm"
                  value={editGroupId}
                  onValueChange={setEditGroupId}
                  options={[
                    { value: "", label: "Unassigned" },
                    ...data.screenGroups.map((g) => ({
                      value: g.id,
                      label: g.name,
                    })),
                  ]}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Orientation &amp; Display Mode</Label>
                <ModernSelect
                  size="sm"
                  value={editOrientation}
                  onValueChange={setEditOrientation}
                  options={[
                    { value: "landscape_16_9", label: "Landscape (16:9 Standard TV)" },
                    { value: "portrait_9_16", label: "Portrait (9:16 Vertical Totem)" },
                    { value: "portrait_rotate_90", label: "Portrait — Software Rotate 90° CW" },
                    { value: "portrait_rotate_270", label: "Portrait — Software Rotate 270° CCW" },
                    { value: "ultrawide_21_9", label: "Ultrawide Bar (21:9 / Stretched LED)" },
                  ]}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Role</Label>
                <ModernSelect
                  size="sm"
                  value={editRole}
                  onValueChange={setEditRole}
                  options={[
                    { value: "showroom_customer", label: "Showroom Customer" },
                    { value: "reception", label: "Reception" },
                    { value: "factory_floor", label: "Factory / Operations" },
                    { value: "back_office", label: "Back Office" },
                  ]}
                />
              </div>
              <div className="flex items-center justify-end gap-2 md:col-span-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setEditingScreen(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={savingEdit}>
                  {savingEdit ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Scalable Data Table OR Card Grid */}
      {filteredScreens.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-zinc-500">
            No displays match your current filter. Click{" "}
            <strong>Pair Screen</strong> to connect a TV or clear filters.
          </CardContent>
        </Card>
      ) : viewMode === "table" ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-200 bg-zinc-50/80 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="w-9 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds((prev) =>
                            Array.from(
                              new Set([...prev, ...pageScreens.map((s) => s.id)])
                            )
                          );
                        } else {
                          const pageSet = new Set(pageScreens.map((s) => s.id));
                          setSelectedIds((prev) =>
                            prev.filter((id) => !pageSet.has(id))
                          );
                        }
                      }}
                      className="size-3.5 rounded border-zinc-300"
                    />
                  </th>
                  <th className="px-3 py-2.5">Display</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Location &amp; Group</th>
                  <th className="px-3 py-2.5">Assigned Playlist</th>
                  <th className="px-3 py-2.5">Now Playing / Cache</th>
                  <th className="px-3 py-2.5 text-right">Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {pageScreens.map((scr) => {
                  const br = branchById.get(scr.branchId);
                  const grp = scr.groupId ? groupById.get(scr.groupId) : null;
                  const checked = selectedIds.includes(scr.id);
                  return (
                    <tr
                      key={scr.id}
                      className={`transition hover:bg-zinc-50/70 ${checked ? "bg-blue-50/40" : ""
                        }`}
                    >
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setSelectedIds((prev) =>
                              e.target.checked
                                ? [...prev, scr.id]
                                : prev.filter((id) => id !== scr.id)
                            )
                          }
                          className="size-3.5 rounded border-zinc-300"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          {scr.lastSnapshotUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={scr.lastSnapshotUrl}
                              alt={scr.name}
                              className="h-9 w-16 shrink-0 rounded border border-zinc-200 bg-zinc-950 object-cover"
                            />
                          ) : (
                            <span className="flex h-9 w-16 shrink-0 items-center justify-center rounded border border-zinc-200 bg-zinc-100 text-zinc-400">
                              <Monitor className="size-4" />
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-zinc-950">
                              {scr.name}
                            </p>
                            <p className="text-[10px] text-zinc-500">
                              {scr.hardwareType === "android_tv"
                                ? "Android TV"
                                : scr.hardwareType === "other"
                                  ? "Smart TV"
                                  : "Mini PC"}{" "}
                              • {scr.resolution || scr.orientation}
                              {scr.appVersion
                                ? ` • v${scr.appVersion.split("-")[0]}`
                                : ""}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">{renderStatusBadge(scr)}</td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-zinc-800">
                          {br?.name ?? "Unknown"}
                        </p>
                        <div className="mt-0.5 flex items-center gap-1">
                          {grp && (
                            <Badge variant="purple" className="text-[10px]">
                              {grp.name}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="w-44">
                          <ModernSelect
                            size="xs"
                            value={scr.activePlaylistId ?? ""}
                            onValueChange={(v) =>
                              void handlePatchScreen(
                                scr.id,
                                { activePlaylistId: v || null },
                                "Playlist pushed to display"
                              )
                            }
                            options={[
                              { value: "", label: "Unassigned" },
                              ...data.playlists.map((pl) => ({
                                value: pl.id,
                                label: pl.name,
                              })),
                            ]}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-zinc-500">
                        {(() => {
                          const liveStatus =
                            screenLiveHealth.get(scr.id)?.status ?? "offline";
                          const isLiveOnline = liveStatus === "online";
                          return (
                            <>
                              <p
                                className={`max-w-[190px] truncate font-medium ${
                                  isLiveOnline ? "text-zinc-800" : "text-zinc-400"
                                }`}
                              >
                                {isLiveOnline
                                  ? scr.currentItemTitle || "Playing playlist..."
                                  : scr.currentItemTitle
                                    ? `Last: ${scr.currentItemTitle}`
                                    : "Disconnected"}
                              </p>
                              <p>
                                {scr.cachedAssetCount} cached • {scr.storageUsedMb} MB
                              </p>
                            </>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            title="Capture Live Snapshot"
                            onClick={() =>
                              void handleSendCommand(scr.id, "screenshot")
                            }
                          >
                            <Camera className="size-3.5 text-zinc-600" />
                          </Button>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            title="Reload Display (Keeps Fullscreen)"
                            onClick={() =>
                              void handleSendCommand(scr.id, "reload")
                            }
                          >
                            <RefreshCw className="size-3.5 text-zinc-600" />
                          </Button>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            title="Clear Local TV Cache & Re-Sync Media (Keeps Fullscreen)"
                            onClick={() =>
                              void handleSendCommand(scr.id, "clear_cache")
                            }
                          >
                            <Eraser className="size-3.5 text-violet-600" />
                          </Button>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            title={
                              scr.isActive === false
                                ? "Activate Display"
                                : "Pause / Deactivate Display"
                            }
                            onClick={() =>
                              void handlePatchScreen(
                                scr.id,
                                { isActive: scr.isActive === false },
                                scr.isActive === false
                                  ? `Activated "${scr.name}"`
                                  : `Paused "${scr.name}"`
                              )
                            }
                          >
                            {scr.isActive === false ? (
                              <PlayCircle className="size-3.5 text-emerald-600" />
                            ) : (
                              <PauseCircle className="size-3.5 text-amber-600" />
                            )}
                          </Button>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            title="Edit Display"
                            onClick={() => openEditScreen(scr)}
                          >
                            <Edit3 className="size-3.5 text-blue-600" />
                          </Button>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            title="Remove Display"
                            onClick={() => void handleRemoveScreen(scr)}
                          >
                            <Trash2 className="size-3.5 text-rose-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 px-4 py-2.5 text-xs text-zinc-500">
            <span>
              Showing {(safePage - 1) * pageSize + 1}–
              {Math.min(safePage * pageSize, filteredScreens.length)} of{" "}
              {filteredScreens.length} displays
            </span>
            <div className="flex items-center gap-2">
              <div className="w-24">
                <ModernSelect
                  size="xs"
                  value={String(pageSize)}
                  onValueChange={(v) => {
                    setPageSize(Number(v));
                    setPage(1);
                  }}
                  options={[
                    { value: "10", label: "10 / page" },
                    { value: "25", label: "25 / page" },
                    { value: "50", label: "50 / page" },
                    { value: "100", label: "100 / page" },
                  ]}
                />
              </div>
              <Button
                size="icon-xs"
                variant="outline"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <span className="font-mono text-[11px]">
                {safePage} / {totalPages}
              </span>
              <Button
                size="icon-xs"
                variant="outline"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {pageScreens.map((scr) => {
            const br = branchById.get(scr.branchId);
            const grp = scr.groupId ? groupById.get(scr.groupId) : null;
            return (
              <Card key={scr.id} className="overflow-hidden">
                <div className="relative aspect-video w-full border-b border-zinc-200 bg-zinc-950">
                  {scr.lastSnapshotUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={scr.lastSnapshotUrl}
                      alt={scr.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-1.5 text-zinc-500">
                      <Tv className="size-7" />
                      <span className="text-[11px]">No snapshot yet</span>
                    </div>
                  )}
                  <div className="absolute left-3 top-3">
                    {renderStatusBadge(scr, false)}
                  </div>
                  <div className="absolute right-3 top-3 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-xs">
                    {formatAgeLabel(screenLiveHealth.get(scr.id)?.ageSeconds ?? null)}
                  </div>
                </div>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {scr.name}
                      </p>
                      <p className="truncate text-xs text-zinc-500">
                        {br?.name ?? "Unknown"} • {scr.orientation}
                      </p>
                    </div>
                    {grp && <Badge variant="purple">{grp.name}</Badge>}
                  </div>
                  <ModernSelect
                    size="xs"
                    value={scr.activePlaylistId ?? ""}
                    onValueChange={(v) =>
                      void handlePatchScreen(
                        scr.id,
                        { activePlaylistId: v || null },
                        "Playlist assigned"
                      )
                    }
                    options={[
                      { value: "", label: "Unassigned Playlist" },
                      ...data.playlists.map((pl) => ({
                        value: pl.id,
                        label: pl.name,
                      })),
                    ]}
                  />
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() =>
                        void handleSendCommand(scr.id, "screenshot")
                      }
                    >
                      <Camera className="size-3" />
                      Snapshot
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => void handleSendCommand(scr.id, "identify")}
                    >
                      Identify
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => void handleSendCommand(scr.id, "reload")}
                    >
                      Reload
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() =>
                        void handleSendCommand(scr.id, "clear_cache")
                      }
                    >
                      Clear Cache
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => openEditScreen(scr)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      className="ml-auto text-rose-600"
                      onClick={() => void handleRemoveScreen(scr)}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
