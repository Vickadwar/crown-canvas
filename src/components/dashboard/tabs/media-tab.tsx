"use client";

/**
 * @file src/components/dashboard/tabs/media-tab.tsx
 * @description Uncongested Media Library with collapsible tabbed upload/URL composer,
 * search & coloured type filters, live playlist usage badges, and 1-click multi-playlist
 * assignment so any single video or image can be reused across multiple playlists.
 */

import { useMemo, useRef, useState } from "react";
import {
  Check,
  Cpu,
  Film,
  Globe,
  HardDrive,
  Image as ImageIcon,
  ListVideo,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModernSelect } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { TaglineBuilder } from "@/components/dashboard/tagline-builder";
import {
  inspectVideoForAndroidTv,
  normalizeExternalMediaUrl,
  optimizeImageForSignage,
} from "@/lib/media-optimizer";
import {
  compressVideoInBrowser,
  isWebCodecsSupported,
  type VideoCompressionPreset,
  type VideoCompressionProgress,
} from "@/lib/video-compressor";
import type { MediaAssetItem, OverviewPayload, PlaylistRecord } from "../cms-types";

interface MediaTabProps {
  data: OverviewPayload;
  onRefresh: () => Promise<void>;
}

async function computeFileSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function readMediaDuration(file: File): Promise<number> {
  if (!file.type.startsWith("video/")) return 15;
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    const url = URL.createObjectURL(file);
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Math.max(5, Math.round(video.duration || 15)));
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(15);
    };
    video.src = url;
  });
}

