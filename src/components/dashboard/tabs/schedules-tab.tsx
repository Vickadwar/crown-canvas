"use client";

/**
 * @file src/components/dashboard/tabs/schedules-tab.tsx
 * @description Polished Daypart Scheduling UI with Day-of-Week pills, time-window
 * visual cards, priority & target scope badges, Pause/Resume toggle, and Delete.
 */

import { useMemo, useState } from "react";
import {
  CalendarClock,
  Clock,
  PauseCircle,
  PlayCircle,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModernSelect } from "@/components/ui/select";
import type { OverviewPayload, ScheduleItem } from "../cms-types";

interface SchedulesTabProps {
  data: OverviewPayload;
  onRefresh: () => Promise<void>;
}

const DAY_LABELS = [
  { idx: 1, short: "Mon" },
  { idx: 2, short: "Tue" },
  { idx: 3, short: "Wed" },
  { idx: 4, short: "Thu" },
  { idx: 5, short: "Fri" },
  { idx: 6, short: "Sat" },
  { idx: 0, short: "Sun" },
];

export function SchedulesTab({ data, onRefresh }: SchedulesTabProps) {
  const [showCreate, setShowCreate] = useState(data.schedules.length === 0);
  const [name, setName] = useState("");
  const [playlistId, setPlaylistId] = useState(data.playlists[0]?.id ?? "");
  const [targetType, setTargetType] = useState<ScheduleItem["targetType"]>("global");
  const [targetId, setTargetId] = useState("");
  const [targetScreenRole, setTargetScreenRole] = useState("showroom_customer");
  const [priority, setPriority] = useState(20);
  const [daypartStart, setDaypartStart] = useState("08:00");
  const [daypartEnd, setDaypartEnd] = useState("17:30");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [saving, setSaving] = useState(false);

  const playlistById = useMemo(
    () => new Map(data.playlists.map((p) => [p.id, p])),
    [data.playlists]
  );
  const branchById = useMemo(
    () => new Map(data.branches.map((b) => [b.id, b])),
    [data.branches]
  );
  const screenById = useMemo(
    () => new Map(data.screens.map((s) => [s.id, s])),
    [data.screens]
  );
  const groupById = useMemo(
    () => new Map(data.screenGroups.map((g) => [g.id, g])),
    [data.screenGroups]
  );
  const countryById = useMemo(
    () => new Map(data.countries.map((c) => [c.id, c])),
    [data.countries]
  );

  function resolveTargetLabel(s: ScheduleItem): string {
    if (s.targetType === "global") return "All Displays";
    if (s.targetType === "screen_role")
      return `Role: ${(s.targetScreenRole ?? "showroom").replace("_", " ")}`;
    if (s.targetType === "branch" && s.targetId)
      return `Location: ${branchById.get(s.targetId)?.name ?? "Location"}`;
    if (s.targetType === "screen_group" && s.targetId)
      return `Group: ${groupById.get(s.targetId)?.name ?? "Group"}`;
    if (s.targetType === "screen" && s.targetId)
      return `Display: ${screenById.get(s.targetId)?.name ?? "Display"}`;
    if (s.targetType === "country" && s.targetId)
      return `Region: ${countryById.get(s.targetId)?.name ?? "Region"}`;
    return s.targetType;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !playlistId) {
      toast.error("Provide a schedule name and playlist.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          playlistId,
          targetType,
          targetId:
            targetType === "global" || targetType === "screen_role"
              ? null
              : targetId || null,
          targetScreenRole:
            targetType === "screen_role" ? targetScreenRole : null,
          priority,
          daysOfWeek,
          daypartStart,
          daypartEnd,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error || "Could not create schedule");
        return;
      }
      toast.success(`Schedule "${name.trim()}" activated`);
      setName("");
      setShowCreate(false);
      await onRefresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(s: ScheduleItem) {
    const res = await fetch(`/api/schedules/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !s.isActive }),
    });
    if (!res.ok) {
      toast.error("Failed to toggle schedule");
      return;
    }
    toast.success(s.isActive ? `Paused "${s.name}"` : `Resumed "${s.name}"`);
    await onRefresh();
  }

  async function handleDelete(s: ScheduleItem) {
    if (!window.confirm(`Delete schedule "${s.name}"?`)) return;
    const res = await fetch(`/api/schedules/${s.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete schedule");
      return;
    }
    toast.success(`Deleted "${s.name}"`);
    await onRefresh();
  }

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-950">
              Daypart &amp; Priority Schedules
            </h2>
            <p className="text-xs text-zinc-500">
              Automatically switch playlists by time of day, day of week, location, group, or screen role.
            </p>
          </div>
          <Badge variant="info">{data.schedules.length} Rules</Badge>
        </div>
        <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
          <Plus className="size-3.5" />
          New Schedule
        </Button>
      </div>

      {/* Collapsible Create Form */}
      {showCreate && (
        <Card className="border-blue-300">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Create Daypart Schedule</CardTitle>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => setShowCreate(false)}
            >
              <X className="size-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-12">
              <div className="space-y-1 md:col-span-4">
                <Label className="text-xs">Schedule Name</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="e.g. Morning Showroom Promos"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1 md:col-span-4">
                <Label className="text-xs">Playlist to Air</Label>
                <ModernSelect
                  size="sm"
                  value={playlistId}
                  onValueChange={setPlaylistId}
                  options={data.playlists.map((p) => ({
                    value: p.id,
                    label: p.name,
                  }))}
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label className="text-xs">Start Time</Label>
                <Input
                  type="time"
                  className="h-8 text-xs"
                  value={daypartStart}
                  onChange={(e) => setDaypartStart(e.target.value)}
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label className="text-xs">End Time</Label>
                <Input
                  type="time"
                  className="h-8 text-xs"
                  value={daypartEnd}
                  onChange={(e) => setDaypartEnd(e.target.value)}
                />
              </div>

              <div className="space-y-1 md:col-span-3">
                <Label className="text-xs">Target Scope</Label>
                <ModernSelect
                  size="sm"
                  value={targetType}
                  onValueChange={(v) => {
                    setTargetType(v as ScheduleItem["targetType"]);
                    setTargetId("");
                  }}
                  options={[
                    { value: "global", label: "All Displays (Global)" },
                    { value: "branch", label: "Specific Location" },
                    { value: "screen_group", label: "Screen Group" },
                    { value: "screen", label: "Single Display" },
                    { value: "screen_role", label: "Display Role" },
                    { value: "country", label: "Operating Region" },
                  ]}
                />
              </div>

              {targetType === "branch" && (
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
              {targetType === "screen_group" && (
                <div className="space-y-1 md:col-span-3">
                  <Label className="text-xs">Screen Group</Label>
                  <ModernSelect
                    size="sm"
                    value={targetId}
                    onValueChange={setTargetId}
                    options={data.screenGroups.map((g) => ({
                      value: g.id,
                      label: g.name,
                    }))}
                  />
                </div>
              )}
              {targetType === "screen" && (
                <div className="space-y-1 md:col-span-3">
                  <Label className="text-xs">Display</Label>
                  <ModernSelect
                    size="sm"
                    value={targetId}
                    onValueChange={setTargetId}
                    options={data.screens.map((s) => ({
                      value: s.id,
                      label: s.name,
                    }))}
                  />
                </div>
              )}
              {targetType === "country" && (
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
              {targetType === "screen_role" && (
                <div className="space-y-1 md:col-span-3">
                  <Label className="text-xs">Role</Label>
                  <ModernSelect
                    size="sm"
                    value={targetScreenRole}
                    onValueChange={setTargetScreenRole}
                    options={[
                      { value: "showroom_customer", label: "Showroom Customer" },
                      { value: "reception", label: "Reception" },
                      { value: "factory_floor", label: "Factory / Operations" },
                      { value: "back_office", label: "Back Office" },
                    ]}
                  />
                </div>
              )}

              <div className="space-y-1 md:col-span-2">
                <Label className="text-xs">Priority (1–999)</Label>
                <Input
                  type="number"
                  min={1}
                  max={999}
                  className="h-8 font-mono text-xs"
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value) || 10)}
                />
              </div>

              <div className="space-y-1 md:col-span-4">
                <Label className="text-xs">Active Days</Label>
                <div className="flex flex-wrap gap-1">
                  {DAY_LABELS.map((d) => {
                    const active = daysOfWeek.includes(d.idx);
                    return (
                      <button
                        key={d.idx}
                        type="button"
                        onClick={() =>
                          setDaysOfWeek((prev) =>
                            active
                              ? prev.filter((x) => x !== d.idx)
                              : [...prev, d.idx]
                          )
                        }
                        className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
                          active
                            ? "bg-zinc-950 text-white"
                            : "border border-zinc-200 bg-white text-zinc-500"
                        }`}
                      >
                        {d.short}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-end justify-end gap-2 md:col-span-12">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving}>
                  <CalendarClock className="size-3.5" />
                  {saving ? "Saving..." : "Activate Schedule"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Schedule Cards */}
      {data.schedules.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-zinc-500">
            No daypart schedules created yet. Displays will run their default assigned playlist until a schedule matches.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.schedules.map((sch) => {
            const pl = playlistById.get(sch.playlistId);
            const activeDays = sch.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6];
            return (
              <Card key={sch.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-zinc-950">
                          {sch.name}
                        </p>
                        <Badge variant={sch.isActive ? "success" : "secondary"}>
                          {sch.isActive ? "Active" : "Paused"}
                        </Badge>
                        <Badge variant="purple" className="font-mono text-[10px]">
                          P{sch.priority}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">
                        Playlist:{" "}
                        <strong className="text-zinc-800">
                          {pl?.name ?? "Unknown"}
                        </strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        title={sch.isActive ? "Pause Schedule" : "Resume Schedule"}
                        onClick={() => void handleToggle(sch)}
                      >
                        {sch.isActive ? (
                          <PauseCircle className="size-4 text-amber-600" />
                        ) : (
                          <PlayCircle className="size-4 text-emerald-600" />
                        )}
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        title="Delete Schedule"
                        onClick={() => void handleDelete(sch)}
                      >
                        <Trash2 className="size-3.5 text-rose-500" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-100 bg-zinc-50/70 px-3 py-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-zinc-800">
                      <Clock className="size-3.5 text-blue-600" />
                      {sch.daypartStart} – {sch.daypartEnd}
                    </span>
                    <Badge variant="info">{resolveTargetLabel(sch)}</Badge>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {DAY_LABELS.map((d) => {
                      const on = activeDays.includes(d.idx);
                      return (
                        <span
                          key={d.idx}
                          className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                            on
                              ? "bg-zinc-900 text-white"
                              : "bg-zinc-100 text-zinc-400"
                          }`}
                        >
                          {d.short}
                        </span>
                      );
                    })}
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
