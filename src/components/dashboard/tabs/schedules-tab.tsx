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
  Edit3,
  PauseCircle,
  PlayCircle,
  Plus,
  Repeat,
  Sparkles,
  Trash2,
  Tv,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { ScheduleRotationStep } from "@/db/schema";
import { buildDailyBroadcastTimeline } from "@/lib/schedule-resolver";
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
import { useConfirm } from "@/components/ui/confirm-dialog";
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

const DAYPART_PRESETS = [
  {
    label: "Mon–Fri (08:00–18:00)",
    days: [1, 2, 3, 4, 5],
    start: "08:00",
    end: "18:00",
  },
  {
    label: "Saturday Half-Day (08:00–13:00)",
    days: [6],
    start: "08:00",
    end: "13:00",
  },
  {
    label: "Saturday Extended (08:00–14:00)",
    days: [6],
    start: "08:00",
    end: "14:00",
  },
  {
    label: "Morning Shift (08:00–12:00)",
    days: [1, 2, 3, 4, 5, 6],
    start: "08:00",
    end: "12:00",
  },
  {
    label: "Afternoon Shift (12:00–18:00)",
    days: [1, 2, 3, 4, 5],
    start: "12:00",
    end: "18:00",
  },
];

export function SchedulesTab({ data, onRefresh }: SchedulesTabProps) {
  const confirm = useConfirm();
  const [showCreate, setShowCreate] = useState(data.schedules.length === 0);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [playlistId, setPlaylistId] = useState(data.playlists[0]?.id ?? "");
  const [targetType, setTargetType] = useState<ScheduleItem["targetType"]>("global");
  const [targetId, setTargetId] = useState("");
  const [targetScreenRole, setTargetScreenRole] = useState("showroom_customer");
  const [priority, setPriority] = useState(20);
  const [daypartStart, setDaypartStart] = useState("08:00");
  const [daypartEnd, setDaypartEnd] = useState("18:00");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5]);
  const [rotationSteps, setRotationSteps] = useState<ScheduleRotationStep[]>([]);
  const [saving, setSaving] = useState(false);

  // 24-Hour Screen Broadcast Timeline preview selectors
  const [timelineScreenId, setTimelineScreenId] = useState(
    data.screens[0]?.id ?? ""
  );
  const [timelineDay, setTimelineDay] = useState<number>(1);

  function resetScheduleForm() {
    setEditingScheduleId(null);
    setName("");
    setPlaylistId(data.playlists[0]?.id ?? "");
    setTargetType("global");
    setTargetId("");
    setTargetScreenRole("showroom_customer");
    setPriority(20);
    setDaypartStart("08:00");
    setDaypartEnd("18:00");
    setDaysOfWeek([1, 2, 3, 4, 5]);
    setRotationSteps([]);
  }

  function startEditSchedule(sch: ScheduleItem) {
    setEditingScheduleId(sch.id);
    setName(sch.name);
    setPlaylistId(sch.playlistId);
    setTargetType(sch.targetType);
    setTargetId(sch.targetId ?? "");
    setTargetScreenRole(sch.targetScreenRole ?? "showroom_customer");
    setPriority(sch.priority);
    setDaypartStart(sch.daypartStart || "08:00");
    setDaypartEnd(sch.daypartEnd || "18:00");
    setDaysOfWeek(
      sch.daysOfWeek && sch.daysOfWeek.length > 0
        ? sch.daysOfWeek
        : [1, 2, 3, 4, 5]
    );
    setRotationSteps(sch.rotationSequence ?? []);
    setShowCreate(true);
  }

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

  async function handleSaveSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !playlistId) {
      toast.error("Provide a schedule name and playlist.");
      return;
    }
    if (daysOfWeek.length === 0) {
      toast.error("Select at least one active day of the week.");
      return;
    }
    setSaving(true);
    try {
      const url = editingScheduleId
        ? `/api/schedules/${editingScheduleId}`
        : "/api/schedules";
      const method = editingScheduleId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
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
          rotationSequence: rotationSteps.length > 0 ? rotationSteps : null,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error || "Could not save schedule");
        return;
      }
      toast.success(
        editingScheduleId
          ? `Schedule "${name.trim()}" updated`
          : `Schedule "${name.trim()}" activated`
      );
      resetScheduleForm();
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
    const ok = await confirm({
      title: `Delete schedule "${s.name}"?`,
      description:
        "This removes the daypart automation rule permanently. Screens will resume their default playlists.",
      confirmLabel: "Delete Schedule",
      variant: "danger",
    });
    if (!ok) return;
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
        <Button
          size="sm"
          onClick={() => {
            if (showCreate && editingScheduleId) {
              resetScheduleForm();
              return;
            }
            resetScheduleForm();
            setShowCreate((v) => !v);
          }}
        >
          <Plus className="size-3.5" />
          New Schedule
        </Button>
      </div>

      {/* Collapsible Create / Edit Form */}
      {showCreate && (
        <Card className="border-blue-300">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">
              {editingScheduleId ? "Edit Daypart Schedule" : "Create Daypart Schedule"}
            </CardTitle>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => {
                resetScheduleForm();
                setShowCreate(false);
              }}
            >
              <X className="size-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 1-Click Daypart Presets */}
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-zinc-200/80 bg-zinc-50 px-3 py-2">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-600">
                <Sparkles className="size-3 text-blue-600" />
                Quick Presets:
              </span>
              {DAYPART_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setDaysOfWeek(preset.days);
                    setDaypartStart(preset.start);
                    setDaypartEnd(preset.end);
                    if (!name.trim()) setName(preset.label);
                  }}
                  className="rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 text-[10px] font-semibold text-zinc-700 transition hover:border-blue-400 hover:text-blue-700"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSaveSchedule} className="grid gap-4 md:grid-cols-12">
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
                        className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${active
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

              {/* Chained Sequential Rotation Loop (Playlist A -> Promotions -> Playlist B -> Loop) */}
              <div className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 md:col-span-12">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900">
                      <Repeat className="size-3.5 text-blue-600" />
                      Sequential Playlist &amp; Promotions Loop (Optional)
                    </Label>
                    <p className="text-[11px] text-zinc-500">
                      Chain multiple playlists, targeted Promotions, and Employee Spotlights back-to-back during this daypart window — transitions seamlessly in fullscreen!
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() =>
                        setRotationSteps((prev) => [
                          ...prev,
                          {
                            kind: "playlist",
                            playlistId: playlistId || data.playlists[0]?.id || null,
                            label:
                              playlistById.get(playlistId || data.playlists[0]?.id || "")
                                ?.name || "Playlist",
                            durationMinutes: 15,
                          },
                        ])
                      }
                    >
                      <Plus className="size-3" />
                      Add Playlist Step
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() =>
                        setRotationSteps((prev) => [
                          ...prev,
                          {
                            kind: "promotions",
                            playlistId: null,
                            label: "Active Promotions",
                            durationMinutes: 5,
                          },
                        ])
                      }
                    >
                      <Plus className="size-3 text-amber-600" />
                      Add Promotions Block
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() =>
                        setRotationSteps((prev) => [
                          ...prev,
                          {
                            kind: "recognitions",
                            playlistId: null,
                            label: "Employee Spotlights",
                            durationMinutes: 3,
                          },
                        ])
                      }
                    >
                      <Plus className="size-3 text-violet-600" />
                      Add Employee Spotlight
                    </Button>
                  </div>
                </div>

                {rotationSteps.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {rotationSteps.map((step, idx) => (
                      <div
                        key={idx}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs"
                      >
                        <Badge variant="outline" className="font-mono text-[10px]">
                          #{idx + 1}
                        </Badge>
                        {step.kind === "playlist" ? (
                          <select
                            value={step.playlistId ?? ""}
                            onChange={(e) => {
                              const nextPlId = e.target.value;
                              const nextName =
                                playlistById.get(nextPlId)?.name ?? "Playlist";
                              setRotationSteps((prev) =>
                                prev.map((s, i) =>
                                  i === idx
                                    ? { ...s, playlistId: nextPlId, label: nextName }
                                    : s
                                )
                              );
                            }}
                            className="h-7 min-w-[180px] flex-1 rounded-md border border-zinc-200 bg-white px-2 text-xs"
                          >
                            {data.playlists.map((pl) => (
                              <option key={pl.id} value={pl.id}>
                                Playlist: {pl.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="flex-1 font-semibold text-zinc-800">
                            {step.kind === "promotions"
                              ? "Targeted Active Promotions Block"
                              : "Employee of the Month / Quarter / Year Spotlights"}
                          </span>
                        )}
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] text-zinc-500">Air for</span>
                          <Input
                            type="number"
                            min={1}
                            max={720}
                            className="h-7 w-16 text-center font-mono text-xs"
                            value={step.durationMinutes}
                            onChange={(e) =>
                              setRotationSteps((prev) =>
                                prev.map((s, i) =>
                                  i === idx
                                    ? {
                                        ...s,
                                        durationMinutes: Math.max(
                                          1,
                                          Number(e.target.value) || 5
                                        ),
                                      }
                                    : s
                                )
                              )
                            }
                          />
                          <span className="text-[11px] text-zinc-500">min</span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setRotationSteps((prev) =>
                              prev.filter((_, i) => i !== idx)
                            )
                          }
                          className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-rose-500"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-end justify-end gap-2 md:col-span-12">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    resetScheduleForm();
                    setShowCreate(false);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving}>
                  <CalendarClock className="size-3.5" />
                  {saving
                    ? "Saving..."
                    : editingScheduleId
                      ? "Update Schedule"
                      : "Activate Schedule"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Interactive 24-Hour Screen Broadcast Timeline Visualizer */}
      {data.screens.length > 0 && (() => {
        const selectedScreen =
          data.screens.find((s) => s.id === timelineScreenId) ?? data.screens[0];
        const branch = branchById.get(selectedScreen.branchId);
        const country = branch ? countryById.get(branch.countryId) : undefined;
        const scheduleRecords = data.schedules.map((s) => ({
          id: s.id,
          name: s.name,
          playlistId: s.playlistId,
          targetType: s.targetType,
          targetId: s.targetId,
          targetScreenRole: s.targetScreenRole,
          priority: s.priority,
          startDate: null,
          endDate: null,
          daysOfWeek: s.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6],
          daypartStart: s.daypartStart,
          daypartEnd: s.daypartEnd,
          rotationSequence: s.rotationSequence ?? null,
          isActive: s.isActive,
        }));
        const timelineSlots = buildDailyBroadcastTimeline(
          scheduleRecords,
          {
            screenId: selectedScreen.id,
            branchId: selectedScreen.branchId,
            countryId: branch?.countryId ?? null,
            groupId: selectedScreen.groupId ?? null,
            screenRole: selectedScreen.screenRole,
            timezone: country?.timezone ?? "Africa/Nairobi",
          },
          timelineDay
        );

        return (
          <Card className="border-zinc-200 bg-white">
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Tv className="size-4 text-blue-600" />
                  <p className="text-xs font-semibold text-zinc-950">
                    24-Hour Screen Broadcast Preview
                  </p>
                  <span className="text-[11px] text-zinc-500">
                    (Verify what plays at every hour)
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="w-52">
                    <ModernSelect
                      size="xs"
                      value={selectedScreen.id}
                      onValueChange={setTimelineScreenId}
                      options={data.screens.map((s) => ({
                        value: s.id,
                        label: s.name,
                      }))}
                    />
                  </div>
                  <div className="flex gap-1">
                    {DAY_LABELS.map((d) => (
                      <button
                        key={d.idx}
                        type="button"
                        onClick={() => setTimelineDay(d.idx)}
                        className={`rounded px-2 py-1 text-[10px] font-semibold ${
                          timelineDay === d.idx
                            ? "bg-zinc-950 text-white"
                            : "border border-zinc-200 bg-white text-zinc-500"
                        }`}
                      >
                        {d.short}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-12 gap-1 sm:grid-cols-24">
                {timelineSlots.map((slot) => {
                  const plName = slot.playlistId
                    ? playlistById.get(slot.playlistId)?.name
                    : null;
                  return (
                    <div
                      key={slot.hour}
                      title={`${slot.label} — ${
                        slot.scheduleName
                          ? `${slot.scheduleName} (${plName ?? "Playlist"})${slot.hasRotation ? " • Chained Loop" : ""}`
                          : "Default Assigned Playlist"
                      }`}
                      className={`flex flex-col items-center justify-center rounded-md border py-1.5 text-center ${
                        slot.hasRotation
                          ? "border-violet-300 bg-violet-100 text-violet-900"
                          : slot.scheduleName
                            ? "border-blue-300 bg-blue-100 text-blue-900"
                            : "border-zinc-200 bg-zinc-50 text-zinc-400"
                      }`}
                    >
                      <span className="font-mono text-[9px] font-bold">
                        {String(slot.hour).padStart(2, "0")}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-4 text-[10px] text-zinc-500">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-blue-200 ring-1 ring-blue-300" />
                  Scheduled Daypart Playlist
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-violet-200 ring-1 ring-violet-300" />
                  Chained Playlist / Promotions Loop
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-zinc-100 ring-1 ring-zinc-300" />
                  Default Screen Playlist (Hover any hour for details)
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })()}

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
                      {sch.rotationSequence && sch.rotationSequence.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          <Badge variant="info" className="text-[10px]">
                            <Repeat className="size-2.5" />
                            Loop:
                          </Badge>
                          {sch.rotationSequence.map((st, i) => (
                            <span
                              key={i}
                              className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700"
                            >
                              {st.label || st.kind} ({st.durationMinutes}m)
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        title="Edit Schedule"
                        onClick={() => startEditSchedule(sch)}
                      >
                        <Edit3 className="size-3.5 text-blue-600" />
                      </Button>
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
                          className={`rounded px-2 py-0.5 text-[10px] font-medium ${on
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