export function MediaTab({ data, onRefresh }: MediaTabProps) {
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "video" | "image" | "web">("all");
  const [deptFilter, setDeptFilter] = useState("");
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [addMode, setAddMode] = useState<"upload" | "url">("upload");

  // Upload & GPU Video Compression state
  const [title, setTitle] = useState("");
  const [deptId, setDeptId] = useState(data.departments[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [compressionPreset, setCompressionPreset] =
    useState<VideoCompressionPreset>("auto_fit");
  const [compressionProgress, setCompressionProgress] =
    useState<VideoCompressionProgress | null>(null);
  const [uploadPhase, setUploadPhase] = useState<
    "idle" | "compressing" | "uploading" | "saving"
  >("idle");
  const abortControllerRef = useRef<AbortController | null>(null);
  const [targetPlaylistIds, setTargetPlaylistIds] = useState<string[]>(
    data.playlists[0]?.id ? [data.playlists[0].id] : []
  );
  const [runningTagline, setRunningTagline] = useState("");
  const [uploading, setUploading] = useState(false);

  // External URL state
  const [extTitle, setExtTitle] = useState("");
  const [extUrl, setExtUrl] = useState("");
  const [extDuration, setExtDuration] = useState(20);

  // Multi-playlist assignment popover per asset
  const [assigningAssetId, setAssigningAssetId] = useState<string | null>(null);
  const [savingAssignment, setSavingAssignment] = useState(false);

  const deptById = useMemo(
    () => new Map(data.departments.map((d) => [d.id, d])),
    [data.departments]
  );

  // Map each media asset -> list of playlists using it
  const playlistsByAssetId = useMemo(() => {
    const map = new Map<string, PlaylistRecord[]>();
    for (const pl of data.playlists) {
      for (const item of pl.items) {
        if (item.itemKind === "media_asset" && item.mediaAssetId) {
          const list = map.get(item.mediaAssetId) ?? [];
          if (!list.some((existing) => existing.id === pl.id)) {
            list.push(pl);
          }
          map.set(item.mediaAssetId, list);
        }
      }
    }
    return map;
  }, [data.playlists]);

  const filteredAssets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.mediaAssets.filter((asset) => {
      if (typeFilter === "video" && asset.mediaType !== "video") return false;
      if (typeFilter === "image" && asset.mediaType !== "image") return false;
      if (
        typeFilter === "web" &&
        asset.mediaType !== "web_url" &&
        asset.mediaType !== "pdf"
      ) {
        return false;
      }
      if (deptFilter && asset.departmentId !== deptFilter) return false;
      if (!q) return true;
      return asset.title.toLowerCase().includes(q);
    });
  }, [data.mediaAssets, search, typeFilter, deptFilter]);

  async function appendAssetToPlaylists(
    assetId: string,
    durationSeconds: number,
    playlistIds: string[],
    taglineToAppend?: string
  ) {
    for (const plId of playlistIds) {
      const pl = data.playlists.find((p) => p.id === plId);
      if (!pl) continue;
      const alreadyIn = pl.items.some(
        (it) => it.itemKind === "media_asset" && it.mediaAssetId === assetId
      );
      if (!alreadyIn) {
        const nextItems = [
          ...pl.items.map((it) => ({
            itemKind: it.itemKind,
            mediaAssetId: it.mediaAssetId ?? null,
            quickPostId: it.quickPostId ?? null,
            durationSeconds: it.durationSeconds ?? null,
          })),
          {
            itemKind: "media_asset" as const,
            mediaAssetId: assetId,
            quickPostId: null,
            durationSeconds,
          },
        ];
        await fetch(`/api/playlists/${plId}/items`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: nextItems }),
        });
      }
      if (taglineToAppend && taglineToAppend.trim()) {
        const existing = pl.tickerText?.trim();
        const trimmed = taglineToAppend.trim();
        const nextTicker = existing
          ? existing.includes(trimmed)
            ? existing
            : `${existing} | ${trimmed}`
          : trimmed;
        await fetch(`/api/playlists/${plId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tickerText: nextTicker }),
        });
      }
    }
  }

  function handleCancelUpload() {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setUploading(false);
    setUploadPhase("idle");
    setCompressionProgress(null);
    toast.info("Video compression cancelled");
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !title.trim() || !deptId) {
      toast.error("Provide a title, department, and media file.");
      return;
    }
    const dept = deptById.get(deptId);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setUploading(true);
    setCompressionProgress(null);

    try {
      let uploadFile = file;
      let compressionSummary: string | null = null;
      let knownDurationSeconds: number | null = null;

      if (file.type.startsWith("image/")) {
        setUploadPhase("compressing");
        const optimized = await optimizeImageForSignage(file);
        uploadFile = optimized.file;
      } else if (
        file.type.startsWith("video/") ||
        /\.(mp4|mov|webm|mkv|m4v)$/i.test(file.name)
      ) {
        const needsCompression =
          file.size > 32 * 1024 * 1024 ||
          compressionPreset !== "auto_fit" ||
          !(file.type === "video/mp4" || file.name.toLowerCase().endsWith(".mp4"));

        if (needsCompression) {
          if (!isWebCodecsSupported()) {
            toast.error(
              "Automatic GPU video compression requires desktop Chrome or Edge. Please switch browsers or link via External URL."
            );
            return;
          }
          setUploadPhase("compressing");
          const result = await compressVideoInBrowser(file, {
            preset: compressionPreset,
            onProgress: (p) => setCompressionProgress(p),
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;

          uploadFile = result.file;
          knownDurationSeconds = result.durationSeconds;

          if (result.compressed) {
            const beforeMb = (result.originalBytes / (1024 * 1024)).toFixed(1);
            const afterMb = (result.outputBytes / (1024 * 1024)).toFixed(1);
            compressionSummary = `${beforeMb} MB → ${afterMb} MB (-${result.savingsPercent}%)`;
          }
        }
      }

      if (controller.signal.aborted) return;
      setUploadPhase("uploading");

      const [sha256Checksum, durationSeconds] = await Promise.all([
        computeFileSha256(uploadFile),
        knownDurationSeconds
          ? Promise.resolve(knownDurationSeconds)
          : readMediaDuration(uploadFile),
      ]);

      const urlRes = await fetch("/api/media/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: uploadFile.name,
          mimeType: uploadFile.type || "application/octet-stream",
          departmentCode: dept?.code ?? "GENERAL",
          sha256Checksum,
          fileSizeBytes: uploadFile.size,
        }),
        signal: controller.signal,
      });
      const urlJson = await urlRes.json();
      if (!urlRes.ok) {
        toast.error(urlJson.error || "Could not prepare upload");
        return;
      }

      let assetId: string | undefined;
      if (urlJson.deduplicated && urlJson.existingAsset?.id) {
        assetId = urlJson.existingAsset.id;
        toast.info(
          `Reused existing identical file "${urlJson.existingAsset.title}" (0 extra bytes)`
        );
      } else {
        const putRes = await fetch(urlJson.signedUrl, {
          method: "PUT",
          headers: {
            "Content-Type": uploadFile.type || "application/octet-stream",
          },
          body: uploadFile,
          signal: controller.signal,
        });
        if (!putRes.ok) {
          toast.error("Cloud upload failed");
          return;
        }
        setUploadPhase("saving");
        const isPdfUpload =
          uploadFile.type === "application/pdf" ||
          uploadFile.name.toLowerCase().endsWith(".pdf");
        const saveRes = await fetch("/api/media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            mediaType: uploadFile.type.startsWith("video/")
              ? "video"
              : isPdfUpload
                ? "pdf"
                : "image",
            storagePath: urlJson.storagePath,
            publicUrl: urlJson.publicUrl,
            mimeType:
              uploadFile.type ||
              (isPdfUpload ? "application/pdf" : "video/mp4"),
            fileSizeBytes: uploadFile.size,
            sha256Checksum,
            durationSeconds: isPdfUpload ? Math.max(durationSeconds, 25) : durationSeconds,
            departmentId: deptId,
          }),
          signal: controller.signal,
        });
        const saveJson = await saveRes.json();
        if (!saveRes.ok) {
          toast.error(saveJson.error || "Failed to save media metadata");
          return;
        }
        assetId = saveJson.asset?.id;
      }

      if (assetId && targetPlaylistIds.length > 0) {
        await appendAssetToPlaylists(
          assetId,
          durationSeconds,
          targetPlaylistIds,
          runningTagline
        );
      }

      const prefix = compressionSummary ? `Compressed ${compressionSummary} & uploaded` : "Uploaded";
      toast.success(
        targetPlaylistIds.length > 0
          ? `${prefix} "${title.trim()}" to ${targetPlaylistIds.length} playlist(s)`
          : `${prefix} "${title.trim()}" to library`
      );
      setTitle("");
      setFile(null);
      setRunningTagline("");
      setShowAddPanel(false);
      await onRefresh();
    } catch (err) {
      if (controller.signal.aborted) return;
      const msg =
        err instanceof Error ? err.message : "Failed to optimize or upload video";
      toast.error(msg);
    } finally {
      abortControllerRef.current = null;
      setUploading(false);
      setUploadPhase("idle");
      setCompressionProgress(null);
    }
  }

  async function handleAddExternalUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!extTitle.trim() || !extUrl.trim() || !deptId) {
      toast.error("Enter a title, URL, and department.");
      return;
    }
    setUploading(true);
    try {
      const info = normalizeExternalMediaUrl(extUrl);
      const res = await fetch("/api/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: extTitle.trim(),
          mediaType: info.mediaType,
          publicUrl: info.normalizedUrl,
          mimeType: info.mimeType,
          fileSizeBytes: 0,
          durationSeconds: Math.max(5, extDuration),
          departmentId: deptId,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Could not save web media");
        return;
      }
      if (json.asset?.id && targetPlaylistIds.length > 0) {
        await appendAssetToPlaylists(
          json.asset.id,
          Math.max(5, extDuration),
          targetPlaylistIds
        );
      }
      toast.success(`Added ${info.label}`);
      setExtTitle("");
      setExtUrl("");
      setShowAddPanel(false);
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid URL");
    } finally {
      setUploading(false);
    }
  }

  async function handleToggleAssetInPlaylist(
    asset: MediaAssetItem,
    pl: PlaylistRecord
  ) {
    setSavingAssignment(true);
    try {
      const exists = pl.items.some(
        (it) => it.itemKind === "media_asset" && it.mediaAssetId === asset.id
      );
      const nextItems = exists
        ? pl.items
          .filter(
            (it) =>
              !(it.itemKind === "media_asset" && it.mediaAssetId === asset.id)
          )
          .map((it) => ({
            itemKind: it.itemKind,
            mediaAssetId: it.mediaAssetId ?? null,
            quickPostId: it.quickPostId ?? null,
            durationSeconds: it.durationSeconds ?? null,
          }))
        : [
          ...pl.items.map((it) => ({
            itemKind: it.itemKind,
            mediaAssetId: it.mediaAssetId ?? null,
            quickPostId: it.quickPostId ?? null,
            durationSeconds: it.durationSeconds ?? null,
          })),
          {
            itemKind: "media_asset" as const,
            mediaAssetId: asset.id,
            quickPostId: null,
            durationSeconds: asset.durationSeconds || 15,
          },
        ];

      const res = await fetch(`/api/playlists/${pl.id}/items`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: nextItems }),
      });
      if (!res.ok) {
        toast.error("Failed to update playlist assignment");
        return;
      }
      toast.success(
        exists
          ? `Removed "${asset.title}" from "${pl.name}"`
          : `Added "${asset.title}" to "${pl.name}"`
      );
      await onRefresh();
    } finally {
      setSavingAssignment(false);
    }
  }

  async function handleDeleteAsset(asset: MediaAssetItem) {
    const ok = await confirm({
      title: `Delete "${asset.title}"?`,
      description:
        "This permanently removes the file from cloud storage and any playlists currently referencing it.",
      confirmLabel: "Delete Asset",
      variant: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/media/${asset.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete asset");
      return;
    }
    toast.success(`Deleted "${asset.title}"`);
    await onRefresh();
  }

  const usedMb = ((data.storageStats?.totalBytesUsed ?? 0) / (1024 * 1024)).toFixed(1);
  const quotaMb = Math.round(
    (data.storageStats?.quotaBytes ?? 1073741824) / (1024 * 1024)
  );

  return (
    <div className="space-y-5">
      {/* Clean Single-Row Header & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-zinc-400" />
            <Input
              className="h-8 pl-8 text-xs"
              placeholder="Search videos, images, web links..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-44">
            <ModernSelect
              size="sm"
              value={deptFilter}
              onValueChange={setDeptFilter}
              options={[
                { value: "", label: "All Departments" },
                ...data.departments.map((d) => ({ value: d.id, label: d.name })),
              ]}
            />
          </div>
          <span className="hidden items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-medium text-zinc-600 lg:inline-flex">
            <HardDrive className="size-3.5 text-blue-600" />
            {usedMb} / {quotaMb} MB used
          </span>
        </div>

        <Button
          size="sm"
          onClick={() => setShowAddPanel((v) => !v)}
        >
          <Plus className="size-3.5" />
          Add Media
        </Button>
      </div>

      {/* Type Filter Pills */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { id: "all", label: `All Assets (${data.mediaAssets.length})` },
            {
              id: "video",
              label: `Videos (${data.mediaAssets.filter((a) => a.mediaType === "video").length})`,
            },
            {
              id: "image",
              label: `Images (${data.mediaAssets.filter((a) => a.mediaType === "image").length})`,
            },
            {
              id: "web",
              label: `Web / YouTube / PDF (${data.mediaAssets.filter((a) => a.mediaType === "web_url" || a.mediaType === "pdf").length})`,
            },
          ] as const
        ).map((pill) => (
          <button
            key={pill.id}
            type="button"
            onClick={() => setTypeFilter(pill.id)}
            className={`rounded-full px-3.5 py-1 text-xs font-medium transition ${typeFilter === pill.id
              ? "bg-zinc-950 text-white"
              : "border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-950"
              }`}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* Collapsible Tabbed "+ Add Media" Panel (No Congestion!) */}
      {showAddPanel && (
        <Card className="border-zinc-300">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
                <button
                  type="button"
                  onClick={() => setAddMode("upload")}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium ${addMode === "upload"
                    ? "bg-white text-zinc-950 shadow-2xs"
                    : "text-zinc-500 hover:text-zinc-900"
                    }`}
                >
                  <Upload className="size-3.5" />
                  Upload Video / Image
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode("url")}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium ${addMode === "url"
                    ? "bg-white text-zinc-950 shadow-2xs"
                    : "text-zinc-500 hover:text-zinc-900"
                    }`}
                >
                  <Globe className="size-3.5" />
                  Zero-Disk Web / YouTube / PDF
                </button>
              </div>
            </div>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => setShowAddPanel(false)}
            >
              <X className="size-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {addMode === "upload" ? (
              <form onSubmit={handleUpload} className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Asset Title</Label>
                    <Input
                      className="h-8 text-xs"
                      placeholder="e.g. Showroom Campaign Promo MP4"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Department</Label>
                    <ModernSelect
                      size="sm"
                      value={deptId}
                      onValueChange={setDeptId}
                      options={data.departments.map((d) => ({
                        value: d.id,
                        label: d.name,
                      }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Video (MP4/MOV/WebM), Image, or PDF</Label>
                    <Input
                      type="file"
                      accept="video/*,image/*,application/pdf,.pdf"
                      className="h-8 text-xs"
                      disabled={uploading}
                      onChange={(e) => {
                        const picked = e.target.files?.[0] ?? null;
                        setFile(picked);
                        if (picked && !title.trim()) {
                          setTitle(
                            picked.name
                              .replace(/\.[^.]+$/, "")
                              .replace(/[-_]+/g, " ")
                              .trim()
                          );
                        }
                      }}
                      required
                    />
                  </div>
                </div>

                {file &&
                  (file.type.startsWith("video/") ||
                    /\.(mp4|mov|webm|mkv|m4v)$/i.test(file.name)) &&
                  (() => {
                    const compat = inspectVideoForAndroidTv(file);
                    const fileMb = (file.size / (1024 * 1024)).toFixed(1);
                    return (
                      <div className="space-y-2.5 rounded-xl border border-blue-200/80 bg-blue-50/50 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs font-medium text-blue-950">
                            <Cpu className="size-4 text-blue-600" />
                            <span>
                              Built-In GPU Video Compressor{" "}
                              <span className="font-normal text-blue-700">
                                ({fileMb} MB selected)
                              </span>
                            </span>
                          </div>
                          <div className="w-56">
                            <ModernSelect
                              size="sm"
                              value={compressionPreset}
                              onValueChange={(v) =>
                                setCompressionPreset(v as VideoCompressionPreset)
                              }
                              options={[
                                {
                                  value: "auto_fit",
                                  label: "Auto Fit < 45 MB (Recommended)",
                                },
                                {
                                  value: "high_1080p",
                                  label: "High Quality 1080p H.264",
                                },
                                {
                                  value: "balanced_720p",
                                  label: "Compact 720p (Longer Videos)",
                                },
                              ]}
                            />
                          </div>
                        </div>

                        <p
                          className={`rounded-lg px-2.5 py-1.5 text-xs ${compat.level === "optimal"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-white/80 text-blue-900"
                            }`}
                        >
                          {compat.tvReady ? "✓ " : "⚡ "}
                          {compat.summary}
                        </p>

                        {uploading && (
                          <div className="space-y-1.5 rounded-lg border border-blue-200 bg-white p-2.5">
                            <div className="flex items-center justify-between text-xs font-medium text-zinc-900">
                              <span>
                                {uploadPhase === "compressing"
                                  ? compressionProgress?.stage === "retrying"
                                    ? `Fine-tuning size under 45 MB (${compressionProgress.percent}%)`
                                    : compressionProgress?.stage === "analyzing"
                                      ? "Analyzing video tracks..."
                                      : `Compressing on GPU (${compressionProgress?.percent ?? 0}%)${compressionProgress?.totalSeconds
                                        ? ` · ${compressionProgress.processedSeconds ?? 0}s / ${compressionProgress.totalSeconds}s`
                                        : ""
                                      }`
                                  : uploadPhase === "uploading"
                                    ? "Uploading optimized MP4 to cloud..."
                                    : "Saving to Media Library & Playlists..."}
                              </span>
                              <span className="font-mono text-[11px] text-blue-700">
                                {uploadPhase === "compressing"
                                  ? `${compressionProgress?.percent ?? 0}%`
                                  : "100%"}
                              </span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                              <div
                                className="h-full rounded-full bg-blue-600 transition-all duration-200"
                                style={{
                                  width: `${uploadPhase === "compressing"
                                    ? Math.max(4, compressionProgress?.percent ?? 4)
                                    : 100
                                    }%`,
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                {/* Multi-Playlist Assignment right during upload */}
                {data.playlists.length > 0 && (
                  <div className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3">
                    <Label className="text-xs font-semibold text-zinc-700">
                      Add immediately to one or more playlists (optional):
                    </Label>
                    <div className="flex flex-wrap gap-1.5">
                      {data.playlists.map((pl) => {
                        const selected = targetPlaylistIds.includes(pl.id);
                        return (
                          <button
                            key={pl.id}
                            type="button"
                            onClick={() =>
                              setTargetPlaylistIds((prev) =>
                                selected
                                  ? prev.filter((id) => id !== pl.id)
                                  : [...prev, pl.id]
                              )
                            }
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${selected
                              ? "bg-zinc-950 text-white"
                              : "border border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400"
                              }`}
                          >
                            {selected && <Check className="size-3" />}
                            {pl.name}
                          </button>
                        );
                      })}
                    </div>

                    {targetPlaylistIds.length > 0 && (
                      <div className="pt-2">
                        <Label className="mb-1.5 block text-[11px] text-zinc-500">
                          Running Bottom Taglines (Optional — add multiple with Play Store / App Store / icons)
                        </Label>
                        <TaglineBuilder
                          compact
                          value={runningTagline}
                          onChange={setRunningTagline}
                          placeholder="e.g. Download Team Kubwa App Today!"
                        />
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (uploading) {
                        handleCancelUpload();
                      } else {
                        setShowAddPanel(false);
                      }
                    }}
                  >
                    {uploading ? "Cancel Compression" : "Cancel"}
                  </Button>
                  <Button type="submit" size="sm" disabled={uploading}>
                    <Upload className="size-3.5" />
                    {uploadPhase === "compressing"
                      ? `Compressing (${compressionProgress?.percent ?? 0}%)...`
                      : uploadPhase === "uploading"
                        ? "Uploading to Cloud..."
                        : uploadPhase === "saving"
                          ? "Finalizing..."
                          : "Compress & Upload"}
                  </Button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleAddExternalUrl} className="space-y-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Title</Label>
                    <Input
                      className="h-8 text-xs"
                      placeholder="e.g. Product Launch Video"
                      value={extTitle}
                      onChange={(e) => setExtTitle(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label className="text-xs">
                      YouTube, Canva, Google Slides, Power BI, or PDF URL
                    </Label>
                    <Input
                      className="h-8 text-xs"
                      placeholder="https://..."
                      value={extUrl}
                      onChange={(e) => setExtUrl(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Duration (sec)</Label>
                    <Input
                      type="number"
                      min={5}
                      max={600}
                      className="h-8 text-xs"
                      value={extDuration}
                      onChange={(e) =>
                        setExtDuration(Number(e.target.value) || 20)
                      }
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowAddPanel(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={uploading}>
                    <Globe className="size-3.5" />
                    Add Zero-Disk Embed
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {/* Spacious, Cleanly Aligned Media Asset Grid */}
      {filteredAssets.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-zinc-500">
            No media assets found. Click <strong>Add Media</strong> above to upload a video, image, or web link.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredAssets.map((asset) => {
            const dept = deptById.get(asset.departmentId);
            const usedIn = playlistsByAssetId.get(asset.id) ?? [];
            const isAssigning = assigningAssetId === asset.id;
            const sizeLabel =
              asset.fileSizeBytes === 0
                ? "0 MB (Embed)"
                : `${(asset.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`;

            return (
              <Card
                key={asset.id}
                className="flex flex-col overflow-hidden transition hover:border-zinc-300"
              >
                {/* Uniform 16:9 Thumbnail */}
                <div className="relative aspect-video w-full overflow-hidden border-b border-zinc-200 bg-zinc-950">
                  {asset.mediaType === "image" ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={asset.publicUrl}
                      alt={asset.title}
                      className="h-full w-full object-cover"
                    />
                  ) : asset.mediaType === "video" ? (
                    <video
                      src={asset.publicUrl}
                      muted
                      preload="metadata"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 bg-zinc-900 text-zinc-400">
                      <Globe className="size-8 text-blue-400" />
                      <span className="max-w-[80%] truncate font-mono text-[10px]">
                        {asset.publicUrl}
                      </span>
                    </div>
                  )}

                  {/* Top-left Media Type Badge */}
                  <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
                    {asset.mediaType === "video" ? (
                      <Badge variant="info">
                        <Film className="size-3" />
                        Video
                      </Badge>
                    ) : asset.mediaType === "image" ? (
                      <Badge variant="success">
                        <ImageIcon className="size-3" />
                        Image
                      </Badge>
                    ) : (
                      <Badge variant="purple">
                        <Globe className="size-3" />
                        {asset.mediaType === "pdf" ? "PDF" : "Web"}
                      </Badge>
                    )}
                    {asset.approvalStatus === "pending_approval" && (
                      <Badge variant="warning">Pending</Badge>
                    )}
                  </div>

                  {/* Bottom-right Duration / Size pill */}
                  <span className="absolute bottom-2 right-2 rounded-md bg-black/75 px-2 py-0.5 font-mono text-[10px] font-medium text-white">
                    {asset.durationSeconds}s • {sizeLabel}
                  </span>
                </div>

                {/* Card Body */}
                <CardContent className="flex flex-1 flex-col justify-between gap-3 p-4">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-zinc-950">
                          {asset.title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-zinc-500">
                          {dept?.name ?? "General"}
                        </p>
                      </div>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        title="Delete Asset"
                        onClick={() => void handleDeleteAsset(asset)}
                      >
                        <Trash2 className="size-3.5 text-rose-500" />
                      </Button>
                    </div>

                    {/* Multi-Playlist Usage Pills */}
                    <div className="flex flex-wrap items-center gap-1">
                      {usedIn.length === 0 ? (
                        <span className="text-[11px] text-zinc-400">
                          Not assigned to any playlist yet
                        </span>
                      ) : (
                        usedIn.map((pl) => (
                          <Badge
                            key={pl.id}
                            variant="outline"
                            className="text-[10px]"
                          >
                            <ListVideo className="size-2.5 text-blue-600" />
                            {pl.name}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Multi-Playlist Picker Drawer */}
                  <div className="border-t border-zinc-100 pt-2.5">
                    <Button
                      type="button"
                      size="xs"
                      variant={isAssigning ? "secondary" : "outline"}
                      className="w-full"
                      onClick={() =>
                        setAssigningAssetId(isAssigning ? null : asset.id)
                      }
                    >
                      <ListVideo className="size-3.5" />
                      {isAssigning
                        ? "Done Assigning Playlists"
                        : `Assign to Playlists (${usedIn.length})`}
                    </Button>

                    {isAssigning && (
                      <div className="mt-2.5 space-y-1.5 rounded-lg border border-zinc-200 bg-zinc-50 p-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                          Toggle playlists for this asset
                        </p>
                        {data.playlists.length === 0 ? (
                          <p className="text-[11px] text-zinc-500">
                            Create a playlist first.
                          </p>
                        ) : (
                          data.playlists.map((pl) => {
                            const active = usedIn.some((u) => u.id === pl.id);
                            return (
                              <button
                                key={pl.id}
                                type="button"
                                disabled={savingAssignment}
                                onClick={() =>
                                  void handleToggleAssetInPlaylist(asset, pl)
                                }
                                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition ${active
                                  ? "bg-zinc-950 font-medium text-white"
                                  : "bg-white text-zinc-700 hover:bg-zinc-100"
                                  }`}
                              >
                                <span className="truncate">{pl.name}</span>
                                {active ? (
                                  <Check className="size-3.5 shrink-0 text-emerald-400" />
                                ) : (
                                  <Plus className="size-3.5 shrink-0 text-zinc-400" />
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
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
