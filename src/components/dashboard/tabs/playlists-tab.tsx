"use client";

/**
 * @file src/components/dashboard/tabs/playlists-tab.tsx
 * @description Drag-and-Drop (`@dnd-kit`) Playlist Studio: create/rename/delete playlists,
 * switch multi-zone layouts, drag-to-reorder playback items, adjust per-item duration,
 * add Media Library assets or Studio slides inline, and manage rich bottom taglines.
 */

import { useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CheckCircle2,
  Edit3,
  Film,
  Globe,
  GripVertical,
  Image as ImageIcon,
  LayoutPanelLeft,
  ListVideo,
  Package,
  Plus,
  Search,
  Sparkles,
  Trash2,
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
import { TaglineBuilder } from "@/components/dashboard/tagline-builder";
import {
  BUILTIN_DEFAULT_SIDEBAR_ID,
  PartnerLogosPanel,
  ShowcaseProductsPanel,
  SidebarProfilesPanel,
} from "@/components/dashboard/sidebar-designer-panel";
import type {
  OverviewPayload,
  PlaylistItemRecord,
  PlaylistRecord,
} from "../cms-types";

interface PlaylistsTabProps {
  data: OverviewPayload;
  selectedPlaylistId: string;
  onSelectPlaylist: (id: string) => void;
  onBrowseTemplatesForPlaylist?: (playlistId: string) => void;
  onRefresh: () => Promise<void>;
}

interface SortableItemRowProps {
  rowKey: string;
  index: number;
  item: PlaylistItemRecord;
  title: string;
  kindBadge: "video" | "image" | "web" | "studio";
  onDurationChange: (seconds: number) => void;
  onRemove: () => void;
}

function SortablePlaylistItemRow({
  rowKey,
  index,
  item,
  title,
  kindBadge,
  onDurationChange,
  onRemove,
}: SortableItemRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rowKey });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition ${isDragging
        ? "z-20 border-blue-500 bg-blue-50/70 shadow-lg"
        : "border-zinc-200 bg-white hover:border-zinc-300"
        }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 active:cursor-grabbing"
          title="Drag to reorder"
        >
          <GripVertical className="size-4" />
        </button>
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-zinc-100 font-mono text-[11px] font-bold text-zinc-700">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-zinc-950">{title}</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            {kindBadge === "video" ? (
              <Badge variant="info" className="h-4 text-[10px]">
                <Film className="size-2.5" />
                Video
              </Badge>
            ) : kindBadge === "image" ? (
              <Badge variant="success" className="h-4 text-[10px]">
                <ImageIcon className="size-2.5" />
                Image
              </Badge>
            ) : kindBadge === "web" ? (
              <Badge variant="warning" className="h-4 text-[10px]">
                <Globe className="size-2.5" />
                Web / PDF
              </Badge>
            ) : (
              <Badge variant="purple" className="h-4 text-[10px]">
                <Sparkles className="size-2.5" />
                Studio Slide
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={3}
            max={600}
            value={item.durationSeconds ?? 15}
            onChange={(e) =>
              onDurationChange(Math.max(3, Number(e.target.value) || 15))
            }
            className="h-7 w-16 text-center font-mono text-xs"
            title="Display duration in seconds"
          />
          <span className="text-[10px] text-zinc-400">sec</span>
        </div>
        <Button
          size="icon-xs"
          variant="ghost"
          title="Remove from playlist"
          onClick={onRemove}
        >
          <Trash2 className="size-3.5 text-rose-500" />
        </Button>
      </div>
    </div>
  );
}

