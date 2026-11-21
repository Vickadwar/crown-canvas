"use client";

/**
 * @file src/components/dashboard/crown-cms.tsx
 * @description Universal white-label Crown Canvas Enterprise CMS Shell.
 * Clean Vercel/Linear minimalist chrome with coloured semantic accents, 4-section
 * grouped sidebar navigation, and 13 modular domain workspaces.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  Building2,
  CalendarClock,
  CheckCircle2,
  Database,
  ExternalLink,
  Film,
  LayoutDashboard,
  LayoutTemplate,
  ListVideo,
  LogIn,
  LogOut,
  Radio,
  RefreshCw,
  Shield,
  Sparkles,
  Store,
  Tv,
  Webhook,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  BUILT_IN_STUDIO_TEMPLATES,
  cloneCanvasDoc,
  createBlankCanvasDoc,
  type BuiltInStudioTemplate,
} from "@/lib/studio-templates";
import {
  createSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import type { CustomTemplateRecord } from "@/components/studio/canvas-editor";
import type { StudioCanvasDoc } from "@/db/schema";
import type { NavTab, OverviewPayload, QuickPostItem } from "./cms-types";

import { OverviewTab } from "./tabs/overview-tab";
import { FleetTab } from "./tabs/fleet-tab";
import { ShowroomsTab } from "./tabs/showrooms-tab";
import { DepartmentsTab } from "./tabs/departments-tab";
import { MediaTab } from "./tabs/media-tab";
import { PlaylistsTab } from "./tabs/playlists-tab";
import { SchedulesTab } from "./tabs/schedules-tab";
import { BroadcastsTab } from "./tabs/broadcasts-tab";
import { TemplatesTab } from "./tabs/templates-tab";
import { StudioTab } from "./tabs/studio-tab";
import { FeedsTab } from "./tabs/feeds-tab";
import { AnalyticsTab } from "./tabs/analytics-tab";
import { TeamTab } from "./tabs/team-tab";

interface NavItem {
  id: NavTab;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: string;
  badgeVariant?: "default" | "success" | "warning" | "info" | "purple" | "danger";
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const TAB_META: Record<NavTab, { title: string; subtitle: string }> = {
  overview: {
    title: "Overview",
    subtitle: "Real-time network health, storage capacity, and display telemetry.",
  },
  fleet: {
    title: "Fleet & Pairing",
    subtitle: "Manage screens at scale, pair new displays, groups, and bulk fleet actions.",
  },
  showrooms: {
    title: "Locations & Showrooms",
    subtitle: "Add, edit, activate, or pause showrooms, hubs, depots, and operating regions.",
  },
  departments: {
    title: "Departments",
    subtitle: "Organize teams, brand colours, playlists, and media ownership.",
  },
  media: {
    title: "Media Library",
    subtitle: "Upload videos, images, or zero-disk web streams and assign them across playlists.",
  },
  playlists: {
    title: "Playlists & Layouts",
    subtitle: "Drag-and-drop slide sequencing, multi-zone layouts, and running taglines.",
  },
  schedules: {
    title: "Daypart Schedules",
    subtitle: "Automate playlist rotation by time window, days of week, and priority.",
  },
  broadcasts: {
    title: "Emergency Broadcasts",
    subtitle: "Trigger instant screen takeovers from custom alerts, media clips, or full playlists.",
  },
  templates: {
    title: "Templates Gallery",
    subtitle: "Launch professionally designed 16:9 and 9:16 templates directly in Crown Studio.",
  },
  studio: {
    title: "Crown Studio",
    subtitle: "Design rich multi-layer slides, charts, product showcases, and live KPI displays.",
  },
  feeds: {
    title: "Data Feeds & API",
    subtitle: "Ingest real-time ERP, POS, or third-party JSON data via webhooks or remote pull sync.",
  },
  analytics: {
    title: "Analytics & Reports",
    subtitle: "Proof-of-play trends, department share, approval queue, and executive SLA exports.",
  },
  team: {
    title: "Team & Access",
    subtitle: "Manage administrator roles and scoped permissions across regions and departments.",
  },
};

export function CrownCms() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<NavTab>("overview");
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  // Shared cross-tab selection (Playlist & Studio)
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");

  // Crown Studio workspace state
  const [studioMode, setStudioMode] = useState<"canvas" | "kpi">("canvas");
  const [studioCanvasDoc, setStudioCanvasDoc] = useState<StudioCanvasDoc>(() =>
    cloneCanvasDoc(BUILT_IN_STUDIO_TEMPLATES[0].canvasDoc)
  );
  const [studioEditorKey, setStudioEditorKey] = useState(1);
  const [editingQuickPostId, setEditingQuickPostId] = useState<string | null>(null);
  const [qpTitle, setQpTitle] = useState("Showroom Promotional Slide");
  const [qpDeptId, setQpDeptId] = useState("");
  const [qpAddToPlaylist, setQpAddToPlaylist] = useState(true);
  const [savingStudio, setSavingStudio] = useState(false);

  const loadOverviewData = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/dashboard/overview", { cache: "no-store" });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        const errPayload = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setOverviewError(
          errPayload.error || `Service temporarily unavailable (HTTP ${res.status})`
        );
        return;
      }
      const payload = (await res.json()) as OverviewPayload;
      setOverviewError(null);
      setData(payload);

      if (payload.departments[0]) {
        const firstDeptId = payload.departments[0].id;
        setQpDeptId((prev) => prev || firstDeptId);
      }
      if (payload.playlists[0]) {
        const firstPlId = payload.playlists[0].id;
        setSelectedPlaylistId((prev) => prev || firstPlId);
      }
    } catch {
      setOverviewError("Could not reach the CMS backend. Click Retry to reconnect.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    setOverviewError(null);
    await loadOverviewData();
  }, [loadOverviewData]);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!active) return;
      await loadOverviewData();
    })();
    return () => {
      active = false;
    };
  }, [loadOverviewData]);

  const deptById = useMemo(
    () => new Map((data?.departments ?? []).map((d) => [d.id, d])),
    [data?.departments]
  );

  async function handleSignOut() {
    if (isSupabaseConfigured()) {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    }
    toast.success("Signed out");
    router.push("/login");
  }

  async function handleSeedDatabase() {
    setSeeding(true);
    try {
      const res = await fetch("/api/seed", { method: "POST" });
      const json = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        toast.error(json.error || "Failed to initialize starter workspace");
        return;
      }
      toast.success(json.message || "Starter workspace initialized");
      await fetchOverview();
    } finally {
      setSeeding(false);
    }
  }

  // Studio & Templates Cross-Tab Handlers
  function openBuiltInTemplateInStudio(tpl: BuiltInStudioTemplate) {
    setEditingQuickPostId(null);
    setStudioMode("canvas");
    setQpTitle(tpl.name);
    const matchedDept = data?.departments.find((d) => d.code === tpl.departmentCode);
    if (matchedDept) setQpDeptId(matchedDept.id);
    setStudioCanvasDoc(cloneCanvasDoc(tpl.canvasDoc));
    setStudioEditorKey((k) => k + 1);
    setActiveTab("studio");
  }

  function openCustomTemplateInStudio(tpl: CustomTemplateRecord) {
    setEditingQuickPostId(null);
    setStudioMode("canvas");
    setQpTitle(tpl.name);
    if (tpl.departmentCode) {
      const matchedDept = data?.departments.find((d) => d.code === tpl.departmentCode);
      if (matchedDept) setQpDeptId(matchedDept.id);
    }
    setStudioCanvasDoc(cloneCanvasDoc(tpl.canvasDoc));
    setStudioEditorKey((k) => k + 1);
    setActiveTab("studio");
  }

  function openBlankCanvasInStudio(orientation: "landscape" | "portrait" = "landscape") {
    setEditingQuickPostId(null);
    setStudioMode("canvas");
    setQpTitle("Untitled Showroom Slide");
    setStudioCanvasDoc(createBlankCanvasDoc(orientation));
    setStudioEditorKey((k) => k + 1);
    setActiveTab("studio");
  }

  function loadQuickPostIntoStudio(qp: QuickPostItem) {
    setEditingQuickPostId(qp.id);
    setQpTitle(qp.title);
    if (qp.departmentId) setQpDeptId(qp.departmentId);
    if (qp.slideConfig.canvasDoc) {
      setStudioMode("canvas");
      setStudioCanvasDoc(cloneCanvasDoc(qp.slideConfig.canvasDoc));
      setStudioEditorKey((k) => k + 1);
    } else {
      setStudioMode("kpi");
    }
    setActiveTab("studio");
  }

  function resetStudioToNew() {
    setEditingQuickPostId(null);
    setQpTitle("Showroom Promotional Slide");
    setStudioCanvasDoc(createBlankCanvasDoc("landscape"));
    setStudioEditorKey((k) => k + 1);
  }

  async function handleSaveCanvasSlide(doc: StudioCanvasDoc) {
    if (!qpDeptId) {
      toast.error("Select a department first");
      return;
    }
    const title = qpTitle.trim() || "Untitled Crown Studio Slide";
    const firstText = doc.elements.find((e) => e.type === "text")?.text || title;

    setSavingStudio(true);
    try {
      const payload = {
        title,
        templateType: "marketing_promo",
        departmentId: qpDeptId,
        dataFeedId: null,
        durationSeconds: 15,
        slideConfig: {
          headline: firstText.slice(0, 150),
          backgroundTheme: "crown_navy",
          canvasDoc: doc,
        },
      };

      const isEditing = Boolean(editingQuickPostId);
      const res = await fetch(
        isEditing ? `/api/quick-posts/${editingQuickPostId}` : "/api/quick-posts",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = (await res.json()) as {
        error?: string;
        quickPost?: QuickPostItem;
      };
      if (!res.ok || !json.quickPost) {
        toast.error(json.error || "Could not save Studio slide");
        return;
      }

      const savedId = json.quickPost.id;
      setEditingQuickPostId(savedId);
      setStudioCanvasDoc(cloneCanvasDoc(doc));

      const targetPlaylist = data?.playlists.find((p) => p.id === selectedPlaylistId);
      const alreadyInPlaylist = Boolean(
        targetPlaylist?.items.some((it) => it.quickPostId === savedId)
      );

      if (qpAddToPlaylist && targetPlaylist && !alreadyInPlaylist) {
        const nextItems = [
          ...targetPlaylist.items.map((it) => ({
            itemKind: it.itemKind,
            mediaAssetId: it.mediaAssetId ?? null,
            quickPostId: it.quickPostId ?? null,
            durationSeconds: it.durationSeconds ?? null,
          })),
          {
            itemKind: "quick_post" as const,
            mediaAssetId: null,
            quickPostId: savedId,
            durationSeconds: json.quickPost.durationSeconds ?? 15,
          },
        ];
        const plRes = await fetch(`/api/playlists/${targetPlaylist.id}/items`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: nextItems }),
        });
        if (plRes.ok) {
          toast.success(`Slide saved & added to "${targetPlaylist.name}"`);
        } else {
          toast.success("Slide saved to Crown Studio library");
        }
      } else {
        toast.success(
          isEditing
            ? "Studio slide updated & pushed to paired displays"
            : "Studio slide saved to library"
        );
      }
      await fetchOverview();
    } finally {
      setSavingStudio(false);
    }
  }

  async function handleSaveAsCustomTemplate(
    name: string,
    category: "decorative" | "automotive" | "industrial" | "department" | "custom",
    doc: StudioCanvasDoc
  ) {
    const dept = deptById.get(qpDeptId);
    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        category,
        departmentCode: dept?.code ?? null,
        orientation: doc.orientation,
        canvasDoc: doc,
      }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      toast.error(json.error || "Failed to save custom template");
      return;
    }
    toast.success(`Saved "${name}" to Templates Gallery`);
    await fetchOverview();
  }

  async function handleDeleteCustomTemplate(id: string) {
    const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete template");
      return;
    }
    toast.success("Custom template deleted");
    await fetchOverview();
  }

  const onlineScreensCount = useMemo(
    () => (data?.screens ?? []).filter((s) => s.isActive !== false && s.isOnline).length,
    [data?.screens]
  );
  const activeOverridesCount = useMemo(
    () => (data?.overrides ?? []).filter((o) => o.isActive).length,
    [data?.overrides]
  );

  const navGroups: NavGroup[] = useMemo(
    () => [
      {
        label: "Network & Fleet",
        items: [
          { id: "overview", label: "Overview", icon: LayoutDashboard },
          {
            id: "fleet",
            label: "Fleet & Pairing",
            icon: Tv,
            badge: data ? `${onlineScreensCount}/${data.screens.length}` : undefined,
            badgeVariant: onlineScreensCount > 0 ? "success" : "default",
          },
          {
            id: "showrooms",
            label: "Locations",
            icon: Store,
            badge: data ? String(data.branches.length) : undefined,
            badgeVariant: "info",
          },
          {
            id: "departments",
            label: "Departments",
            icon: Building2,
            badge: data ? String(data.departments.length) : undefined,
            badgeVariant: "purple",
          },
        ],
      },
      {
        label: "Content & Playback",
        items: [
          {
            id: "media",
            label: "Media Library",
            icon: Film,
            badge: data ? String(data.mediaAssets.length) : undefined,
          },
          {
            id: "playlists",
            label: "Playlists & Layouts",
            icon: ListVideo,
            badge: data ? String(data.playlists.length) : undefined,
          },
          { id: "schedules", label: "Daypart Schedules", icon: CalendarClock },
          {
            id: "broadcasts",
            label: "Emergency Broadcast",
            icon: Radio,
            badge: activeOverridesCount > 0 ? "LIVE" : undefined,
            badgeVariant: "danger",
          },
        ],
      },
      {
        label: "Design Studio",
        items: [
          { id: "templates", label: "Templates Gallery", icon: LayoutTemplate },
          { id: "studio", label: "Crown Studio", icon: Sparkles },
        ],
      },
      {
        label: "Data & Governance",
        items: [
          { id: "feeds", label: "Data Feeds & API", icon: Webhook },
          {
            id: "analytics",
            label: "Analytics & Reports",
            icon: Activity,
            badge:
              data?.pendingApprovalsCount && data.pendingApprovalsCount > 0
                ? String(data.pendingApprovalsCount)
                : undefined,
            badgeVariant: "warning",
          },
          { id: "team", label: "Team & Access", icon: Shield },
        ],
      },
    ],
    [data, onlineScreensCount, activeOverridesCount]
  );

  const activeMeta = TAB_META[activeTab];

  return (
    <div className="flex min-h-screen bg-[#fafafa] text-zinc-950">
      {/* Grouped Minimalist Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-zinc-200 bg-white lg:flex">
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/media/logo/CrownLogo.png"
              alt="Crown Paints"
              className="h-8 w-auto object-contain"
            />
            <div>
              <p className="text-xs font-bold leading-tight tracking-tight text-zinc-950">
                Crown Canvas
              </p>
              <p className="text-[10px] font-medium text-zinc-400">
                Signage Platform
              </p>
            </div>
          </div>
          {data?.configured && (
            <span
              className="size-2 rounded-full bg-emerald-500 ring-4 ring-emerald-50"
              title="Cloud Sync Active"
            />
          )}
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {navGroups.map((group) => (
            <div key={group.label} className="space-y-1">
              <p className="px-2.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveTab(item.id)}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium transition-colors ${
                        active
                          ? "bg-zinc-950 text-white shadow-xs"
                          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon
                          className={`size-4 ${
                            active ? "text-white" : "text-zinc-400"
                          }`}
                        />
                        {item.label}
                      </span>
                      {item.badge && (
                        <Badge
                          variant={
                            active
                              ? "default"
                              : item.badgeVariant ?? "outline"
                          }
                          className={
                            active
                              ? "bg-white/20 text-white border-transparent text-[10px]"
                              : "text-[10px]"
                          }
                        >
                          {item.badge}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="space-y-2 border-t border-zinc-100 p-3">
          <Link
            href="/player"
            target="_blank"
            className="flex w-full items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950"
          >
            <span className="flex items-center gap-2">
              <Tv className="size-3.5 text-blue-600" />
              Open Screen Player
            </span>
            <ExternalLink className="size-3 text-zinc-400" />
          </Link>

          <div className="flex items-center justify-between px-1 pt-0.5">
            {data?.session?.authenticated ? (
              <>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-zinc-900">
                    {data.session.fullName || data.session.email}
                  </p>
                  <p className="truncate text-[10px] text-zinc-500">
                    {data.session.email}
                  </p>
                </div>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  title="Sign Out"
                  onClick={handleSignOut}
                >
                  <LogOut className="size-3.5 text-zinc-500" />
                </Button>
              </>
            ) : (
              <Link
                href="/login"
                className="flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
              >
                <LogIn className="size-3.5" />
                Administrator Sign In
              </Link>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white/95 px-6 py-3.5 backdrop-blur">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-semibold tracking-tight text-zinc-950">
                {activeMeta.title}
              </h1>
              {activeOverridesCount > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab("broadcasts")}
                  className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-700"
                >
                  <span className="size-1.5 animate-pulse rounded-full bg-red-600" />
                  {activeOverridesCount} Live Broadcast
                </button>
              )}
            </div>
            <p className="text-xs text-zinc-500">{activeMeta.subtitle}</p>
          </div>

          <div className="flex items-center gap-2">
            {data?.configured && (
              <Badge variant="success" className="hidden sm:inline-flex">
                <CheckCircle2 className="size-3" />
                Cloud Sync Active
              </Badge>
            )}

            {data &&
              data.configured &&
              data.departments.length === 0 &&
              data.branches.length === 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={seeding}
                  onClick={handleSeedDatabase}
                >
                  <Database className="size-3.5" />
                  {seeding ? "Initializing..." : "Initialize Starter Data"}
                </Button>
              )}

            <Button
              size="sm"
              variant="outline"
              onClick={() => void fetchOverview()}
              disabled={loading}
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>

            <Button
              size="sm"
              variant="default"
              onClick={() => openBlankCanvasInStudio("landscape")}
            >
              <Sparkles className="size-3.5" />
              New Slide
            </Button>
          </div>
        </header>

        {/* Mobile Tab Strip */}
        <div className="flex gap-1.5 overflow-x-auto border-b border-zinc-200 bg-white px-4 py-2 lg:hidden">
          {navGroups.flatMap((g) => g.items).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                activeTab === item.id
                  ? "bg-zinc-950 text-white"
                  : "bg-zinc-100 text-zinc-600"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Workspace Canvas */}
        <main
          className={`flex-1 ${
            activeTab === "studio" ? "p-4" : "mx-auto w-full max-w-[1440px] p-6"
          }`}
        >
          {overviewError && !data ? (
            <Card className="mx-auto max-w-lg border-red-200 bg-white">
              <CardContent className="space-y-3 py-8 text-center">
                <p className="text-sm font-semibold text-zinc-950">
                  Unable to load workspace data
                </p>
                <p className="text-xs text-zinc-500">{overviewError}</p>
                <Button size="sm" onClick={() => void fetchOverview()}>
                  <RefreshCw className="size-3.5" />
                  Retry Connection
                </Button>
              </CardContent>
            </Card>
          ) : !data ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-28 animate-pulse rounded-xl border border-zinc-200 bg-white"
                />
              ))}
            </div>
          ) : (
            <>
              {activeTab === "overview" && (
                <OverviewTab data={data} onNavigate={setActiveTab} />
              )}

              {activeTab === "fleet" && (
                <FleetTab data={data} onRefresh={fetchOverview} />
              )}

              {activeTab === "showrooms" && (
                <ShowroomsTab data={data} onRefresh={fetchOverview} />
              )}

              {activeTab === "departments" && (
                <DepartmentsTab data={data} onRefresh={fetchOverview} />
              )}

              {activeTab === "media" && (
                <MediaTab data={data} onRefresh={fetchOverview} />
              )}

              {activeTab === "playlists" && (
                <PlaylistsTab
                  data={data}
                  selectedPlaylistId={selectedPlaylistId}
                  onSelectPlaylist={setSelectedPlaylistId}
                  onRefresh={fetchOverview}
                />
              )}

              {activeTab === "schedules" && (
                <SchedulesTab data={data} onRefresh={fetchOverview} />
              )}

              {activeTab === "broadcasts" && (
                <BroadcastsTab data={data} onRefresh={fetchOverview} />
              )}

              {activeTab === "templates" && (
                <TemplatesTab
                  data={data}
                  onOpenBuiltIn={openBuiltInTemplateInStudio}
                  onOpenCustom={openCustomTemplateInStudio}
                  onDeleteCustom={handleDeleteCustomTemplate}
                  onCreateBlank={openBlankCanvasInStudio}
                />
              )}

              {activeTab === "studio" && (
                <StudioTab
                  data={data}
                  studioMode={studioMode}
                  onStudioModeChange={setStudioMode}
                  studioCanvasDoc={studioCanvasDoc}
                  studioEditorKey={studioEditorKey}
                  editingQuickPostId={editingQuickPostId}
                  qpTitle={qpTitle}
                  onQpTitleChange={setQpTitle}
                  qpDeptId={qpDeptId}
                  onQpDeptIdChange={setQpDeptId}
                  selectedPlaylistId={selectedPlaylistId}
                  onSelectedPlaylistIdChange={setSelectedPlaylistId}
                  qpAddToPlaylist={qpAddToPlaylist}
                  onQpAddToPlaylistChange={setQpAddToPlaylist}
                  savingStudio={savingStudio}
                  onBrowseTemplates={() => setActiveTab("templates")}
                  onResetNewSlide={resetStudioToNew}
                  onLoadExistingSlide={loadQuickPostIntoStudio}
                  onSaveCanvasSlide={handleSaveCanvasSlide}
                  onSaveAsCustomTemplate={handleSaveAsCustomTemplate}
                  onRefresh={fetchOverview}
                />
              )}

              {activeTab === "feeds" && (
                <FeedsTab data={data} onRefresh={fetchOverview} />
              )}

              {activeTab === "analytics" && (
                <AnalyticsTab data={data} onRefresh={fetchOverview} />
              )}

              {activeTab === "team" && (
                <TeamTab data={data} onRefresh={fetchOverview} />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
