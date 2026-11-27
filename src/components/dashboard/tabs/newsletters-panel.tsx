"use client";

/**
 * @file src/components/dashboard/tabs/newsletters-panel.tsx
 * @description End-to-end Multi-Page PDF Newsletter Manager inside Promotions & Background Audio.
 * Splits multi-page PDFs (e.g. IMPACT ESG Newsletters) in the admin's browser into crisp HD WebP
 * slides (1 page = 1 TV slide) with per-page preview/toggle/duration, Run-Until auto-expiry dates,
 * single/multi-screen & multi-playlist targeting, ambient audio, full editing, and 1-click R2 delete.
 */

import { useMemo, useState } from "react";
import {
  BookOpen,
  Calendar,
  Check,
  Clock,
  FileText,
  Layers,
  ListVideo,
  Loader2,
  Music,
  PauseCircle,
  Pencil,
  PlayCircle,
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
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModernSelect } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  splitPdfIntoWebpSlides,
  type PdfSplitProgress,
  type RenderedPdfPageDraft,
} from "@/lib/pdf-splitter";
import type {
  NewsletterItem,
  NewsletterPageItem,
  OverviewPayload,
} from "../cms-types";

interface NewslettersPanelProps {
  data: OverviewPayload;
  onRefresh: () => Promise<void>;
  uploadToCloudR2: (
    file: File,
    departmentCode: string
  ) => Promise<{
    publicUrl: string;
    storagePath: string;
    sha256Checksum: string;
  }>;
  showForm: boolean;
  onShowFormChange: (show: boolean) => void;
}

interface EditablePageDraft {
  key: string;
  pageNumber: number;
  previewUrl: string;
  durationSeconds: number;
  included: boolean;
  // Either newly rendered from PDF (needs R2 upload) OR already persisted on R2
  newFile?: File;
  width?: number;
  height?: number;
  existing?: NewsletterPageItem;
}

function getNewsletterStatus(nl: NewsletterItem): {
  label: string;
  variant: "success" | "warning" | "secondary" | "danger";
} {
  if (!nl.isActive) return { label: "Paused", variant: "secondary" };
  const now = Date.now();
  if (nl.startDate && Date.parse(nl.startDate) > now) {
    return { label: "Scheduled", variant: "warning" };
  }
  if (nl.endDate && Date.parse(nl.endDate) < now) {
    return { label: "Expired", variant: "danger" };
  }
  return { label: "Live", variant: "success" };
}