export function PlaylistsTab({
  data,
  selectedPlaylistId,
  onSelectPlaylist,
  onBrowseTemplatesForPlaylist,
  onRefresh,
}: PlaylistsTabProps) {
  const confirm = useConfirm();
  const [subTab, setSubTab] = useState<
    "playlists" | "sidebars" | "products" | "partners"
  >("playlists");
  const [editProfileId, setEditProfileId] = useState<string | null>(null);
  const [autoCreatingSidebar, setAutoCreatingSidebar] = useState(false);
  const [searchPl, setSearchPl] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDeptId, setNewDeptId] = useState(data.departments[0]?.id ?? "");
  const [newLayoutId, setNewLayoutId] = useState(data.layouts[0]?.id ?? "");

  // Content picker state
  const [showPicker, setShowPicker] = useState(false);
  const [pickerTab, setPickerTab] = useState<"media" | "studio">("media");
  const [pickerSearch, setPickerSearch] = useState("");

  // Local draft overrides for selected playlist
  const [tickerDrafts, setTickerDrafts] = useState<Record<string, string>>({});
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [savingOrder, setSavingOrder] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const deptById = useMemo(
    () => new Map(data.departments.map((d) => [d.id, d])),
    [data.departments]
  );
  const layoutById = useMemo(
    () => new Map(data.layouts.map((l) => [l.id, l])),
    [data.layouts]
  );
  const mediaById = useMemo(
    () => new Map(data.mediaAssets.map((m) => [m.id, m])),
    [data.mediaAssets]
  );
  const postById = useMemo(
    () => new Map(data.quickPosts.map((q) => [q.id, q])),
    [data.quickPosts]
  );

  const filteredPlaylists = useMemo(() => {
    const q = searchPl.trim().toLowerCase();
    if (!q) return data.playlists;
    return data.playlists.filter((p) => p.name.toLowerCase().includes(q));
  }, [data.playlists, searchPl]);

  const activePlaylist: PlaylistRecord | null =
    data.playlists.find((p) => p.id === selectedPlaylistId) ??
    data.playlists[0] ??
    null;

  async function saveItems(
    playlistId: string,
    items: PlaylistItemRecord[],
    toastMsg: string
  ) {
    setSavingOrder(true);
    try {
      const res = await fetch(`/api/playlists/${playlistId}/items`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((it) => ({
            itemKind: it.itemKind,
            mediaAssetId: it.mediaAssetId ?? null,
            quickPostId: it.quickPostId ?? null,
            durationSeconds: it.durationSeconds ?? 15,
          })),
        }),
      });
      if (!res.ok) {
        toast.error("Failed to save playlist order");
        return;
      }
      toast.success(toastMsg);
      await onRefresh();
    } finally {
      setSavingOrder(false);
    }
  }

  async function handleCreatePlaylist(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newDeptId) return;
    const res = await fetch("/api/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        departmentId: newDeptId,
        layoutId: newLayoutId || null,
      }),
    });
    const j = await res.json();
    if (!res.ok) {
      toast.error(j.error || "Could not create playlist");
      return;
    }
    toast.success(`Created playlist "${newName.trim()}"`);
    if (j.playlist?.id) onSelectPlaylist(j.playlist.id);
    setNewName("");
    setShowCreate(false);
    await onRefresh();
  }

  async function handlePatchPlaylist(
    plId: string,
    payload: Record<string, unknown>,
    msg: string
  ) {
    const res = await fetch(`/api/playlists/${plId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      toast.error("Failed to update playlist");
      return;
    }
    toast.success(msg);
    await onRefresh();
  }

  async function handleDeletePlaylist(pl: PlaylistRecord) {
    const ok = await confirm({
      title: `Delete playlist "${pl.name}"?`,
      description:
        "Screens assigned to this playlist will fall back to their next scheduled or default playlist.",
      confirmLabel: "Delete Playlist",
      variant: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/playlists/${pl.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete playlist");
      return;
    }
    toast.success(`Deleted "${pl.name}"`);
    await onRefresh();
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!activePlaylist) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const keys = activePlaylist.items.map((it, idx) => it.id ?? `idx-${idx}`);
    const oldIndex = keys.indexOf(String(active.id));
    const newIndex = keys.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(activePlaylist.items, oldIndex, newIndex);
    void saveItems(
      activePlaylist.id,
      reordered,
      "Reordered playback sequence & pushed to TVs"
    );
  }

  function handleAppendItem(
    itemKind: "media_asset" | "quick_post",
    refId: string,
    durationSeconds: number
  ) {
    if (!activePlaylist) return;
    const next: PlaylistItemRecord[] = [
      ...activePlaylist.items,
      {
        itemKind,
        mediaAssetId: itemKind === "media_asset" ? refId : null,
        quickPostId: itemKind === "quick_post" ? refId : null,
        durationSeconds,
      },
    ];
    void saveItems(
      activePlaylist.id,
      next,
      `Added item to "${activePlaylist.name}" & pushed to TVs`
    );
  }

  async function handleAutoCreateSidebarForPlaylist(pl: PlaylistRecord) {
    setAutoCreatingSidebar(true);
    try {
      const res = await fetch("/api/sidebar-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${pl.name} Sidebar`,
          theme: "white_minimal",
          attachToPlaylistId: pl.id,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        profile?: { id: string; name: string };
      };
      if (!res.ok || !json.profile) {
        toast.error(json.error || "Could not create sidebar for playlist");
        return;
      }
      toast.success(`Created & attached "${json.profile.name}" to "${pl.name}"`);
      await onRefresh();
      setEditProfileId(json.profile.id);
      setSubTab("sidebars");
    } finally {
      setAutoCreatingSidebar(false);
    }
  }

  const sortableKeys = (activePlaylist?.items ?? []).map(
    (it, idx) => it.id ?? `idx-${idx}`
  );

  const sidebarProfiles = data.sidebarProfiles ?? [];
  const defaultSidebarProfile = sidebarProfiles.find((sp) => sp.isDefault) ?? null;
  const sidebarProfilesDisplayCount = defaultSidebarProfile
    ? sidebarProfiles.length
    : sidebarProfiles.length + 1;
  const showcaseProductsCount = (data.showcaseProducts ?? []).length;

  return (
    <div className="space-y-4">
      {/* Sub-navigation: Playlists | Sidebar Profiles | Showcase Products */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-1">
          {[
            {
              id: "playlists" as const,
              label: `Playlists (${data.playlists.length})`,
              icon: ListVideo,
            },
            {
              id: "sidebars" as const,
              label: `Sidebar Profiles (${sidebarProfilesDisplayCount})`,
              icon: LayoutPanelLeft,
            },
            {
              id: "products" as const,
              label: `Showcase Products (${showcaseProductsCount})`,
              icon: Package,
            },
            {
              id: "partners" as const,
              label: `Partner Logos (${(data.partnerLogos ?? []).length})`,
              icon: Globe,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${active
                    ? "bg-white text-zinc-950 shadow-2xs ring-1 ring-zinc-200/80"
                    : "text-zinc-500 hover:text-zinc-900"
                  }`}
              >
                <Icon className="size-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-zinc-500">
          Attach a unique Sidebar Profile to each playlist or customize products rotating on split-screen TVs.
        </p>
      </div>

      {subTab === "sidebars" ? (
        <SidebarProfilesPanel
          key={editProfileId ?? "list"}
          data={data}
          initialEditProfileId={editProfileId}
          onClearInitialEdit={() => setEditProfileId(null)}
          onRefresh={onRefresh}
        />
      ) : subTab === "products" ? (
        <ShowcaseProductsPanel data={data} onRefresh={onRefresh} />
      ) : subTab === "partners" ? (
        <PartnerLogosPanel data={data} onRefresh={onRefresh} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-12">
          {/* LEFT RAIL: Playlists Directory */}
          <Card className="lg:col-span-4">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Playlists</CardTitle>
                  <CardDescription>
                    {data.playlists.length} playlist{data.playlists.length === 1 ? "" : "s"}
                  </CardDescription>
                </div>
                <Button
                  size="xs"
                  onClick={() => setShowCreate((v) => !v)}
                >
                  <Plus className="size-3.5" />
                  New
                </Button>
              </div>
              <div className="relative mt-2">
                <Search className="pointer-events-none absolute left-2.5 top-2 size-3.5 text-zinc-400" />
                <Input
                  className="h-7 pl-8 text-xs"
                  placeholder="Filter playlists..."
                  value={searchPl}
                  onChange={(e) => setSearchPl(e.target.value)}
                />
              </div>
            </CardHeader>

            <CardContent className="space-y-2.5">
              {showCreate && (
                <form
                  onSubmit={handleCreatePlaylist}
                  className="space-y-2.5 rounded-xl border border-blue-200 bg-blue-50/40 p-3"
                >
                  <Input
                    className="h-8 bg-white text-xs"
                    placeholder="Playlist Name (e.g. Main Showroom Loop)"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    required
                  />
                  <ModernSelect
                    size="xs"
                    value={newDeptId}
                    onValueChange={setNewDeptId}
                    options={data.departments.map((d) => ({
                      value: d.id,
                      label: d.name,
                    }))}
                  />
                  <ModernSelect
                    size="xs"
                    value={newLayoutId}
                    onValueChange={setNewLayoutId}
                    options={[
                      { value: "", label: "Full Screen (100%)" },
                      ...data.layouts.map((l) => ({ value: l.id, label: l.name })),
                    ]}
                  />
                  <div className="flex justify-end gap-1.5">
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() => setShowCreate(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" size="xs">
                      Create
                    </Button>
                  </div>
                </form>
              )}

              <div className="space-y-1.5">
                {filteredPlaylists.map((pl) => {
                  const isSelected = activePlaylist?.id === pl.id;
                  const layoutName = pl.layoutId
                    ? layoutById.get(pl.layoutId)?.name ?? "Split Canvas"
                    : "Full Screen";
                  const deptName = deptById.get(pl.departmentId)?.name ?? "General";
                  return (
                    <div
                      key={pl.id}
                      onClick={() => onSelectPlaylist(pl.id)}
                      className={`cursor-pointer rounded-xl border p-3 transition ${isSelected
                        ? "border-zinc-950 bg-zinc-50 shadow-2xs"
                        : "border-zinc-200 bg-white hover:border-zinc-300"
                        }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-zinc-950">
                            {pl.name}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                            {deptName}
                          </p>
                        </div>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDeletePlaylist(pl);
                          }}
                        >
                          <Trash2 className="size-3 text-rose-500" />
                        </Button>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge variant="info" className="text-[10px]">
                          {pl.items.length} items
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {layoutName}
                        </Badge>
                        <span className="ml-auto font-mono text-[10px] text-zinc-400">
                          v{pl.version}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* RIGHT WORKSPACE: Drag-and-Drop Sequence Editor */}
          <Card className="lg:col-span-8">
            {!activePlaylist ? (
              <CardContent className="p-12 text-center text-sm text-zinc-500">
                Select or create a playlist on the left to arrange its media and slides.
              </CardContent>
            ) : (
              <>
                <CardHeader className="space-y-3 border-b border-zinc-100 pb-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-1 items-center gap-2 min-w-[220px]">
                      <Input
                        className="h-8 max-w-xs text-sm font-semibold"
                        value={nameDrafts[activePlaylist.id] ?? activePlaylist.name}
                        onChange={(e) =>
                          setNameDrafts((prev) => ({
                            ...prev,
                            [activePlaylist.id]: e.target.value,
                          }))
                        }
                        onBlur={() => {
                          const nextName = (
                            nameDrafts[activePlaylist.id] ?? activePlaylist.name
                          ).trim();
                          if (nextName && nextName !== activePlaylist.name) {
                            void handlePatchPlaylist(
                              activePlaylist.id,
                              { name: nextName },
                              `Renamed playlist to "${nextName}"`
                            );
                          }
                        }}
                      />
                      <Badge variant="outline" className="font-mono">
                        v{activePlaylist.version}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="w-48">
                        <ModernSelect
                          size="sm"
                          value={activePlaylist.layoutId ?? ""}
                          onValueChange={(v) =>
                            void handlePatchPlaylist(
                              activePlaylist.id,
                              { layoutId: v || null },
                              "Updated layout & pushed to TVs"
                            )
                          }
                          options={[
                            { value: "", label: "Full Screen (100%)" },
                            ...data.layouts.map((l) => ({
                              value: l.id,
                              label: l.name,
                            })),
                          ]}
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-48">
                          <ModernSelect
                            size="sm"
                            value={activePlaylist.sidebarProfileId ?? ""}
                            onValueChange={(v) =>
                              void handlePatchPlaylist(
                                activePlaylist.id,
                                { sidebarProfileId: v || null },
                                "Attached sidebar profile & pushed to TVs"
                              )
                            }
                            options={[
                              {
                                value: "",
                                label: defaultSidebarProfile
                                  ? `Default (${defaultSidebarProfile.name})`
                                  : "Default Sidebar",
                              },
                              ...sidebarProfiles.map((sp) => ({
                                value: sp.id,
                                label: sp.name,
                              })),
                            ]}
                          />
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          title={
                            activePlaylist.sidebarProfileId
                              ? "Edit this playlist's attached sidebar"
                              : "Edit the Default Sidebar used by this playlist"
                          }
                          onClick={() => {
                            setEditProfileId(
                              activePlaylist.sidebarProfileId ||
                              defaultSidebarProfile?.id ||
                              BUILTIN_DEFAULT_SIDEBAR_ID
                            );
                            setSubTab("sidebars");
                          }}
                        >
                          <Edit3 className="size-3.5 text-zinc-700" />
                          Edit Sidebar
                        </Button>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={autoCreatingSidebar}
                        title="Auto-create a dedicated custom sidebar and attach it to this playlist"
                        onClick={() =>
                          void handleAutoCreateSidebarForPlaylist(activePlaylist)
                        }
                      >
                        <LayoutPanelLeft className="size-3.5 text-blue-600" />
                        {autoCreatingSidebar ? "Creating..." : "Auto-Create Sidebar"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowPicker((v) => !v)}
                      >
                        <Plus className="size-3.5" />
                        Add Content
                      </Button>
                      <Button
                        size="sm"
                        disabled={savingOrder}
                        onClick={() =>
                          void saveItems(
                            activePlaylist.id,
                            activePlaylist.items,
                            `Saved "${activePlaylist.name}" & pushed to paired TVs`
                          )
                        }
                      >
                        <CheckCircle2 className="size-3.5" />
                        Push to TVs
                      </Button>
                    </div>
                  </div>

                  {/* Ambient Music, Targeted Promotion Interleaving, Partner Ticker & Poster/Video Stage Controls */}
                  <div className="grid gap-2.5 rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-3 md:grid-cols-5">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-zinc-600">
                        Background Music
                      </Label>
                      <ModernSelect
                        size="xs"
                        value={activePlaylist.audioTrackId ?? ""}
                        onValueChange={(v) =>
                          void handlePatchPlaylist(
                            activePlaylist.id,
                            { audioTrackId: v || null },
                            "Updated playlist background music & pushed to TVs"
                          )
                        }
                        options={[
                          { value: "", label: "Silent (No Music)" },
                          ...(data.audioTracks ?? []).map((a) => ({
                            value: a.id,
                            label: `♪ ${a.title} (${a.volumePercent}%)`,
                          })),
                        ]}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-zinc-600">
                        Inject Promotions
                      </Label>
                      <ModernSelect
                        size="xs"
                        value={String(activePlaylist.promoInjectEveryN ?? 0)}
                        onValueChange={(v) =>
                          void handlePatchPlaylist(
                            activePlaylist.id,
                            { promoInjectEveryN: Number(v) || 0 },
                            "Updated promotion ad-break cadence & pushed to TVs"
                          )
                        }
                        options={[
                          { value: "0", label: "Off (Playlist Only)" },
                          { value: "2", label: "1 Promo / 2 slides" },
                          { value: "3", label: "1 Promo / 3 slides" },
                          { value: "4", label: "1 Promo / 4 slides" },
                          { value: "5", label: "1 Promo / 5 slides" },
                          { value: "6", label: "1 Promo / 6 slides" },
                        ]}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-zinc-600">
                        Ticker Brand Logos
                      </Label>
                      <ModernSelect
                        size="xs"
                        value={
                          activePlaylist.showPartnerLogos === false
                            ? "hidden"
                            : (activePlaylist.partnerTickerMode || "pinned_right")
                        }
                        onValueChange={(v) =>
                          void handlePatchPlaylist(
                            activePlaylist.id,
                            {
                              showPartnerLogos: v !== "hidden",
                              partnerTickerMode: v,
                            },
                            "Updated brand logo ticker display & pushed to TVs"
                          )
                        }
                        options={[
                          { value: "pinned_right", label: "Pinned 2-Logo Rail" },
                          { value: "inline_scroll", label: "Inline Scrolling" },
                          { value: "hidden", label: "Hide Logos" },
                        ]}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-zinc-600">
                        A4 Poster / Video BG
                      </Label>
                      <ModernSelect
                        size="xs"
                        value={activePlaylist.stageBackdrop || "ambient_blur"}
                        onValueChange={(v) =>
                          void handlePatchPlaylist(
                            activePlaylist.id,
                            { stageBackdrop: v },
                            "Updated stage backdrop & pushed to TVs"
                          )
                        }
                        options={[
                          { value: "ambient_blur", label: "Live Ambilight & Blur" },
                          { value: "showroom_light", label: "Showroom Light Gallery" },
                          { value: "crown_navy", label: "Crown Royal Navy" },
                        ]}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-zinc-600">
                        Video / Poster Fit
                      </Label>
                      <ModernSelect
                        size="xs"
                        value={activePlaylist.mediaFitMode || "ambient_fit"}
                        onValueChange={(v) =>
                          void handlePatchPlaylist(
                            activePlaylist.id,
                            { mediaFitMode: v },
                            "Updated display fit mode & pushed to TVs"
                          )
                        }
                        options={[
                          { value: "ambient_fit", label: "Smart Fit (Keep Logos)" },
                          { value: "edge_cover", label: "Edge-to-Edge Fill" },
                        ]}
                      />
                    </div>
                  </div>

                  {/* Collapsible Add Content Picker (Media Library + Studio Slides) */}
                  {showPicker && (
                    <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white p-0.5">
                          <button
                            type="button"
                            onClick={() => setPickerTab("media")}
                            className={`rounded-md px-2.5 py-1 text-xs font-medium ${pickerTab === "media"
                              ? "bg-zinc-950 text-white"
                              : "text-zinc-600"
                              }`}
                          >
                            Media Library ({data.mediaAssets.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setPickerTab("studio")}
                            className={`rounded-md px-2.5 py-1 text-xs font-medium ${pickerTab === "studio"
                              ? "bg-zinc-950 text-white"
                              : "text-zinc-600"
                              }`}
                          >
                            Crown Studio Slides ({data.quickPosts.length})
                          </button>
                          {onBrowseTemplatesForPlaylist && activePlaylist && (
                            <button
                              type="button"
                              onClick={() =>
                                onBrowseTemplatesForPlaylist(activePlaylist.id)
                              }
                              className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 transition hover:bg-violet-100"
                            >
                              <Sparkles className="size-3" />
                              + New from Template
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            className="h-7 w-48 bg-white text-xs"
                            placeholder="Search content..."
                            value={pickerSearch}
                            onChange={(e) => setPickerSearch(e.target.value)}
                          />
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            onClick={() => setShowPicker(false)}
                          >
                            <X className="size-3.5" />
                          </Button>
                        </div>
                      </div>

                      <div className="grid max-h-52 gap-2 overflow-y-auto sm:grid-cols-2">
                        {pickerTab === "media"
                          ? data.mediaAssets
                            .filter((m) =>
                              m.title
                                .toLowerCase()
                                .includes(pickerSearch.trim().toLowerCase())
                            )
                            .map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() =>
                                  handleAppendItem(
                                    "media_asset",
                                    m.id,
                                    m.durationSeconds || 15
                                  )
                                }
                                className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-xs transition hover:border-zinc-950"
                              >
                                <div className="min-w-0">
                                  <p className="truncate font-semibold">
                                    {m.title}
                                  </p>
                                  <p className="text-[10px] text-zinc-500">
                                    {m.mediaType} • {m.durationSeconds}s
                                  </p>
                                </div>
                                <Plus className="size-3.5 shrink-0 text-blue-600" />
                              </button>
                            ))
                          : data.quickPosts
                            .filter((q) =>
                              q.title
                                .toLowerCase()
                                .includes(pickerSearch.trim().toLowerCase())
                            )
                            .map((q) => (
                              <button
                                key={q.id}
                                type="button"
                                onClick={() =>
                                  handleAppendItem(
                                    "quick_post",
                                    q.id,
                                    q.durationSeconds || 15
                                  )
                                }
                                className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-xs transition hover:border-zinc-950"
                              >
                                <div className="min-w-0">
                                  <p className="truncate font-semibold">
                                    {q.title}
                                  </p>
                                  <p className="text-[10px] text-zinc-500">
                                    Studio Slide • {q.durationSeconds}s
                                  </p>
                                </div>
                                <Plus className="size-3.5 shrink-0 text-violet-600" />
                              </button>
                            ))}
                      </div>
                    </div>
                  )}
                </CardHeader>

                <CardContent className="space-y-5 pt-4">
                  {/* Drag-and-Drop Sequence */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                        Drag &amp; Drop Playback Order ({activePlaylist.items.length}{" "}
                        items)
                      </p>
                      <span className="text-[11px] text-zinc-400">
                        Drag handles to reorder — auto-saves on drop
                      </span>
                    </div>

                    {activePlaylist.items.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-zinc-200 p-8 text-center text-xs text-zinc-500">
                        <ListVideo className="mx-auto mb-2 size-6 text-zinc-300" />
                        This playlist is empty. Click <strong>Add Content</strong>{" "}
                        above to add videos, images, or Crown Studio slides.
                      </div>
                    ) : (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                      >
                        <SortableContext
                          items={sortableKeys}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="space-y-2">
                            {activePlaylist.items.map((item, idx) => {
                              const rowKey = sortableKeys[idx];
                              const asset =
                                item.itemKind === "media_asset" && item.mediaAssetId
                                  ? mediaById.get(item.mediaAssetId)
                                  : undefined;
                              const post =
                                item.itemKind === "quick_post" && item.quickPostId
                                  ? postById.get(item.quickPostId)
                                  : undefined;
                              const title =
                                asset?.title ??
                                post?.title ??
                                (item.itemKind === "media_asset"
                                  ? "Media Asset"
                                  : "Studio Slide");
                              const kindBadge: "video" | "image" | "web" | "studio" =
                                item.itemKind === "quick_post"
                                  ? "studio"
                                  : asset?.mediaType === "video"
                                    ? "video"
                                    : asset?.mediaType === "image"
                                      ? "image"
                                      : "web";

                              return (
                                <SortablePlaylistItemRow
                                  key={rowKey}
                                  rowKey={rowKey}
                                  index={idx}
                                  item={item}
                                  title={title}
                                  kindBadge={kindBadge}
                                  onDurationChange={(sec) => {
                                    const next = activePlaylist.items.map(
                                      (it, i) =>
                                        i === idx
                                          ? { ...it, durationSeconds: sec }
                                          : it
                                    );
                                    void saveItems(
                                      activePlaylist.id,
                                      next,
                                      `Updated duration to ${sec}s`
                                    );
                                  }}
                                  onRemove={() => {
                                    const next = activePlaylist.items.filter(
                                      (_, i) => i !== idx
                                    );
                                    void saveItems(
                                      activePlaylist.id,
                                      next,
                                      `Removed "${title}" from playlist`
                                    );
                                  }}
                                />
                              );
                            })}
                          </div>
                        </SortableContext>
                      </DndContext>
                    )}
                  </div>

                  {/* Multi-Tagline Bottom Ticker Builder */}
                  <div className="space-y-2 border-t border-zinc-100 pt-4">
                    <Label className="text-xs font-semibold text-zinc-700">
                      Running Bottom Taglines (supports multiple messages with Google Play, App Store &amp; icons)
                    </Label>
                    <TaglineBuilder
                      value={
                        tickerDrafts[activePlaylist.id] ??
                        activePlaylist.tickerText ??
                        ""
                      }
                      onChange={(next) =>
                        setTickerDrafts((prev) => ({
                          ...prev,
                          [activePlaylist.id]: next,
                        }))
                      }
                      onSave={(next) =>
                        void handlePatchPlaylist(
                          activePlaylist.id,
                          { tickerText: next.trim() || null },
                          "Running taglines updated & pushed to TVs"
                        )
                      }
                    />
                  </div>
                </CardContent>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
