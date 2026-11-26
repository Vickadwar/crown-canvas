"use client";

/**
 * @file src/components/dashboard/tabs/promotions-tab.tsx
 * @description Agency-Ready Promotions Campaign Manager + Cloudflare R2 Background Music
 * Library (`audio_tracks`). Supports drag-and-drop agency creatives, date-range auto-expiry,
 * multi-screen targeting, ambient music attachment, and inline audio preview.
 */

import { useMemo, useState } from "react";
import {
  Calendar,
  Check,
  FileImage,
  Film,
  FileText,
  Megaphone,
  Music,
  PauseCircle,
  PlayCircle,
  Plus,
  Search,
  Trash2,
  Upload,
  Volume2,
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
import { optimizeImageForSignage } from "@/lib/media-optimizer";
import type {
  AudioTrackItem,
  OverviewPayload,
  PromotionItem,
} from "../cms-types";

interface PromotionsTabProps {
  data: OverviewPayload;
  onRefresh: () => Promise<void>;
}

const MOOD_LABELS: Record<string, string> = {
  showroom_lounge: "Showroom Lounge",
  upbeat_promo: "Upbeat Promo",
  corporate_ambient: "Corporate Ambient",
  celebration: "Celebration / Awards",
};

async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function uploadToCloudR2(
  file: File,
  departmentCode: string
): Promise<{ publicUrl: string; storagePath: string; sha256Checksum: string }> {
  const sha256Checksum = await sha256Hex(file);
  const urlRes = await fetch("/api/media/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      departmentCode,
      sha256Checksum,
      fileSizeBytes: file.size,
    }),
  });
  const urlJson = (await urlRes.json()) as {
    error?: string;
    deduplicated?: boolean;
    signedUrl?: string;
    uploadHeaders?: Record<string, string>;
    publicUrl?: string;
    storagePath?: string;
  };
  if (!urlRes.ok || !urlJson.publicUrl || !urlJson.storagePath) {
    throw new Error(urlJson.error || "Could not prepare Cloudflare R2 upload");
  }
  if (!urlJson.deduplicated && urlJson.signedUrl) {
    const putRes = await fetch(urlJson.signedUrl, {
      method: "PUT",
      headers: urlJson.uploadHeaders ?? {
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    });
    if (!putRes.ok) {
      throw new Error("Upload to Cloudflare R2 failed");
    }
  }
  return {
    publicUrl: urlJson.publicUrl,
    storagePath: urlJson.storagePath,
    sha256Checksum,
  };
}

function getPromoStatus(p: PromotionItem): {
  label: string;
  variant: "success" | "warning" | "secondary" | "danger";
} {
  if (!p.isActive) return { label: "Paused", variant: "secondary" };
  const now = Date.now();
  if (p.startDate && Date.parse(p.startDate) > now) {
    return { label: "Scheduled", variant: "warning" };
  }
  if (p.endDate && Date.parse(p.endDate) < now) {
    return { label: "Expired", variant: "danger" };
  }
  return { label: "Live", variant: "success" };
}

