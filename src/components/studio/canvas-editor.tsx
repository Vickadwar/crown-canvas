"use client";

/**
 * @file src/components/studio/canvas-editor.tsx
 * @description Figma/Canva-grade visual design studio for Crown Canvas featuring a minimalist
 * Vercel/Linear chrome, exact integer Transform & Rotation (-360..360 deg) inputs, 8-handle
 * resize & drag-rotate, smart snap guides, live Recharts Bar/Donut/Progress infographics,
 * spec comparison tables, graphic separators, numbered steps, lists, stock photos, and PNG export.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  BarChart3,
  BookmarkPlus,
  Download,
  FlipHorizontal2,
  FlipVertical2,
  Grid3X3,
  Image as ImageIcon,
  Layers,
  LayoutTemplate,
  Lock,
  Magnet,
  Minus,
  Monitor,
  Palette,
  PieChart as PieChartIcon,
  Plus,
  QrCode,
  Redo2,
  RotateCcw,
  RotateCw,
  Search,
  Send,
  Shapes,
  Smartphone,
  Sparkles,
  Table2,
  Trash2,
  Tv,
  Type,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import type {
  StudioCanvasDoc,
  StudioCanvasElement,
  StudioFontKey,
} from "@/db/schema";
import {
  CROWN_DESIGNER_SWATCHES,
  STUDIO_BACKGROUNDS,
  STUDIO_FONTS,
  STUDIO_ICONS,
} from "@/lib/studio-assets";
import {
  BUILT_IN_STUDIO_TEMPLATES,
  cloneCanvasDoc,
  createBlankCanvasDoc,
} from "@/lib/studio-templates";
import {
  CROWN_CAMPAIGN_BANNERS,
  CROWN_DECORATIVE_QR_URL,
  CROWN_PRODUCT_SHOWCASE,
} from "@/lib/crown-products";
import {
  CanvasRenderer,
  StudioVectorIcon,
} from "@/components/player/canvas-renderer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ModernSelect } from "@/components/ui/select";

export interface CustomTemplateRecord {
  id: string;
  name: string;
  description: string | null;
  category: "decorative" | "automotive" | "industrial" | "department" | "custom";
  departmentCode: string | null;
  orientation: "landscape" | "portrait" | string;
  canvasDoc: StudioCanvasDoc;
}

interface StockPhotoItem {
  id: string;
  title: string;
  category: string;
  url: string;
  thumb: string;
  credit: string;
}

interface CanvasEditorProps {
  initialDoc: StudioCanvasDoc;
  slideTitle: string;
  onSlideTitleChange: (val: string) => void;
  departmentId: string;
  onDepartmentChange: (val: string) => void;
  departments: Array<{ id: string; code: string; name: string }>;
  playlists: Array<{ id: string; name: string; items: unknown[] }>;
  selectedPlaylistId: string;
  onSelectedPlaylistChange: (val: string) => void;
  addToPlaylist: boolean;
  onAddToPlaylistChange: (val: boolean) => void;
  mediaImages: Array<{ id: string; title: string; publicUrl: string }>;
  customTemplates: CustomTemplateRecord[];
  isEditingExisting: boolean;
  savingSlide: boolean;
  onSaveSlide: (doc: StudioCanvasDoc) => Promise<void>;
  onSaveAsTemplate: (payload: {
    name: string;
    category: "decorative" | "automotive" | "industrial" | "department" | "custom";
    doc: StudioCanvasDoc;
  }) => Promise<void>;
}

type ToolTab =
  | "templates"
  | "text"
  | "charts"
  | "shapes"
  | "icons"
  | "media"
  | "background";

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function clampRotation(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return Math.max(-360, Math.min(360, Math.round(deg)));
}

export function CanvasEditor({
  initialDoc,
  slideTitle,
  onSlideTitleChange,
  departmentId,
  onDepartmentChange,
  departments,
  playlists,
  selectedPlaylistId,
  onSelectedPlaylistChange,
  addToPlaylist,
  onAddToPlaylistChange,
  mediaImages,
  customTemplates,
  isEditingExisting,
  savingSlide,
  onSaveSlide,
  onSaveAsTemplate,
}: CanvasEditorProps) {
  const [doc, setDoc] = useState<StudioCanvasDoc>(() => cloneCanvasDoc(initialDoc));
  const [selectedId, setSelectedId] = useState<string | null>(
    initialDoc.elements[0]?.id ?? null
  );
  const [toolTab, setToolTab] = useState<ToolTab>("charts");
  const [iconCategory, setIconCategory] = useState<string>("all");
  const [zoom, setZoom] = useState<"fit" | number>("fit");
  const [showGrid, setShowGrid] = useState(false);
  const [showSafeZone, setShowSafeZone] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);

  const [history, setHistory] = useState<StudioCanvasDoc[]>(() => [
    cloneCanvasDoc(initialDoc),
  ]);
  const [historyIdx, setHistoryIdx] = useState(0);

  const [showTemplateSave, setShowTemplateSave] = useState(false);
  const [tplSaveName, setTplSaveName] = useState("");
  const [tplSaveCat, setTplSaveCat] = useState<
    "decorative" | "automotive" | "industrial" | "department" | "custom"
  >("decorative");
  const [savingTpl, setSavingTpl] = useState(false);

  // Stock Photo Search state
  const [stockQuery, setStockQuery] = useState("");
  const [stockPhotos, setStockPhotos] = useState<StockPhotoItem[]>([]);
  const [loadingStock, setLoadingStock] = useState(false);

  const canvasExportRef = useRef<HTMLDivElement | null>(null);
  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  const commitDoc = useCallback(
    (next: StudioCanvasDoc) => {
      const snap = cloneCanvasDoc(next);
      setDoc(snap);
      setHistory((prev) => {
        const sliced = prev.slice(0, historyIdx + 1);
        return [...sliced.slice(-24), snap];
      });
      setHistoryIdx((prev) => Math.min(24, prev + 1));
    },
    [historyIdx]
  );

  const commitCurrentToHistory = useCallback(() => {
    const snap = cloneCanvasDoc(docRef.current);
    setHistory((prev) => {
      const sliced = prev.slice(0, historyIdx + 1);
      return [...sliced.slice(-24), snap];
    });
    setHistoryIdx((prev) => Math.min(24, prev + 1));
  }, [historyIdx]);

  const undo = useCallback(() => {
    if (historyIdx <= 0) return;
    const prevIdx = historyIdx - 1;
    setHistoryIdx(prevIdx);
    setDoc(cloneCanvasDoc(history[prevIdx]));
  }, [history, historyIdx]);

  const redo = useCallback(() => {
    if (historyIdx >= history.length - 1) return;
    const nextIdx = historyIdx + 1;
    setHistoryIdx(nextIdx);
    setDoc(cloneCanvasDoc(history[nextIdx]));
  }, [history, historyIdx]);

  const updateElementLive = useCallback(
    (id: string, patch: Partial<StudioCanvasElement>) => {
      setDoc((prev) => ({
        ...prev,
        elements: prev.elements.map((el) =>
          el.id === id ? { ...el, ...patch } : el
        ),
      }));
    },
    []
  );

  const updateElementAndCommit = useCallback(
    (id: string, patch: Partial<StudioCanvasElement>) => {
      const next: StudioCanvasDoc = {
        ...docRef.current,
        elements: docRef.current.elements.map((el) =>
          el.id === id ? { ...el, ...patch } : el
        ),
      };
      commitDoc(next);
    },
    [commitDoc]
  );

  const addElement = useCallback(
    (partial: Omit<StudioCanvasElement, "id" | "zIndex">) => {
      const maxZ = docRef.current.elements.reduce(
        (m, e) => Math.max(m, e.zIndex),
        1
      );
      const created: StudioCanvasElement = {
        ...partial,
        id: makeId(partial.type),
        zIndex: maxZ + 1,
      };
      commitDoc({
        ...docRef.current,
        elements: [...docRef.current.elements, created],
      });
      setSelectedId(created.id);
    },
    [commitDoc]
  );

  const deleteElement = useCallback(
    (id: string) => {
      commitDoc({
        ...docRef.current,
        elements: docRef.current.elements.filter((el) => el.id !== id),
      });
      setSelectedId((prev) => (prev === id ? null : prev));
    },
    [commitDoc]
  );

  const duplicateElement = useCallback(
    (id: string) => {
      const found = docRef.current.elements.find((e) => e.id === id);
      if (!found) return;
      const maxZ = docRef.current.elements.reduce(
        (m, e) => Math.max(m, e.zIndex),
        1
      );
      const clone: StudioCanvasElement = {
        ...JSON.parse(JSON.stringify(found)),
        id: makeId(found.type),
        label: `${found.label} Copy`,
        x: Math.min(88, found.x + 3),
        y: Math.min(88, found.y + 3),
        zIndex: maxZ + 1,
        locked: false,
      };
      commitDoc({
        ...docRef.current,
        elements: [...docRef.current.elements, clone],
      });
      setSelectedId(clone.id);
    },
    [commitDoc]
  );

  const moveLayer = useCallback(
    (id: string, dir: "front" | "back") => {
      const zs = docRef.current.elements.map((e) => e.zIndex);
      const nextZ =
        dir === "front"
          ? Math.max(...zs, 1) + 1
          : Math.max(0, Math.min(...zs, 1) - 1);
      updateElementAndCommit(id, { zIndex: nextZ });
    },
    [updateElementAndCommit]
  );

  const alignSelected = useCallback(
    (edge: "left" | "centerH" | "right" | "top" | "centerV" | "bottom") => {
      if (!selectedId) return;
      const el = docRef.current.elements.find((x) => x.id === selectedId);
      if (!el || el.locked) return;
      const patch: Partial<StudioCanvasElement> =
        edge === "left"
          ? { x: 5 }
          : edge === "centerH"
            ? { x: Number(((100 - el.w) / 2).toFixed(1)) }
            : edge === "right"
              ? { x: Number((95 - el.w).toFixed(1)) }
              : edge === "top"
                ? { y: 5 }
                : edge === "centerV"
                  ? { y: Number(((100 - el.h) / 2).toFixed(1)) }
                  : { y: Number((95 - el.h).toFixed(1)) };
      updateElementAndCommit(selectedId, patch);
    },
    [selectedId, updateElementAndCommit]
  );

  const fetchStockPhotos = useCallback(async (q: string) => {
    setLoadingStock(true);
    try {
      const res = await fetch(
        `/api/studio/stock-photos?q=${encodeURIComponent(q)}`
      );
      if (!res.ok) return;
      const json = (await res.json()) as { photos?: StockPhotoItem[] };
      setStockPhotos(json.photos ?? []);
    } finally {
      setLoadingStock(false);
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d" && selectedId) {
        e.preventDefault();
        duplicateElement(selectedId);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        deleteElement(selectedId);
        return;
      }
      if (
        selectedId &&
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
      ) {
        const el = docRef.current.elements.find((x) => x.id === selectedId);
        if (!el || el.locked) return;
        e.preventDefault();
        const step = e.shiftKey ? 2 : 0.5;
        const patch: Partial<StudioCanvasElement> =
          e.key === "ArrowUp"
            ? { y: Number((el.y - step).toFixed(1)) }
            : e.key === "ArrowDown"
              ? { y: Number((el.y + step).toFixed(1)) }
              : e.key === "ArrowLeft"
                ? { x: Number((el.x - step).toFixed(1)) }
                : { x: Number((el.x + step).toFixed(1)) };
        updateElementAndCommit(selectedId, patch);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    selectedId,
    undo,
    redo,
    duplicateElement,
    deleteElement,
    updateElementAndCommit,
  ]);

  // Download slide as PNG (renders clean SVG foreignObject snapshot — zero extra npm packages!)
  async function handleExportPng() {
    const node = canvasExportRef.current;
    if (!node) return;
    const prevSelected = selectedId;
    setSelectedId(null);

    await new Promise((r) => setTimeout(r, 80));

    try {
      const w = doc.orientation === "portrait" ? 1080 : 1920;
      const h = doc.orientation === "portrait" ? 1920 : 1080;
      const clone = node.cloneNode(true) as HTMLElement;
      clone.style.transform = "none";
      const serialized = new XMLSerializer().serializeToString(clone);
      const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject width="100%" height="100%">${serialized}</foreignObject></svg>`;
      const svgBlob = new Blob([svgString], {
        type: "image/svg+xml;charset=utf-8",
      });
      const svgUrl = URL.createObjectURL(svgBlob);

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const pngUrl = canvas.toDataURL("image/png");
          const link = document.createElement("a");
          link.download = `${(slideTitle || "crown-studio-slide").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
          link.href = pngUrl;
          link.click();
          toast.success("Downloaded 1080p PNG export");
        }
        URL.revokeObjectURL(svgUrl);
        setSelectedId(prevSelected);
      };
      img.onerror = () => {
        URL.revokeObjectURL(svgUrl);
        setSelectedId(prevSelected);
        toast.info(
          "PNG export uses browser SVG rasterization — use Print / Save PDF if cross-origin images are present."
        );
      };
      img.src = svgUrl;
    } catch {
      setSelectedId(prevSelected);
      toast.error("Could not export PNG");
    }
  }

  const selectedEl = doc.elements.find((e) => e.id === selectedId) ?? null;
  const isLightBg =
    STUDIO_BACKGROUNDS.find((b) => b.id === doc.backgroundPreset)?.isLight ??
    (doc.backgroundColor ? doc.backgroundColor.toLowerCase() === "#ffffff" : false);
  const defaultInk = isLightBg ? "#09090b" : "#ffffff";

  async function handleSaveTemplateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tplSaveName.trim()) return;
    setSavingTpl(true);
    try {
      await onSaveAsTemplate({
        name: tplSaveName.trim(),
        category: tplSaveCat,
        doc,
      });
      setTplSaveName("");
      setShowTemplateSave(false);
    } finally {
      setSavingTpl(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Top Figma/Vercel Studio Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={slideTitle}
            onChange={(e) => onSlideTitleChange(e.target.value)}
            placeholder="Untitled Slide"
            className="h-8 w-52 border-zinc-200 text-xs font-semibold"
          />
          <div className="w-44">
            <ModernSelect
              size="sm"
              value={departmentId}
              onValueChange={onDepartmentChange}
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
              placeholder="Department"
            />
          </div>

          <span className="h-5 w-px bg-zinc-200 dark:bg-zinc-800" />

          {/* Orientation Switch */}
          <div className="flex items-center rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-800 dark:bg-zinc-900">
            <button
              type="button"
              onClick={() => commitDoc({ ...doc, orientation: "landscape" })}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition ${doc.orientation === "landscape"
                ? "bg-white text-zinc-950 shadow-2xs dark:bg-zinc-800 dark:text-white"
                : "text-zinc-500 hover:text-zinc-900"
                }`}
            >
              <Monitor className="size-3" />
              16:9
            </button>
            <button
              type="button"
              onClick={() => commitDoc({ ...doc, orientation: "portrait" })}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition ${doc.orientation === "portrait"
                ? "bg-white text-zinc-950 shadow-2xs dark:bg-zinc-800 dark:text-white"
                : "text-zinc-500 hover:text-zinc-900"
                }`}
            >
              <Smartphone className="size-3" />
              9:16
            </button>
          </div>

          {/* Zoom & Viewport Guides */}
          <div className="w-24">
            <ModernSelect
              size="xs"
              value={zoom === "fit" ? "fit" : String(zoom)}
              onValueChange={(v) => setZoom(v === "fit" ? "fit" : Number(v))}
              options={[
                { value: "fit", label: "Fit" },
                { value: "0.5", label: "50%" },
                { value: "0.75", label: "75%" },
                { value: "1", label: "100%" },
                { value: "1.25", label: "125%" },
              ]}
            />
          </div>

          <Button
            type="button"
            size="icon-xs"
            variant={showGrid ? "default" : "outline"}
            onClick={() => setShowGrid((v) => !v)}
            title="Toggle Alignment Grid"
          >
            <Grid3X3 className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant={showSafeZone ? "default" : "outline"}
            onClick={() => setShowSafeZone((v) => !v)}
            title="Toggle TV 5% Overscan Safe Zone"
          >
            <Tv className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant={snapEnabled ? "default" : "outline"}
            onClick={() => setSnapEnabled((v) => !v)}
            title="Smart Snap Guides"
          >
            <Magnet className="size-3.5" />
          </Button>

          <span className="h-5 w-px bg-zinc-200 dark:bg-zinc-800" />

          <Button
            type="button"
            size="icon-xs"
            variant="outline"
            disabled={historyIdx <= 0}
            onClick={undo}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="outline"
            disabled={historyIdx >= history.length - 1}
            onClick={redo}
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => {
              const blank = createBlankCanvasDoc(doc.orientation, "gallery_white");
              commitDoc(blank);
              setSelectedId(blank.elements[0]?.id ?? null);
            }}
          >
            Blank
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => void handleExportPng()}
            title="Export 1080p PNG"
          >
            <Download className="size-3.5" />
            PNG
          </Button>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => {
              setTplSaveName(slideTitle || "Custom Crown Template");
              setShowTemplateSave((v) => !v);
            }}
          >
            <BookmarkPlus className="size-3.5" />
            Save Template
          </Button>
          <Button
            type="button"
            size="sm"
            variant="default"
            disabled={savingSlide}
            onClick={() => void onSaveSlide(doc)}
          >
            <Send className="size-3.5" />
            {savingSlide
              ? "Saving..."
              : isEditingExisting
                ? "Save & Push to TVs"
                : addToPlaylist
                  ? "Publish to Playlist"
                  : "Save Slide"}
          </Button>
        </div>
      </div>

      {/* Inline Save as Reusable Template Bar */}
      {showTemplateSave && (
        <form
          onSubmit={handleSaveTemplateSubmit}
          className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-xs dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="min-w-[220px] flex-1 space-y-1">
            <Label className="text-xs font-medium">Reusable Template Name</Label>
            <Input
              value={tplSaveName}
              onChange={(e) => setTplSaveName(e.target.value)}
              placeholder="e.g. Q1 Decorative Infographic"
              className="h-8 text-xs"
              required
            />
          </div>
          <div className="w-48 space-y-1">
            <Label className="text-xs font-medium">Category</Label>
            <ModernSelect
              size="sm"
              value={tplSaveCat}
              onValueChange={(v) => setTplSaveCat(v as typeof tplSaveCat)}
              options={[
                { value: "decorative", label: "Decorative Paints" },
                { value: "automotive", label: "Automotive Refinish" },
                { value: "industrial", label: "Industrial & Protective" },
                { value: "department", label: "Corporate Department" },
                { value: "custom", label: "Custom Company Template" },
              ]}
            />
          </div>
          <Button type="submit" size="sm" disabled={savingTpl}>
            {savingTpl ? "Saving..." : "Confirm Save"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setShowTemplateSave(false)}
          >
            Cancel
          </Button>
        </form>
      )}

      {/* Main 3-Column Figma/Canva Workspace */}
      <div className="grid gap-3 xl:grid-cols-12">
        {/* LEFT TOOLBOX RAIL */}
        <div className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-zinc-800 dark:bg-zinc-950 xl:col-span-3">
          <div className="grid grid-cols-4 gap-1 border-b border-zinc-200/80 bg-zinc-50/70 p-1.5 dark:border-zinc-800 dark:bg-zinc-900/50">
            {(
              [
                { id: "templates", label: "Templates", icon: LayoutTemplate },
                { id: "text", label: "Text/List", icon: Type },
                { id: "charts", label: "Charts", icon: BarChart3 },
                { id: "shapes", label: "Shapes", icon: Shapes },
                { id: "icons", label: "Icons", icon: Sparkles },
                { id: "media", label: "Media/QR", icon: ImageIcon },
                { id: "background", label: "Backdrop", icon: Palette },
              ] as const
            ).map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setToolTab(t.id);
                    if (t.id === "media" && stockPhotos.length === 0) {
                      void fetchStockPhotos("");
                    }
                  }}
                  className={`flex flex-col items-center justify-center gap-1 rounded-lg px-1.5 py-1.5 text-[10px] font-medium transition ${toolTab === t.id
                    ? "bg-zinc-950 text-white shadow-2xs dark:bg-white dark:text-zinc-950"
                    : "text-zinc-600 hover:bg-white hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    }`}
                >
                  <Icon className="size-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="max-h-[590px] flex-1 space-y-3 overflow-y-auto p-3 text-xs">
            {/* TEMPLATES */}
            {toolTab === "templates" && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Switch Template ({BUILT_IN_STUDIO_TEMPLATES.length + customTemplates.length})
                </p>
                {customTemplates.map((ct) => (
                  <button
                    key={ct.id}
                    type="button"
                    onClick={() => {
                      const next = cloneCanvasDoc(ct.canvasDoc);
                      commitDoc(next);
                      onSlideTitleChange(ct.name);
                      setSelectedId(next.elements[0]?.id ?? null);
                    }}
                    className="w-full rounded-lg border border-zinc-300 bg-zinc-50 p-2.5 text-left transition hover:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <p className="font-semibold text-zinc-950 dark:text-white">
                      {ct.name}
                    </p>
                    <p className="mt-0.5 text-[10px] text-zinc-500">
                      Custom • {ct.category}
                    </p>
                  </button>
                ))}
                {BUILT_IN_STUDIO_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => {
                      const next = cloneCanvasDoc(tpl.canvasDoc);
                      commitDoc(next);
                      onSlideTitleChange(tpl.name);
                      setSelectedId(next.elements[0]?.id ?? null);
                    }}
                    className="w-full rounded-lg border border-zinc-200 p-2.5 text-left transition hover:border-zinc-950 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                  >
                    <p className="font-semibold text-zinc-900 dark:text-white">
                      {tpl.name}
                    </p>
                    <p className="mt-0.5 text-[10px] text-zinc-500">
                      {tpl.divisionLabel}
                    </p>
                  </button>
                ))}
              </div>
            )}

            {/* TEXT, NUMBERING & LISTS */}
            {toolTab === "text" && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Typography
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto w-full justify-start py-2 text-left"
                  onClick={() =>
                    addElement({
                      type: "text",
                      label: "Heading",
                      x: 8,
                      y: 20,
                      w: 60,
                      h: 16,
                      text: "Modern Showroom Headline",
                      fontFamily: "montserrat",
                      fontSize: 64,
                      fontWeight: "900",
                      color: defaultInk,
                    })
                  }
                >
                  <div>
                    <p className="text-sm font-black leading-none">Add Heading</p>
                    <p className="mt-0.5 text-[10px] text-zinc-400">64px Bold Hero</p>
                  </div>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  size="sm"
                  onClick={() =>
                    addElement({
                      type: "text",
                      label: "Editorial Serif",
                      x: 8,
                      y: 36,
                      w: 58,
                      h: 14,
                      text: "Luxury Designer Collection",
                      fontFamily: "playfair",
                      fontSize: 50,
                      fontWeight: "700",
                      color: defaultInk,
                    })
                  }
                >
                  + Editorial Serif (Playfair)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  size="sm"
                  onClick={() =>
                    addElement({
                      type: "text",
                      label: "Body Copy",
                      x: 8,
                      y: 50,
                      w: 52,
                      h: 12,
                      text: "Double-click directly on canvas to edit copy.",
                      fontFamily: "satoshi",
                      fontSize: 26,
                      fontWeight: "500",
                      color: isLightBg ? "#52525b" : "#d4d4d8",
                    })
                  }
                >
                  + Body Copy
                </Button>

                <p className="pt-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Numbering, Lists &amp; Badges
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  size="sm"
                  onClick={() =>
                    addElement({
                      type: "step_number",
                      label: "Step 01 Callout",
                      x: 6,
                      y: 62,
                      w: 36,
                      h: 16,
                      stepNumber: "01",
                      stepStyle: "circle",
                      text: "Choose Your Shade",
                      subtext: "Select from 1,000+ decorative finishes",
                      fill: isLightBg ? "#09090b" : "#ffffff",
                      color: isLightBg ? "#ffffff" : "#09090b",
                      borderColor: defaultInk,
                      fontSize: 32,
                    })
                  }
                >
                  + Numbered Step Callout (01 / 02 / 03)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  size="sm"
                  onClick={() =>
                    addElement({
                      type: "list_block",
                      label: "Numbered List",
                      x: 8,
                      y: 50,
                      w: 44,
                      h: 34,
                      listStyle: "numbered",
                      listItems: [
                        "10-Year UV & Tropical Rain Shield",
                        "Precision Tinted in 5 Minutes",
                        "Available in 1L, 4L & 20L Packs",
                      ],
                      fill: "#2563eb",
                      color: defaultInk,
                      fontSize: 24,
                    })
                  }
                >
                  + Numbered / Checklist Block
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  size="sm"
                  onClick={() =>
                    addElement({
                      type: "badge",
                      label: "Pill Badge",
                      x: 6,
                      y: 8,
                      w: 28,
                      h: 6.5,
                      text: "DECORATIVE PAINTS",
                      fontFamily: "montserrat",
                      fontSize: 17,
                      fontWeight: "800",
                      color: isLightBg ? "#09090b" : "#ffffff",
                      fill: isLightBg ? "#f4f4f5" : "rgba(255,255,255,0.12)",
                      borderColor: isLightBg ? "#d4d4d8" : "rgba(255,255,255,0.25)",
                    })
                  }
                >
                  + Minimal Pill Badge
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  size="sm"
                  onClick={() =>
                    addElement({
                      type: "price_tag",
                      label: "Price Offer Tag",
                      x: 68,
                      y: 18,
                      w: 26,
                      h: 26,
                      currency: "KES",
                      text: "4,850",
                      subtext: "4L PACK • SHOWROOM OFFER",
                      fill: "#09090b",
                      color: "#ffffff",
                    })
                  }
                >
                  + Price Tag (KES / TZS / UGX)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  size="sm"
                  onClick={() =>
                    addElement({
                      type: "emblem",
                      label: "Crown Emblem",
                      x: 5,
                      y: 6,
                      w: 25,
                      h: 8.5,
                      text: "CROWN PAINTS",
                      subtext: "EAST AFRICA",
                      color: defaultInk,
                      fill: isLightBg ? "#09090b" : "#ffffff",
                      borderColor: isLightBg ? "#ffffff" : "#09090b",
                    })
                  }
                >
                  + Crown Paints Emblem
                </Button>
              </div>
            )}

            {/* CHARTS & INFOGRAPHICS */}
            {toolTab === "charts" && (
              <div className="space-y-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Infographics &amp; Live Data Widgets (0 MB Disk)
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto w-full justify-start gap-2.5 py-2.5 text-left"
                  onClick={() =>
                    addElement({
                      type: "chart_bar",
                      label: "Bar Chart Infographic",
                      x: 5,
                      y: 44,
                      w: 54,
                      h: 46,
                      chartTitle: "Showroom Sales vs Target (M)",
                      chartSeries: [
                        { label: "Nairobi", value: 14.2, target: 13.0 },
                        { label: "Westlands", value: 11.8, target: 10.5 },
                        { label: "Mombasa", value: 8.6, target: 8.2 },
                        { label: "Dar", value: 9.4, target: 8.8 },
                      ],
                      barColor: "#2563eb",
                      secondaryColor: "#94a3b8",
                      showGrid: true,
                      color: defaultInk,
                      fill: isLightBg ? "#ffffff" : "rgba(255,255,255,0.05)",
                      borderColor: isLightBg ? "#e4e4e7" : "rgba(255,255,255,0.16)",
                    })
                  }
                >
                  <BarChart3 className="size-4 text-blue-600" />
                  <div>
                    <p className="text-xs font-semibold">Bar / Column Chart</p>
                    <p className="text-[10px] text-zinc-400">Compare branches, SKUs, or output</p>
                  </div>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="h-auto w-full justify-start gap-2.5 py-2.5 text-left"
                  onClick={() =>
                    addElement({
                      type: "chart_donut",
                      label: "Donut Chart Infographic",
                      x: 62,
                      y: 44,
                      w: 33,
                      h: 48,
                      chartTitle: "Division Volume Mix",
                      centerValue: "100%",
                      centerLabel: "Total Mix",
                      donutSlices: [
                        { name: "Decorative", value: 58, color: "#09090b" },
                        { name: "Automotive", value: 24, color: "#2563eb" },
                        { name: "Industrial", value: 18, color: "#10b981" },
                      ],
                      color: defaultInk,
                      fill: isLightBg ? "#ffffff" : "rgba(255,255,255,0.05)",
                      borderColor: isLightBg ? "#e4e4e7" : "rgba(255,255,255,0.16)",
                    })
                  }
                >
                  <PieChartIcon className="size-4 text-blue-600" />
                  <div>
                    <p className="text-xs font-semibold">Donut / Pie Chart</p>
                    <p className="text-[10px] text-zinc-400">Category share &amp; center KPI</p>
                  </div>
                </Button>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      addElement({
                        type: "chart_progress",
                        label: "Progress Bar KPI",
                        x: 5,
                        y: 72,
                        w: 44,
                        h: 18,
                        progressStyle: "bar",
                        progressValue: 92,
                        progressMax: 100,
                        text: "Q4 Quota Attainment",
                        subtext: "KES 54.6M of 59.3M Target",
                        barColor: "#2563eb",
                        color: defaultInk,
                        fill: isLightBg ? "#ffffff" : "rgba(255,255,255,0.05)",
                        borderColor: isLightBg ? "#e4e4e7" : "rgba(255,255,255,0.16)",
                      })
                    }
                  >
                    + Progress Bar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      addElement({
                        type: "chart_progress",
                        label: "Radial Gauge Ring",
                        x: 68,
                        y: 48,
                        w: 26,
                        h: 40,
                        progressStyle: "ring",
                        progressValue: 98,
                        progressMax: 100,
                        text: "First-Pass Tint QC",
                        subtext: "Plant Accuracy",
                        barColor: "#10b981",
                        color: defaultInk,
                        fill: isLightBg ? "#ffffff" : "rgba(255,255,255,0.05)",
                        borderColor: isLightBg ? "#e4e4e7" : "rgba(255,255,255,0.16)",
                      })
                    }
                  >
                    + Ring Gauge
                  </Button>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="h-auto w-full justify-start gap-2.5 py-2.5 text-left"
                  onClick={() =>
                    addElement({
                      type: "table_spec",
                      label: "Spec Matrix Table",
                      x: 5,
                      y: 44,
                      w: 62,
                      h: 44,
                      tableHeaders: ["Product Line", "Finish", "Pack Sizes", "Coverage"],
                      tableRows: [
                        ["Weatherguard", "Silicone Exterior", "4L / 20L", "12 m²/L"],
                        ["Silk Vinyl", "Washable Sheen", "1L / 4L / 20L", "16 m²/L"],
                        ["2K Clearcoat", "High-Solid Gloss", "1L / 5L Kit", "10 m²/L"],
                      ],
                      color: isLightBg ? "#09090b" : "#f8fafc",
                      fill: isLightBg ? "#ffffff" : "rgba(255,255,255,0.06)",
                      barColor: isLightBg ? "#f4f4f5" : "rgba(255,255,255,0.1)",
                      borderColor: isLightBg ? "#e4e4e7" : "rgba(255,255,255,0.18)",
                    })
                  }
                >
                  <Table2 className="size-4 text-zinc-700 dark:text-zinc-300" />
                  <div>
                    <p className="text-xs font-semibold">Spec &amp; SKU Matrix Table</p>
                    <p className="text-[10px] text-zinc-400">PMG, Industrial &amp; Auto datasheets</p>
                  </div>
                </Button>
              </div>
            )}

            {/* SHAPES, SEPARATORS & PAINT SWATCHES */}
            {toolTab === "shapes" && (
              <div className="space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Separators &amp; Dividers
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      addElement({
                        type: "separator",
                        label: "Horizontal Rule",
                        x: 5,
                        y: 50,
                        w: 90,
                        h: 2,
                        separatorOrientation: "horizontal",
                        separatorStyle: "solid",
                        lineThickness: 3,
                        color: isLightBg ? "#d4d4d8" : "rgba(255,255,255,0.28)",
                      })
                    }
                  >
                    <Minus className="size-3" />
                    Horizontal
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      addElement({
                        type: "separator",
                        label: "Vertical Rule",
                        x: 50,
                        y: 12,
                        w: 2,
                        h: 76,
                        separatorOrientation: "vertical",
                        separatorStyle: "solid",
                        lineThickness: 3,
                        color: isLightBg ? "#d4d4d8" : "rgba(255,255,255,0.28)",
                      })
                    }
                  >
                    Vertical Rule
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      addElement({
                        type: "separator",
                        label: "Dashed Separator",
                        x: 5,
                        y: 56,
                        w: 90,
                        h: 2,
                        separatorOrientation: "horizontal",
                        separatorStyle: "dashed",
                        lineThickness: 3,
                        color: "#2563eb",
                      })
                    }
                  >
                    Dashed Line
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      addElement({
                        type: "separator",
                        label: "Fade Gradient Rule",
                        x: 5,
                        y: 62,
                        w: 90,
                        h: 2,
                        separatorOrientation: "horizontal",
                        separatorStyle: "gradient",
                        lineThickness: 4,
                        color: "#2563eb",
                      })
                    }
                  >
                    Gradient Rule
                  </Button>
                </div>

                <p className="border-t pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Vector Shapes &amp; Arrows
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { k: "rect", lbl: "Card" },
                      { k: "circle", lbl: "Circle" },
                      { k: "ring", lbl: "Ring" },
                      { k: "triangle", lbl: "Triangle" },
                      { k: "diamond", lbl: "Diamond" },
                      { k: "arrow_right", lbl: "Arrow" },
                      { k: "chevron", lbl: "Chevron" },
                      { k: "star", lbl: "Star" },
                      { k: "stripe", lbl: "Color Bar" },
                    ] as const
                  ).map((sh) => (
                    <Button
                      key={sh.k}
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() =>
                        addElement({
                          type: "shape",
                          shapeKind: sh.k,
                          label: sh.lbl,
                          x: sh.k === "stripe" ? 0 : 35,
                          y: sh.k === "stripe" ? 0 : 30,
                          w: sh.k === "stripe" ? 100 : sh.k === "arrow_right" ? 18 : 16,
                          h: sh.k === "stripe" ? 2 : sh.k === "arrow_right" ? 10 : 24,
                          fill:
                            sh.k === "stripe"
                              ? "#09090b"
                              : isLightBg
                                ? "#e4e4e7"
                                : "rgba(255,255,255,0.14)",
                          borderColor: isLightBg ? "#d4d4d8" : "rgba(255,255,255,0.25)",
                          borderWidth: sh.k === "ring" ? 12 : 1,
                          borderRadius: 20,
                        })
                      }
                    >
                      {sh.lbl}
                    </Button>
                  ))}
                </div>

                <div className="border-t pt-2.5">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Crown Paint Swatch Cards
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {CROWN_DESIGNER_SWATCHES.map((sw) => (
                      <button
                        key={sw.code}
                        type="button"
                        onClick={() =>
                          addElement({
                            type: "swatch",
                            label: `Swatch: ${sw.name}`,
                            x: 10,
                            y: 66,
                            w: 18,
                            h: 25,
                            text: sw.name,
                            swatchCode: sw.code,
                            swatchHex: sw.hex,
                            color: defaultInk,
                            fill: isLightBg ? "#ffffff" : "rgba(255,255,255,0.08)",
                          })
                        }
                        className="flex items-center gap-2 rounded-lg border border-zinc-200 p-1.5 text-left transition hover:border-zinc-950 dark:border-zinc-800"
                      >
                        <span
                          className="size-5 shrink-0 rounded border border-black/15"
                          style={{ backgroundColor: sw.hex }}
                        />
                        <span className="truncate text-[10px] font-medium">
                          {sw.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ICONS */}
            {toolTab === "icons" && (
              <div className="space-y-2.5">
                <ModernSelect
                  size="sm"
                  value={iconCategory}
                  onValueChange={setIconCategory}
                  options={[
                    { value: "all", label: "All Icons (36)" },
                    { value: "paint", label: "Decorative & Paint" },
                    { value: "automotive_industrial", label: "Automotive & Industrial" },
                    { value: "safety", label: "SHE & Compliance" },
                    { value: "corporate", label: "Corporate & Departments" },
                  ]}
                />
                <div className="grid grid-cols-3 gap-1.5">
                  {STUDIO_ICONS.filter(
                    (ic) => iconCategory === "all" || ic.category === iconCategory
                  ).map((ic) => (
                    <button
                      key={ic.name}
                      type="button"
                      onClick={() =>
                        addElement({
                          type: "icon",
                          label: ic.label,
                          x: 80,
                          y: 10,
                          w: 8,
                          h: 14,
                          iconName: ic.name,
                          color: doc.accentColor || "#2563eb",
                        })
                      }
                      className="flex flex-col items-center gap-1 rounded-lg border border-zinc-200 p-2 text-center transition hover:border-zinc-950 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                    >
                      <StudioVectorIcon
                        name={ic.name}
                        className="size-4 text-zinc-800 dark:text-zinc-200"
                      />
                      <span className="w-full truncate text-[9px] text-zinc-500">
                        {ic.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* MEDIA, QR, CROWN PRODUCTS & STOCK PHOTOS */}
            {toolTab === "media" && (
              <div className="space-y-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() =>
                    addElement({
                      type: "qr",
                      label: "Showroom QR Code",
                      x: 74,
                      y: 46,
                      w: 21,
                      h: 44,
                      qrUrl: CROWN_DECORATIVE_QR_URL,
                      qrLabel: "Explore Decorative Range",
                      color: defaultInk,
                      fill: isLightBg ? "#ffffff" : "rgba(255,255,255,0.08)",
                    })
                  }
                >
                  <QrCode className="size-3.5" />
                  + Trackable Decorative QR
                </Button>

                <div className="space-y-1.5 border-t pt-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Crown Product Packshots ({CROWN_PRODUCT_SHOWCASE.length})
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {CROWN_PRODUCT_SHOWCASE.map((prod) => (
                      <button
                        key={prod.id}
                        type="button"
                        onClick={() =>
                          addElement({
                            type: "image",
                            label: prod.name,
                            x: 64,
                            y: 22,
                            w: 26,
                            h: 50,
                            imageUrl: prod.imageUrl,
                            objectFit: "contain",
                            borderRadius: 0,
                          })
                        }
                        className="overflow-hidden rounded-lg border border-zinc-200 bg-white text-left transition hover:border-zinc-950 dark:border-zinc-800 dark:bg-zinc-900"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={prod.imageUrl}
                          alt={prod.name}
                          className="h-14 w-full bg-zinc-50 p-1 object-contain dark:bg-zinc-900"
                        />
                        <p className="truncate px-1.5 py-1 text-[10px] font-medium">
                          {prod.name}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5 border-t pt-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Crown Campaign Banners ({CROWN_CAMPAIGN_BANNERS.length})
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {CROWN_CAMPAIGN_BANNERS.map((banner) => (
                      <button
                        key={banner.id}
                        type="button"
                        onClick={() =>
                          addElement({
                            type: "image",
                            label: banner.name,
                            x: 5,
                            y: 12,
                            w: 90,
                            h: 76,
                            imageUrl: banner.imageUrl,
                            objectFit: "cover",
                            borderRadius: 16,
                          })
                        }
                        className="overflow-hidden rounded-lg border border-zinc-200 bg-white text-left transition hover:border-zinc-950 dark:border-zinc-800 dark:bg-zinc-900"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={banner.imageUrl}
                          alt={banner.name}
                          className="h-14 w-full bg-zinc-100 object-cover"
                        />
                        <p className="truncate px-1.5 py-1 text-[10px] font-medium">
                          {banner.name}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {mediaImages.length > 0 && (
                  <div className="space-y-1.5 border-t pt-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                      Media Library ({mediaImages.length})
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {mediaImages.map((img) => (
                        <button
                          key={img.id}
                          type="button"
                          onClick={() =>
                            addElement({
                              type: "image",
                              label: img.title,
                              x: 62,
                              y: 22,
                              w: 30,
                              h: 48,
                              imageUrl: img.publicUrl,
                              objectFit: "contain",
                            })
                          }
                          className="overflow-hidden rounded-lg border border-zinc-200 text-left transition hover:border-zinc-950 dark:border-zinc-800"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.publicUrl}
                            alt={img.title}
                            className="h-14 w-full bg-zinc-100 object-cover"
                          />
                          <p className="truncate p-1 text-[10px] font-medium">
                            {img.title}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2 border-t pt-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Zero-Disk Stock Photos
                  </p>
                  <div className="flex gap-1">
                    <Input
                      value={stockQuery}
                      onChange={(e) => setStockQuery(e.target.value)}
                      placeholder="Search interior, car, factory..."
                      className="h-7 text-xs"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void fetchStockPhotos(stockQuery);
                        }
                      }}
                    />
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="outline"
                      disabled={loadingStock}
                      onClick={() => void fetchStockPhotos(stockQuery)}
                    >
                      <Search className="size-3" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {stockPhotos.map((ph) => (
                      <button
                        key={ph.id}
                        type="button"
                        onClick={() =>
                          addElement({
                            type: "image",
                            label: ph.title,
                            x: 56,
                            y: 12,
                            w: 39,
                            h: 76,
                            imageUrl: ph.url,
                            objectFit: "cover",
                            borderRadius: 20,
                          })
                        }
                        className="overflow-hidden rounded-lg border border-zinc-200 text-left transition hover:border-zinc-950 dark:border-zinc-800"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={ph.thumb}
                          alt={ph.title}
                          className="h-14 w-full bg-zinc-100 object-cover"
                        />
                        <p className="truncate p-1 text-[9px] text-zinc-500">
                          {ph.title}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* BACKGROUNDS */}
            {toolTab === "background" && (
              <div className="space-y-3">
                {/* Official Crown Campaign Banners as Full-Bleed Canvas Background */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                      Crown Banners (Canvas Background)
                    </p>
                    {doc.backgroundImageUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          commitDoc({ ...doc, backgroundImageUrl: undefined })
                        }
                        className="text-[10px] font-semibold text-red-600 hover:underline"
                      >
                        Clear Image
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {CROWN_CAMPAIGN_BANNERS.map((banner) => (
                      <button
                        key={banner.id}
                        type="button"
                        onClick={() =>
                          commitDoc({
                            ...doc,
                            backgroundImageUrl: banner.imageUrl,
                          })
                        }
                        className={`overflow-hidden rounded-lg border text-left transition ${doc.backgroundImageUrl === banner.imageUrl
                            ? "border-zinc-950 ring-2 ring-zinc-950/20"
                            : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-800"
                          }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={banner.imageUrl}
                          alt={banner.name}
                          className="h-12 w-full bg-zinc-100 object-cover"
                        />
                        <p className="truncate px-1.5 py-1 text-[10px] font-semibold">
                          {banner.name}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {mediaImages.length > 0 && (
                  <div className="space-y-1.5 border-t pt-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                      Media Library as Background
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {mediaImages.map((img) => (
                        <button
                          key={`bg-${img.id}`}
                          type="button"
                          onClick={() =>
                            commitDoc({
                              ...doc,
                              backgroundImageUrl: img.publicUrl,
                            })
                          }
                          className={`overflow-hidden rounded-lg border text-left transition ${doc.backgroundImageUrl === img.publicUrl
                              ? "border-zinc-950 ring-2 ring-zinc-950/20"
                              : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-800"
                            }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.publicUrl}
                            alt={img.title}
                            className="h-11 w-full bg-zinc-100 object-cover"
                          />
                          <p className="truncate px-1.5 py-1 text-[10px] font-medium">
                            {img.title}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5 border-t pt-2.5">
                  <Label className="text-[11px]">Custom Background Image URL</Label>
                  <Input
                    value={doc.backgroundImageUrl || ""}
                    onChange={(e) =>
                      commitDoc({
                        ...doc,
                        backgroundImageUrl: e.target.value.trim() || undefined,
                      })
                    }
                    placeholder="https://... or /media/banners/..."
                    className="h-8 text-xs"
                  />
                </div>

                <div className="space-y-1.5 border-t pt-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Gradient Backdrops
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {STUDIO_BACKGROUNDS.map((bgItem) => (
                      <button
                        key={bgItem.id}
                        type="button"
                        onClick={() =>
                          commitDoc({
                            ...doc,
                            backgroundPreset: bgItem.id,
                            backgroundCss: bgItem.css,
                            backgroundColor: undefined,
                            backgroundImageUrl: undefined,
                            accentColor: bgItem.accent,
                          })
                        }
                        className={`overflow-hidden rounded-lg border text-left transition ${doc.backgroundPreset === bgItem.id && !doc.backgroundColor && !doc.backgroundImageUrl
                          ? "border-zinc-950 ring-2 ring-zinc-950/20"
                          : "border-zinc-200 dark:border-zinc-800"
                          }`}
                      >
                        <div
                          className="h-10 w-full"
                          style={{ background: bgItem.css }}
                        />
                        <div className="p-1.5">
                          <p className="truncate text-[10px] font-semibold">
                            {bgItem.name}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5 border-t pt-2.5">
                  <Label className="text-[11px]">Custom Solid Background Color</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={doc.backgroundColor || "#ffffff"}
                      onChange={(e) =>
                        commitDoc({
                          ...doc,
                          backgroundColor: e.target.value,
                          backgroundImageUrl: undefined,
                        })
                      }
                      className="h-8 w-10 cursor-pointer rounded border border-zinc-200"
                    />
                    <Input
                      value={doc.backgroundColor || ""}
                      onChange={(e) =>
                        commitDoc({
                          ...doc,
                          backgroundColor: e.target.value || undefined,
                          backgroundImageUrl: e.target.value
                            ? undefined
                            : doc.backgroundImageUrl,
                        })
                      }
                      placeholder="#ffffff"
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* CENTER FIGMA DOT-GRID WORKSPACE */}
        <div className="flex flex-col gap-2.5 xl:col-span-6">
          <div className="studio-dot-grid flex min-h-[470px] flex-1 items-center justify-center overflow-auto rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
            <div
              className={`w-full overflow-visible ${doc.orientation === "portrait"
                ? "aspect-[9/16] max-h-[540px] max-w-[310px]"
                : "aspect-video"
                }`}
            >
              <CanvasRenderer
                doc={doc}
                interactive
                selectedId={selectedId}
                zoom={zoom}
                showGrid={showGrid}
                showSafeZone={showSafeZone}
                snapEnabled={snapEnabled}
                onSelectElement={setSelectedId}
                onUpdateElement={updateElementLive}
                onCommitHistory={commitCurrentToHistory}
                onDuplicateElement={duplicateElement}
                onDeleteElement={deleteElement}
                onMoveLayer={moveLayer}
                canvasExportRef={canvasExportRef}
              />
            </div>
          </div>

          {playlists.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-950">
              <label className="flex items-center gap-2 font-medium text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={addToPlaylist}
                  onChange={(e) => onAddToPlaylistChange(e.target.checked)}
                  className="size-3.5 rounded border-zinc-300 accent-zinc-950"
                />
                Push live to target playlist
              </label>
              {addToPlaylist && (
                <div className="w-60">
                  <ModernSelect
                    size="xs"
                    value={selectedPlaylistId}
                    onValueChange={onSelectedPlaylistChange}
                    options={playlists.map((pl) => ({
                      value: pl.id,
                      label: `${pl.name} (${pl.items.length} items)`,
                    }))}
                  />
                </div>
              )}
              <span className="text-[10px] text-zinc-400">
                Double-click text to edit • 8 handles resize • Bottom ring rotates
              </span>
            </div>
          )}
        </div>

        {/* RIGHT PRECISION FIGMA INSPECTOR & LAYERS */}
        <div className="flex max-h-[640px] flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-zinc-800 dark:bg-zinc-950 xl:col-span-3">
          <div className="flex items-center justify-between border-b border-zinc-200/80 px-3 py-2 dark:border-zinc-800">
            <span className="truncate text-xs font-semibold">
              {selectedEl ? selectedEl.label : "Inspector"}
            </span>
            {selectedEl && (
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[9px] uppercase text-zinc-500 dark:bg-zinc-900">
                {selectedEl.type}
              </span>
            )}
          </div>

          <div className="flex-1 space-y-3.5 overflow-y-auto p-3 text-xs">
            {!selectedEl ? (
              <p className="rounded-lg border border-dashed border-zinc-200 p-4 text-center text-zinc-500 dark:border-zinc-800">
                Select any layer on the canvas to inspect exact coordinates, integer rotation, typography, or chart data.
              </p>
            ) : (
              <div className="space-y-3.5">
                {/* One-Click Alignment Bar */}
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-zinc-400">
                    Align to Canvas
                  </Label>
                  <div className="grid grid-cols-6 gap-1">
                    {(
                      [
                        { id: "left", icon: AlignStartVertical, t: "Align Left" },
                        { id: "centerH", icon: AlignCenterVertical, t: "Center H" },
                        { id: "right", icon: AlignEndVertical, t: "Align Right" },
                        { id: "top", icon: AlignStartHorizontal, t: "Align Top" },
                        { id: "centerV", icon: AlignCenterHorizontal, t: "Center V" },
                        { id: "bottom", icon: AlignEndHorizontal, t: "Align Bottom" },
                      ] as const
                    ).map(({ id, icon: Icon, t }) => (
                      <Button
                        key={id}
                        type="button"
                        size="icon-xs"
                        variant="outline"
                        title={t}
                        onClick={() => alignSelected(id)}
                      >
                        <Icon className="size-3" />
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Precision Transform Grid (Exact Integer Rotation Input!) */}
                <div className="space-y-2 border-t border-zinc-100 pt-2.5 dark:border-zinc-800">
                  <Label className="text-[10px] uppercase tracking-wider text-zinc-400">
                    Position, Size &amp; Rotation
                  </Label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(
                      [
                        { k: "x", lbl: "X %" },
                        { k: "y", lbl: "Y %" },
                        { k: "w", lbl: "W %" },
                        { k: "h", lbl: "H %" },
                      ] as const
                    ).map(({ k, lbl }) => (
                      <div key={k} className="space-y-0.5">
                        <span className="text-[9px] text-zinc-400">{lbl}</span>
                        <Input
                          type="number"
                          step="0.5"
                          className="h-7 px-1.5 font-mono text-[11px]"
                          value={selectedEl[k]}
                          onChange={(e) =>
                            updateElementLive(selectedEl.id, {
                              [k]: Number(e.target.value) || 0,
                            })
                          }
                          onBlur={commitCurrentToHistory}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Integer Rotation Input (-360..360) + Quick ±90° & Flip */}
                  <div className="grid grid-cols-12 items-end gap-1.5">
                    <div className="col-span-5 space-y-0.5">
                      <span className="text-[9px] text-zinc-400">Rotation (°)</span>
                      <Input
                        type="number"
                        min={-360}
                        max={360}
                        step={1}
                        placeholder="0"
                        className="h-7 px-2 font-mono text-[11px]"
                        value={Math.round(selectedEl.rotation ?? 0)}
                        onChange={(e) => {
                          const raw = parseInt(e.target.value, 10);
                          updateElementLive(selectedEl.id, {
                            rotation: Number.isNaN(raw) ? 0 : clampRotation(raw),
                          });
                        }}
                        onBlur={commitCurrentToHistory}
                      />
                    </div>
                    <div className="col-span-7 flex items-center gap-1">
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="outline"
                        title="Rotate -90°"
                        onClick={() =>
                          updateElementAndCommit(selectedEl.id, {
                            rotation: clampRotation((selectedEl.rotation ?? 0) - 90),
                          })
                        }
                      >
                        <RotateCcw className="size-3" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="outline"
                        title="Rotate +90°"
                        onClick={() =>
                          updateElementAndCommit(selectedEl.id, {
                            rotation: clampRotation((selectedEl.rotation ?? 0) + 90),
                          })
                        }
                      >
                        <RotateCw className="size-3" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-xs"
                        variant={selectedEl.flipX ? "default" : "outline"}
                        title="Flip Horizontal"
                        onClick={() =>
                          updateElementAndCommit(selectedEl.id, {
                            flipX: !selectedEl.flipX,
                          })
                        }
                      >
                        <FlipHorizontal2 className="size-3" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-xs"
                        variant={selectedEl.flipY ? "default" : "outline"}
                        title="Flip Vertical"
                        onClick={() =>
                          updateElementAndCommit(selectedEl.id, {
                            flipY: !selectedEl.flipY,
                          })
                        }
                      >
                        <FlipVertical2 className="size-3" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    <div className="space-y-0.5">
                      <span className="text-[9px] text-zinc-400">Opacity %</span>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={5}
                        className="h-7 px-1.5 font-mono text-[11px]"
                        value={Math.round((selectedEl.opacity ?? 1) * 100)}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                          updateElementLive(selectedEl.id, { opacity: v / 100 });
                        }}
                        onBlur={commitCurrentToHistory}
                      />
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[9px] text-zinc-400">Radius px</span>
                      <Input
                        type="number"
                        min={0}
                        max={200}
                        className="h-7 px-1.5 font-mono text-[11px]"
                        value={selectedEl.borderRadius ?? 16}
                        onChange={(e) =>
                          updateElementLive(selectedEl.id, {
                            borderRadius: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                        onBlur={commitCurrentToHistory}
                      />
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[9px] text-zinc-400">Border px</span>
                      <Input
                        type="number"
                        min={0}
                        max={24}
                        className="h-7 px-1.5 font-mono text-[11px]"
                        value={selectedEl.borderWidth ?? 0}
                        onChange={(e) =>
                          updateElementLive(selectedEl.id, {
                            borderWidth: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                        onBlur={commitCurrentToHistory}
                      />
                    </div>
                  </div>
                </div>

                {/* Contextual Editors: Separator */}
                {selectedEl.type === "separator" && (
                  <div className="space-y-2 border-t border-zinc-100 pt-2.5 dark:border-zinc-800">
                    <Label className="text-[10px] uppercase tracking-wider text-zinc-400">
                      Separator Styling
                    </Label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <ModernSelect
                        size="xs"
                        value={selectedEl.separatorOrientation ?? "horizontal"}
                        onValueChange={(v) =>
                          updateElementAndCommit(selectedEl.id, {
                            separatorOrientation: v as "horizontal" | "vertical",
                          })
                        }
                        options={[
                          { value: "horizontal", label: "Horizontal" },
                          { value: "vertical", label: "Vertical" },
                        ]}
                      />
                      <ModernSelect
                        size="xs"
                        value={selectedEl.separatorStyle ?? "solid"}
                        onValueChange={(v) =>
                          updateElementAndCommit(selectedEl.id, {
                            separatorStyle: v as "solid" | "dashed" | "dotted" | "gradient",
                          })
                        }
                        options={[
                          { value: "solid", label: "Solid" },
                          { value: "dashed", label: "Dashed" },
                          { value: "dotted", label: "Dotted" },
                          { value: "gradient", label: "Fade Gradient" },
                        ]}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="space-y-0.5">
                        <span className="text-[9px] text-zinc-400">Thickness px</span>
                        <Input
                          type="number"
                          min={1}
                          max={24}
                          className="h-7 font-mono text-xs"
                          value={selectedEl.lineThickness ?? 3}
                          onChange={(e) =>
                            updateElementLive(selectedEl.id, {
                              lineThickness: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          onBlur={commitCurrentToHistory}
                        />
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[9px] text-zinc-400">Line Color</span>
                        <input
                          type="color"
                          value={
                            selectedEl.color?.startsWith("#")
                              ? selectedEl.color
                              : "#2563eb"
                          }
                          onChange={(e) =>
                            updateElementLive(selectedEl.id, { color: e.target.value })
                          }
                          onBlur={commitCurrentToHistory}
                          className="h-7 w-full cursor-pointer rounded border border-zinc-200"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Contextual Editor: Numbered Step */}
                {selectedEl.type === "step_number" && (
                  <div className="space-y-2 border-t border-zinc-100 pt-2.5 dark:border-zinc-800">
                    <Label className="text-[10px] uppercase tracking-wider text-zinc-400">
                      Step Numbering
                    </Label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <Input
                        className="h-7 font-mono text-xs"
                        placeholder="01"
                        value={selectedEl.stepNumber ?? "01"}
                        onChange={(e) =>
                          updateElementLive(selectedEl.id, { stepNumber: e.target.value })
                        }
                        onBlur={commitCurrentToHistory}
                      />
                      <ModernSelect
                        size="xs"
                        value={selectedEl.stepStyle ?? "circle"}
                        onValueChange={(v) =>
                          updateElementAndCommit(selectedEl.id, {
                            stepStyle: v as "circle" | "square" | "outline",
                          })
                        }
                        options={[
                          { value: "circle", label: "Circle" },
                          { value: "square", label: "Rounded Square" },
                          { value: "outline", label: "Outline Ring" },
                        ]}
                      />
                    </div>
                  </div>
                )}

                {/* Contextual Editor: List Block */}
                {selectedEl.type === "list_block" && (
                  <div className="space-y-2 border-t border-zinc-100 pt-2.5 dark:border-zinc-800">
                    <Label className="text-[10px] uppercase tracking-wider text-zinc-400">
                      List Style &amp; Items (1 per line)
                    </Label>
                    <ModernSelect
                      size="xs"
                      value={selectedEl.listStyle ?? "numbered"}
                      onValueChange={(v) =>
                        updateElementAndCommit(selectedEl.id, {
                          listStyle: v as "numbered" | "check" | "bullet",
                        })
                      }
                      options={[
                        { value: "numbered", label: "Numbered (01 / 02 / 03)" },
                        { value: "check", label: "Checkmark (✓)" },
                        { value: "bullet", label: "Dot Bullet (•)" },
                      ]}
                    />
                    <Textarea
                      rows={4}
                      className="text-xs"
                      value={(selectedEl.listItems ?? []).join("\n")}
                      onChange={(e) =>
                        updateElementLive(selectedEl.id, {
                          listItems: e.target.value.split("\n"),
                        })
                      }
                      onBlur={commitCurrentToHistory}
                    />
                  </div>
                )}

                {/* Contextual Editor: Bar Chart */}
                {selectedEl.type === "chart_bar" && (
                  <div className="space-y-2 border-t border-zinc-100 pt-2.5 dark:border-zinc-800">
                    <Label className="text-[10px] uppercase tracking-wider text-zinc-400">
                      Bar Chart Data
                    </Label>
                    <Input
                      className="h-7 text-xs"
                      placeholder="Chart Title"
                      value={selectedEl.chartTitle ?? ""}
                      onChange={(e) =>
                        updateElementLive(selectedEl.id, { chartTitle: e.target.value })
                      }
                      onBlur={commitCurrentToHistory}
                    />
                    <div className="space-y-1.5">
                      {(selectedEl.chartSeries ?? []).map((row, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-1">
                          <Input
                            className="col-span-5 h-7 px-1.5 text-[11px]"
                            value={row.label}
                            onChange={(e) => {
                              const next = [...(selectedEl.chartSeries ?? [])];
                              next[idx] = { ...row, label: e.target.value };
                              updateElementLive(selectedEl.id, { chartSeries: next });
                            }}
                            onBlur={commitCurrentToHistory}
                          />
                          <Input
                            type="number"
                            className="col-span-3 h-7 px-1.5 font-mono text-[11px]"
                            value={row.value}
                            onChange={(e) => {
                              const next = [...(selectedEl.chartSeries ?? [])];
                              next[idx] = { ...row, value: Number(e.target.value) || 0 };
                              updateElementLive(selectedEl.id, { chartSeries: next });
                            }}
                            onBlur={commitCurrentToHistory}
                          />
                          <Input
                            type="number"
                            placeholder="Tgt"
                            className="col-span-3 h-7 px-1.5 font-mono text-[11px]"
                            value={row.target ?? ""}
                            onChange={(e) => {
                              const next = [...(selectedEl.chartSeries ?? [])];
                              next[idx] = {
                                ...row,
                                target: e.target.value === "" ? undefined : Number(e.target.value),
                              };
                              updateElementLive(selectedEl.id, { chartSeries: next });
                            }}
                            onBlur={commitCurrentToHistory}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const next = (selectedEl.chartSeries ?? []).filter((_, i) => i !== idx);
                              updateElementAndCommit(selectedEl.id, { chartSeries: next });
                            }}
                            className="col-span-1 flex items-center justify-center text-zinc-400 hover:text-red-600"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          const next = [
                            ...(selectedEl.chartSeries ?? []),
                            { label: "New", value: 10, target: 9 },
                          ];
                          updateElementAndCommit(selectedEl.id, { chartSeries: next });
                        }}
                      >
                        <Plus className="size-3" />
                        Add Bar Row
                      </Button>
                    </div>
                  </div>
                )}

                {/* Contextual Editor: Donut Chart */}
                {selectedEl.type === "chart_donut" && (
                  <div className="space-y-2 border-t border-zinc-100 pt-2.5 dark:border-zinc-800">
                    <Label className="text-[10px] uppercase tracking-wider text-zinc-400">
                      Donut Slices &amp; Center KPI
                    </Label>
                    <Input
                      className="h-7 text-xs"
                      placeholder="Chart Title"
                      value={selectedEl.chartTitle ?? ""}
                      onChange={(e) =>
                        updateElementLive(selectedEl.id, { chartTitle: e.target.value })
                      }
                      onBlur={commitCurrentToHistory}
                    />
                    <div className="grid grid-cols-2 gap-1.5">
                      <Input
                        className="h-7 font-mono text-xs"
                        placeholder="Center Value (100%)"
                        value={selectedEl.centerValue ?? ""}
                        onChange={(e) =>
                          updateElementLive(selectedEl.id, { centerValue: e.target.value })
                        }
                        onBlur={commitCurrentToHistory}
                      />
                      <Input
                        className="h-7 text-xs"
                        placeholder="Center Label"
                        value={selectedEl.centerLabel ?? ""}
                        onChange={(e) =>
                          updateElementLive(selectedEl.id, { centerLabel: e.target.value })
                        }
                        onBlur={commitCurrentToHistory}
                      />
                    </div>
                    <div className="space-y-1.5">
                      {(selectedEl.donutSlices ?? []).map((sl, idx) => (
                        <div key={idx} className="grid grid-cols-12 items-center gap-1">
                          <input
                            type="color"
                            value={sl.color}
                            onChange={(e) => {
                              const next = [...(selectedEl.donutSlices ?? [])];
                              next[idx] = { ...sl, color: e.target.value };
                              updateElementLive(selectedEl.id, { donutSlices: next });
                            }}
                            onBlur={commitCurrentToHistory}
                            className="col-span-2 h-7 w-full cursor-pointer rounded border border-zinc-200"
                          />
                          <Input
                            className="col-span-6 h-7 px-1.5 text-[11px]"
                            value={sl.name}
                            onChange={(e) => {
                              const next = [...(selectedEl.donutSlices ?? [])];
                              next[idx] = { ...sl, name: e.target.value };
                              updateElementLive(selectedEl.id, { donutSlices: next });
                            }}
                            onBlur={commitCurrentToHistory}
                          />
                          <Input
                            type="number"
                            className="col-span-3 h-7 px-1.5 font-mono text-[11px]"
                            value={sl.value}
                            onChange={(e) => {
                              const next = [...(selectedEl.donutSlices ?? [])];
                              next[idx] = { ...sl, value: Number(e.target.value) || 0 };
                              updateElementLive(selectedEl.id, { donutSlices: next });
                            }}
                            onBlur={commitCurrentToHistory}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const next = (selectedEl.donutSlices ?? []).filter((_, i) => i !== idx);
                              updateElementAndCommit(selectedEl.id, { donutSlices: next });
                            }}
                            className="col-span-1 flex justify-center text-zinc-400 hover:text-red-600"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          const next = [
                            ...(selectedEl.donutSlices ?? []),
                            { name: "Segment", value: 15, color: "#6366f1" },
                          ];
                          updateElementAndCommit(selectedEl.id, { donutSlices: next });
                        }}
                      >
                        <Plus className="size-3" />
                        Add Slice
                      </Button>
                    </div>
                  </div>
                )}

                {/* Contextual Editor: Progress Bar / Ring Gauge */}
                {selectedEl.type === "chart_progress" && (
                  <div className="space-y-2 border-t border-zinc-100 pt-2.5 dark:border-zinc-800">
                    <Label className="text-[10px] uppercase tracking-wider text-zinc-400">
                      Progress KPI Settings
                    </Label>
                    <div className="grid grid-cols-3 gap-1.5">
                      <ModernSelect
                        size="xs"
                        value={selectedEl.progressStyle ?? "bar"}
                        onValueChange={(v) =>
                          updateElementAndCommit(selectedEl.id, {
                            progressStyle: v as "bar" | "ring",
                          })
                        }
                        options={[
                          { value: "bar", label: "Bar" },
                          { value: "ring", label: "Ring" },
                        ]}
                      />
                      <Input
                        type="number"
                        min={0}
                        max={1000}
                        className="h-7 font-mono text-xs"
                        value={selectedEl.progressValue ?? 85}
                        onChange={(e) =>
                          updateElementLive(selectedEl.id, {
                            progressValue: Number(e.target.value) || 0,
                          })
                        }
                        onBlur={commitCurrentToHistory}
                      />
                      <Input
                        type="number"
                        min={1}
                        max={1000}
                        className="h-7 font-mono text-xs"
                        value={selectedEl.progressMax ?? 100}
                        onChange={(e) =>
                          updateElementLive(selectedEl.id, {
                            progressMax: Math.max(1, Number(e.target.value) || 100),
                          })
                        }
                        onBlur={commitCurrentToHistory}
                      />
                    </div>
                  </div>
                )}

                {/* Contextual Editor: Spec Table */}
                {selectedEl.type === "table_spec" && (
                  <div className="space-y-2 border-t border-zinc-100 pt-2.5 dark:border-zinc-800">
                    <Label className="text-[10px] uppercase tracking-wider text-zinc-400">
                      Spec Table (Separate columns with |)
                    </Label>
                    <Input
                      className="h-7 font-mono text-[11px]"
                      placeholder="Col 1 | Col 2 | Col 3"
                      value={(selectedEl.tableHeaders ?? []).join(" | ")}
                      onChange={(e) =>
                        updateElementLive(selectedEl.id, {
                          tableHeaders: e.target.value.split("|").map((s) => s.trim()),
                        })
                      }
                      onBlur={commitCurrentToHistory}
                    />
                    <Textarea
                      rows={4}
                      className="font-mono text-[11px]"
                      value={(selectedEl.tableRows ?? [])
                        .map((r) => r.join(" | "))
                        .join("\n")}
                      onChange={(e) =>
                        updateElementLive(selectedEl.id, {
                          tableRows: e.target.value
                            .split("\n")
                            .filter((l) => l.trim().length > 0)
                            .map((line) => line.split("|").map((c) => c.trim())),
                        })
                      }
                      onBlur={commitCurrentToHistory}
                    />
                  </div>
                )}

                {/* Text Content Controls */}
                {(selectedEl.type === "text" ||
                  selectedEl.type === "badge" ||
                  selectedEl.type === "swatch" ||
                  selectedEl.type === "price_tag" ||
                  selectedEl.type === "emblem" ||
                  selectedEl.type === "step_number" ||
                  selectedEl.type === "chart_progress") && (
                    <div className="space-y-1.5 border-t border-zinc-100 pt-2.5 dark:border-zinc-800">
                      <Label className="text-[10px] uppercase tracking-wider text-zinc-400">
                        Content &amp; Typography
                      </Label>
                      {selectedEl.type === "text" ? (
                        <Textarea
                          rows={3}
                          className="text-xs"
                          value={selectedEl.text ?? ""}
                          onChange={(e) =>
                            updateElementLive(selectedEl.id, { text: e.target.value })
                          }
                          onBlur={commitCurrentToHistory}
                        />
                      ) : (
                        <Input
                          className="h-7 text-xs"
                          value={selectedEl.text ?? ""}
                          onChange={(e) =>
                            updateElementLive(selectedEl.id, { text: e.target.value })
                          }
                          onBlur={commitCurrentToHistory}
                        />
                      )}
                      {(selectedEl.type === "price_tag" ||
                        selectedEl.type === "emblem" ||
                        selectedEl.type === "step_number" ||
                        selectedEl.type === "chart_progress") && (
                          <Input
                            className="h-7 text-xs"
                            placeholder="Subtitle / Caption"
                            value={selectedEl.subtext ?? ""}
                            onChange={(e) =>
                              updateElementLive(selectedEl.id, { subtext: e.target.value })
                            }
                            onBlur={commitCurrentToHistory}
                          />
                        )}
                      {selectedEl.type === "price_tag" && (
                        <ModernSelect
                          size="xs"
                          value={selectedEl.currency ?? "KES"}
                          onValueChange={(v) =>
                            updateElementAndCommit(selectedEl.id, {
                              currency: v as "KES" | "TZS" | "UGX",
                            })
                          }
                          options={[
                            { value: "KES", label: "KES (Kenya)" },
                            { value: "TZS", label: "TZS (Tanzania)" },
                            { value: "UGX", label: "UGX (Uganda)" },
                          ]}
                        />
                      )}

                      <ModernSelect
                        size="xs"
                        value={selectedEl.fontFamily ?? "satoshi"}
                        onValueChange={(v) =>
                          updateElementAndCommit(selectedEl.id, {
                            fontFamily: v as StudioFontKey,
                          })
                        }
                        options={STUDIO_FONTS.map((f) => ({
                          value: f.key,
                          label: f.label,
                          description: f.category,
                        }))}
                      />

                      {(selectedEl.type === "text" ||
                        selectedEl.type === "step_number") && (
                          <div className="grid grid-cols-3 gap-1.5">
                            <div className="space-y-0.5">
                              <span className="text-[9px] text-zinc-400">Size</span>
                              <Input
                                type="number"
                                min={12}
                                max={180}
                                className="h-7 px-1.5 font-mono text-[11px]"
                                value={selectedEl.fontSize ?? 48}
                                onChange={(e) =>
                                  updateElementLive(selectedEl.id, {
                                    fontSize: Number(e.target.value) || 32,
                                  })
                                }
                                onBlur={commitCurrentToHistory}
                              />
                            </div>
                            <div className="space-y-0.5">
                              <span className="text-[9px] text-zinc-400">Line Ht</span>
                              <Input
                                type="number"
                                min={0.8}
                                max={2.2}
                                step={0.05}
                                className="h-7 px-1.5 font-mono text-[11px]"
                                value={selectedEl.lineHeight ?? 1.12}
                                onChange={(e) =>
                                  updateElementLive(selectedEl.id, {
                                    lineHeight: Number(e.target.value) || 1.12,
                                  })
                                }
                                onBlur={commitCurrentToHistory}
                              />
                            </div>
                            <div className="space-y-0.5">
                              <span className="text-[9px] text-zinc-400">Track px</span>
                              <Input
                                type="number"
                                min={-4}
                                max={20}
                                step={0.5}
                                className="h-7 px-1.5 font-mono text-[11px]"
                                value={selectedEl.letterSpacing ?? 0}
                                onChange={(e) =>
                                  updateElementLive(selectedEl.id, {
                                    letterSpacing: Number(e.target.value) || 0,
                                  })
                                }
                                onBlur={commitCurrentToHistory}
                              />
                            </div>
                          </div>
                        )}

                      {selectedEl.type === "text" && (
                        <div className="flex items-center gap-1">
                          {(
                            [
                              { a: "left", icon: AlignLeft },
                              { a: "center", icon: AlignCenter },
                              { a: "right", icon: AlignRight },
                            ] as const
                          ).map(({ a, icon: AlignIcon }) => (
                            <Button
                              key={a}
                              type="button"
                              size="icon-xs"
                              variant={selectedEl.textAlign === a ? "default" : "outline"}
                              onClick={() =>
                                updateElementAndCommit(selectedEl.id, { textAlign: a })
                              }
                            >
                              <AlignIcon className="size-3" />
                            </Button>
                          ))}
                          <Button
                            type="button"
                            size="xs"
                            variant={selectedEl.uppercase ? "default" : "outline"}
                            onClick={() =>
                              updateElementAndCommit(selectedEl.id, {
                                uppercase: !selectedEl.uppercase,
                              })
                            }
                          >
                            AA
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                {/* Swatch / Icon / Image / QR Specific */}
                {selectedEl.type === "swatch" && (
                  <div className="grid grid-cols-2 gap-1.5 border-t border-zinc-100 pt-2.5 dark:border-zinc-800">
                    <input
                      type="color"
                      value={selectedEl.swatchHex || "#0D9488"}
                      onChange={(e) =>
                        updateElementLive(selectedEl.id, { swatchHex: e.target.value })
                      }
                      onBlur={commitCurrentToHistory}
                      className="h-7 w-full cursor-pointer rounded border border-zinc-200"
                    />
                    <Input
                      className="h-7 font-mono text-xs"
                      value={selectedEl.swatchCode ?? ""}
                      onChange={(e) =>
                        updateElementLive(selectedEl.id, { swatchCode: e.target.value })
                      }
                      onBlur={commitCurrentToHistory}
                    />
                  </div>
                )}

                {selectedEl.type === "icon" && (
                  <ModernSelect
                    size="xs"
                    value={selectedEl.iconName ?? "Sparkles"}
                    onValueChange={(v) =>
                      updateElementAndCommit(selectedEl.id, { iconName: v })
                    }
                    options={STUDIO_ICONS.map((i) => ({
                      value: i.name,
                      label: i.label,
                    }))}
                  />
                )}

                {selectedEl.type === "image" && (
                  <Input
                    className="h-7 text-xs"
                    placeholder="https://... image URL"
                    value={selectedEl.imageUrl ?? ""}
                    onChange={(e) =>
                      updateElementLive(selectedEl.id, { imageUrl: e.target.value })
                    }
                    onBlur={commitCurrentToHistory}
                  />
                )}

                {selectedEl.type === "qr" && (
                  <div className="space-y-1.5">
                    <Input
                      className="h-7 text-xs"
                      placeholder="https://www.crownpaints.co.ke"
                      value={selectedEl.qrUrl ?? ""}
                      onChange={(e) =>
                        updateElementLive(selectedEl.id, { qrUrl: e.target.value })
                      }
                      onBlur={commitCurrentToHistory}
                    />
                    <Input
                      className="h-7 text-xs"
                      placeholder="QR Caption"
                      value={selectedEl.qrLabel ?? ""}
                      onChange={(e) =>
                        updateElementLive(selectedEl.id, { qrLabel: e.target.value })
                      }
                      onBlur={commitCurrentToHistory}
                    />
                  </div>
                )}

                {/* Color Pickers */}
                {selectedEl.type !== "separator" && (
                  <div className="grid grid-cols-2 gap-1.5 border-t border-zinc-100 pt-2.5 dark:border-zinc-800">
                    {selectedEl.type !== "shape" && selectedEl.type !== "image" && (
                      <div className="space-y-0.5">
                        <span className="text-[9px] text-zinc-400">Text / Ink</span>
                        <input
                          type="color"
                          value={
                            selectedEl.color?.startsWith("#")
                              ? selectedEl.color
                              : "#09090b"
                          }
                          onChange={(e) =>
                            updateElementLive(selectedEl.id, { color: e.target.value })
                          }
                          onBlur={commitCurrentToHistory}
                          className="h-7 w-full cursor-pointer rounded border border-zinc-200"
                        />
                      </div>
                    )}
                    {(selectedEl.type === "shape" ||
                      selectedEl.type === "badge" ||
                      selectedEl.type === "price_tag" ||
                      selectedEl.type === "emblem" ||
                      selectedEl.type === "step_number" ||
                      selectedEl.type === "list_block" ||
                      selectedEl.type === "chart_bar" ||
                      selectedEl.type === "chart_progress") && (
                        <div className="space-y-0.5">
                          <span className="text-[9px] text-zinc-400">
                            {selectedEl.type === "chart_bar" ||
                              selectedEl.type === "chart_progress"
                              ? "Accent Bar"
                              : "Fill / Accent"}
                          </span>
                          <input
                            type="color"
                            value={
                              (selectedEl.type === "chart_bar" ||
                                selectedEl.type === "chart_progress"
                                ? selectedEl.barColor
                                : selectedEl.fill
                              )?.startsWith("#")
                                ? ((selectedEl.type === "chart_bar" ||
                                  selectedEl.type === "chart_progress"
                                  ? selectedEl.barColor
                                  : selectedEl.fill) as string)
                                : "#2563eb"
                            }
                            onChange={(e) =>
                              updateElementLive(
                                selectedEl.id,
                                selectedEl.type === "chart_bar" ||
                                  selectedEl.type === "chart_progress"
                                  ? { barColor: e.target.value }
                                  : { fill: e.target.value }
                              )
                            }
                            onBlur={commitCurrentToHistory}
                            className="h-7 w-full cursor-pointer rounded border border-zinc-200"
                          />
                        </div>
                      )}
                  </div>
                )}
              </div>
            )}

            {/* Layers Stack */}
            <div className="border-t border-zinc-100 pt-2.5 dark:border-zinc-800">
              <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                <Layers className="size-3" />
                Layers ({doc.elements.length})
              </p>
              <div className="space-y-0.5">
                {[...doc.elements]
                  .sort((a, b) => b.zIndex - a.zIndex)
                  .map((el) => (
                    <div
                      key={el.id}
                      onClick={() => setSelectedId(el.id)}
                      className={`flex cursor-pointer items-center justify-between rounded-md px-2 py-1 text-[11px] transition ${selectedId === el.id
                        ? "bg-zinc-950 font-medium text-white dark:bg-white dark:text-zinc-950"
                        : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                        }`}
                    >
                      <span className="truncate">{el.label}</span>
                      <div className="flex items-center gap-1">
                        {el.locked && <Lock className="size-2.5 opacity-60" />}
                        <span className="font-mono text-[9px] opacity-60">
                          {el.type.replace("_", " ")}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
