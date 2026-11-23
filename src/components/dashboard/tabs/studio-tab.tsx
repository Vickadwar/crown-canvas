"use client";

/**
 * @file src/components/dashboard/tabs/studio-tab.tsx
 * @description Streamlined Crown Studio workspace wrapper with single-row header bar,
 * collapsible Running Tagline drawer for maximum canvas viewport, and seamless switching
 * between Figma/Canva Visual Studio and Live ERP / Quick-Form Mode.
 */

import { useState } from "react";
import { Activity, LayoutTemplate, MessageSquareText, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
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
import { TaglineBuilder } from "@/components/dashboard/tagline-builder";
import { QuickPostSlide } from "@/components/player/quick-post-slide";
import { CanvasEditor } from "@/components/studio/canvas-editor";
import { createBlankCanvasDoc } from "@/lib/studio-templates";
import type { QuickPostSlideConfig, StudioCanvasDoc } from "@/db/schema";
import type { OverviewPayload, QuickPostItem } from "../cms-types";

interface StudioTabProps {
  data: OverviewPayload;
  studioMode: "canvas" | "kpi";
  onStudioModeChange: (mode: "canvas" | "kpi") => void;
  studioCanvasDoc: StudioCanvasDoc;
  studioEditorKey: number;
  editingQuickPostId: string | null;
  qpTitle: string;
  onQpTitleChange: (v: string) => void;
  qpDeptId: string;
  onQpDeptIdChange: (v: string) => void;
  selectedPlaylistId: string;
  onSelectedPlaylistIdChange: (v: string) => void;
  qpAddToPlaylist: boolean;
  onQpAddToPlaylistChange: (v: boolean) => void;
  savingStudio: boolean;
  onBrowseTemplates: () => void;
  onResetNewSlide: () => void;
  onLoadExistingSlide: (qp: QuickPostItem) => void;
  onSaveCanvasSlide: (doc: StudioCanvasDoc) => Promise<void>;
  onSaveAsCustomTemplate: (
    name: string,
    category: "decorative" | "automotive" | "industrial" | "department" | "custom",
    doc: StudioCanvasDoc
  ) => Promise<void>;
  onRefresh: () => Promise<void>;
}

export function StudioTab({
  data,
  studioMode,
  onStudioModeChange,
  studioCanvasDoc,
  studioEditorKey,
  editingQuickPostId,
  qpTitle,
  onQpTitleChange,
  qpDeptId,
  onQpDeptIdChange,
  selectedPlaylistId,
  onSelectedPlaylistIdChange,
  qpAddToPlaylist,
  onQpAddToPlaylistChange,
  savingStudio,
  onBrowseTemplates,
  onResetNewSlide,
  onLoadExistingSlide,
  onSaveCanvasSlide,
  onSaveAsCustomTemplate,
  onRefresh,
}: StudioTabProps) {
  const [showTaglineDrawer, setShowTaglineDrawer] = useState(false);
  const [tickerDrafts, setTickerDrafts] = useState<Record<string, string>>({});

  // Quick-Form / Live ERP KPI Mode state
  const [qpTemplate, setQpTemplate] = useState<QuickPostItem["templateType"]>("kpi_chart");
  const [qpTheme, setQpTheme] = useState<NonNullable<QuickPostSlideConfig["backgroundTheme"]>>("crown_navy");
  const [qpBadge, setQpBadge] = useState("LIVE COMMERCIAL KPI");
  const [qpHeadline, setQpHeadline] = useState("Showroom Sales vs. Target");
  const [qpSubheadline, setQpSubheadline] = useState("Real-Time Performance Snapshot");
  const [qpBody, setQpBody] = useState("Updated automatically from connected ERP & POS data feeds.");
  const [qpDataFeedId, setQpDataFeedId] = useState(data.dataFeeds[0]?.id ?? "");
  const [qpCurrency, setQpCurrency] = useState<"KES" | "TZS" | "UGX">("KES");
  const [qpPrice, setQpPrice] = useState("4,950");
  const [qpQrUrl, setQpQrUrl] = useState("https://www.crownpaints.co.ke/product-category/decorative");
  const [qpQrLabel, setQpQrLabel] = useState("Scan to Explore Products");
  const [savingKpi, setSavingKpi] = useState(false);

  const targetPl = data.playlists.find((p) => p.id === selectedPlaylistId) ?? null;

  async function handleSaveTaglines(nextText: string) {
    if (!targetPl) return;
    const res = await fetch(`/api/playlists/${targetPl.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tickerText: nextText.trim() || null }),
    });
    if (!res.ok) {
      toast.error("Failed to save running taglines");
      return;
    }
    toast.success("Running taglines updated & pushed to paired TVs");
    await onRefresh();
  }

  async function handlePublishKpiSlide(e: React.FormEvent) {
    e.preventDefault();
    if (!qpTitle.trim() || !qpDeptId) {
      toast.error("Provide a slide title and department.");
      return;
    }
    setSavingKpi(true);
    try {
      const slideConfig: QuickPostSlideConfig = {
        badgeText: qpBadge,
        headline: qpHeadline,
        subheadline: qpSubheadline,
        body: qpBody,
        currency: qpTemplate === "marketing_promo" ? qpCurrency : undefined,
        price: qpTemplate === "marketing_promo" ? qpPrice : undefined,
        qrUrl: qpQrUrl,
        qrLabel: qpQrLabel,
        backgroundTheme: qpTheme,
      };
      const url = editingQuickPostId
        ? `/api/quick-posts/${editingQuickPostId}`
        : "/api/quick-posts";
      const method = editingQuickPostId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: qpTitle.trim(),
          templateType: qpTemplate,
          departmentId: qpDeptId,
          dataFeedId: qpDataFeedId || null,
          durationSeconds: 18,
          slideConfig,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Could not save live KPI slide");
        return;
      }
      const savedId = json.quickPost?.id ?? editingQuickPostId;
      if (qpAddToPlaylist && selectedPlaylistId && savedId && targetPl) {
        const exists = targetPl.items.some(
          (i) => i.itemKind === "quick_post" && i.quickPostId === savedId
        );
        if (!exists) {
          await fetch(`/api/playlists/${selectedPlaylistId}/items`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: [
                ...targetPl.items.map((it) => ({
                  itemKind: it.itemKind,
                  mediaAssetId: it.mediaAssetId ?? null,
                  quickPostId: it.quickPostId ?? null,
                  durationSeconds: it.durationSeconds ?? null,
                })),
                {
                  itemKind: "quick_post",
                  mediaAssetId: null,
                  quickPostId: savedId,
                  durationSeconds: 18,
                },
              ],
            }),
          });
        }
      }
      toast.success("Saved live KPI slide & pushed to paired displays");
      await onRefresh();
    } finally {
      setSavingKpi(false);
    }
  }

  const livePreviewConfig: QuickPostSlideConfig = {
    badgeText: qpBadge,
    headline: qpHeadline,
    subheadline: qpSubheadline,
    body: qpBody,
    currency: qpTemplate === "marketing_promo" ? qpCurrency : undefined,
    price: qpTemplate === "marketing_promo" ? qpPrice : undefined,
    qrUrl: qpQrUrl,
    qrLabel: qpQrLabel,
    backgroundTheme: qpTheme,
  };

  return (
    <div className="space-y-3.5">
      {/* Compact Single-Row Studio Header */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
            <button
              type="button"
              onClick={() => onStudioModeChange("canvas")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                studioMode === "canvas"
                  ? "bg-zinc-950 text-white shadow-2xs"
                  : "text-zinc-600 hover:text-zinc-950"
              }`}
            >
              <Sparkles className="size-3.5" />
              Visual Canvas Studio
            </button>
            <button
              type="button"
              onClick={() => onStudioModeChange("kpi")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                studioMode === "kpi"
                  ? "bg-zinc-950 text-white shadow-2xs"
                  : "text-zinc-600 hover:text-zinc-950"
              }`}
            >
              <Activity className="size-3.5" />
              Live Data Feed Slide
            </button>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onBrowseTemplates}
          >
            <LayoutTemplate className="size-3.5" />
            Templates
          </Button>
          {targetPl && (
            <Button
              type="button"
              size="sm"
              variant={showTaglineDrawer ? "secondary" : "outline"}
              onClick={() => setShowTaglineDrawer((v) => !v)}
            >
              <MessageSquareText className="size-3.5" />
              Running Taglines
            </Button>
          )}
        </div>

        <div className="w-64">
          <ModernSelect
            size="sm"
            value={editingQuickPostId ?? ""}
            onValueChange={(val) => {
              if (!val) {
                onResetNewSlide();
                return;
              }
              const found = data.quickPosts.find((q) => q.id === val);
              if (found) onLoadExistingSlide(found);
            }}
            options={[
              { value: "", label: "+ New Slide (Create)" },
              ...data.quickPosts.map((qp) => ({
                value: qp.id,
                label: `Edit: ${qp.title}`,
                description: qp.slideConfig.canvasDoc
                  ? "Visual Canvas Slide"
                  : `Live KPI (${qp.templateType})`,
              })),
            ]}
          />
        </div>
      </div>

      {/* Collapsible Running Tagline Drawer (keeps Studio canvas uncluttered) */}
      {showTaglineDrawer && targetPl && (
        <div className="space-y-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-xs shadow-2xs">
          <p className="font-semibold text-zinc-700">
            Running Bottom Taglines ({targetPl.name}) — add multiple with Google Play / App Store / icons:
          </p>
          <TaglineBuilder
            compact
            value={tickerDrafts[targetPl.id] ?? targetPl.tickerText ?? ""}
            onChange={(next) =>
              setTickerDrafts((prev) => ({ ...prev, [targetPl.id]: next }))
            }
            onSave={(next) => void handleSaveTaglines(next)}
          />
        </div>
      )}

      {studioMode === "canvas" ? (
        <CanvasEditor
          key={studioEditorKey}
          initialDoc={studioCanvasDoc || createBlankCanvasDoc("landscape")}
          slideTitle={qpTitle}
          onSlideTitleChange={onQpTitleChange}
          departmentId={qpDeptId}
          onDepartmentChange={onQpDeptIdChange}
          departments={data.departments}
          playlists={data.playlists}
          selectedPlaylistId={selectedPlaylistId}
          onSelectedPlaylistChange={onSelectedPlaylistIdChange}
          addToPlaylist={qpAddToPlaylist}
          onAddToPlaylistChange={onQpAddToPlaylistChange}
          mediaImages={data.mediaAssets
            .filter((a) => a.mediaType === "image")
            .map((a) => ({
              id: a.id,
              title: a.title,
              publicUrl: a.publicUrl,
            }))}
          customTemplates={data.customTemplates ?? []}
          customBackgrounds={data.studioBackgrounds ?? []}
          onRefreshBackgrounds={onRefresh}
          isEditingExisting={Boolean(editingQuickPostId)}
          savingSlide={savingStudio}
          onSaveSlide={onSaveCanvasSlide}
          onSaveAsTemplate={({ name, category, doc }) =>
            onSaveAsCustomTemplate(name, category, doc)
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-12">
          <Card className="lg:col-span-5">
            <CardHeader>
              <CardTitle>Live API / ERP Data Feed Slide</CardTitle>
              <CardDescription>
                Bind a structured signage slide directly to a webhook Data Feed so charts update automatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePublishKpiSlide} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Slide Type</Label>
                    <ModernSelect
                      size="sm"
                      value={qpTemplate}
                      onValueChange={(v) =>
                        setQpTemplate(v as QuickPostItem["templateType"])
                      }
                      options={[
                        { value: "kpi_chart", label: "Live KPI Chart" },
                        { value: "marketing_promo", label: "Retail Promo" },
                        { value: "she_safety", label: "Safety Counter" },
                        { value: "ict_notice", label: "Systems Notice" },
                        { value: "hr_spotlight", label: "People Spotlight" },
                        { value: "general_announcement", label: "Announcement" },
                      ]}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Department</Label>
                    <ModernSelect
                      size="sm"
                      value={qpDeptId}
                      onValueChange={onQpDeptIdChange}
                      options={data.departments.map((d) => ({
                        value: d.id,
                        label: d.name,
                      }))}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Internal Title</Label>
                  <Input
                    className="h-8 text-xs"
                    value={qpTitle}
                    onChange={(e) => onQpTitleChange(e.target.value)}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Badge</Label>
                    <Input
                      className="h-8 text-xs"
                      value={qpBadge}
                      onChange={(e) => setQpBadge(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Theme</Label>
                    <ModernSelect
                      size="sm"
                      value={qpTheme}
                      onValueChange={(v) =>
                        setQpTheme(
                          v as NonNullable<QuickPostSlideConfig["backgroundTheme"]>
                        )
                      }
                      options={[
                        { value: "crown_navy", label: "Midnight Navy" },
                        { value: "crown_gold", label: "Prestige Gold" },
                        { value: "she_emerald", label: "Emerald" },
                        { value: "ict_slate", label: "Indigo Slate" },
                        { value: "hr_violet", label: "Violet" },
                        { value: "light", label: "Clean White" },
                      ]}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Headline</Label>
                  <Input
                    className="h-8 text-xs"
                    value={qpHeadline}
                    onChange={(e) => setQpHeadline(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Subheadline</Label>
                  <Input
                    className="h-8 text-xs"
                    value={qpSubheadline}
                    onChange={(e) => setQpSubheadline(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Body</Label>
                  <Textarea
                    rows={2}
                    className="text-xs"
                    value={qpBody}
                    onChange={(e) => setQpBody(e.target.value)}
                  />
                </div>

                {data.dataFeeds.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-xs">Connected Data Feed</Label>
                    <ModernSelect
                      size="sm"
                      value={qpDataFeedId}
                      onValueChange={setQpDataFeedId}
                      options={[
                        { value: "", label: "Static Slide (No Live Feed)" },
                        ...data.dataFeeds.map((f) => ({
                          value: f.id,
                          label: `${f.name} (${f.key})`,
                        })),
                      ]}
                    />
                  </div>
                )}

                {qpTemplate === "marketing_promo" && (
                  <div className="grid grid-cols-2 gap-2">
                    <ModernSelect
                      size="sm"
                      value={qpCurrency}
                      onValueChange={(v) =>
                        setQpCurrency(v as "KES" | "TZS" | "UGX")
                      }
                      options={[
                        { value: "KES", label: "KES" },
                        { value: "TZS", label: "TZS" },
                        { value: "UGX", label: "UGX" },
                      ]}
                    />
                    <Input
                      className="h-8 text-xs"
                      value={qpPrice}
                      onChange={(e) => setQpPrice(e.target.value)}
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <Input
                    className="h-8 text-xs"
                    placeholder="QR URL"
                    value={qpQrUrl}
                    onChange={(e) => setQpQrUrl(e.target.value)}
                  />
                  <Input
                    className="h-8 text-xs"
                    placeholder="QR Label"
                    value={qpQrLabel}
                    onChange={(e) => setQpQrLabel(e.target.value)}
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={savingKpi}
                >
                  <Send className="size-3.5" />
                  {savingKpi ? "Saving & Pushing..." : "Save & Push Live Slide"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="lg:col-span-7">
            <CardHeader>
              <CardTitle>Live 16:9 Screen Preview</CardTitle>
              <CardDescription>
                Exact live rendering on paired displays
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="aspect-video w-full overflow-hidden rounded-xl border border-zinc-200 shadow-sm">
                <QuickPostSlide
                  templateType={qpTemplate}
                  departmentName={
                    data.departments.find((d) => d.id === qpDeptId)?.name ??
                    "Commercial"
                  }
                  config={livePreviewConfig}
                  branchName={data.branches[0]?.name ?? "Flagship Location"}
                  compact
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