export function PromotionsTab({ data, onRefresh }: PromotionsTabProps) {
  const confirm = useConfirm();
  const [subTab, setSubTab] = useState<"campaigns" | "audio">("campaigns");

  const promotions = useMemo(() => data.promotions ?? [], [data.promotions]);
  const audioTracks = useMemo(() => data.audioTracks ?? [], [data.audioTracks]);
  const audioById = useMemo(
    () => new Map(audioTracks.map((a) => [a.id, a])),
    [audioTracks]
  );
  const screenById = useMemo(
    () => new Map(data.screens.map((s) => [s.id, s])),
    [data.screens]
  );
  const branchById = useMemo(
    () => new Map(data.branches.map((b) => [b.id, b])),
    [data.branches]
  );

  // Campaign Create Form
  const [showPromoForm, setShowPromoForm] = useState(promotions.length === 0);
  const [title, setTitle] = useState("");
  const [agencyName, setAgencyName] = useState("Creative Agency");
  const [campaignCode, setCampaignCode] = useState("");
  const [description, setDescription] = useState("");
  const [durationSeconds, setDurationSeconds] = useState(15);
  const [priority, setPriority] = useState(60);
  const [audioTrackId, setAudioTrackId] = useState("");
  const [targetMode, setTargetMode] = useState<
    "global" | "branch" | "country" | "screen_group" | "screens"
  >("global");
  const [targetId, setTargetId] = useState("");
  const [selectedScreenIds, setSelectedScreenIds] = useState<string[]>([]);
  const [screenSearch, setScreenSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [creativeFile, setCreativeFile] = useState<File | null>(null);
  const [savingPromo, setSavingPromo] = useState(false);

  // Audio Track Upload Form
  const [showAudioForm, setShowAudioForm] = useState(audioTracks.length === 0);
  const [audioTitle, setAudioTitle] = useState("");
  const [audioArtist, setAudioArtist] = useState("Royalty-Free Studio");
  const [audioMood, setAudioMood] = useState<
    "showroom_lounge" | "upbeat_promo" | "corporate_ambient" | "celebration"
  >("showroom_lounge");
  const [audioVolume, setAudioVolume] = useState(35);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [savingAudio, setSavingAudio] = useState(false);

  const filteredScreens = useMemo(() => {
    const q = screenSearch.trim().toLowerCase();
    if (!q) return data.screens;
    return data.screens.filter((s) => s.name.toLowerCase().includes(q));
  }, [data.screens, screenSearch]);

  async function handleCreatePromotion(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !creativeFile) {
      toast.error("Enter a campaign title and attach an agency design file.");
      return;
    }
    if (targetMode === "screens" && selectedScreenIds.length === 0) {
      toast.error("Select at least one target screen.");
      return;
    }

    setSavingPromo(true);
    try {
      let uploadFile = creativeFile;
      let mediaType: "image" | "video" | "pdf" = "image";
      if (creativeFile.type.startsWith("video/")) {
        mediaType = "video";
      } else if (
        creativeFile.type === "application/pdf" ||
        creativeFile.name.toLowerCase().endsWith(".pdf")
      ) {
        mediaType = "pdf";
      } else if (creativeFile.type.startsWith("image/")) {
        mediaType = "image";
        const opt = await optimizeImageForSignage(creativeFile);
        uploadFile = opt.file;
      }

      const uploaded = await uploadToCloudR2(uploadFile, "PROMOTIONS");

      const res = await fetch("/api/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          agencyName: agencyName.trim() || "Creative Agency",
          campaignCode: campaignCode.trim() || null,
          description: description.trim(),
          mediaType,
          publicUrl: uploaded.publicUrl,
          storagePath: uploaded.storagePath,
          mimeType: uploadFile.type || "image/webp",
          fileSizeBytes: uploadFile.size,
          sha256Checksum: uploaded.sha256Checksum,
          durationSeconds: Math.max(5, Number(durationSeconds) || 15),
          priority: Math.max(1, Number(priority) || 50),
          audioTrackId: audioTrackId || null,
          targetType: targetMode === "screens" ? "screen" : targetMode,
          targetId:
            targetMode === "global" || targetMode === "screens"
              ? null
              : targetId || null,
          targetScreenIds:
            targetMode === "screens" ? selectedScreenIds : null,
          startDate: startDate ? new Date(`${startDate}T00:00:00`).toISOString() : null,
          endDate: endDate ? new Date(`${endDate}T23:59:59`).toISOString() : null,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(json.error || "Could not save promotion");
        return;
      }

      toast.success(`Promotion "${title.trim()}" uploaded to R2 & activated`);
      setTitle("");
      setCampaignCode("");
      setDescription("");
      setCreativeFile(null);
      setSelectedScreenIds([]);
      setShowPromoForm(false);
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSavingPromo(false);
    }
  }

  async function handleTogglePromo(p: PromotionItem) {
    const res = await fetch(`/api/promotions/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !p.isActive }),
    });
    if (!res.ok) {
      toast.error("Failed to update promotion");
      return;
    }
    toast.success(p.isActive ? `Paused "${p.title}"` : `Resumed "${p.title}"`);
    await onRefresh();
  }

  async function handleDeletePromo(p: PromotionItem) {
    const ok = await confirm({
      title: `Delete promotion "${p.title}"?`,
      description:
        "This removes the campaign and purges its creative from Cloudflare R2 storage.",
      confirmLabel: "Delete Promotion",
      variant: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/promotions/${p.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete promotion");
      return;
    }
    toast.success(`Deleted "${p.title}"`);
    await onRefresh();
  }

  async function handleUploadAudio(e: React.FormEvent) {
    e.preventDefault();
    if (!audioTitle.trim() || !audioFile) {
      toast.error("Provide a track title and select an MP3/AAC/OGG audio file.");
      return;
    }
    setSavingAudio(true);
    try {
      const uploaded = await uploadToCloudR2(audioFile, "AUDIO");
      const res = await fetch("/api/audio-tracks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: audioTitle.trim(),
          artist: audioArtist.trim() || "Royalty-Free Audio",
          moodTag: audioMood,
          publicUrl: uploaded.publicUrl,
          storagePath: uploaded.storagePath,
          mimeType: audioFile.type || "audio/mpeg",
          fileSizeBytes: audioFile.size,
          volumePercent: Math.max(5, Math.min(100, Number(audioVolume) || 35)),
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(json.error || "Could not save audio track");
        return;
      }
      toast.success(`Uploaded "${audioTitle.trim()}" to Cloudflare R2 ($0 egress)`);
      setAudioTitle("");
      setAudioFile(null);
      setShowAudioForm(false);
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Audio upload failed");
    } finally {
      setSavingAudio(false);
    }
  }

  async function handleDeleteAudio(track: AudioTrackItem) {
    const ok = await confirm({
      title: `Delete audio track "${track.title}"?`,
      description:
        "Playlists or promotions linked to this track will silently play without background music.",
      confirmLabel: "Delete Audio",
      variant: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/audio-tracks/${track.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Failed to delete track");
      return;
    }
    toast.success(`Deleted "${track.title}"`);
    await onRefresh();
  }

  function resolveTargetText(p: PromotionItem): string {
    if (p.targetScreenIds && p.targetScreenIds.length > 0) {
      const names = p.targetScreenIds
        .map((id) => screenById.get(id)?.name)
        .filter(Boolean);
      return names.length <= 2
        ? names.join(", ") || `${p.targetScreenIds.length} screens`
        : `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
    }
    if (p.targetType === "global") return "All Displays";
    if (p.targetType === "branch" && p.targetId) {
      return `Location: ${branchById.get(p.targetId)?.name ?? "Showroom"}`;
    }
    return p.targetType;
  }

  return (
    <div className="space-y-5">
      {/* Sub-navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-1">
          <button
            type="button"
            onClick={() => setSubTab("campaigns")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
              subTab === "campaigns"
                ? "bg-white text-zinc-950 shadow-2xs ring-1 ring-zinc-200/80"
                : "text-zinc-500 hover:text-zinc-900"
            }`}
          >
            <Megaphone className="size-3.5" />
            Agency Promotions ({promotions.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab("audio")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
              subTab === "audio"
                ? "bg-white text-zinc-950 shadow-2xs ring-1 ring-zinc-200/80"
                : "text-zinc-500 hover:text-zinc-900"
            }`}
          >
            <Music className="size-3.5" />
            Background Music ({audioTracks.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          {subTab === "campaigns" ? (
            <Button size="sm" onClick={() => setShowPromoForm((v) => !v)}>
              <Plus className="size-3.5" />
              Upload Promotion Design
            </Button>
          ) : (
            <Button size="sm" onClick={() => setShowAudioForm((v) => !v)}>
              <Upload className="size-3.5" />
              Upload Background Music
            </Button>
          )}
        </div>
      </div>

      {subTab === "campaigns" ? (
        <>
          {showPromoForm && (
            <Card className="border-amber-300 bg-white">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-base">
                    Upload Agency Promotion Campaign
                  </CardTitle>
                  <CardDescription>
                    Upload agency-ready posters, videos, or PDFs directly to Cloudflare R2 ($0 egress), attach ambient music, and schedule targeted screens.
                  </CardDescription>
                </div>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => setShowPromoForm(false)}
                >
                  <X className="size-4" />
                </Button>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={handleCreatePromotion}
                  className="grid gap-3.5 md:grid-cols-12"
                >
                  <div className="space-y-1 md:col-span-4">
                    <Label className="text-xs">Campaign / Promotion Title</Label>
                    <Input
                      className="h-8 text-xs"
                      placeholder="e.g. Festive Silk Vinyl 15% Off"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1 md:col-span-3">
                    <Label className="text-xs">Agency / Source</Label>
                    <Input
                      className="h-8 text-xs"
                      placeholder="e.g. Brand Agency"
                      value={agencyName}
                      onChange={(e) => setAgencyName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label className="text-xs">Duration (sec)</Label>
                    <Input
                      type="number"
                      min={5}
                      max={300}
                      className="h-8 text-xs"
                      value={durationSeconds}
                      onChange={(e) =>
                        setDurationSeconds(Number(e.target.value) || 15)
                      }
                    />
                  </div>
                  <div className="space-y-1 md:col-span-3">
                    <Label className="text-xs">Background Music (Silent Slides)</Label>
                    <ModernSelect
                      size="sm"
                      value={audioTrackId}
                      onValueChange={setAudioTrackId}
                      options={[
                        { value: "", label: "Inherit Playlist Music / Silent" },
                        ...audioTracks.map((a) => ({
                          value: a.id,
                          label: `♪ ${a.title} (${a.volumePercent}%)`,
                        })),
                      ]}
                    />
                  </div>

                  <div className="space-y-1 md:col-span-4">
                    <Label className="text-xs">
                      Agency Creative File (PNG / JPG / WebP / MP4 / PDF)
                    </Label>
                    <Input
                      type="file"
                      accept="image/*,video/mp4,application/pdf"
                      className="h-8 cursor-pointer text-xs"
                      onChange={(e) =>
                        setCreativeFile(e.target.files?.[0] ?? null)
                      }
                      required
                    />
                  </div>
                  <div className="space-y-1 md:col-span-3">
                    <Label className="text-xs">Start Date (Optional)</Label>
                    <Input
                      type="date"
                      className="h-8 text-xs"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1 md:col-span-3">
                    <Label className="text-xs">Auto-Expiry Date (Optional)</Label>
                    <Input
                      type="date"
                      className="h-8 text-xs"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label className="text-xs">Priority</Label>
                    <Input
                      type="number"
                      min={1}
                      max={999}
                      className="h-8 text-xs"
                      value={priority}
                      onChange={(e) => setPriority(Number(e.target.value) || 50)}
                    />
                  </div>

                  <div className="space-y-1 md:col-span-4">
                    <Label className="text-xs">Target Displays</Label>
                    <ModernSelect
                      size="sm"
                      value={targetMode}
                      onValueChange={(v) => {
                        setTargetMode(v as typeof targetMode);
                        setTargetId("");
                      }}
                      options={[
                        { value: "global", label: "All Paired Displays (Global)" },
                        { value: "screens", label: "Specific Multiple Displays" },
                        { value: "branch", label: "Specific Location / Showroom" },
                        { value: "screen_group", label: "Screen Group" },
                        { value: "country", label: "Operating Region" },
                      ]}
                    />
                  </div>

                  {targetMode === "branch" && (
                    <div className="space-y-1 md:col-span-4">
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
                  {targetMode === "screen_group" && (
                    <div className="space-y-1 md:col-span-4">
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
                  {targetMode === "country" && (
                    <div className="space-y-1 md:col-span-4">
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

                  {targetMode === "screens" && (
                    <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50/70 p-3 md:col-span-12">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label className="text-xs font-semibold">
                          Select Target Displays ({selectedScreenIds.length} selected)
                        </Label>
                        <div className="relative w-52">
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
                              className={`flex items-center justify-between rounded-md border px-2.5 py-1.5 text-left text-xs transition ${
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

                  <div className="flex items-end justify-end gap-2 md:col-span-12">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setShowPromoForm(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" disabled={savingPromo}>
                      <Upload className="size-3.5" />
                      {savingPromo ? "Uploading to R2..." : "Publish Promotion"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {promotions.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center text-xs text-zinc-500">
                No agency promotions uploaded yet. Click{" "}
                <strong>Upload Promotion Design</strong> above, then enable{" "}
                <strong>Promo Injection</strong> in Playlists or add a{" "}
                <strong>Promotions Block</strong> in Daypart Schedules!
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {promotions.map((promo) => {
                const status = getPromoStatus(promo);
                const track = promo.audioTrackId
                  ? audioById.get(promo.audioTrackId)
                  : null;
                return (
                  <Card
                    key={promo.id}
                    className="flex flex-col overflow-hidden border-zinc-200 bg-white"
                  >
                    <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-zinc-950">
                      {promo.mediaType === "image" ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={promo.publicUrl}
                          alt={promo.title}
                          className="h-full w-full object-contain"
                        />
                      ) : promo.mediaType === "video" ? (
                        <div className="flex flex-col items-center gap-1.5 text-zinc-300">
                          <Film className="size-8 text-sky-400" />
                          <span className="text-[11px] font-medium">
                            Agency Video Promo
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1.5 text-zinc-300">
                          <FileText className="size-8 text-amber-400" />
                          <span className="text-[11px] font-medium">
                            Agency PDF Flyer
                          </span>
                        </div>
                      )}
                      <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
                        <Badge variant={status.variant} className="text-[10px]">
                          {status.label}
                        </Badge>
                        <Badge variant="outline" className="bg-black/60 text-[10px] text-white border-white/20">
                          {promo.durationSeconds}s
                        </Badge>
                      </div>
                    </div>

                    <CardContent className="flex flex-1 flex-col justify-between gap-3 p-3.5 text-xs">
                      <div className="space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-zinc-950">
                            {promo.title}
                          </p>
                          <Badge variant="secondary" className="text-[10px]">
                            P{promo.priority}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-zinc-500">
                          Agency: <strong className="text-zinc-700">{promo.agencyName}</strong> •{" "}
                          {resolveTargetText(promo)}
                        </p>
                        {(promo.startDate || promo.endDate) && (
                          <p className="flex items-center gap-1 text-[10px] text-zinc-500">
                            <Calendar className="size-3 text-zinc-400" />
                            {promo.startDate ? promo.startDate.slice(0, 10) : "Now"} →{" "}
                            {promo.endDate ? promo.endDate.slice(0, 10) : "No expiry"}
                          </p>
                        )}
                        {track && (
                          <p className="flex items-center gap-1 text-[10px] font-medium text-blue-600">
                            <Music className="size-3" />
                            Audio: {track.title} ({track.volumePercent}%)
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-end gap-1 border-t border-zinc-100 pt-2">
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          title={promo.isActive ? "Pause" : "Activate"}
                          onClick={() => void handleTogglePromo(promo)}
                        >
                          {promo.isActive ? (
                            <PauseCircle className="size-4 text-amber-600" />
                          ) : (
                            <PlayCircle className="size-4 text-emerald-600" />
                          )}
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          title="Delete Promotion"
                          onClick={() => void handleDeletePromo(promo)}
                        >
                          <Trash2 className="size-3.5 text-rose-500" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* Background Music Library (Cloudflare R2) */
        <>
          {showAudioForm && (
            <Card className="border-blue-300 bg-white">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-base">
                    Upload Background Music Track to Cloudflare R2
                  </CardTitle>
                  <CardDescription>
                    Royalty-free MP3/AAC/M4A ambient music plays smoothly during silent Studio slides, Promotions, and Employee Spotlights — and auto-pauses whenever a video with sound plays.
                  </CardDescription>
                </div>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => setShowAudioForm(false)}
                >
                  <X className="size-4" />
                </Button>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={handleUploadAudio}
                  className="grid gap-3 md:grid-cols-12"
                >
                  <div className="space-y-1 md:col-span-4">
                    <Label className="text-xs">Track Title</Label>
                    <Input
                      className="h-8 text-xs"
                      placeholder="e.g. Showroom Soft Acoustic Lounge"
                      value={audioTitle}
                      onChange={(e) => setAudioTitle(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1 md:col-span-3">
                    <Label className="text-xs">Artist / License Source</Label>
                    <Input
                      className="h-8 text-xs"
                      placeholder="e.g. Pixabay Royalty-Free"
                      value={audioArtist}
                      onChange={(e) => setAudioArtist(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1 md:col-span-3">
                    <Label className="text-xs">Mood / Style</Label>
                    <ModernSelect
                      size="sm"
                      value={audioMood}
                      onValueChange={(v) => setAudioMood(v as typeof audioMood)}
                      options={[
                        { value: "showroom_lounge", label: "Showroom Lounge" },
                        { value: "upbeat_promo", label: "Upbeat Promo" },
                        { value: "corporate_ambient", label: "Corporate Ambient" },
                        { value: "celebration", label: "Celebration / Awards" },
                      ]}
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label className="text-xs">Volume ({audioVolume}%)</Label>
                    <Input
                      type="range"
                      min={10}
                      max={100}
                      className="h-8 cursor-pointer"
                      value={audioVolume}
                      onChange={(e) => setAudioVolume(Number(e.target.value))}
                    />
                  </div>

                  <div className="space-y-1 md:col-span-8">
                    <Label className="text-xs">Audio File (MP3 / AAC / M4A / OGG)</Label>
                    <Input
                      type="file"
                      accept="audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/wav,.mp3,.m4a,.ogg"
                      className="h-8 cursor-pointer text-xs"
                      onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
                      required
                    />
                  </div>
                  <div className="flex items-end justify-end gap-2 md:col-span-4">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setShowAudioForm(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" disabled={savingAudio}>
                      <Music className="size-3.5" />
                      {savingAudio ? "Uploading..." : "Save Audio Track"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {audioTracks.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center text-xs text-zinc-500">
                No background music uploaded yet. Upload a royalty-free MP3 track to Cloudflare R2 ($0 egress) and attach it to any Playlist, Promotion, or Employee Spotlight!
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {audioTracks.map((track) => (
                <Card key={track.id} className="border-zinc-200 bg-white">
                  <CardContent className="space-y-2.5 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                            <Volume2 className="size-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-zinc-950">
                              {track.title}
                            </p>
                            <p className="truncate text-[11px] text-zinc-500">
                              {track.artist} • {MOOD_LABELS[track.moodTag] ?? track.moodTag} •{" "}
                              {track.volumePercent}% volume
                            </p>
                          </div>
                        </div>
                      </div>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        title="Delete Audio Track"
                        onClick={() => void handleDeleteAudio(track)}
                      >
                        <Trash2 className="size-3.5 text-rose-500" />
                      </Button>
                    </div>
                    <audio
                      controls
                      preload="none"
                      src={track.publicUrl}
                      className="h-8 w-full"
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Subtle quick-reference footer */}
      <div className="flex items-center gap-2 rounded-lg border border-zinc-200/80 bg-zinc-50 px-3.5 py-2 text-[11px] text-zinc-500">
        <FileImage className="size-3.5 shrink-0 text-blue-600" />
        <span>
          All agency creatives &amp; MP3 tracks are served directly from Cloudflare R2 ($0 egress) and cached locally on paired TVs for glitch-free offline playback.
        </span>
      </div>
    </div>
  );
}