export function NewslettersPanel({
  data,
  onRefresh,
  uploadToCloudR2,
  showForm,
  onShowFormChange,
}: NewslettersPanelProps) {
  const confirm = useConfirm();
  const newsletters = useMemo(() => data.newsletters ?? [], [data.newsletters]);
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
  const playlistById = useMemo(
    () => new Map(data.playlists.map((p) => [p.id, p])),
    [data.playlists]
  );

  // Create / Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [issueLabel, setIssueLabel] = useState("Issue 1");
  const [departmentName, setDepartmentName] = useState("Corporate Comms");
  const [defaultPageSec, setDefaultPageSec] = useState(15);
  const [injectEveryNSlides, setInjectEveryNSlides] = useState(4);
  const [displayFitMode, setDisplayFitMode] = useState<
    "auto" | "ambient_blur" | "edge_cover" | "showroom_light"
  >("auto");
  const [audioTrackId, setAudioTrackId] = useState("");
  const [targetMode, setTargetMode] = useState<
    "global" | "branch" | "country" | "screen_group" | "screens"
  >("global");
  const [targetId, setTargetId] = useState("");
  const [selectedScreenIds, setSelectedScreenIds] = useState<string[]>([]);
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<string[]>([]);
  const [screenSearch, setScreenSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(false);

  // PDF Split & Upload progress
  const [pageDrafts, setPageDrafts] = useState<EditablePageDraft[]>([]);
  const [splitting, setSplitting] = useState<PdfSplitProgress | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadStatusText, setUploadStatusText] = useState("");

  const filteredScreens = useMemo(() => {
    const q = screenSearch.trim().toLowerCase();
    if (!q) return data.screens;
    return data.screens.filter((s) => s.name.toLowerCase().includes(q));
  }, [data.screens, screenSearch]);

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setIssueLabel("Issue 1");
    setDepartmentName("Corporate Comms");
    setDefaultPageSec(15);
    setInjectEveryNSlides(4);
    setDisplayFitMode("auto");
    setAudioTrackId("");
    setTargetMode("global");
    setTargetId("");
    setSelectedScreenIds([]);
    setSelectedPlaylistIds([]);
    setScreenSearch("");
    setStartDate("");
    setEndDate("");
    setReplaceExisting(false);
    setPageDrafts([]);
    setUploadStatusText("");
  }

  function openEditNewsletter(nl: NewsletterItem) {
    setEditingId(nl.id);
    setTitle(nl.title);
    setIssueLabel(nl.issueLabel || "Issue 1");
    setDepartmentName(nl.departmentName || "Corporate Comms");
    setInjectEveryNSlides(nl.injectEveryNSlides || 4);
    setDisplayFitMode(
      (nl.displayFitMode as
        | "auto"
        | "ambient_blur"
        | "edge_cover"
        | "showroom_light") || "auto"
    );
    setAudioTrackId(nl.audioTrackId ?? "");

    if (nl.targetScreenIds && nl.targetScreenIds.length > 0) {
      setTargetMode("screens");
      setSelectedScreenIds(nl.targetScreenIds);
      setTargetId("");
    } else if (
      nl.targetType === "branch" ||
      nl.targetType === "country" ||
      nl.targetType === "screen_group"
    ) {
      setTargetMode(nl.targetType);
      setTargetId(nl.targetId ?? "");
      setSelectedScreenIds([]);
    } else if (nl.targetType === "screen" && nl.targetId) {
      setTargetMode("screens");
      setSelectedScreenIds([nl.targetId]);
      setTargetId("");
    } else {
      setTargetMode("global");
      setTargetId("");
      setSelectedScreenIds([]);
    }
    setSelectedPlaylistIds(
      Array.isArray(nl.targetPlaylistIds) ? nl.targetPlaylistIds : []
    );
    setStartDate(nl.startDate ? nl.startDate.slice(0, 10) : "");
    setEndDate(nl.endDate ? nl.endDate.slice(0, 10) : "");
    setReplaceExisting(false);

    const existingPages = [...(nl.pages ?? [])].sort(
      (a, b) => a.pageNumber - b.pageNumber
    );
    setPageDrafts(
      existingPages.map((p) => ({
        key: `existing-${nl.id}-${p.pageNumber}`,
        pageNumber: p.pageNumber,
        previewUrl: p.publicUrl,
        durationSeconds: p.durationSeconds || 15,
        included: true,
        width: p.width,
        height: p.height,
        existing: p,
      }))
    );
    onShowFormChange(true);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function handlePdfSelected(pdfFile: File) {
    if (
      pdfFile.type !== "application/pdf" &&
      !pdfFile.name.toLowerCase().endsWith(".pdf")
    ) {
      toast.error("Please select a valid multi-page .pdf newsletter file.");
      return;
    }

    setSplitting({ currentPage: 1, totalPages: 1 });
    try {
      const rendered: RenderedPdfPageDraft[] = await splitPdfIntoWebpSlides(
        pdfFile,
        {
          defaultDurationSeconds: Math.max(5, Number(defaultPageSec) || 15),
          onProgress: (p) => setSplitting(p),
        }
      );

      if (rendered.length === 0) {
        toast.error("Could not extract any pages from this PDF.");
        return;
      }

      if (!title.trim()) {
        const cleanTitle = pdfFile.name
          .replace(/\.pdf$/i, "")
          .replace(/[-_]+/g, " ")
          .trim();
        setTitle(cleanTitle || "Corporate Newsletter");
      }

      setPageDrafts(
        rendered.map((r) => ({
          key: `pdf-${Date.now()}-${r.pageNumber}`,
          pageNumber: r.pageNumber,
          previewUrl: r.previewDataUrl,
          durationSeconds: r.durationSeconds,
          included: true,
          newFile: r.file,
          width: r.width,
          height: r.height,
        }))
      );
      toast.success(
        `Split PDF into ${rendered.length} crisp HD slide${rendered.length === 1 ? "" : "s"} — review pages & publish!`
      );
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to split PDF pages in browser."
      );
    } finally {
      setSplitting(null);
    }
  }

  async function handleSaveNewsletter(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Enter a newsletter title.");
      return;
    }
    const activePages = pageDrafts.filter((p) => p.included);
    if (activePages.length === 0) {
      toast.error(
        "Upload a PDF newsletter and keep at least 1 page selected."
      );
      return;
    }
    if (targetMode === "screens" && selectedScreenIds.length === 0) {
      toast.error("Select at least one target TV display.");
      return;
    }

    setSaving(true);
    try {
      const uploadedPages: NewsletterPageItem[] = [];
      for (let i = 0; i < activePages.length; i++) {
        const draft = activePages[i];
        if (draft.newFile) {
          setUploadStatusText(
            `Uploading Page ${i + 1} of ${activePages.length} to Cloudflare R2...`
          );
          const up = await uploadToCloudR2(draft.newFile, "NEWSLETTERS");
          uploadedPages.push({
            pageNumber: i + 1,
            publicUrl: up.publicUrl,
            storagePath: up.storagePath,
            sha256Checksum: up.sha256Checksum,
            fileSizeBytes: draft.newFile.size,
            durationSeconds: Math.max(5, Number(draft.durationSeconds) || 15),
            width: draft.width,
            height: draft.height,
          });
        } else if (draft.existing) {
          uploadedPages.push({
            ...draft.existing,
            pageNumber: i + 1,
            durationSeconds: Math.max(5, Number(draft.durationSeconds) || 15),
          });
        }
      }

      setUploadStatusText("Publishing newsletter live to paired TVs...");
      const payload = {
        title: title.trim(),
        issueLabel: issueLabel.trim() || "Issue 1",
        departmentName: departmentName.trim() || "Corporate Comms",
        pages: uploadedPages,
        displayFitMode,
        injectEveryNSlides: Math.max(1, Number(injectEveryNSlides) || 4),
        audioTrackId: audioTrackId || null,
        targetType: targetMode === "screens" ? "screen" : targetMode,
        targetId:
          targetMode === "global" || targetMode === "screens"
            ? null
            : targetId || null,
        targetScreenIds:
          targetMode === "screens" ? selectedScreenIds : null,
        targetPlaylistIds:
          selectedPlaylistIds.length > 0 ? selectedPlaylistIds : null,
        startDate: startDate
          ? new Date(`${startDate}T00:00:00`).toISOString()
          : null,
        endDate: endDate
          ? new Date(`${endDate}T23:59:59`).toISOString()
          : null,
        ...(!editingId ? { replaceExisting } : {}),
      };

      const res = await fetch(
        editingId ? `/api/newsletters/${editingId}` : "/api/newsletters",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(json.error || "Could not save newsletter");
        return;
      }

      toast.success(
        editingId
          ? `Updated "${title.trim()}" (${uploadedPages.length} slides) & pushed live to TVs`
          : `Published "${title.trim()}" (${uploadedPages.length} sequential slides) live to TVs!`
      );
      resetForm();
      onShowFormChange(false);
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSaving(false);
      setUploadStatusText("");
    }
  }

  async function handleToggleNewsletter(nl: NewsletterItem) {
    const res = await fetch(`/api/newsletters/${nl.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !nl.isActive }),
    });
    if (!res.ok) {
      toast.error("Failed to update newsletter");
      return;
    }
    toast.success(
      nl.isActive ? `Paused "${nl.title}"` : `Resumed "${nl.title}"`
    );
    await onRefresh();
  }

  async function handleDeleteNewsletter(nl: NewsletterItem) {
    const pageCount = nl.pages?.length ?? 0;
    const ok = await confirm({
      title: `Delete newsletter "${nl.title}"?`,
      description: `This permanently removes all ${pageCount} slide(s) from rotation on paired TVs and purges every page image from Cloudflare R2 storage.`,
      confirmLabel: "Delete Newsletter",
      variant: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/newsletters/${nl.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete newsletter");
      return;
    }
    if (editingId === nl.id) {
      resetForm();
      onShowFormChange(false);
    }
    toast.success(`Deleted "${nl.title}" & purged ${pageCount} page(s) from R2`);
    await onRefresh();
  }

  function resolveTargetText(nl: NewsletterItem): string {
    if (nl.targetScreenIds && nl.targetScreenIds.length > 0) {
      const names = nl.targetScreenIds
        .map((id) => screenById.get(id)?.name)
        .filter(Boolean);
      return names.length <= 2
        ? names.join(", ") || `${nl.targetScreenIds.length} screens`
        : `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
    }
    if (nl.targetType === "global") return "All Displays";
    if (nl.targetType === "branch" && nl.targetId) {
      return `Location: ${branchById.get(nl.targetId)?.name ?? "Showroom"}`;
    }
    return nl.targetType;
  }

  const includedCount = pageDrafts.filter((p) => p.included).length;

  return (
    <div className="space-y-4">
      {showForm && (
        <Card className="border-emerald-300 bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="size-4 text-emerald-600" />
                {editingId
                  ? `Edit Newsletter — ${title || "Issue"}`
                  : "Ingest Multi-Page PDF Newsletter (Auto-Split to TV Slides)"}
              </CardTitle>
              <CardDescription>
                Upload a multi-page PDF newsletter (e.g. 3-page IMPACT ESG Issue) — each page is automatically converted into a razor-sharp HD WebP slide playing sequentially Page 1 → Page N with zero PDF lag on Smart TVs.
              </CardDescription>
            </div>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => {
                resetForm();
                onShowFormChange(false);
              }}
            >
              <X className="size-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleSaveNewsletter}
              className="grid gap-3.5 md:grid-cols-12"
            >
              {/* PDF Upload Dropzone */}
              <div className="space-y-1.5 md:col-span-12">
                <Label className="text-xs font-semibold">
                  {editingId
                    ? "Replace PDF Newsletter (Optional — leave blank to keep current pages)"
                    : "Multi-Page PDF Newsletter File (.pdf)"}
                </Label>
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-emerald-300 bg-emerald-50/40 p-3.5">
                  <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-zinc-950 px-3 text-xs font-medium text-white shadow-2xs transition hover:bg-zinc-800">
                    <FileText className="size-3.5 text-emerald-300" />
                    {splitting
                      ? `Rendering Page ${splitting.currentPage}/${splitting.totalPages}...`
                      : pageDrafts.length > 0
                        ? "Upload Different PDF"
                        : "Select PDF Newsletter (.pdf)"}
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      disabled={Boolean(splitting) || saving}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handlePdfSelected(f);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>
                  {splitting ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800">
                      <Loader2 className="size-3.5 animate-spin" />
                      Converting page {splitting.currentPage} of {splitting.totalPages} to HD WebP...
                    </span>
                  ) : pageDrafts.length > 0 ? (
                    <span className="text-xs font-medium text-emerald-800">
                      {includedCount} of {pageDrafts.length} page(s) selected as sequential TV slides
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-500">
                      Supports 1–40 pages • Automatically splits 3 pages → 3 sequential slides (Page 1 → Page 2 → Page 3)
                    </span>
                  )}
                </div>
              </div>

              {/* Interactive Page Preview Strip */}
              {pageDrafts.length > 0 && (
                <div className="space-y-2.5 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 md:col-span-12">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Layers className="size-3.5 text-emerald-600" />
                      <span className="text-xs font-semibold text-zinc-900">
                        Extracted Newsletter Slides ({includedCount} Active)
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-[11px] text-zinc-500">
                        Apply to all pages:
                      </span>
                      <Input
                        type="number"
                        min={5}
                        max={120}
                        className="h-7 w-16 bg-white text-xs"
                        value={defaultPageSec}
                        onChange={(e) =>
                          setDefaultPageSec(Number(e.target.value) || 15)
                        }
                      />
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() =>
                          setPageDrafts((prev) =>
                            prev.map((p) => ({
                              ...p,
                              durationSeconds: Math.max(
                                5,
                                Number(defaultPageSec) || 15
                              ),
                            }))
                          )
                        }
                      >
                        Set All ({defaultPageSec}s)
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                    {pageDrafts.map((pg, idx) => (
                      <div
                        key={pg.key}
                        className={`flex flex-col overflow-hidden rounded-lg border bg-white transition ${
                          pg.included
                            ? "border-emerald-300 shadow-2xs"
                            : "border-zinc-200 opacity-50"
                        }`}
                      >
                        <div className="relative flex aspect-[3/4] items-center justify-center overflow-hidden bg-zinc-100">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={pg.previewUrl}
                            alt={`Page ${pg.pageNumber}`}
                            className="h-full w-full object-contain"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setPageDrafts((prev) =>
                                prev.map((item, i) =>
                                  i === idx
                                    ? { ...item, included: !item.included }
                                    : item
                                )
                              )
                            }
                            className={`absolute right-2 top-2 flex size-5 items-center justify-center rounded border shadow-xs transition ${
                              pg.included
                                ? "border-emerald-600 bg-emerald-600 text-white"
                                : "border-zinc-300 bg-white text-transparent"
                            }`}
                            title={
                              pg.included
                                ? "Exclude this page"
                                : "Include this page"
                            }
                          >
                            <Check className="size-3 stroke-[3]" />
                          </button>
                          <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            Page {pg.pageNumber}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 border-t border-zinc-100 p-2 text-[11px]">
                          <span className="flex items-center gap-1 text-zinc-500">
                            <Clock className="size-3" />
                            Dwell:
                          </span>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min={5}
                              max={300}
                              disabled={!pg.included}
                              value={pg.durationSeconds}
                              onChange={(e) =>
                                setPageDrafts((prev) =>
                                  prev.map((item, i) =>
                                    i === idx
                                      ? {
                                          ...item,
                                          durationSeconds: Math.max(
                                            5,
                                            Number(e.target.value) || 15
                                          ),
                                        }
                                      : item
                                  )
                                )
                              }
                              className="h-6 w-14 text-center text-[11px]"
                            />
                            <span className="text-[10px] text-zinc-400">s</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Title, Issue, Department, Cadence */}
              <div className="space-y-1 md:col-span-4">
                <Label className="text-xs">Newsletter Title</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="e.g. IMPACT ESG Sustainability Newsletter"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1 md:col-span-3">
                <Label className="text-xs">Issue / Edition Label</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="e.g. Issue 1 • Oct 2026"
                  value={issueLabel}
                  onChange={(e) => setIssueLabel(e.target.value)}
                />
              </div>
              <div className="space-y-1 md:col-span-3">
                <Label className="text-xs">Department / Publisher</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="e.g. ESG & Sustainability"
                  value={departmentName}
                  onChange={(e) => setDepartmentName(e.target.value)}
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label className="text-xs">Show Every N Slides</Label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  className="h-8 text-xs"
                  value={injectEveryNSlides}
                  onChange={(e) =>
                    setInjectEveryNSlides(Math.max(1, Number(e.target.value) || 4))
                  }
                />
              </div>

              {/* Start Date, Run Until (Auto-Expiry), Display Fit, Background Audio */}
              <div className="space-y-1 md:col-span-3">
                <Label className="text-xs">Start Date (Optional)</Label>
                <DatePicker
                  value={startDate}
                  onChange={setStartDate}
                  placeholder="Starts immediately"
                />
              </div>
              <div className="space-y-1 md:col-span-3">
                <Label className="text-xs">Run Until / Auto-Expiry</Label>
                <DatePicker
                  value={endDate}
                  onChange={setEndDate}
                  placeholder="No expiry date"
                  align="right"
                />
              </div>
              <div className="space-y-1 md:col-span-3">
                <Label className="text-xs">A4 Backdrop / Fit Mode</Label>
                <ModernSelect
                  size="sm"
                  value={displayFitMode}
                  onValueChange={(v) =>
                    setDisplayFitMode(v as typeof displayFitMode)
                  }
                  options={[
                    { value: "auto", label: "Auto (A4 Color-Bleed Blur)" },
                    { value: "ambient_blur", label: "Vibrant Ambient Blur" },
                    { value: "showroom_light", label: "Showroom Light Gallery" },
                    { value: "edge_cover", label: "Edge-to-Edge Fill" },
                  ]}
                />
              </div>
              <div className="space-y-1 md:col-span-3">
                <Label className="text-xs">Background Music</Label>
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

              {/* Target Displays Selector */}
              <div className="space-y-1 md:col-span-4">
                <Label className="text-xs">Target TV Displays</Label>
                <ModernSelect
                  size="sm"
                  value={targetMode}
                  onValueChange={(v) => {
                    setTargetMode(v as typeof targetMode);
                    setTargetId("");
                  }}
                  options={[
                    { value: "global", label: "All Paired Displays (Global)" },
                    { value: "screens", label: "Specific TV / Multiple TVs" },
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
                      Select Specific TV(s) ({selectedScreenIds.length} selected)
                    </Label>
                    <div className="flex items-center gap-2">
                      <div className="relative w-48">
                        <Search className="pointer-events-none absolute left-2 top-2 size-3 text-zinc-400" />
                        <Input
                          className="h-7 bg-white pl-7 text-xs"
                          placeholder="Filter displays..."
                          value={screenSearch}
                          onChange={(e) => setScreenSearch(e.target.value)}
                        />
                      </div>
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() =>
                          setSelectedScreenIds(data.screens.map((s) => s.id))
                        }
                      >
                        Select All
                      </Button>
                      {selectedScreenIds.length > 0 && (
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          onClick={() => setSelectedScreenIds([])}
                        >
                          Clear
                        </Button>
                      )}
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

              {/* Optional Multi-Playlist Embedding */}
              {data.playlists.length > 0 && (
                <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50/70 p-3 md:col-span-12">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <Label className="flex items-center gap-1.5 text-xs font-semibold">
                        <ListVideo className="size-3.5 text-emerald-600" />
                        Embed in Specific Playlists (
                        {selectedPlaylistIds.length === 0
                          ? "Any Playlist on Target TVs"
                          : `${selectedPlaylistIds.length} Selected`}
                        )
                      </Label>
                      <p className="text-[11px] text-zinc-500">
                        Leave unchecked to air on whichever playlist your target TVs are playing, or pick specific playlists.
                      </p>
                    </div>
                    {selectedPlaylistIds.length > 0 && (
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        onClick={() => setSelectedPlaylistIds([])}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                  <div className="grid max-h-32 gap-1.5 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                    {data.playlists.map((pl) => {
                      const checked = selectedPlaylistIds.includes(pl.id);
                      return (
                        <button
                          key={pl.id}
                          type="button"
                          onClick={() =>
                            setSelectedPlaylistIds((prev) =>
                              checked
                                ? prev.filter((id) => id !== pl.id)
                                : [...prev, pl.id]
                            )
                          }
                          className={`flex items-center justify-between rounded-md border px-2.5 py-1.5 text-left text-xs transition ${
                            checked
                              ? "border-zinc-950 bg-white font-semibold text-zinc-950"
                              : "border-zinc-200 bg-white/70 text-zinc-600 hover:border-zinc-300"
                          }`}
                        >
                          <span className="truncate">{pl.name}</span>
                          {checked && (
                            <Check className="size-3.5 shrink-0 text-emerald-600" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Footer Save / Replace Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 md:col-span-12">
                <div>
                  {!editingId && newsletters.length > 0 && (
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-950">
                      <input
                        type="checkbox"
                        checked={replaceExisting}
                        onChange={(e) => setReplaceExisting(e.target.checked)}
                        className="size-3.5 rounded accent-zinc-950"
                      />
                      Replace previous newsletter issue(s) ({newsletters.length}) &amp; purge old R2 files
                    </label>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {uploadStatusText && (
                    <span className="text-[11px] font-medium text-emerald-700">
                      {uploadStatusText}
                    </span>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      resetForm();
                      onShowFormChange(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={saving || Boolean(splitting) || includedCount === 0}
                  >
                    <Upload className="size-3.5" />
                    {saving
                      ? "Publishing..."
                      : editingId
                        ? `Save Newsletter (${includedCount} Slides)`
                        : `Publish ${includedCount} Slide${includedCount === 1 ? "" : "s"} Live`}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Published Newsletters Grid */}
      {newsletters.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-xs text-zinc-500">
            No newsletters published yet. Click{" "}
            <strong>Upload PDF Newsletter</strong> above to ingest a multi-page
            PDF (like your 3-page IMPACT ESG Newsletter) — each page becomes a
            crisp sequential TV slide with full scheduling, screen targeting, and
            1-click deletion!
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {newsletters.map((nl) => {
            const status = getNewsletterStatus(nl);
            const pages = [...(nl.pages ?? [])].sort(
              (a, b) => a.pageNumber - b.pageNumber
            );
            const totalDuration = pages.reduce(
              (sum, p) => sum + (p.durationSeconds || 15),
              0
            );
            const track = nl.audioTrackId
              ? audioById.get(nl.audioTrackId)
              : null;

            return (
              <Card
                key={nl.id}
                className="flex flex-col overflow-hidden border-zinc-200 bg-white"
              >
                {/* Mini Page-Strip Thumbnail Header */}
                <div className="relative flex aspect-video items-center justify-center gap-1.5 overflow-hidden bg-gradient-to-br from-emerald-950 via-zinc-900 to-slate-900 p-2.5">
                  {pages.slice(0, 3).map((pg) => (
                    <div
                      key={pg.pageNumber}
                      className="relative h-full overflow-hidden rounded border border-white/20 bg-white shadow-md"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={pg.publicUrl}
                        alt={`${nl.title} Page ${pg.pageNumber}`}
                        className="h-full w-auto object-contain"
                      />
                      <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-0.5 text-[9px] font-bold text-white">
                        P{pg.pageNumber}
                      </span>
                    </div>
                  ))}
                  {pages.length > 3 && (
                    <div className="flex h-full min-w-[44px] items-center justify-center rounded border border-white/20 bg-white/10 px-2 text-xs font-bold text-white backdrop-blur-xs">
                      +{pages.length - 3}
                    </div>
                  )}
                  <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
                    <Badge variant={status.variant} className="text-[10px]">
                      {status.label}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="border-white/20 bg-black/65 text-[10px] text-white"
                    >
                      {pages.length} Slide{pages.length === 1 ? "" : "s"} •{" "}
                      {totalDuration}s
                    </Badge>
                  </div>
                </div>

                <CardContent className="flex flex-1 flex-col justify-between gap-3 p-3.5 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-zinc-950">{nl.title}</p>
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        {nl.issueLabel}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-zinc-500">
                      {nl.departmentName} •{" "}
                      <strong className="text-zinc-700">
                        {resolveTargetText(nl)}
                      </strong>
                    </p>
                    <p className="flex items-center gap-1 text-[10px] text-zinc-600">
                      <ListVideo className="size-3 shrink-0 text-emerald-600" />
                      <span className="truncate">
                        {nl.targetPlaylistIds && nl.targetPlaylistIds.length > 0
                          ? (() => {
                              const names = nl.targetPlaylistIds
                                .map((id) => playlistById.get(id)?.name)
                                .filter(Boolean);
                              return `Playlists: ${names.slice(0, 2).join(", ")}${names.length > 2 ? ` +${names.length - 2}` : ""}`;
                            })()
                          : `Every ${nl.injectEveryNSlides} slides on target TVs`}
                      </span>
                    </p>
                    <p className="flex items-center gap-1 text-[10px] text-zinc-500">
                      <Calendar className="size-3 text-zinc-400" />
                      {nl.startDate ? nl.startDate.slice(0, 10) : "Active now"} →{" "}
                      {nl.endDate ? (
                        <strong className="text-zinc-700">
                          Runs until {nl.endDate.slice(0, 10)}
                        </strong>
                      ) : (
                        "No expiry"
                      )}
                    </p>
                    {track && (
                      <p className="flex items-center gap-1 text-[10px] font-medium text-blue-600">
                        <Music className="size-3" />
                        Audio: {track.title} ({track.volumePercent}%)
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-1 border-t border-zinc-100 pt-2">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => openEditNewsletter(nl)}
                    >
                      <Pencil className="size-3 text-zinc-700" />
                      Edit / Screens
                    </Button>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        title={nl.isActive ? "Pause Newsletter" : "Resume Newsletter"}
                        onClick={() => void handleToggleNewsletter(nl)}
                      >
                        {nl.isActive ? (
                          <PauseCircle className="size-4 text-amber-600" />
                        ) : (
                          <PlayCircle className="size-4 text-emerald-600" />
                        )}
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        title="Delete Newsletter & Purge R2 Pages"
                        onClick={() => void handleDeleteNewsletter(nl)}
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
      )}
    </div>
  );
}
