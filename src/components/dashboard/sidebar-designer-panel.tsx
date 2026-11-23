"use client";

/**
 * @file src/components/dashboard/sidebar-designer-panel.tsx
 * @description CMS workspaces for (1) Reusable Per-Playlist Sidebar Profiles (theme,
 * custom tracked QR code, clock/weather toggles, curated showcase products) and
 * (2) Automated Sidebar Showcase Products (attach image, set name, badge header & description).
 */

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  ImagePlus,
  LayoutPanelLeft,
  Package,
  Plus,
  QrCode,
  Star,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModernSelect } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { CROWN_DECORATIVE_QR_URL } from "@/lib/crown-products";
import { optimizeImageForSignage } from "@/lib/media-optimizer";
import type {
  OverviewPayload,
  ShowcaseProductItem,
  SidebarProfileItem,
} from "./cms-types";

const THEME_OPTIONS = [
  { value: "white_minimal", label: "Pure White Minimal (Recommended)" },
  { value: "warm_editorial", label: "Warm Editorial Ivory" },
  { value: "navy_dark", label: "Executive Crown Navy" },
  { value: "slate_industrial", label: "Industrial Slate Dark" },
];

const THEME_SWATCH: Record<string, string> = {
  white_minimal: "bg-white border-zinc-300",
  warm_editorial: "bg-[#faf7f2] border-amber-300",
  navy_dark: "bg-[#0a1329] border-blue-900",
  slate_industrial: "bg-slate-900 border-slate-700",
};

async function computeSha256(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function uploadOptimizedImage(
  rawFile: File,
  departmentCode: string
): Promise<{ publicUrl: string; storagePath: string }> {
  const optimized = await optimizeImageForSignage(rawFile);
  const uploadFile = optimized.file;
  const sha256Checksum = await computeSha256(uploadFile);

  const urlRes = await fetch("/api/media/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: uploadFile.name,
      mimeType: uploadFile.type || "image/webp",
      departmentCode,
      sha256Checksum,
      fileSizeBytes: uploadFile.size,
    }),
  });
  const urlJson = (await urlRes.json()) as {
    error?: string;
    deduplicated?: boolean;
    signedUrl?: string;
    publicUrl?: string;
    storagePath?: string;
  };
  if (!urlRes.ok || !urlJson.publicUrl || !urlJson.storagePath) {
    throw new Error(urlJson.error || "Could not prepare image upload");
  }

  if (!urlJson.deduplicated && urlJson.signedUrl) {
    const putRes = await fetch(urlJson.signedUrl, {
      method: "PUT",
      headers: { "Content-Type": uploadFile.type || "image/webp" },
      body: uploadFile,
    });
    if (!putRes.ok) {
      throw new Error("Cloud image upload failed");
    }
  }

  return {
    publicUrl: urlJson.publicUrl,
    storagePath: urlJson.storagePath,
  };
}

// =============================================================================
// 1. SIDEBAR PROFILES PANEL (Per-Playlist Reusable Sidebars)
// =============================================================================

