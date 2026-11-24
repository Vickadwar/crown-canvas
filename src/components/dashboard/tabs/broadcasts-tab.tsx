"use client";

/**
 * @file src/components/dashboard/tabs/broadcasts-tab.tsx
 * @description 3-Mode Emergency Broadcasts console: trigger instant screen takeovers
 * from Scratch (Custom Alert), a Media Clip (Video/Image), or a Full Playlist,
 * with live TV preview, targeting, active broadcast monitoring, and 1-click End Broadcast.
 */

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Film,
  ListVideo,
  MessageSquareWarning,
  Radio,
  StopCircle,
  Trash2,
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
import { Textarea } from "@/components/ui/textarea";
import { ModernSelect } from "@/components/ui/select";
import type { OverrideItem, OverviewPayload } from "../cms-types";

interface BroadcastsTabProps {
  data: OverviewPayload;
  onRefresh: () => Promise<void>;
}

export function BroadcastsTab({ data, onRefresh }: BroadcastsTabProps) {
  const [overrideKind, setOverrideKind] = useState<
    "alert" | "media_asset" | "playlist"
  >("alert");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState<"info" | "warning" | "critical">(
    "critical"
  );
  const [mediaAssetId, setMediaAssetId] = useState(
    data.mediaAssets[0]?.id ?? ""
  );
  const [playlistId, setPlaylistId] = useState(data.playlists[0]?.id ?? "");
  const [targetType, setTargetType] = useState<
    "global" | "branch" | "screen_group" | "screen"
  >("global");
  const [targetId, setTargetId] = useState("");
  const [targetScreenIds, setTargetScreenIds] = useState<string[]>([]);
  const [screenSearch, setScreenSearch] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [customDurationValue, setCustomDurationValue] = useState("45");
  const [customDurationUnit, setCustomDurationUnit] = useState<
    "minutes" | "hours" | "days"
  >("minutes");
  const [sending, setSending] = useState(false);

  const screenById = useMemo(
    () => new Map(data.screens.map((s) => [s.id, s])),
    [data.screens]
  );
  const branchById = useMemo(
    () => new Map(data.branches.map((b) => [b.id, b])),
    [data.branches]
  );

  const mediaById = useMemo(
    () => new Map(data.mediaAssets.map((m) => [m.id, m])),
    [data.mediaAssets]
  );
  const playlistById = useMemo(
    () => new Map(data.playlists.map((p) => [p.id, p])),
    [data.playlists]
  );

  const activeBroadcasts = useMemo(
    () =>
      data.overrides.filter(
        (o) =>
          o.isActive && (!o.expiresAt || new Date(o.expiresAt) > new Date())
      ),
    [data.overrides]
  );

  const pastBroadcasts = useMemo(
    () =>
      data.overrides.filter(
        (o) =>
          !o.isActive || (o.expiresAt && new Date(o.expiresAt) <= new Date())
      ),
    [data.overrides]
  );

  async function handleTrigger(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Provide a broadcast title.");
      return;
    }
    if (overrideKind === "alert" && message.trim().length < 2) {
      toast.error("Provide an alert message.");
      return;
    }
    if (overrideKind === "media_asset" && !mediaAssetId) {
      toast.error("Select a video or image clip.");
      return;
    }
    if (overrideKind === "playlist" && !playlistId) {
      toast.error("Select a playlist for emergency takeover.");
      return;
    }

    if (targetType === "screen" && targetScreenIds.length === 0) {
      toast.error("Select at least one display to target.");
      return;
    }

    let computedMinutes: number | null = null;
    if (durationMinutes === "custom") {
      const val = Math.max(1, Number(customDurationValue) || 1);
      const mult =
        customDurationUnit === "days"
          ? 1440
          : customDurationUnit === "hours"
            ? 60
            : 1;
      computedMinutes = Math.min(43200, Math.round(val * mult));
    } else if (durationMinutes !== "0") {
      computedMinutes = Number(durationMinutes) || 30;
    }

    setSending(true);
    try {
      const res = await fetch("/api/overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim(),
          overrideKind,
          mediaAssetId: overrideKind === "media_asset" ? mediaAssetId : null,
          playlistId: overrideKind === "playlist" ? playlistId : null,
          severity,
          targetType,
          targetId:
            targetType === "global" || targetType === "screen"
              ? targetType === "screen" && targetScreenIds.length === 1
                ? targetScreenIds[0]
                : null
              : targetId || null,
          targetScreenIds:
            targetType === "screen" ? targetScreenIds : null,
          durationMinutes: computedMinutes,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error || "Could not launch emergency broadcast");
        return;
      }
      toast.success("Emergency broadcast pushed live to target displays (< 2s)");
      setTitle("");
      setMessage("");
      await onRefresh();
    } finally {
      setSending(false);
    }
  }

  async function handleEndBroadcast(ov: OverrideItem) {
    const res = await fetch(`/api/overrides/${ov.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    });
    if (!res.ok) {
      toast.error("Failed to end broadcast");
      return;
    }
    toast.success(`Ended "${ov.title}" — displays restored to normal schedules`);
    await onRefresh();
  }

  async function handleDeleteBroadcast(ov: OverrideItem) {
    const res = await fetch(`/api/overrides/${ov.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete broadcast record");
      return;
    }
    toast.success("Removed broadcast log");
    await onRefresh();
  }

  const previewBg =
    severity === "critical"
      ? "bg-rose-950 text-rose-50"
      : severity === "warning"
        ? "bg-amber-950 text-amber-50"
        : "bg-blue-950 text-blue-50";

  return (
    <div className="space-y-6">
      {/* Live Active Broadcasts Strip */}
      {activeBroadcasts.length > 0 && (
        <Card className="border-rose-300 bg-rose-50/40">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-rose-900">
              <span className="size-2.5 animate-pulse rounded-full bg-rose-600" />
              Active Live Broadcasts ({activeBroadcasts.length})
            </CardTitle>
            <CardDescription className="text-rose-700">
              These overrides are currently taking over targeted displays in real time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {activeBroadcasts.map((ov) => (
              <div
                key={ov.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-white p-3.5 shadow-2xs"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        ov.severity === "critical"
                          ? "danger"
                          : ov.severity === "warning"
                            ? "warning"
                            : "info"
                      }
                    >
                      {ov.severity.toUpperCase()}
                    </Badge>
                    <Badge variant="purple">
                      {ov.overrideKind === "media_asset"
                        ? "Media Clip"
                        : ov.overrideKind === "playlist"
                          ? "Playlist Takeover"
                          : "Custom Alert"}
                    </Badge>
                    <span className="text-sm font-semibold text-zinc-950">
                      {ov.title}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500">
                    {ov.overrideKind === "media_asset" && ov.mediaAssetId
                      ? `Playing clip: ${mediaById.get(ov.mediaAssetId)?.title ?? "Media Asset"}`
                      : ov.overrideKind === "playlist" && ov.playlistId
                        ? `Running playlist: ${playlistById.get(ov.playlistId)?.name ?? "Playlist"}`
                        : ov.message}
                    {" • "}
                    {ov.targetType === "screen" &&
                      Array.isArray(ov.targetScreenIds) &&
                      ov.targetScreenIds.length > 0
                      ? `Targets: ${ov.targetScreenIds
                        .map((id) => screenById.get(id)?.name ?? "Display")
                        .slice(0, 3)
                        .join(", ")}${ov.targetScreenIds.length > 3 ? ` +${ov.targetScreenIds.length - 3} more` : ""}`
                      : ov.targetType === "global"
                        ? "All Paired Displays"
                        : `Target: ${ov.targetType}`}
                    {" • "}
                    {ov.expiresAt
                      ? `Expires ${new Date(ov.expiresAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
                      : "Active until manually cleared"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => void handleEndBroadcast(ov)}
                >
                  <StopCircle className="size-3.5" />
                  End Broadcast Now
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 3-Mode Emergency Broadcast Composer */}
      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Radio className="size-4 text-rose-600" />
              Launch Instant Broadcast Takeover
            </CardTitle>
            <CardDescription>
              Interrupt displays in under 2 seconds with a custom alert, a video/image clip, or a full emergency playlist.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 3-Mode Selector */}
            <div className="grid grid-cols-3 gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-1">
              {(
                [
                  {
                    id: "alert",
                    label: "Custom Alert",
                    icon: MessageSquareWarning,
                  },
                  { id: "media_asset", label: "Media Clip", icon: Film },
                  { id: "playlist", label: "Full Playlist", icon: ListVideo },
                ] as const
              ).map((m) => {
                const Icon = m.icon;
                const active = overrideKind === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setOverrideKind(m.id)}
                    className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${active
                        ? "bg-zinc-950 text-white shadow-2xs"
                        : "text-zinc-600 hover:bg-white hover:text-zinc-950"
                      }`}
                  >
                    <Icon className="size-3.5" />
                    {m.label}
                  </button>
                );
              })}
            </div>

            <form onSubmit={handleTrigger} className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1 md:col-span-2">
                  <Label className="text-xs">Broadcast Title</Label>
                  <Input
                    className="h-8 text-xs"
                    placeholder={
                      overrideKind === "alert"
                        ? "e.g. Fire Drill Assembly Notice"
                        : overrideKind === "media_asset"
                          ? "e.g. CEO Special Announcement Video"
                          : "e.g. Urgent Flash Campaign Takeover"
                    }
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Severity Level</Label>
                  <ModernSelect
                    size="sm"
                    value={severity}
                    onValueChange={(v) =>
                      setSeverity(v as "info" | "warning" | "critical")
                    }
                    options={[
                      { value: "critical", label: "Critical (Red)" },
                      { value: "warning", label: "Warning (Amber)" },
                      { value: "info", label: "Info (Blue)" },
                    ]}
                  />
                </div>
              </div>

              {overrideKind === "alert" && (
                <div className="space-y-1">
                  <Label className="text-xs">Full-Screen Alert Message</Label>
                  <Textarea
                    rows={3}
                    className="text-xs"
                    placeholder="Clear instructions or urgent message to display across targeted screens..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                  />
                </div>
              )}

              {overrideKind === "media_asset" && (
                <div className="space-y-1">
                  <Label className="text-xs">
                    Select Video or Image Clip from Media Library
                  </Label>
                  <ModernSelect
                    size="sm"
                    value={mediaAssetId}
                    onValueChange={setMediaAssetId}
                    options={data.mediaAssets.map((a) => ({
                      value: a.id,
                      label: `${a.title} (${a.mediaType})`,
                    }))}
                  />
                </div>
              )}

              {overrideKind === "playlist" && (
                <div className="space-y-1">
                  <Label className="text-xs">
                    Select Playlist for Immediate Takeover
                  </Label>
                  <ModernSelect
                    size="sm"
                    value={playlistId}
                    onValueChange={setPlaylistId}
                    options={data.playlists.map((p) => ({
                      value: p.id,
                      label: `${p.name} (${p.items.length} items)`,
                    }))}
                  />
                </div>
              )}

              {/* Target & Duration */}
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">Target Displays</Label>
                  <ModernSelect
                    size="sm"
                    value={targetType}
                    onValueChange={(v) => {
                      setTargetType(v as typeof targetType);
                      setTargetId("");
                    }}
                    options={[
                      { value: "global", label: "All Paired Displays" },
                      { value: "screen", label: "Specific Displays (Multi-Select)" },
                      { value: "branch", label: "Specific Location" },
                      { value: "screen_group", label: "Screen Group" },
                    ]}
                  />
                </div>

                {targetType === "branch" && (
                  <div className="space-y-1">
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
                  <div className="space-y-1">
                    <Label className="text-xs">Group</Label>
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

                <div className="space-y-1">
                  <Label className="text-xs">Auto-Expire After</Label>
                  <ModernSelect
                    size="sm"
                    value={durationMinutes}
                    onValueChange={setDurationMinutes}
                    options={[
                      { value: "15", label: "15 Minutes" },
                      { value: "30", label: "30 Minutes" },
                      { value: "60", label: "1 Hour" },
                      { value: "240", label: "4 Hours" },
                      { value: "custom", label: "Custom Duration..." },
                      { value: "0", label: "Until Manually Cleared" },
                    ]}
                  />
                </div>
              </div>

              {/* Custom Expiry Duration Controls */}
              {durationMinutes === "custom" && (
                <div className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Custom Duration Value</Label>
                    <Input
                      type="number"
                      min={1}
                      max={customDurationUnit === "days" ? 30 : customDurationUnit === "hours" ? 720 : 43200}
                      className="h-8 bg-white text-xs"
                      value={customDurationValue}
                      onChange={(e) => setCustomDurationValue(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Unit</Label>
                    <ModernSelect
                      size="sm"
                      value={customDurationUnit}
                      onValueChange={(v) =>
                        setCustomDurationUnit(v as "minutes" | "hours" | "days")
                      }
                      options={[
                        { value: "minutes", label: "Minutes" },
                        { value: "hours", label: "Hours" },
                        { value: "days", label: "Days (up to 30)" },
                      ]}
                    />
                  </div>
                </div>
              )}

              {/* Multi-Screen Target Picker */}
              {targetType === "screen" && (
                <div className="space-y-2.5 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label className="text-xs font-semibold text-zinc-800">
                      Select Specific Displays ({targetScreenIds.length} selected)
                    </Label>
                    <div className="flex items-center gap-1.5">
                      <Input
                        className="h-7 w-40 bg-white text-xs"
                        placeholder="Filter screens..."
                        value={screenSearch}
                        onChange={(e) => setScreenSearch(e.target.value)}
                      />
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() =>
                          setTargetScreenIds(data.screens.map((s) => s.id))
                        }
                      >
                        All
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        onClick={() => setTargetScreenIds([])}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                  <div className="grid max-h-44 gap-1.5 overflow-y-auto sm:grid-cols-2">
                    {data.screens
                      .filter((s) => {
                        const q = screenSearch.trim().toLowerCase();
                        if (!q) return true;
                        const bName = branchById.get(s.branchId)?.name ?? "";
                        return (
                          s.name.toLowerCase().includes(q) ||
                          bName.toLowerCase().includes(q)
                        );
                      })
                      .map((s) => {
                        const checked = targetScreenIds.includes(s.id);
                        const br = branchById.get(s.branchId);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() =>
                              setTargetScreenIds((prev) =>
                                checked
                                  ? prev.filter((id) => id !== s.id)
                                  : [...prev, s.id]
                              )
                            }
                            className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition ${checked
                                ? "border-rose-500 bg-rose-50/70 text-rose-950"
                                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                              }`}
                          >
                            <div className="min-w-0">
                              <p className="truncate font-semibold">{s.name}</p>
                              <p className="truncate text-[10px] text-zinc-500">
                                {br?.name ?? "Location"} •{" "}
                                {s.isOnline ? "Online" : "Offline"}
                              </p>
                            </div>
                            <span
                              className={`flex size-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${checked
                                  ? "border-rose-600 bg-rose-600 text-white"
                                  : "border-zinc-300 bg-white"
                                }`}
                            >
                              {checked ? "✓" : ""}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}

              <Button
                type="submit"
                className="w-full bg-rose-600 text-white hover:bg-rose-700"
                disabled={sending}
              >
                <AlertTriangle className="size-4" />
                {sending
                  ? "Broadcasting to Screens..."
                  : "Trigger Emergency Broadcast Now"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Live 16:9 Broadcast Preview + History */}
        <div className="space-y-5 lg:col-span-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Live Screen Preview</CardTitle>
              <CardDescription className="text-xs">
                How targeted TVs will render this takeover
              </CardDescription>
            </CardHeader>
            <CardContent>
              {overrideKind === "alert" ? (
                <div
                  className={`flex aspect-video w-full flex-col items-center justify-center rounded-xl p-6 text-center shadow-inner ${previewBg}`}
                >
                  <span className="rounded-full bg-white/15 px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest">
                    EMERGENCY BROADCAST • {severity}
                  </span>
                  <p className="mt-3 text-xl font-black leading-tight">
                    {title || "Broadcast Title Preview"}
                  </p>
                  <p className="mt-2 line-clamp-3 text-xs opacity-85">
                    {message ||
                      "Your full-screen broadcast message will appear here immediately across targeted displays."}
                  </p>
                </div>
              ) : overrideKind === "media_asset" ? (
                <div className="relative flex aspect-video w-full flex-col items-center justify-center overflow-hidden rounded-xl bg-zinc-950 text-center text-white">
                  <span className="absolute left-3 top-3 rounded-full bg-rose-600 px-2.5 py-0.5 text-[9px] font-bold uppercase">
                    LIVE CLIP TAKEOVER
                  </span>
                  <Film className="size-8 text-blue-400" />
                  <p className="mt-2 text-xs font-semibold">
                    {mediaById.get(mediaAssetId)?.title ?? "Select a clip"}
                  </p>
                  <p className="text-[10px] text-zinc-400">
                    Loops fullscreen with audio until ended
                  </p>
                </div>
              ) : (
                <div className="relative flex aspect-video w-full flex-col items-center justify-center overflow-hidden rounded-xl bg-zinc-950 text-center text-white">
                  <span className="absolute left-3 top-3 rounded-full bg-amber-500 px-2.5 py-0.5 text-[9px] font-bold uppercase text-zinc-950">
                    PLAYLIST TAKEOVER
                  </span>
                  <ListVideo className="size-8 text-amber-400" />
                  <p className="mt-2 text-xs font-semibold">
                    {playlistById.get(playlistId)?.name ?? "Select a playlist"}
                  </p>
                  <p className="text-[10px] text-zinc-400">
                    Overrides normal schedules immediately
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Recent Broadcast History</CardTitle>
            </CardHeader>
            <CardContent className="max-h-56 space-y-2 overflow-y-auto">
              {pastBroadcasts.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  No past broadcasts logged yet.
                </p>
              ) : (
                pastBroadcasts.slice(0, 10).map((ov) => (
                  <div
                    key={ov.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-zinc-100 bg-zinc-50/70 px-3 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-zinc-800">
                        {ov.title}
                      </p>
                      <p className="text-[10px] text-zinc-400">
                        {ov.overrideKind ?? "alert"} • {ov.severity}
                      </p>
                    </div>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => void handleDeleteBroadcast(ov)}
                    >
                      <Trash2 className="size-3 text-zinc-400 hover:text-rose-500" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