export function SidebarProfilesPanel({
  data,
  initialEditProfileId,
  onClearInitialEdit,
  onRefresh,
}: {
  data: OverviewPayload;
  initialEditProfileId?: string | null;
  onClearInitialEdit?: () => void;
  onRefresh: () => Promise<void>;
}) {
  const confirm = useConfirm();
  const profiles = useMemo(() => data.sidebarProfiles ?? [], [data.sidebarProfiles]);
  const products = useMemo(
    () => (data.showcaseProducts ?? []).filter((p) => p.isActive),
    [data.showcaseProducts]
  );

  const initialEditProfile = initialEditProfileId
    ? profiles.find((p) => p.id === initialEditProfileId) ?? null
    : null;

  const [showForm, setShowForm] = useState(Boolean(initialEditProfile));
  const [editing, setEditing] = useState<SidebarProfileItem | null>(
    initialEditProfile
  );
  const [name, setName] = useState(initialEditProfile?.name ?? "");
  const [description, setDescription] = useState(
    initialEditProfile?.description ?? ""
  );
  const [theme, setTheme] = useState(
    initialEditProfile?.theme ?? "white_minimal"
  );
  const [displayName, setDisplayName] = useState(
    initialEditProfile?.displayName ?? ""
  );
  const [showClock, setShowClock] = useState(
    initialEditProfile?.showClock ?? true
  );
  const [showWeather, setShowWeather] = useState(
    initialEditProfile?.showWeather ?? true
  );
  const [showQr, setShowQr] = useState(initialEditProfile?.showQr ?? true);
  const [qrTitle, setQrTitle] = useState(
    initialEditProfile?.qrTitle ?? "Explore Decorative Range"
  );
  const [promoLabel, setPromoLabel] = useState(
    initialEditProfile?.promoLabel ??
      "Scan to browse Crown Decorative paints & shades."
  );
  const [qrTargetUrl, setQrTargetUrl] = useState(
    initialEditProfile?.qrTargetUrl ?? CROWN_DECORATIVE_QR_URL
  );
  const [slideIntervalSeconds, setSlideIntervalSeconds] = useState(
    initialEditProfile?.slideIntervalSeconds ?? 6
  );
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>(
    initialEditProfile?.productIds ?? []
  );
  const [isDefault, setIsDefault] = useState(
    initialEditProfile?.isDefault ?? false
  );
  const [saving, setSaving] = useState(false);

  const playlistsByProfileId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const pl of data.playlists) {
      if (pl.sidebarProfileId) {
        const list = map.get(pl.sidebarProfileId) ?? [];
        list.push(pl.name);
        map.set(pl.sidebarProfileId, list);
      }
    }
    return map;
  }, [data.playlists]);

  function openNew() {
    onClearInitialEdit?.();
    setEditing(null);
    setName("");
    setDescription("");
    setTheme("white_minimal");
    setDisplayName("");
    setShowClock(true);
    setShowWeather(true);
    setShowQr(true);
    setQrTitle("Explore Decorative Range");
    setPromoLabel("Scan to browse Crown Decorative paints & shades.");
    setQrTargetUrl(CROWN_DECORATIVE_QR_URL);
    setSlideIntervalSeconds(6);
    setSelectedProductIds([]);
    setIsDefault(profiles.length === 0);
    setShowForm(true);
  }

  function openEdit(p: SidebarProfileItem, asClone = false) {
    onClearInitialEdit?.();
    setEditing(asClone ? null : p);
    setName(asClone ? `${p.name} Copy` : p.name);
    setDescription(p.description ?? "");
    setTheme(p.theme || "white_minimal");
    setDisplayName(p.displayName ?? "");
    setShowClock(p.showClock);
    setShowWeather(p.showWeather);
    setShowQr(p.showQr);
    setQrTitle(p.qrTitle ?? "Explore Decorative Range");
    setPromoLabel(p.promoLabel ?? "");
    setQrTargetUrl(p.qrTargetUrl ?? CROWN_DECORATIVE_QR_URL);
    setSlideIntervalSeconds(p.slideIntervalSeconds ?? 6);
    setSelectedProductIds(p.productIds ?? []);
    setIsDefault(asClone ? false : p.isDefault);
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        theme,
        displayName: displayName.trim() || null,
        showClock,
        showWeather,
        showQr,
        qrTitle: qrTitle.trim() || "Explore Decorative Range",
        promoLabel: promoLabel.trim() || null,
        qrTargetUrl: qrTargetUrl.trim() || CROWN_DECORATIVE_QR_URL,
        slideIntervalSeconds: Math.max(3, Math.min(60, Number(slideIntervalSeconds) || 6)),
        productIds: selectedProductIds,
        isDefault,
      };
      const res = await fetch(
        editing ? `/api/sidebar-profiles/${editing.id}` : "/api/sidebar-profiles",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(json.error || "Failed to save sidebar profile");
        return;
      }
      toast.success(
        editing
          ? `Updated sidebar "${name.trim()}" & pushed live to TVs`
          : `Created sidebar "${name.trim()}"`
      );
      setShowForm(false);
      setEditing(null);
      onClearInitialEdit?.();
      await onRefresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(p: SidebarProfileItem) {
    const ok = await confirm({
      title: `Delete sidebar "${p.name}"?`,
      description:
        "Playlists currently attached to this sidebar will automatically fall back to the default showroom sidebar.",
      confirmLabel: "Delete Sidebar",
      variant: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/sidebar-profiles/${p.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Failed to delete sidebar profile");
      return;
    }
    toast.success(`Deleted "${p.name}"`);
    await onRefresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div>
          <h2 className="text-sm font-semibold text-zinc-950">
            Per-Playlist Sidebar Profiles
          </h2>
          <p className="text-xs text-zinc-500">
            Design distinct sidebars (custom products, theme, and auto-tracked QR code) and attach them to different playlists.
          </p>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="size-3.5" />
          New Sidebar Profile
        </Button>
      </div>

      {showForm && (
        <Card className="border-zinc-200 bg-white">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm">
                <LayoutPanelLeft className="size-4 text-blue-600" />
                {editing ? `Edit Sidebar — ${editing.name}` : "Create Sidebar Profile"}
              </CardTitle>
              <CardDescription className="text-xs">
                Customize theme, widgets, tracked QR destination, and which showcase products rotate on TVs using this sidebar.
              </CardDescription>
            </div>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => {
                setShowForm(false);
                setEditing(null);
                onClearInitialEdit?.();
              }}
            >
              <X className="size-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">Sidebar Name</Label>
                  <Input
                    className="h-8 text-xs"
                    placeholder="e.g. Automotive 2K Bodyshop Sidebar"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Visual Theme</Label>
                  <ModernSelect
                    size="sm"
                    value={theme}
                    onValueChange={setTheme}
                    options={THEME_OPTIONS}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Custom Header / Location Override (Optional)</Label>
                  <Input
                    className="h-8 text-xs"
                    placeholder="Leave blank to show each TV's location"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">QR Card Heading</Label>
                  <Input
                    className="h-8 text-xs"
                    placeholder="Explore Decorative Range"
                    value={qrTitle}
                    onChange={(e) => setQrTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">QR Promo Caption</Label>
                  <Input
                    className="h-8 text-xs"
                    placeholder="Scan to browse shades & calculators"
                    value={promoLabel}
                    onChange={(e) => setPromoLabel(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tracked QR Destination URL (HTTPS)</Label>
                  <Input
                    type="url"
                    className="h-8 text-xs"
                    placeholder="https://www.crownpaints.co.ke/..."
                    value={qrTargetUrl}
                    onChange={(e) => setQrTargetUrl(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-5 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 text-xs">
                <label className="flex items-center gap-1.5 font-medium text-zinc-700">
                  <input
                    type="checkbox"
                    checked={showClock}
                    onChange={(e) => setShowClock(e.target.checked)}
                  />
                  Show Clock
                </label>
                <label className="flex items-center gap-1.5 font-medium text-zinc-700">
                  <input
                    type="checkbox"
                    checked={showWeather}
                    onChange={(e) => setShowWeather(e.target.checked)}
                  />
                  Show Weather
                </label>
                <label className="flex items-center gap-1.5 font-medium text-zinc-700">
                  <input
                    type="checkbox"
                    checked={showQr}
                    onChange={(e) => setShowQr(e.target.checked)}
                  />
                  Show Auto-Tracked QR Card
                </label>
                <label className="flex items-center gap-1.5 font-medium text-zinc-700">
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                  />
                  Default Sidebar
                </label>
                <div className="ml-auto flex items-center gap-2">
                  <Label className="text-xs text-zinc-500">Product Rotation (sec)</Label>
                  <Input
                    type="number"
                    min={3}
                    max={60}
                    className="h-7 w-16 text-center text-xs"
                    value={slideIntervalSeconds}
                    onChange={(e) =>
                      setSlideIntervalSeconds(Number(e.target.value) || 6)
                    }
                  />
                </div>
              </div>

              {/* Curated Products Picker */}
              <div className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Label className="text-xs font-semibold text-zinc-800">
                      Showcase Products on This Sidebar
                    </Label>
                    <p className="text-[11px] text-zinc-500">
                      {selectedProductIds.length === 0
                        ? `Showing ALL ${products.length} active products automatically. Click specific products below to curate a subset.`
                        : `Curated: ${selectedProductIds.length} selected product(s) will rotate on this sidebar.`}
                    </p>
                  </div>
                  {selectedProductIds.length > 0 && (
                    <button
                      type="button"
                      className="text-[11px] font-medium text-blue-600 hover:underline"
                      onClick={() => setSelectedProductIds([])}
                    >
                      Reset to All Products
                    </button>
                  )}
                </div>

                <div className="grid max-h-56 gap-2 overflow-y-auto pt-1 sm:grid-cols-2 lg:grid-cols-3">
                  {products.map((prod) => {
                    const selected = selectedProductIds.includes(prod.id);
                    const isRealUuid = /^[0-9a-f-]{36}$/i.test(prod.id);
                    return (
                      <button
                        key={prod.id}
                        type="button"
                        disabled={!isRealUuid}
                        onClick={() => {
                          setSelectedProductIds((prev) =>
                            selected
                              ? prev.filter((id) => id !== prod.id)
                              : [...prev, prod.id]
                          );
                        }}
                        className={`flex items-center gap-2.5 rounded-lg border p-2 text-left text-xs transition ${
                          selected
                            ? "border-zinc-950 bg-white ring-1 ring-zinc-950"
                            : "border-zinc-200 bg-white/80 hover:border-zinc-400"
                        }`}
                      >
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-zinc-50 p-1">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={prod.imageUrl}
                            alt={prod.name}
                            className="h-auto max-h-full w-auto max-w-full object-contain"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-zinc-900">
                            {prod.name}
                          </p>
                          <p className="truncate text-[10px] text-zinc-500">
                            {prod.badgeHeader}
                          </p>
                        </div>
                        {selected && (
                          <Check className="size-3.5 shrink-0 text-emerald-600" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    setEditing(null);
                    onClearInitialEdit?.();
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving}>
                  <LayoutPanelLeft className="size-3.5" />
                  {saving
                    ? "Saving Sidebar..."
                    : editing
                      ? "Save Sidebar Changes"
                      : "Create Sidebar Profile"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {profiles.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-xs text-zinc-500">
            No custom sidebar profiles yet. All playlists currently share the built-in showroom sidebar. Click{" "}
            <strong>New Sidebar Profile</strong> above or use{" "}
            <strong>+ Custom Sidebar</strong> directly on any playlist!
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {profiles.map((p) => {
            const attached = playlistsByProfileId.get(p.id) ?? [];
            return (
              <Card key={p.id} className="flex flex-col border-zinc-200 bg-white">
                <CardHeader className="pb-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`size-3 rounded-full border ${
                            THEME_SWATCH[p.theme] ?? "bg-white border-zinc-300"
                          }`}
                        />
                        <CardTitle className="truncate text-sm">{p.name}</CardTitle>
                        {p.isDefault && (
                          <Badge variant="success" className="text-[10px]">
                            <Star className="size-2.5" />
                            Default
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-500">
                        {p.productIds.length > 0
                          ? `${p.productIds.length} curated product(s)`
                          : "All active products"}{" "}
                        • {p.slideIntervalSeconds}s rotation
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-between gap-3 text-xs">
                  <div className="space-y-1.5">
                    {p.showQr && (
                      <p className="flex items-center gap-1.5 truncate text-[11px] text-zinc-600">
                        <QrCode className="size-3.5 shrink-0 text-blue-600" />
                        <span className="truncate font-medium">
                          {p.qrTitle || "Tracked QR"}:
                        </span>
                        <span className="truncate text-zinc-400">
                          {p.qrTargetUrl || CROWN_DECORATIVE_QR_URL}
                        </span>
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1 pt-1">
                      {attached.length === 0 ? (
                        <span className="text-[11px] italic text-zinc-400">
                          Not attached to a specific playlist yet
                        </span>
                      ) : (
                        attached.map((plName) => (
                          <Badge key={plName} variant="info" className="text-[10px]">
                            {plName}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-1.5 border-t border-zinc-100 pt-2.5">
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => openEdit(p, true)}
                    >
                      <Copy className="size-3" />
                      Clone
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => openEdit(p)}
                    >
                      <Edit3 className="size-3" />
                      Edit
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      title="Delete sidebar profile"
                      onClick={() => void handleDelete(p)}
                    >
                      <Trash2 className="size-3.5 text-zinc-400 hover:text-rose-600" />
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

// =============================================================================
// 2. SHOWCASE PRODUCTS PANEL (Attach Photo, Badge Header, Name & Description)
// =============================================================================

export function ShowcaseProductsPanel({
  data,
  onRefresh,
}: {
  data: OverviewPayload;
  onRefresh: () => Promise<void>;
}) {
  const confirm = useConfirm();
  const products = useMemo(() => data.showcaseProducts ?? [], [data.showcaseProducts]);

  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<ShowcaseProductItem | null>(null);
  const [name, setName] = useState("");
  const [badgeHeader, setBadgeHeader] = useState("DECORATIVE • INTERIOR");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [saving, setSaving] = useState(false);

  function openNew() {
    setEditing(null);
    setName("");
    setBadgeHeader("DECORATIVE • INTERIOR");
    setDescription("");
    setImageFile(null);
    setPreviewUrl("");
    setShowAdd(true);
  }

  function openEdit(p: ShowcaseProductItem) {
    setEditing(p);
    setName(p.name);
    setBadgeHeader(p.badgeHeader);
    setDescription(p.description);
    setImageFile(null);
    setPreviewUrl(p.imageUrl);
    setShowAdd(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !badgeHeader.trim()) {
      toast.error("Enter a product name and badge header.");
      return;
    }
    if (!editing && !imageFile && !previewUrl) {
      toast.error("Attach a product image (PNG or WebP with transparent/clean background works best).");
      return;
    }

    setSaving(true);
    try {
      let imageUrl = previewUrl;
      let storagePath: string | null | undefined = editing?.storagePath;

      if (imageFile) {
        const uploaded = await uploadOptimizedImage(imageFile, "PRODUCTS");
        imageUrl = uploaded.publicUrl;
        storagePath = uploaded.storagePath;
      }

      const isRealUuid = editing && /^[0-9a-f-]{36}$/i.test(editing.id);
      const res = await fetch(
        isRealUuid ? `/api/showcase-products/${editing.id}` : "/api/showcase-products",
        {
          method: isRealUuid ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            badgeHeader: badgeHeader.trim(),
            description: description.trim(),
            imageUrl,
            storagePath,
          }),
        }
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(json.error || "Failed to save showcase product");
        return;
      }
      toast.success(
        isRealUuid
          ? `Updated "${name.trim()}" & pushed live to TVs`
          : `Added "${name.trim()}" to Sidebar Showcase`
      );
      setShowAdd(false);
      setEditing(null);
      setImageFile(null);
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(p: ShowcaseProductItem) {
    const res = await fetch(`/api/showcase-products/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !p.isActive }),
    });
    if (!res.ok) {
      toast.error("Failed to update product visibility");
      return;
    }
    toast.success(p.isActive ? `Hidden "${p.name}" from TVs` : `Activated "${p.name}"`);
    await onRefresh();
  }

  async function handleReorder(idx: number, delta: -1 | 1) {
    const target = idx + delta;
    if (target < 0 || target >= products.length) return;
    const a = products[idx];
    const b = products[target];
    await Promise.all([
      fetch(`/api/showcase-products/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: target }),
      }),
      fetch(`/api/showcase-products/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: idx }),
      }),
    ]);
    await onRefresh();
  }

  async function handleDelete(p: ShowcaseProductItem) {
    const ok = await confirm({
      title: `Delete "${p.name}" from Sidebar Showcase?`,
      description:
        "This removes the product card from all TV sidebars and frees its uploaded image from cloud storage.",
      confirmLabel: "Delete Product",
      variant: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/showcase-products/${p.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Failed to delete product");
      return;
    }
    toast.success(`Deleted "${p.name}"`);
    await onRefresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div>
          <h2 className="text-sm font-semibold text-zinc-950">
            Sidebar Product Showcase Catalog ({products.length})
          </h2>
          <p className="text-xs text-zinc-500">
            Attach a product image, set its Badge Header, Name, and Description — updates rotate cleanly on showroom TVs in natural aspect ratio.
          </p>
        </div>
        <Button size="sm" onClick={openNew}>
          <ImagePlus className="size-3.5" />
          Add Product
        </Button>
      </div>

      {showAdd && (
        <Card className="border-zinc-200 bg-white">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Package className="size-4 text-blue-600" />
                {editing ? `Edit Product — ${editing.name}` : "Add Sidebar Showcase Product"}
              </CardTitle>
              <CardDescription className="text-xs">
                Transparent PNG or crisp WebP packshots look best on the white minimalist sidebar.
              </CardDescription>
            </div>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => {
                setShowAdd(false);
                setEditing(null);
              }}
            >
              <X className="size-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="grid gap-4 md:grid-cols-12">
              {/* Live Mini Sidebar Preview */}
              <div className="flex flex-col items-center justify-between rounded-xl border border-zinc-200 bg-gradient-to-b from-zinc-50 via-white to-amber-50/40 p-4 md:col-span-4">
                <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#1e2a6e]">
                  <span className="size-1.5 rounded-full bg-amber-500" />
                  {badgeHeader || "BADGE HEADER"}
                </span>
                <div className="my-3 flex h-36 w-full items-center justify-center p-2">
                  {previewUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={previewUrl}
                      alt={name || "Product Preview"}
                      className="h-auto max-h-full w-auto max-w-full object-contain drop-shadow-md"
                    />
                  ) : (
                    <span className="text-xs text-zinc-400">
                      Attach image to preview
                    </span>
                  )}
                </div>
                <div className="w-full">
                  <p className="truncate text-sm font-bold text-zinc-950">
                    {name || "Product Name"}
                  </p>
                  <p className="line-clamp-2 text-[11px] text-zinc-500">
                    {description || "Short product highlight or finish description"}
                  </p>
                </div>
              </div>

              {/* Fields */}
              <div className="space-y-3 md:col-span-8">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Product Name</Label>
                    <Input
                      className="h-8 text-xs"
                      placeholder="e.g. Silk Vinyl Emulsion"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Badge Header</Label>
                    <Input
                      className="h-8 text-xs"
                      placeholder="e.g. DECORATIVE • INTERIOR"
                      value={badgeHeader}
                      onChange={(e) => setBadgeHeader(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Short Description</Label>
                  <Input
                    className="h-8 text-xs"
                    placeholder="e.g. Washable satin sheen with zero harsh odour"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">
                    Product Photo (PNG / JPG / WebP — auto-compressed on upload)
                  </Label>
                  <Input
                    type="file"
                    accept="image/*"
                    className="h-8 text-xs"
                    onChange={(e) => {
                      const picked = e.target.files?.[0] ?? null;
                      setImageFile(picked);
                      if (picked) {
                        setPreviewUrl(URL.createObjectURL(picked));
                      }
                    }}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowAdd(false);
                      setEditing(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={saving}>
                    <Upload className="size-3.5" />
                    {saving
                      ? "Uploading & Saving..."
                      : editing
                        ? "Save Changes"
                        : "Add to Showcase"}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {products.map((prod, idx) => {
          const isRealUuid = /^[0-9a-f-]{36}$/i.test(prod.id);
          return (
            <Card
              key={prod.id}
              className={`flex flex-col border-zinc-200 bg-white ${
                !prod.isActive ? "opacity-60" : ""
              }`}
            >
              <CardContent className="flex flex-1 flex-col justify-between gap-3 p-3.5">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="info" className="max-w-[75%] truncate text-[10px]">
                      {prod.badgeHeader}
                    </Badge>
                    <Badge
                      variant={prod.isActive ? "success" : "outline"}
                      className="text-[10px]"
                    >
                      {prod.isActive ? "Live" : "Hidden"}
                    </Badge>
                  </div>

                  <div className="my-3 flex h-32 w-full items-center justify-center rounded-xl bg-zinc-50 p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={prod.imageUrl}
                      alt={prod.name}
                      className="h-auto max-h-full w-auto max-w-full object-contain"
                    />
                  </div>

                  <p className="truncate text-sm font-semibold text-zinc-950">
                    {prod.name}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500">
                    {prod.description || "—"}
                  </p>
                </div>

                {isRealUuid && (
                  <div className="flex items-center justify-between border-t border-zinc-100 pt-2">
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        disabled={idx === 0}
                        title="Move earlier"
                        onClick={() => void handleReorder(idx, -1)}
                      >
                        <ArrowUp className="size-3" />
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        disabled={idx === products.length - 1}
                        title="Move later"
                        onClick={() => void handleReorder(idx, 1)}
                      >
                        <ArrowDown className="size-3" />
                      </Button>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        title={prod.isActive ? "Hide from TVs" : "Show on TVs"}
                        onClick={() => void handleToggleActive(prod)}
                      >
                        {prod.isActive ? (
                          <Eye className="size-3.5 text-emerald-600" />
                        ) : (
                          <EyeOff className="size-3.5 text-zinc-400" />
                        )}
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        title="Edit product"
                        onClick={() => openEdit(prod)}
                      >
                        <Edit3 className="size-3.5 text-zinc-600" />
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        title="Delete product"
                        onClick={() => void handleDelete(prod)}
                      >
                        <Trash2 className="size-3.5 text-zinc-400 hover:text-rose-600" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
