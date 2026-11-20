/**
 * @file src/components/dashboard/crown-cms.tsx
 * @description Main Crown Canvas Enterprise CMS client dashboard covering Fleet & Pairing,
 * Kenya/Tanzania/Uganda Showrooms, Departments, Media Library, Playlists & Layouts,
 * Daypart Schedules, Emergency Broadcasts, ERP Data Feeds, Analytics & Audit, Team RBAC,
 * and the Crown Studio Quick-Post Playground.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Building2,
  CalendarClock,
  Camera,
  CheckCircle2,
  Database,
  Download,
  Film,
  Globe,
  HardDrive,
  Layers,
  LayoutDashboard,
  LayoutTemplate,
  ListVideo,
  LogOut,
  Monitor,
  Plus,
  Printer,
  Radio,
  RefreshCw,
  Send,
  Shield,
  Sparkles,
  Store,
  Trash2,
  Tv,
  Upload,
  Webhook,
  Wifi,
  WifiOff,
  AlertTriangle,
} from "lucide-react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ModernSelect } from "@/components/ui/select";
import { QuickPostSlide } from "@/components/player/quick-post-slide";
import { CanvasRenderer } from "@/components/player/canvas-renderer";
import {
  CanvasEditor,
  type CustomTemplateRecord,
} from "@/components/studio/canvas-editor";
import { TaglineBuilder } from "@/components/dashboard/tagline-builder";
import { generateCrownSampleVideoFile } from "@/lib/sample-video-generator";
import {
  inspectVideoForAndroidTv,
  normalizeExternalMediaUrl,
  optimizeImageForSignage,
} from "@/lib/media-optimizer";
import {
  BUILT_IN_STUDIO_TEMPLATES,
  cloneCanvasDoc,
  createBlankCanvasDoc,
  type BuiltInStudioTemplate,
  type TemplateCategoryFilter,
} from "@/lib/studio-templates";
import type {
  PlaylistSidebarConfig,
  QuickPostSlideConfig,
  StudioCanvasDoc,
} from "@/db/schema";
import { CROWN_OFFICIAL_LOGO_URL } from "@/lib/crown-products";

type NavTab =
  | "overview"
  | "fleet"
  | "showrooms"
  | "departments"
  | "media"
  | "playlists"
  | "schedules"
  | "broadcasts"
  | "feeds"
  | "analytics"
  | "team"
  | "templates"
  | "studio";

interface CountryItem {
  id: string;
  code: string;
  name: string;
  currencyCode: string;
  timezone: string;
}

interface BranchItem {
  id: string;
  countryId: string;
  code: string;
  name: string;
  branchType: "showroom" | "depot" | "factory" | "hq";
  city: string;
  openingTime: string;
  closingTime: string;
}

interface DepartmentItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  accentColor: string;
  icon: string;
}

interface ScreenGroupItem {
  id: string;
  name: string;
  description: string | null;
  countryId: string | null;
  branchId: string | null;
  departmentId: string | null;
}

interface ScreenItem {
  id: string;
  name: string;
  branchId: string;
  departmentId: string | null;
  groupId?: string | null;
  screenRole: string;
  hardwareType: string;
  orientation: "landscape" | "portrait" | string;
  isOnline: boolean;
  healthStatus?: "online" | "degraded" | "offline";
  lastSeenSeconds?: number | null;
  cacheStatus: string;
  cachedAssetCount: number;
  storageUsedMb: number;
  activePlaylistId: string | null;
  currentItemTitle?: string | null;
  lastSnapshotUrl?: string | null;
  lastSnapshotAt?: string | null;
  lastHeartbeatAt: string | null;
}

interface MediaAssetItem {
  id: string;
  title: string;
  mediaType: "video" | "image" | "web_url" | "pdf";
  publicUrl: string;
  mimeType: string;
  fileSizeBytes: number;
  sha256Checksum: string;
  durationSeconds: number;
  departmentId: string;
  approvalStatus?: "draft" | "pending_approval" | "approved" | "rejected";
  rejectionReason?: string | null;
}

interface QuickPostItem {
  id: string;
  title: string;
  templateType:
  | "she_safety"
  | "ict_notice"
  | "marketing_promo"
  | "customer_service_qr"
  | "kpi_chart"
  | "hr_spotlight"
  | "general_announcement";
  departmentId?: string;
  departmentCode?: string;
  departmentName?: string;
  dataFeedId?: string | null;
  durationSeconds: number;
  approvalStatus?: "draft" | "pending_approval" | "approved" | "rejected";
  rejectionReason?: string | null;
  slideConfig: QuickPostSlideConfig;
}

interface PlaylistItemRecord {
  id?: string;
  itemKind: "media_asset" | "quick_post";
  mediaAssetId?: string | null;
  quickPostId?: string | null;
  durationSeconds?: number | null;
  sortOrder?: number;
}

interface LayoutRecord {
  id: string;
  name: string;
  description: string | null;
  orientation: string;
}

interface ScheduleItem {
  id: string;
  name: string;
  playlistId: string;
  targetType:
  | "screen"
  | "screen_group"
  | "branch"
  | "country"
  | "screen_role"
  | "global";
  targetId: string | null;
  targetScreenRole: string | null;
  priority: number;
  daypartStart: string;
  daypartEnd: string;
  isActive: boolean;
}

interface OverrideItem {
  id: string;
  title: string;
  message: string;
  severity: "info" | "warning" | "critical";
  targetType: string;
  isActive: boolean;
  expiresAt: string | null;
}

interface PlaylistRecord {
  id: string;
  name: string;
  description: string | null;
  departmentId: string;
  layoutId?: string | null;
  tickerText?: string | null;
  sidebarConfig?: PlaylistSidebarConfig | null;
  isActive: boolean;
  version: number;
  items: PlaylistItemRecord[];
}

interface PendingPairing {
  id: string;
  code: string;
  hardwareType: string;
  resolution: string | null;
}

interface DataFeedItem {
  id: string;
  key: string;
  name: string;
  departmentId: string;
  sourceType: "push_webhook" | "google_sheet" | "manual_json";
  payload: Record<string, unknown>;
  lastSyncedAt: string | null;
}

interface TelemetrySummary {
  totalImpressions: number;
  totalQrScans: number;
  recentPlays: Array<{
    id: string;
    screenId: string;
    branchId: string;
    durationPlayedSeconds: number;
    startedAt: string;
  }>;
  recentQrScans: Array<{
    id: string;
    shortCode: string;
    branchId: string | null;
    targetUrl: string;
    scannedAt: string;
  }>;
}

interface AuditLogItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface TeamUserItem {
  id: string;
  email: string;
  fullName: string;
  scopes: Array<{
    id: string;
    role: string;
    countryId: string | null;
    branchId: string | null;
    departmentId: string | null;
  }>;
}

interface SessionInfo {
  enforceAuth: boolean;
  authenticated: boolean;
  email: string | null;
  fullName: string | null;
}

interface StorageStats {
  totalBytesUsed: number;
  quotaBytes: number;
  uploadedCount: number;
  zeroDiskCount: number;
  provider: string;
}

interface ExecutiveReportPayload {
  generatedAt: string;
  fleet: {
    totalScreens: number;
    online: number;
    degraded: number;
    offline: number;
    fleetUptimePercent: number;
  };
  impressionsByDepartment: Array<{
    departmentId: string | null;
    departmentName: string;
    plays: number;
    totalMinutes: number;
  }>;
  impressionsByBranch: Array<{
    branchId: string;
    branchName: string;
    plays: number;
    totalMinutes: number;
    qrScans: number;
  }>;
  roiComparison: {
    modeledScreenCount: number;
    screenCloudCoreAnnualUsd: number;
    screenCloudProAnnualUsd: number;
    yodeckEnterpriseAnnualUsd: number;
    crownCanvasOneOffUsd: number;
    crownCanvasAnnualInfraUsd: number;
    threeYearSavingsVsScreenCloudProUsd: number;
  };
}

interface OverviewPayload {
  configured: boolean;
  session?: SessionInfo;
  canApprove?: boolean;
  pendingApprovalsCount?: number;
  supabaseReady: boolean;
  storageReady: boolean;
  storageStats?: StorageStats;
  countries: CountryItem[];
  branches: BranchItem[];
  departments: DepartmentItem[];
  screenGroups?: ScreenGroupItem[];
  screens: ScreenItem[];
  pendingPairings: PendingPairing[];
  mediaAssets: MediaAssetItem[];
  quickPosts: QuickPostItem[];
  customTemplates?: CustomTemplateRecord[];
  dataFeeds: DataFeedItem[];
  layouts: LayoutRecord[];
  schedules: ScheduleItem[];
  overrides: OverrideItem[];
  telemetry: TelemetrySummary;
  auditLogs: AuditLogItem[];
  teamUsers: TeamUserItem[];
  playlists: PlaylistRecord[];
}

async function computeFileSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("video/")) {
      resolve(15);
      return;
    }
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

export function CrownCms() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<NavTab>("overview");
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [countryFilter, setCountryFilter] = useState<string>("ALL");

  // Fleet Pairing Form
  const [pairCode, setPairCode] = useState("");
  const [screenName, setScreenName] = useState("");
  const [pairBranchId, setPairBranchId] = useState("");
  const [pairDeptId, setPairDeptId] = useState("");
  const [pairRole, setPairRole] = useState<
    "showroom_customer" | "back_office" | "factory_floor" | "reception"
  >("showroom_customer");
  const [pairPlaylistId, setPairPlaylistId] = useState("");
  const [submittingPair, setSubmittingPair] = useState(false);

  // Branch Form
  const [branchCountryId, setBranchCountryId] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [branchName, setBranchName] = useState("");
  const [branchCity, setBranchCity] = useState("");
  const [branchType, setBranchType] = useState<
    "showroom" | "depot" | "factory" | "hq"
  >("showroom");

  // Media Upload Form
  const [mediaTitle, setMediaTitle] = useState("");
  const [mediaDeptId, setMediaDeptId] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaAddToPlaylist, setMediaAddToPlaylist] = useState(true);
  const [mediaTagline, setMediaTagline] = useState("");
  const [uploadingMedia, setUploadingMedia] = useState(false);

  // Playlist Form
  const [playlistName, setPlaylistName] = useState("");
  const [playlistDeptId, setPlaylistDeptId] = useState("");
  const [playlistLayoutId, setPlaylistLayoutId] = useState("");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [tickerDrafts, setTickerDrafts] = useState<Record<string, string>>({});

  // Zero-Disk External URL Form (YouTube, Canva, Google Slides, Power BI, PDF)
  const [externalTitle, setExternalTitle] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [externalDuration, setExternalDuration] = useState(20);

  // Screen Groups & Executive Report
  const [newGroupName, setNewGroupName] = useState("");
  const [groupPlaylistId, setGroupPlaylistId] = useState("");
  const [executiveReport, setExecutiveReport] =
    useState<ExecutiveReportPayload | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  // Schedule Form (Dayparting & Priority)
  const [schName, setSchName] = useState("");
  const [schPlaylistId, setSchPlaylistId] = useState("");
  const [schTargetType, setSchTargetType] = useState<
    "global" | "country" | "branch" | "screen_role" | "screen"
  >("country");
  const [schTargetId, setSchTargetId] = useState("");
  const [schTargetRole, setSchTargetRole] = useState<
    "showroom_customer" | "back_office" | "factory_floor" | "reception"
  >("showroom_customer");
  const [schPriority, setSchPriority] = useState(50);
  const [schStart, setSchStart] = useState("08:00");
  const [schEnd, setSchEnd] = useState("17:30");

  // Emergency / VIP Broadcast Form
  const [ovTitle, setOvTitle] = useState("");
  const [ovMessage, setOvMessage] = useState("");
  const [ovSeverity, setOvSeverity] = useState<"info" | "warning" | "critical">("warning");
  const [ovTargetType, setOvTargetType] = useState<"global" | "country" | "branch">("global");
  const [ovTargetId, setOvTargetId] = useState("");
  const [ovDurationMin, setOvDurationMin] = useState(30);

  // Data Feeds Form
  const [feedKey, setFeedKey] = useState("");
  const [feedName, setFeedName] = useState("");
  const [feedDeptId, setFeedDeptId] = useState("");
  const [feedJsonText, setFeedJsonText] = useState(
    JSON.stringify(
      {
        kpis: [
          { label: "East Africa YTD", value: "KES 58.2M", delta: "+21.0% YoY" },
          { label: "Quota Attainment", value: "108.4%", delta: "Ahead of Plan" },
        ],
      },
      null,
      2
    )
  );
  const [generatedFeedApiKey, setGeneratedFeedApiKey] = useState<string | null>(
    null
  );
  const [selectedFeedKey, setSelectedFeedKey] = useState("");
  const [qpDataFeedId, setQpDataFeedId] = useState("");

  // Team & RBAC Form
  const [rbacEmail, setRbacEmail] = useState("");
  const [rbacName, setRbacName] = useState("");
  const [rbacRole, setRbacRole] = useState<
    | "super_admin"
    | "country_manager"
    | "department_lead"
    | "branch_manager"
    | "content_editor"
    | "auditor"
  >("branch_manager");
  const [rbacCountryId, setRbacCountryId] = useState("");
  const [rbacBranchId, setRbacBranchId] = useState("");
  const [rbacDeptId, setRbacDeptId] = useState("");

  // Quick Post Studio Form + Canva-style Visual Canvas Studio State
  const [studioMode, setStudioMode] = useState<"canvas" | "kpi">("canvas");
  const [templateFilter, setTemplateFilter] =
    useState<TemplateCategoryFilter>("all");
  const [studioCanvasDoc, setStudioCanvasDoc] = useState<StudioCanvasDoc>(() =>
    cloneCanvasDoc(BUILT_IN_STUDIO_TEMPLATES[0].canvasDoc)
  );
  const [studioEditorKey, setStudioEditorKey] = useState(1);
  const [editingQuickPostId, setEditingQuickPostId] = useState<string | null>(null);
  const [qpAddToPlaylist, setQpAddToPlaylist] = useState(true);
  const [savingStudio, setSavingStudio] = useState(false);
  const [qpTitle, setQpTitle] = useState("Weatherguard Seasonal Offer");
  const [qpTemplate, setQpTemplate] = useState<
    | "she_safety"
    | "ict_notice"
    | "marketing_promo"
    | "customer_service_qr"
    | "kpi_chart"
    | "hr_spotlight"
    | "general_announcement"
  >("marketing_promo");
  const [qpDeptId, setQpDeptId] = useState("");
  const [qpBadge, setQpBadge] = useState("CROWN PAINTS SHOWROOM");
  const [qpHeadline, setQpHeadline] = useState(
    "Crown Weatherguard Silicone Exterior"
  );
  const [qpSubheadline, setQpSubheadline] = useState(
    "10-Year UV & Tropical Rain Protection"
  );
  const [qpBody, setQpBody] = useState(
    "Ask our Showroom Colour Specialist for custom tinting in 240+ shades."
  );
  const [qpCurrency, setQpCurrency] = useState<"KES" | "TZS" | "UGX">("KES");
  const [qpPrice, setQpPrice] = useState("4,850 / 4L");
  const [qpPersonName, setQpPersonName] = useState("Grace Achieng");
  const [qpPersonRole, setQpPersonRole] = useState("Lead Colour Advisor");
  const [qpPersonBranch, setQpPersonBranch] = useState("Kisumu Milimani Showroom");
  const [qpQrUrl, setQpQrUrl] = useState("https://www.crownpaints.co.ke");
  const [qpQrLabel, setQpQrLabel] = useState("Scan for Colour Guide");
  const [qpTheme, setQpTheme] = useState<
    "crown_navy" | "crown_gold" | "she_emerald" | "ict_slate" | "hr_violet" | "light"
  >("crown_navy");

  const fetchOverview = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setOverviewError(null);
    try {
      const res = await fetch("/api/dashboard/overview", {
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        const msg =
          errBody.error || `Server returned HTTP ${res.status} loading overview.`;
        setOverviewError(msg);
        toast.error(msg);
        return;
      }
      const json = (await res.json()) as OverviewPayload;
      setData(json);

      if (json.countries?.length) {
        setBranchCountryId((prev) => prev || json.countries[0].id);
        setSchTargetId((prev) => prev || json.countries[0].id);
        setOvTargetId((prev) => prev || json.countries[0].id);
      }
      if (json.branches?.length) {
        setPairBranchId((prev) => prev || json.branches[0].id);
      }
      if (json.departments?.length) {
        setPairDeptId((prev) => prev || json.departments[0].id);
        setMediaDeptId((prev) => prev || json.departments[0].id);
        setPlaylistDeptId((prev) => prev || json.departments[0].id);
        setQpDeptId((prev) => prev || json.departments[0].id);
        setFeedDeptId((prev) => prev || json.departments[0].id);
      }
      if (json.dataFeeds?.length) {
        setSelectedFeedKey((prev) => prev || json.dataFeeds[0].key);
      }
      if (json.layouts?.length) {
        setPlaylistLayoutId((prev) => prev || json.layouts[0].id);
      }
      if (json.playlists?.length) {
        setPairPlaylistId((prev) => prev || json.playlists[0].id);
        setSelectedPlaylistId((prev) => prev || json.playlists[0].id);
        setSchPlaylistId((prev) => prev || json.playlists[0].id);
      }
    } catch (err) {
      const msg =
        err instanceof Error && err.name === "TimeoutError"
          ? "Timed out connecting to Supabase PostgreSQL (20s). Check your network or restart `npm run dev`."
          : "Network error while loading Crown Canvas overview.";
      setOverviewError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchOverview(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchOverview]);

  const countryById = useMemo(
    () => new Map((data?.countries ?? []).map((c) => [c.id, c])),
    [data?.countries]
  );

  const branchById = useMemo(
    () => new Map((data?.branches ?? []).map((b) => [b.id, b])),
    [data?.branches]
  );

  const deptById = useMemo(
    () => new Map((data?.departments ?? []).map((d) => [d.id, d])),
    [data?.departments]
  );

  const countryChartData = useMemo(() => {
    if (!data?.countries) return [];
    const branchesList = data.branches ?? [];
    const screensList = data.screens ?? [];
    return data.countries.map((c) => {
      const cBranches = branchesList.filter((b) => b.countryId === c.id);
      const branchIds = new Set(cBranches.map((b) => b.id));
      const cScreens = screensList.filter((s) => branchIds.has(s.branchId));
      return {
        country: c.name,
        Showrooms: cBranches.length,
        Screens: cScreens.length,
      };
    });
  }, [data]);

  async function handleClaimPairing(e: React.FormEvent) {
    e.preventDefault();
    if (!pairCode || !screenName || !pairBranchId) return;
    setSubmittingPair(true);
    try {
      const res = await fetch("/api/player/pair/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: pairCode.trim(),
          name: screenName.trim(),
          branchId: pairBranchId,
          departmentId: pairDeptId || null,
          screenRole: pairRole,
          activePlaylistId: pairPlaylistId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Failed to pair screen");
        return;
      }
      toast.success(`Paired "${screenName}" successfully`);
      setPairCode("");
      setScreenName("");
      await fetchOverview();
    } finally {
      setSubmittingPair(false);
    }
  }

  async function handleCreateBranch(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch("/api/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          countryId: branchCountryId,
          code: branchCode,
          name: branchName,
          city: branchCity,
          branchType,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Could not create showroom");
        return;
      }
      toast.success(`Added ${branchName}`);
      setBranchCode("");
      setBranchName("");
      setBranchCity("");
      await fetchOverview();
    } catch {
      toast.error("Request failed");
    }
  }

  async function uploadMediaFileToLibrary(
    rawFile: File,
    title: string,
    deptId: string,
    autoAddToSelectedPlaylist = false,
    runningTagline?: string
  ) {
    const dept = deptById.get(deptId);
    setUploadingMedia(true);
    try {
      // Auto-compress oversized PNG/JPG images to <=1080p WebP to save Supabase Free Tier storage
      let file = rawFile;
      if (rawFile.type.startsWith("image/")) {
        const optimized = await optimizeImageForSignage(rawFile);
        file = optimized.file;
        if (optimized.savedBytes > 50_000) {
          toast.info(
            `Optimized image to WebP — saved ${Math.round(optimized.savedBytes / 1024)} KB of cloud storage`
          );
        }
      }

      const [sha256Checksum, durationSeconds] = await Promise.all([
        computeFileSha256(file),
        readVideoDuration(file),
      ]);

      const urlRes = await fetch("/api/media/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          departmentCode: dept?.code ?? "GENERAL",
          sha256Checksum,
          fileSizeBytes: file.size,
        }),
      });
      const urlJson = await urlRes.json();
      if (!urlRes.ok) {
        toast.error(urlJson.error || "Could not create upload URL");
        return;
      }

      let savedAssetId: string | undefined;

      if (urlJson.deduplicated && urlJson.existingAsset?.id) {
        savedAssetId = urlJson.existingAsset.id;
        toast.success(
          `SHA-256 Deduplicated: reused "${urlJson.existingAsset.title}" (0 extra bytes stored)`
        );
      } else {
        const putRes = await fetch(urlJson.signedUrl, {
          method: "PUT",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
          body: file,
        });

        if (!putRes.ok) {
          toast.error("Direct upload to Supabase Storage failed");
          return;
        }

        const saveRes = await fetch("/api/media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            mediaType: file.type.startsWith("video/") ? "video" : "image",
            storagePath: urlJson.storagePath,
            publicUrl: urlJson.publicUrl,
            mimeType: file.type || "video/mp4",
            fileSizeBytes: file.size,
            sha256Checksum,
            durationSeconds,
            departmentId: deptId,
          }),
        });
        const saveJson = await saveRes.json();
        if (!saveRes.ok) {
          toast.error(saveJson.error || "Failed to save asset metadata");
          return;
        }
        savedAssetId = saveJson.asset?.id;
        toast.success(
          saveJson.asset?.approvalStatus === "pending_approval"
            ? "Uploaded & submitted for Department Lead approval"
            : "Media uploaded & checksum indexed for offline caching"
        );
      }

      if (autoAddToSelectedPlaylist && selectedPlaylistId && savedAssetId) {
        await handleAppendToPlaylist("media_asset", savedAssetId, durationSeconds);
      }

      if (runningTagline && runningTagline.trim() && selectedPlaylistId) {
        const targetPl = data?.playlists.find((p) => p.id === selectedPlaylistId);
        const existingTicker = targetPl?.tickerText?.trim();
        const trimmedTag = runningTagline.trim();
        const nextTicker = existingTicker
          ? existingTicker.includes(trimmedTag)
            ? existingTicker
            : `${existingTicker} | ${trimmedTag}`
          : trimmedTag;
        await fetch(`/api/playlists/${selectedPlaylistId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tickerText: nextTicker }),
        });
      }

      setMediaTitle("");
      setMediaFile(null);
      setMediaTagline("");
      await fetchOverview();
    } finally {
      setUploadingMedia(false);
    }
  }

  async function handleAddExternalMedia(e: React.FormEvent) {
    e.preventDefault();
    if (!externalTitle || !externalUrl || !mediaDeptId) {
      toast.error("Provide a title, URL, and department.");
      return;
    }
    try {
      const info = normalizeExternalMediaUrl(externalUrl);
      const res = await fetch("/api/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: externalTitle.trim(),
          mediaType: info.mediaType,
          publicUrl: info.normalizedUrl,
          mimeType: info.mimeType,
          fileSizeBytes: 0,
          durationSeconds: Math.max(5, externalDuration),
          departmentId: mediaDeptId,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Failed to add external URL");
        return;
      }
      if (selectedPlaylistId && json.asset?.id) {
        await handleAppendToPlaylist(
          "media_asset",
          json.asset.id,
          Math.max(5, externalDuration)
        );
      } else {
        toast.success(`Added ${info.label}`);
        await fetchOverview();
      }
      setExternalTitle("");
      setExternalUrl("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid external URL");
    }
  }

  async function handleCreateScreenGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    const res = await fetch("/api/screen-groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newGroupName.trim() }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error || "Failed to create group");
      return;
    }
    toast.success(`Created screen group "${newGroupName.trim()}"`);
    setNewGroupName("");
    await fetchOverview();
  }

  async function handleDeleteScreenGroup(groupId: string) {
    const res = await fetch(`/api/screen-groups/${groupId}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete screen group");
      return;
    }
    toast.success("Screen group deleted");
    await fetchOverview();
  }

  async function handleBulkGroupAction(
    groupId: string,
    action: "assign_playlist" | "reload" | "identify" | "clear_cache" | "screenshot",
    playlistId?: string
  ) {
    const res = await fetch("/api/screen-groups", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId, action, playlistId: playlistId || null }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error || "Bulk action failed");
      return;
    }
    toast.success(
      `Applied "${action}" to ${json.affectedScreens ?? 0} screen(s) in group`
    );
    await fetchOverview();
  }

  async function handleUpdateScreenMeta(
    screenId: string,
    patch: { groupId?: string | null; orientation?: "landscape" | "portrait" }
  ) {
    const res = await fetch(`/api/screens/${screenId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      toast.error("Failed to update screen settings");
      return;
    }
    toast.success("Screen configuration updated & pushed");
    await fetchOverview();
  }

  async function handleApprovalDecision(
    entityKind: "media_asset" | "quick_post",
    entityId: string,
    decision: "approved" | "rejected"
  ) {
    const res = await fetch("/api/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityKind, entityId, decision }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error || "Approval action failed");
      return;
    }
    toast.success(
      decision === "approved"
        ? "Approved & pushed to paired TVs"
        : "Content rejected"
    );
    await fetchOverview();
  }

  async function handleSavePlaylistTicker(
    pl: PlaylistRecord,
    overrideText?: string
  ) {
    const tickerText =
      overrideText !== undefined
        ? overrideText
        : (tickerDrafts[pl.id] ?? pl.tickerText ?? "");
    const res = await fetch(`/api/playlists/${pl.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tickerText: tickerText.trim() || null }),
    });
    if (!res.ok) {
      toast.error("Failed to save running taglines");
      return;
    }
    toast.success("Running taglines updated & pushed to paired TVs");
    await fetchOverview();
  }

  async function handleLoadExecutiveReport() {
    setLoadingReport(true);
    try {
      const res = await fetch("/api/reports/executive");
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Failed to load executive report");
        return;
      }
      setExecutiveReport(json as ExecutiveReportPayload);
    } finally {
      setLoadingReport(false);
    }
  }

  async function handlePruneTelemetry() {
    const res = await fetch("/api/reports/executive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "prune_telemetry", retentionDays: 90 }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error || "Failed to prune telemetry");
      return;
    }
    toast.success(`Pruned ${json.deletedRows ?? 0} Proof-of-Play rows older than 90 days`);
    await fetchOverview();
  }

  async function handleMediaUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!mediaFile || !mediaTitle || !mediaDeptId) {
      toast.error("Select a file, title, and department first.");
      return;
    }
    await uploadMediaFileToLibrary(
      mediaFile,
      mediaTitle,
      mediaDeptId,
      mediaAddToPlaylist,
      mediaTagline
    );
  }

  async function handleGenerateSampleVideo() {
    if (!mediaDeptId) {
      toast.error("Select a department first.");
      return;
    }
    setUploadingMedia(true);
    try {
      toast.info("Rendering 6s Crown Paints sample video...");
      const sampleFile = await generateCrownSampleVideoFile();
      await uploadMediaFileToLibrary(
        sampleFile,
        "Crown Paints Colour Studio Intro (6s Sample)",
        mediaDeptId,
        true
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not generate sample video"
      );
      setUploadingMedia(false);
    }
  }

  async function handleCreatePlaylist(e: React.FormEvent) {
    e.preventDefault();
    if (!playlistName || !playlistDeptId) return;
    const res = await fetch("/api/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: playlistName,
        departmentId: playlistDeptId,
        layoutId: playlistLayoutId || null,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error || "Failed to create playlist");
      return;
    }
    toast.success(`Playlist "${playlistName}" created`);
    setPlaylistName("");
    await fetchOverview();
  }

  async function handleChangePlaylistLayout(playlistId: string, layoutId: string) {
    const res = await fetch(`/api/playlists/${playlistId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ layoutId: layoutId || null }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error || "Failed to update layout");
      return;
    }
    toast.success("Playlist layout updated & pushed to screens");
    await fetchOverview();
  }

  async function handleCreateSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!schName || !schPlaylistId) return;
    const res = await fetch("/api/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: schName,
        playlistId: schPlaylistId,
        targetType: schTargetType,
        targetId:
          schTargetType === "global" || schTargetType === "screen_role"
            ? null
            : schTargetId || null,
        targetScreenRole: schTargetType === "screen_role" ? schTargetRole : null,
        priority: Number(schPriority) || 20,
        daypartStart: schStart,
        daypartEnd: schEnd,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error || "Could not create schedule");
      return;
    }
    toast.success(`Schedule "${schName}" active`);
    setSchName("");
    await fetchOverview();
  }

  async function handleToggleSchedule(id: string, isActive: boolean) {
    const res = await fetch(`/api/schedules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    if (!res.ok) {
      toast.error("Failed to update schedule");
      return;
    }
    toast.success(isActive ? "Schedule enabled" : "Schedule paused");
    await fetchOverview();
  }

  async function handleDeleteSchedule(id: string) {
    const res = await fetch(`/api/schedules/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete schedule");
      return;
    }
    toast.success("Schedule removed");
    await fetchOverview();
  }

  async function handleTriggerOverride(e: React.FormEvent) {
    e.preventDefault();
    if (!ovTitle || !ovMessage) return;
    const res = await fetch("/api/overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: ovTitle,
        message: ovMessage,
        severity: ovSeverity,
        targetType: ovTargetType,
        targetId: ovTargetType === "global" ? null : ovTargetId || null,
        durationMinutes: Number(ovDurationMin) || 30,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error || "Failed to send broadcast");
      return;
    }
    toast.success("Instant broadcast pushed across Crown Canvas fleet");
    setOvTitle("");
    setOvMessage("");
    await fetchOverview();
  }

  async function handleClearOverride(id: string) {
    const res = await fetch(`/api/overrides/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    });
    if (!res.ok) {
      toast.error("Failed to clear broadcast");
      return;
    }
    toast.success("Broadcast cleared; screens resumed normal playlists");
    await fetchOverview();
  }

  async function handleCreateFeed(e: React.FormEvent) {
    e.preventDefault();
    if (!feedKey || !feedName || !feedDeptId) return;
    let parsedPayload: Record<string, unknown> = {};
    try {
      parsedPayload = JSON.parse(feedJsonText) as Record<string, unknown>;
    } catch {
      toast.error("Invalid JSON payload");
      return;
    }

    const res = await fetch("/api/feeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: feedKey.trim().toLowerCase(),
        name: feedName.trim(),
        departmentId: feedDeptId,
        sourceType: "push_webhook",
        payload: parsedPayload,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error || "Failed to create data feed");
      return;
    }
    setGeneratedFeedApiKey(json.apiKey);
    setSelectedFeedKey(json.feed.key);
    setFeedKey("");
    setFeedName("");
    toast.success("Data feed created — copy your webhook key below");
    await fetchOverview();
  }

  async function handlePushFeedSnapshot(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFeedKey) return;
    let parsedPayload: Record<string, unknown> = {};
    try {
      parsedPayload = JSON.parse(feedJsonText) as Record<string, unknown>;
    } catch {
      toast.error("Invalid JSON payload");
      return;
    }

    const res = await fetch(
      `/api/integrations/feeds/${encodeURIComponent(selectedFeedKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: parsedPayload, fromCms: true }),
      }
    );
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error || "Failed to push feed snapshot");
      return;
    }
    toast.success(`Live snapshot pushed to "${selectedFeedKey}" & screens`);
    await fetchOverview();
  }

  async function handleAppendToPlaylist(
    itemKind: "media_asset" | "quick_post",
    refId: string,
    durationSeconds: number
  ) {
    const target = data?.playlists.find((p) => p.id === selectedPlaylistId);
    if (!target) {
      toast.error("Select a playlist first");
      return;
    }

    const nextItems = [
      ...target.items.map((it) => ({
        itemKind: it.itemKind,
        mediaAssetId: it.mediaAssetId ?? null,
        quickPostId: it.quickPostId ?? null,
        durationSeconds: it.durationSeconds ?? null,
      })),
      {
        itemKind,
        mediaAssetId: itemKind === "media_asset" ? refId : null,
        quickPostId: itemKind === "quick_post" ? refId : null,
        durationSeconds,
      },
    ];

    const res = await fetch(`/api/playlists/${target.id}/items`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: nextItems }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error || "Failed to update playlist");
      return;
    }
    toast.success(`Added item to "${target.name}" (v${json.playlist.version})`);
    await fetchOverview();
  }

  function openBuiltInTemplateInStudio(tpl: BuiltInStudioTemplate) {
    setEditingQuickPostId(null);
    setStudioMode("canvas");
    setQpTitle(tpl.name);
    setQpTemplate(tpl.templateType);
    const matchedDept = data?.departments.find(
      (d) => d.code === tpl.departmentCode
    );
    if (matchedDept) setQpDeptId(matchedDept.id);
    setStudioCanvasDoc(cloneCanvasDoc(tpl.canvasDoc));
    setStudioEditorKey((k) => k + 1);
    setActiveTab("studio");
  }

  function openCustomTemplateInStudio(tpl: CustomTemplateRecord) {
    setEditingQuickPostId(null);
    setStudioMode("canvas");
    setQpTitle(tpl.name);
    setQpTemplate("marketing_promo");
    if (tpl.departmentCode) {
      const matchedDept = data?.departments.find(
        (d) => d.code === tpl.departmentCode
      );
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
        templateType: qpTemplate === "kpi_chart" ? "marketing_promo" : qpTemplate,
        departmentId: qpDeptId,
        dataFeedId: null,
        durationSeconds: 15,
        slideConfig: {
          headline: firstText.slice(0, 150),
          backgroundTheme: qpTheme,
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

      const targetPlaylist = data?.playlists.find(
        (p) => p.id === selectedPlaylistId
      );
      const alreadyInPlaylist = Boolean(
        targetPlaylist?.items.some((it) => it.quickPostId === savedId)
      );

      if (qpAddToPlaylist && selectedPlaylistId && !alreadyInPlaylist) {
        await handleAppendToPlaylist(
          "quick_post",
          savedId,
          json.quickPost.durationSeconds ?? 15
        );
      } else {
        toast.success(
          isEditing
            ? "Visual Studio slide saved & pushed to paired TVs"
            : "Visual Studio slide saved to Crown Studio library"
        );
        await fetchOverview();
      }
    } finally {
      setSavingStudio(false);
    }
  }

  async function handleSaveAsCustomTemplate(args: {
    name: string;
    category: "decorative" | "automotive" | "industrial" | "department" | "custom";
    doc: StudioCanvasDoc;
  }) {
    const dept = deptById.get(qpDeptId);
    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: args.name,
        category: args.category,
        departmentCode: dept?.code ?? null,
        orientation: args.doc.orientation,
        canvasDoc: args.doc,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error || "Failed to save custom template");
      return;
    }
    toast.success(`Saved "${args.name}" to Templates Gallery`);
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

  function loadQuickPostIntoStudio(qp: QuickPostItem) {
    setEditingQuickPostId(qp.id);
    setQpTitle(qp.title);
    setQpTemplate(qp.templateType);
    if (qp.departmentId) setQpDeptId(qp.departmentId);
    setQpDataFeedId(qp.dataFeedId ?? "");
    setQpBadge(qp.slideConfig.badgeText ?? "CROWN PAINTS SHOWROOM");
    setQpHeadline(qp.slideConfig.headline ?? "");
    setQpSubheadline(qp.slideConfig.subheadline ?? "");
    setQpBody(qp.slideConfig.body ?? "");
    if (qp.slideConfig.currency) setQpCurrency(qp.slideConfig.currency);
    if (qp.slideConfig.price) setQpPrice(qp.slideConfig.price);
    if (qp.slideConfig.personName) setQpPersonName(qp.slideConfig.personName);
    if (qp.slideConfig.personRole) setQpPersonRole(qp.slideConfig.personRole);
    if (qp.slideConfig.personBranch) setQpPersonBranch(qp.slideConfig.personBranch);
    setQpQrUrl(qp.slideConfig.qrUrl ?? "");
    setQpQrLabel(qp.slideConfig.qrLabel ?? "Scan for Colour Guide");
    setQpTheme(qp.slideConfig.backgroundTheme ?? "crown_navy");

    if (qp.slideConfig.canvasDoc) {
      setStudioMode("canvas");
      setStudioCanvasDoc(cloneCanvasDoc(qp.slideConfig.canvasDoc));
      setStudioEditorKey((k) => k + 1);
    } else {
      setStudioMode("kpi");
    }
  }

  function resetStudioToNew() {
    setEditingQuickPostId(null);
    setQpTitle("Weatherguard Seasonal Offer");
    setQpTemplate("marketing_promo");
    setQpBadge("CROWN PAINTS SHOWROOM");
    setQpHeadline("Crown Weatherguard Silicone Exterior");
    setQpSubheadline("10-Year UV & Tropical Rain Protection");
    setQpBody("Ask our Showroom Colour Specialist for custom tinting in 240+ shades.");
    setQpTheme("crown_navy");
    setQpDataFeedId("");
  }

  async function handlePublishQuickPost(e: React.FormEvent) {
    e.preventDefault();
    if (!qpDeptId) {
      toast.error("Select a department first");
      return;
    }
    setSavingStudio(true);
    try {
      const payload = {
        title: qpTitle,
        templateType: qpTemplate,
        departmentId: qpDeptId,
        dataFeedId: qpDataFeedId || null,
        durationSeconds: 15,
        slideConfig: {
          badgeText: qpBadge,
          headline: qpHeadline,
          subheadline: qpSubheadline,
          body: qpBody,
          currency: qpTemplate === "marketing_promo" ? qpCurrency : undefined,
          price: qpTemplate === "marketing_promo" ? qpPrice : undefined,
          personName: qpTemplate === "hr_spotlight" ? qpPersonName : undefined,
          personRole: qpTemplate === "hr_spotlight" ? qpPersonRole : undefined,
          personBranch: qpTemplate === "hr_spotlight" ? qpPersonBranch : undefined,
          qrUrl: qpQrUrl,
          qrLabel: qpQrLabel,
          backgroundTheme: qpTheme,
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
        toast.error(json.error || "Could not save Quick Post");
        return;
      }

      const savedId = json.quickPost.id;
      setEditingQuickPostId(savedId);

      const targetPlaylist = data?.playlists.find(
        (p) => p.id === selectedPlaylistId
      );
      const alreadyInPlaylist = Boolean(
        targetPlaylist?.items.some((it) => it.quickPostId === savedId)
      );

      if (qpAddToPlaylist && selectedPlaylistId && !alreadyInPlaylist) {
        await handleAppendToPlaylist(
          "quick_post",
          savedId,
          json.quickPost.durationSeconds ?? 15
        );
      } else {
        toast.success(
          isEditing
            ? "Slide saved & pushed to paired TVs"
            : "Quick Post saved to Crown Studio library"
        );
        await fetchOverview();
      }
    } finally {
      setSavingStudio(false);
    }
  }

  async function handleAssignScreenPlaylist(screenId: string, playlistId: string) {
    const res = await fetch(`/api/screens/${screenId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activePlaylistId: playlistId || null }),
    });
    if (!res.ok) {
      const json = await res.json();
      toast.error(json.error || "Failed to assign playlist");
      return;
    }
    toast.success("Screen playlist updated");
    await fetchOverview();
  }

  async function handleSendCommand(
    screenId: string,
    command: "identify" | "reload" | "clear_cache" | "screenshot"
  ) {
    const res = await fetch(`/api/screens/${screenId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command }),
    });
    if (!res.ok) {
      toast.error("Failed to send remote command");
      return;
    }
    toast.success(
      command === "screenshot"
        ? "Requested live Proof-of-Playback snapshot — refresh in 3s"
        : `Queued "${command}" command for paired screen`
    );
    if (command === "screenshot") {
      setTimeout(() => {
        void fetchOverview(false);
      }, 3500);
    }
  }

  async function handleSignOut() {
    await fetch("/api/auth/session", { method: "DELETE" });
    toast.success("Signed out");
    router.push("/login");
  }

  async function handleArchiveMedia(id: string) {
    const res = await fetch(`/api/media/${id}`, { method: "DELETE" });
    const json = (await res.json().catch(() => ({}))) as {
      storagePurged?: boolean;
      freedBytes?: number;
    };
    if (!res.ok) {
      toast.error("Failed to purge asset");
      return;
    }
    toast.success(
      json.storagePurged
        ? `Purged from Supabase Storage — reclaimed ${(Math.max(1, Math.round((json.freedBytes ?? 0) / 1024))).toLocaleString()} KB`
        : "Media asset archived"
    );
    await fetchOverview();
  }

  async function handleRemoveScreen(screenId: string, screenName: string) {
    const res = await fetch(`/api/screens/${screenId}`, { method: "DELETE" });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(json.error || "Failed to remove screen");
      return;
    }
    toast.success(`Removed "${screenName}" from fleet`);
    await fetchOverview();
  }

  async function handleArchiveQuickPost(id: string) {
    const res = await fetch(`/api/quick-posts/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to archive Quick Post");
      return;
    }
    toast.success("Quick Post archived");
    await fetchOverview();
  }

  async function handleDeletePlaylist(id: string) {
    const res = await fetch(`/api/playlists/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete playlist");
      return;
    }
    toast.success("Playlist deleted");
    if (selectedPlaylistId === id) setSelectedPlaylistId("");
    await fetchOverview();
  }

  async function handleUpdatePlaylistSequence(
    playlistId: string,
    nextItems: PlaylistItemRecord[],
    successMessage = "Playlist saved & pushed to paired TVs"
  ) {
    const res = await fetch(`/api/playlists/${playlistId}/items`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: nextItems.map((it) => ({
          itemKind: it.itemKind,
          mediaAssetId: it.mediaAssetId ?? null,
          quickPostId: it.quickPostId ?? null,
          durationSeconds: it.durationSeconds ?? null,
        })),
      }),
    });
    if (!res.ok) {
      toast.error("Failed to save playlist");
      return;
    }
    toast.success(successMessage);
    await fetchOverview();
  }

  async function handleMovePlaylistItem(
    pl: PlaylistRecord,
    index: number,
    direction: -1 | 1
  ) {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= pl.items.length) return;
    const copy = [...pl.items];
    const [moved] = copy.splice(index, 1);
    copy.splice(targetIdx, 0, moved);
    await handleUpdatePlaylistSequence(pl.id, copy);
  }

  async function handleRemovePlaylistItem(pl: PlaylistRecord, index: number) {
    const copy = pl.items.filter((_, i) => i !== index);
    await handleUpdatePlaylistSequence(pl.id, copy);
  }

  async function handleSeedDatabase() {
    setSeeding(true);
    try {
      const res = await fetch("/api/admin/seed", { method: "POST" });
      const json = (await res.json()) as {
        error?: string;
        countriesCount?: number;
        branchesCount?: number;
        departmentsCount?: number;
      };
      if (!res.ok) {
        toast.error(json.error || "Failed to seed database");
        return;
      }
      toast.success(
        `Seeded ${json.countriesCount ?? 3} countries, ${json.branchesCount ?? 7} showrooms & ${json.departmentsCount ?? 7} departments`
      );
      await fetchOverview(true);
    } catch {
      toast.error("Failed to seed database");
    } finally {
      setSeeding(false);
    }
  }

  async function handleAssignRbacScope(e: React.FormEvent) {
    e.preventDefault();
    if (!rbacEmail || !rbacName) return;
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: rbacEmail.trim(),
        fullName: rbacName.trim(),
        role: rbacRole,
        countryId: rbacCountryId || null,
        branchId: rbacBranchId || null,
        departmentId: rbacDeptId || null,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error || "Failed to assign RBAC role");
      return;
    }
    toast.success(`Assigned ${rbacRole} to ${rbacEmail}`);
    setRbacEmail("");
    setRbacName("");
    await fetchOverview();
  }

  async function handleRemoveRbacScope(scopeId: string) {
    const res = await fetch(`/api/users/${scopeId}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to remove scope");
      return;
    }
    toast.success("Access scope removed");
    await fetchOverview();
  }

  function handleExportTelemetryCsv() {
    if (!data) return;
    const rows = [
      ["Type", "Branch", "Detail", "Timestamp"],
      ...data.telemetry.recentPlays.map((p) => [
        "ProofOfPlay",
        branchById.get(p.branchId)?.name ?? p.branchId,
        `${p.durationPlayedSeconds}s`,
        p.startedAt,
      ]),
      ...data.telemetry.recentQrScans.map((q) => [
        "QRScan",
        branchById.get(q.branchId ?? "")?.name ?? "Showroom",
        `${q.shortCode} -> ${q.targetUrl}`,
        q.scannedAt,
      ]),
    ];
    const csv = rows
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `crown-canvas-telemetry-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const navSections: Array<{
    title: string;
    items: Array<{ id: NavTab; label: string; icon: React.ReactNode }>;
  }> = [
      {
        title: "Overview & Fleet",
        items: [
          { id: "overview", label: "Overview", icon: <LayoutDashboard className="size-4" /> },
          { id: "fleet", label: "Fleet & Pairing", icon: <Tv className="size-4" /> },
          { id: "showrooms", label: "Showrooms (KE/TZ/UG)", icon: <Store className="size-4" /> },
          { id: "departments", label: "Departments", icon: <Building2 className="size-4" /> },
        ],
      },
      {
        title: "Content",
        items: [
          { id: "media", label: "Media Library", icon: <Film className="size-4" /> },
          { id: "playlists", label: "Playlists & Layouts", icon: <ListVideo className="size-4" /> },
          { id: "schedules", label: "Daypart Schedules", icon: <CalendarClock className="size-4" /> },
          { id: "broadcasts", label: "Emergency Broadcasts", icon: <Radio className="size-4" /> },
        ],
      },
      {
        title: "Design Studio",
        items: [
          { id: "templates", label: "Templates", icon: <LayoutTemplate className="size-4" /> },
          { id: "studio", label: "Crown Studio", icon: <Sparkles className="size-4" /> },
          { id: "feeds", label: "Data Feeds (ERP/KPI)", icon: <Webhook className="size-4" /> },
        ],
      },
      {
        title: "Governance",
        items: [
          { id: "analytics", label: "Analytics & Audit", icon: <Activity className="size-4" /> },
          { id: "team", label: "Team & RBAC", icon: <Shield className="size-4" /> },
        ],
      },
    ];
  const navItems = navSections.flatMap((section) => section.items);

  const liveQuickPostConfig: QuickPostSlideConfig = {
    badgeText: qpBadge,
    headline: qpHeadline,
    subheadline: qpSubheadline,
    body: qpBody,
    currency: qpTemplate === "marketing_promo" ? qpCurrency : undefined,
    price: qpTemplate === "marketing_promo" ? qpPrice : undefined,
    personName: qpTemplate === "hr_spotlight" ? qpPersonName : undefined,
    personRole: qpTemplate === "hr_spotlight" ? qpPersonRole : undefined,
    personBranch: qpTemplate === "hr_spotlight" ? qpPersonBranch : undefined,
    qrUrl: qpQrUrl,
    qrLabel: qpQrLabel,
    backgroundTheme: qpTheme,
  };

  return (
    <div className="flex min-h-screen bg-[#FAFAFA] text-zinc-950 dark:bg-zinc-950 dark:text-zinc-100">
      {/* Vercel / Linear Minimalist Grouped Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-zinc-200 bg-white px-3 py-4 dark:border-zinc-800 dark:bg-zinc-950 md:flex">
        <div className="mb-5 flex flex-col items-start gap-1.5 border-b border-zinc-100 px-2 pb-4 dark:border-zinc-800">
          <div className="rounded-lg bg-white px-1.5 py-0.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={CROWN_OFFICIAL_LOGO_URL}
              alt="Crown Paints"
              className="h-10 w-auto object-contain"
            />
          </div>
          <p className="px-1 text-[11px] font-medium text-zinc-500">
            Crown Canvas • Signage CMS
          </p>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto">
          {navSections.map((section) => (
            <div key={section.title} className="space-y-0.5">
              <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                {section.title}
              </p>
              {section.items.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors ${isActive
                        ? "bg-zinc-100 font-semibold text-zinc-950 dark:bg-zinc-900 dark:text-white"
                        : "font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900/60 dark:hover:text-zinc-100"
                      }`}
                  >
                    <span
                      className={
                        isActive
                          ? "text-zinc-950 dark:text-white"
                          : "text-zinc-400 dark:text-zinc-500"
                      }
                    >
                      {item.icon}
                    </span>
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
          <p className="text-xs font-semibold text-zinc-950 dark:text-zinc-100">
            Showroom Player
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
            Open `/player` on any Android TV or Mini PC to test pairing &amp; offline caching.
          </p>
          <Link
            href="/player"
            target="_blank"
            className="mt-2.5 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-zinc-950 px-3 text-xs font-medium text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            <Tv className="size-3.5" />
            Launch Player Screen
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white/95 px-6 py-3 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/95">
          <div className="flex items-center gap-2 overflow-x-auto md:hidden">
            {navItems.map((item) => (
              <Button
                key={item.id}
                size="xs"
                variant={activeTab === item.id ? "default" : "outline"}
                onClick={() => setActiveTab(item.id)}
              >
                {item.label}
              </Button>
            ))}
          </div>
          <div className="hidden md:block">
            <h1 className="text-[15px] font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              {navItems.find((n) => n.id === activeTab)?.label}
            </h1>
            <p className="text-xs text-zinc-500">
              East Africa Enterprise Signage • Kenya, Tanzania &amp; Uganda
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${data?.configured
                  ? "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                  : overviewError
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-zinc-200 bg-zinc-50 text-zinc-600"
                }`}
            >
              <span
                className={`size-1.5 rounded-full ${data?.configured
                    ? "bg-emerald-500"
                    : overviewError
                      ? "bg-red-500"
                      : "bg-zinc-400"
                  }`}
              />
              {data?.configured
                ? "Supabase Connected"
                : overviewError
                  ? "Connection Error"
                  : loading
                    ? "Connecting..."
                    : "Preview Mode"}
            </span>
            {data?.session?.authenticated ? (
              <div className="flex items-center gap-2">
                <Badge variant="outline">{data.session.fullName}</Badge>
                <Button size="xs" variant="outline" onClick={handleSignOut}>
                  <LogOut className="size-3" />
                  Sign Out
                </Button>
              </div>
            ) : (
              <Link
                href="/login"
                className="inline-flex h-7 items-center rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
              >
                Sign In
              </Link>
            )}
            <Button size="sm" variant="outline" onClick={() => void fetchOverview(true)} disabled={loading}>
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </header>

        <main className="flex-1 space-y-6 p-6">
          {loading && !data && !overviewError && (
            <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
              <RefreshCw className="mx-auto mb-2 size-5 animate-spin text-zinc-900 dark:text-zinc-100" />
              Connecting to Supabase PostgreSQL and loading Crown Canvas fleet...
            </div>
          )}
          {overviewError && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertTitle>Database Connection Error</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3 text-xs">
                <span>{overviewError}</span>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => void fetchOverview(true)}
                >
                  Retry Connection
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {data && data.configured && data.countries.length === 0 && (
            <Alert>
              <Database className="size-4 text-amber-500" />
              <AlertTitle>Database Connected — Ready to Seed Starter Data</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3 text-xs">
                <span>
                  Your Supabase Postgres database is connected, but Kenya/Tanzania/Uganda
                  showrooms and Crown Paints departments have not been seeded yet.
                </span>
                <Button
                  size="xs"
                  onClick={() => void handleSeedDatabase()}
                  disabled={seeding}
                >
                  <Sparkles className="size-3.5" />
                  {seeding ? "Seeding..." : "Seed Crown Paints Data Now"}
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {data && !data.configured && (
            <Alert>
              <AlertTriangle className="size-4 text-amber-500" />
              <AlertTitle>Supabase Credentials Not Configured Yet</AlertTitle>
              <AlertDescription className="text-xs">
                Copy <code>.env.example</code> to <code>.env.local</code>, add your
                Supabase Postgres <code>DATABASE_URL</code> &amp; Storage keys, then run{" "}
                <code>npm run db:push</code> and <code>npm run db:seed</code> inside{" "}
                <code>digital-signage/</code>. Until then, you are viewing Crown Paints
                East Africa preview data and can still test the offline{" "}
                <Link href="/player" target="_blank" className="underline font-medium">
                  /player demo loop
                </Link>
                .
              </AlertDescription>
            </Alert>
          )}

          {/* TAB: OVERVIEW */}
          {activeTab === "overview" && data && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>East Africa Showrooms</CardDescription>
                    <CardTitle className="text-3xl">{data.branches.length}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-slate-500">
                    Across {data.countries.length} countries (KE, TZ, UG)
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Paired Screens</CardDescription>
                    <CardTitle className="text-3xl">{data.screens.length}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-slate-500">
                    {data.screens.filter((s) => s.isOnline).length} online •{" "}
                    {data.pendingPairings.length} awaiting claim
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Departments</CardDescription>
                    <CardTitle className="text-3xl">{data.departments.length}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-slate-500">
                    ICT, SHE, Marketing, Customer Service &amp; more
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Assets &amp; Quick Posts</CardDescription>
                    <CardTitle className="text-3xl">
                      {data.mediaAssets.length + data.quickPosts.length}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-slate-500">
                    {data.mediaAssets.length} uploaded • {data.quickPosts.length} studio slides
                  </CardContent>
                </Card>
              </div>

              {/* Enterprise Storage Health, Pending Approvals & Commercial ROI Strip */}
              <div className="grid gap-4 lg:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription className="flex items-center justify-between">
                      <span>Cloud Storage Quota ({data.storageStats?.provider ?? "supabase"})</span>
                      <HardDrive className="size-4 text-zinc-400" />
                    </CardDescription>
                    <CardTitle className="text-xl font-semibold tracking-tight">
                      {((data.storageStats?.totalBytesUsed ?? 0) / (1024 * 1024)).toFixed(1)} MB
                      <span className="ml-1 text-xs font-normal text-zinc-500">
                        / {Math.round((data.storageStats?.quotaBytes ?? 1073741824) / (1024 * 1024))} MB
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs text-zinc-500">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-zinc-950 transition-all dark:bg-white"
                        style={{
                          width: `${Math.min(
                            100,
                            ((data.storageStats?.totalBytesUsed ?? 0) /
                              (data.storageStats?.quotaBytes ?? 1073741824)) *
                            100
                          )}%`,
                        }}
                      />
                    </div>
                    <p>
                      {data.storageStats?.uploadedCount ?? 0} deduplicated files •{" "}
                      {data.storageStats?.zeroDiskCount ?? 0} zero-disk web/YouTube embeds
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription className="flex items-center justify-between">
                      <span>Content Governance Queue</span>
                      <Shield className="size-4 text-zinc-400" />
                    </CardDescription>
                    <CardTitle className="text-xl font-semibold tracking-tight">
                      {data.pendingApprovalsCount ?? 0} Pending Review
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between text-xs text-zinc-500">
                    <span>Maker-Checker approval before TV broadcast</span>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => setActiveTab("analytics")}
                    >
                      Open Queue
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription className="flex items-center justify-between">
                      <span>Enterprise TCO Savings (vs. ScreenCloud Pro)</span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        Zero Licensing
                      </span>
                    </CardDescription>
                    <CardTitle className="text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                      ${(Math.max(data.screens.length, 15) * 30 * 12).toLocaleString()}/yr Avoided
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-zinc-500">
                    Zero per-screen licensing across {Math.max(data.screens.length, 15)}+ showrooms
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Regional Footprint (KE / TZ / UG)</CardTitle>
                    <CardDescription>
                      Showrooms and active screens by operating country
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="h-64 min-w-0">
                    <ResponsiveContainer
                      width="100%"
                      height={224}
                      minWidth={0}
                      initialDimension={{ width: 480, height: 224 }}
                    >
                      <BarChart data={countryChartData}>
                        <XAxis dataKey="country" fontSize={12} />
                        <YAxis allowDecimals={false} fontSize={12} />
                        <Tooltip />
                        <Bar dataKey="Showrooms" fill="#09090b" radius={[5, 5, 0, 0]} />
                        <Bar dataKey="Screens" fill="#a1a1aa" radius={[5, 5, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Enterprise Capabilities Readiness</CardTitle>
                    <CardDescription>
                      Phase 1 core foundation status
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {[
                      {
                        label: "8-Module Drizzle Schema (Locations, Departments, Studio, Telemetry)",
                        ok: true,
                      },
                      {
                        label: "Zero-Buffer Offline Cache Engine (Android TV & Mini PC)",
                        ok: true,
                      },
                      {
                        label: "Supabase Postgres Database Connection",
                        ok: data.configured,
                      },
                      {
                        label: "Supabase Storage Signed Video Upload",
                        ok: data.storageReady,
                      },
                    ].map((row) => (
                      <div
                        key={row.label}
                        className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800"
                      >
                        <span className="text-xs font-medium">{row.label}</span>
                        <Badge variant={row.ok ? "default" : "secondary"}>
                          {row.ok ? "Ready" : "Pending Keys"}
                        </Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* TAB: FLEET & PAIRING */}
          {activeTab === "fleet" && data && (
            <div className="grid gap-6 lg:grid-cols-12">
              <Card className="lg:col-span-5">
                <CardHeader>
                  <CardTitle>Pair Android TV / Mini PC</CardTitle>
                  <CardDescription>
                    Enter the 6-digit PIN shown on <code>/player</code>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {data.pendingPairings.length > 0 && (
                    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-950/30">
                      <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                        Active Unclaimed TV PINs:
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {data.pendingPairings.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setPairCode(p.code)}
                            className="rounded-md bg-white px-2.5 py-1 font-mono text-xs font-bold text-slate-900 shadow-sm hover:bg-amber-100"
                          >
                            {p.code} ({p.hardwareType})
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <form onSubmit={handleClaimPairing} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="pin">6-Digit TV Pairing PIN</Label>
                      <Input
                        id="pin"
                        placeholder="e.g. 482910"
                        maxLength={6}
                        value={pairCode}
                        onChange={(e) => setPairCode(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="screenName">Screen Name</Label>
                      <Input
                        id="screenName"
                        placeholder="e.g. Westlands Main Counter TV"
                        value={screenName}
                        onChange={(e) => setScreenName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Showroom / Branch</Label>
                      <ModernSelect
                        value={pairBranchId}
                        onValueChange={setPairBranchId}
                        options={data.branches.map((b) => ({
                          value: b.id,
                          label: `[${countryById.get(b.countryId)?.code ?? ""}] ${b.name}`,
                        }))}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Department</Label>
                        <ModernSelect
                          value={pairDeptId}
                          onValueChange={setPairDeptId}
                          options={data.departments.map((d) => ({
                            value: d.id,
                            label: d.name,
                          }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Screen Role</Label>
                        <ModernSelect
                          value={pairRole}
                          onValueChange={(v) =>
                            setPairRole(
                              v as
                              | "showroom_customer"
                              | "back_office"
                              | "factory_floor"
                              | "reception"
                            )
                          }
                          options={[
                            { value: "showroom_customer", label: "Showroom Customer" },
                            { value: "reception", label: "Reception" },
                            { value: "back_office", label: "Back Office" },
                            { value: "factory_floor", label: "Factory Floor" },
                          ]}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Initial Playlist</Label>
                      <ModernSelect
                        value={pairPlaylistId}
                        onValueChange={setPairPlaylistId}
                        options={[
                          { value: "", label: "None (Assign Later)" },
                          ...data.playlists.map((pl) => ({
                            value: pl.id,
                            label: pl.name,
                          })),
                        ]}
                      />
                    </div>
                    <Button
                      type="submit"
                      variant="brand"
                      className="w-full"
                      disabled={submittingPair}
                    >
                      <CheckCircle2 className="size-4" />
                      {submittingPair ? "Pairing..." : "Claim & Activate Screen"}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="lg:col-span-7">
                <CardHeader>
                  <CardTitle>Connected Showroom &amp; Office Screens</CardTitle>
                  <CardDescription>
                    Monitor offline cache health, swap playlists, or trigger remote commands
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.screens.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                      No paired screens yet. Open{" "}
                      <Link href="/player" target="_blank" className="underline font-medium">
                        /player
                      </Link>{" "}
                      on a screen or browser tab and enter its 6-digit PIN on the left.
                    </div>
                  ) : (
                    data.screens.map((scr) => {
                      const br = branchById.get(scr.branchId);
                      const dept = scr.departmentId
                        ? deptById.get(scr.departmentId)
                        : null;
                      return (
                        <div
                          key={scr.id}
                          className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              {scr.hardwareType === "android_tv" ? (
                                <Tv className="size-5 text-amber-500" />
                              ) : (
                                <Monitor className="size-5 text-blue-500" />
                              )}
                              <div>
                                <p className="text-sm font-semibold">{scr.name}</p>
                                <p className="text-xs text-slate-500">
                                  {br?.name ?? "Showroom"} •{" "}
                                  {dept?.name ?? "Shared"} • {scr.screenRole}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={
                                  scr.healthStatus === "online" || scr.isOnline
                                    ? "default"
                                    : scr.healthStatus === "degraded"
                                      ? "outline"
                                      : "secondary"
                                }
                              >
                                {scr.isOnline ? (
                                  <Wifi className="size-3" />
                                ) : (
                                  <WifiOff className="size-3" />
                                )}
                                {scr.healthStatus === "degraded"
                                  ? "Degraded"
                                  : scr.isOnline
                                    ? "Online"
                                    : "Offline"}
                              </Badge>
                              <Badge variant="outline">
                                Cache: {scr.cacheStatus} ({scr.cachedAssetCount})
                              </Badge>
                            </div>
                          </div>

                          {(scr.currentItemTitle || scr.lastSnapshotUrl) && (
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-2.5 text-xs dark:bg-slate-900/60">
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-slate-700 dark:text-slate-200 truncate">
                                  Now Playing: {scr.currentItemTitle || "Idle / Syncing"}
                                </p>
                                {scr.lastSnapshotAt && (
                                  <p className="text-[10px] text-slate-400">
                                    Snapshot verified {new Date(scr.lastSnapshotAt).toLocaleTimeString()}
                                  </p>
                                )}
                              </div>
                              {scr.lastSnapshotUrl && (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  src={scr.lastSnapshotUrl}
                                  alt={`Live snapshot of ${scr.name}`}
                                  className="h-14 w-24 rounded border border-slate-200 object-cover shadow-sm dark:border-slate-700"
                                />
                              )}
                            </div>
                          )}

                          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <div className="w-52">
                                <ModernSelect
                                  size="sm"
                                  value={scr.activePlaylistId ?? ""}
                                  onValueChange={(v) =>
                                    handleAssignScreenPlaylist(scr.id, v)
                                  }
                                  options={[
                                    { value: "", label: "No playlist assigned" },
                                    ...data.playlists.map((pl) => ({
                                      value: pl.id,
                                      label: pl.name,
                                    })),
                                  ]}
                                />
                              </div>
                              <div className="w-36">
                                <ModernSelect
                                  size="sm"
                                  value={scr.orientation || "landscape"}
                                  onValueChange={(v) =>
                                    handleUpdateScreenMeta(scr.id, {
                                      orientation: v as "landscape" | "portrait",
                                    })
                                  }
                                  options={[
                                    { value: "landscape", label: "16:9 Landscape" },
                                    { value: "portrait", label: "9:16 Portrait" },
                                  ]}
                                />
                              </div>
                              {(data.screenGroups?.length ?? 0) > 0 && (
                                <div className="w-40">
                                  <ModernSelect
                                    size="sm"
                                    value={scr.groupId ?? ""}
                                    onValueChange={(v) =>
                                      handleUpdateScreenMeta(scr.id, {
                                        groupId: v || null,
                                      })
                                    }
                                    options={[
                                      { value: "", label: "No Group" },
                                      ...(data.screenGroups ?? []).map((g) => ({
                                        value: g.id,
                                        label: `Group: ${g.name}`,
                                      })),
                                    ]}
                                  />
                                </div>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => handleSendCommand(scr.id, "screenshot")}
                              >
                                <Camera className="size-3" />
                                Snapshot
                              </Button>
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => handleSendCommand(scr.id, "identify")}
                              >
                                Identify
                              </Button>
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => handleSendCommand(scr.id, "reload")}
                              >
                                Reload
                              </Button>
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => handleSendCommand(scr.id, "clear_cache")}
                              >
                                Clear Cache
                              </Button>
                              <Button
                                size="xs"
                                variant="destructive"
                                title="Remove & Unpair Screen"
                                onClick={() => handleRemoveScreen(scr.id, scr.name)}
                              >
                                <Trash2 className="size-3" />
                                Remove
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>

              {/* Screen Groups & Bulk Fleet Actions */}
              <Card className="lg:col-span-12">
                <CardHeader>
                  <CardTitle>Screen Groups &amp; Bulk Fleet Actions</CardTitle>
                  <CardDescription>
                    Organize screens into logical fleets (e.g., &ldquo;Nairobi Flagship Showrooms&rdquo;, &ldquo;Factory SHE Monitors&rdquo;) and push playlists or commands to all members at once.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <form
                    onSubmit={handleCreateScreenGroup}
                    className="flex flex-wrap items-end gap-2"
                  >
                    <div className="min-w-[220px] flex-1 space-y-1">
                      <Label className="text-xs">New Group Name</Label>
                      <Input
                        placeholder="e.g. Kenya Retail Showrooms"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        required
                      />
                    </div>
                    <Button type="submit" size="sm">
                      <Plus className="size-3.5" />
                      Create Group
                    </Button>
                  </form>

                  {(data.screenGroups?.length ?? 0) === 0 ? (
                    <p className="text-xs text-slate-500">
                      No screen groups created yet. Create a group above, then assign screens to it using the dropdown on each screen card.
                    </p>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {(data.screenGroups ?? []).map((grp) => {
                        const memberCount = data.screens.filter(
                          (s) => s.groupId === grp.id
                        ).length;
                        return (
                          <div
                            key={grp.id}
                            className="flex flex-col gap-2.5 rounded-xl border border-slate-200 p-3.5 dark:border-slate-800"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold">{grp.name}</p>
                                <p className="text-xs text-slate-500">
                                  {memberCount} assigned screen(s)
                                </p>
                              </div>
                              <Button
                                size="xs"
                                variant="ghost"
                                onClick={() => handleDeleteScreenGroup(grp.id)}
                              >
                                <Trash2 className="size-3 text-red-500" />
                              </Button>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <div className="w-52">
                                <ModernSelect
                                  size="xs"
                                  value={groupPlaylistId || selectedPlaylistId}
                                  onValueChange={setGroupPlaylistId}
                                  options={data.playlists.map((pl) => ({
                                    value: pl.id,
                                    label: pl.name,
                                  }))}
                                />
                              </div>
                              <Button
                                size="xs"
                                variant="outline"
                                disabled={memberCount === 0}
                                onClick={() =>
                                  handleBulkGroupAction(
                                    grp.id,
                                    "assign_playlist",
                                    groupPlaylistId || selectedPlaylistId
                                  )
                                }
                              >
                                Push Playlist
                              </Button>
                              <Button
                                size="xs"
                                variant="outline"
                                disabled={memberCount === 0}
                                onClick={() => handleBulkGroupAction(grp.id, "reload")}
                              >
                                Reload All
                              </Button>
                              <Button
                                size="xs"
                                variant="outline"
                                disabled={memberCount === 0}
                                onClick={() => handleBulkGroupAction(grp.id, "screenshot")}
                              >
                                Snapshot All
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB: SHOWROOMS */}
          {activeTab === "showrooms" && data && (
            <div className="grid gap-6 lg:grid-cols-12">
              <Card className="lg:col-span-4">
                <CardHeader>
                  <CardTitle>Add Showroom / Branch</CardTitle>
                  <CardDescription>
                    Expand Kenya, Tanzania, and Uganda branch coverage
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateBranch} className="space-y-3">
                    <div className="space-y-1">
                      <Label>Country</Label>
                      <ModernSelect
                        value={branchCountryId}
                        onValueChange={setBranchCountryId}
                        options={data.countries.map((c) => ({
                          value: c.id,
                          label: `${c.name} (${c.currencyCode})`,
                        }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Branch Code</Label>
                      <Input
                        placeholder="e.g. KE-ELD-CBD"
                        value={branchCode}
                        onChange={(e) => setBranchCode(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Showroom Name</Label>
                      <Input
                        placeholder="e.g. Eldoret Uganda Rd Showroom"
                        value={branchName}
                        onChange={(e) => setBranchName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label>City</Label>
                        <Input
                          placeholder="Eldoret"
                          value={branchCity}
                          onChange={(e) => setBranchCity(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Type</Label>
                        <ModernSelect
                          value={branchType}
                          onValueChange={(v) =>
                            setBranchType(
                              v as "showroom" | "depot" | "factory" | "hq"
                            )
                          }
                          options={[
                            { value: "showroom", label: "Showroom" },
                            { value: "depot", label: "Depot" },
                            { value: "factory", label: "Factory" },
                            { value: "hq", label: "HQ" },
                          ]}
                        />
                      </div>
                    </div>
                    <Button type="submit" className="w-full">
                      <Plus className="size-4" />
                      Save Branch
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="lg:col-span-8">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>East Africa Branches</CardTitle>
                    <CardDescription>
                      Filter showrooms, depots, and manufacturing sites by country
                    </CardDescription>
                  </div>
                  <div className="flex gap-1.5">
                    {["ALL", ...data.countries.map((c) => c.code)].map((code) => (
                      <Button
                        key={code}
                        size="xs"
                        variant={countryFilter === code ? "default" : "outline"}
                        onClick={() => setCountryFilter(code)}
                      >
                        {code}
                      </Button>
                    ))}
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  {data.branches
                    .filter((b) => {
                      if (countryFilter === "ALL") return true;
                      return countryById.get(b.countryId)?.code === countryFilter;
                    })
                    .map((b) => {
                      const c = countryById.get(b.countryId);
                      return (
                        <div
                          key={b.id}
                          className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-800"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs text-slate-500">
                              {b.code}
                            </span>
                            <Badge variant="outline">
                              {c?.code} • {b.branchType}
                            </Badge>
                          </div>
                          <p className="mt-1 font-semibold text-sm">{b.name}</p>
                          <p className="text-xs text-slate-500">
                            {b.city} • Hours {b.openingTime}–{b.closingTime}
                          </p>
                        </div>
                      );
                    })}
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB: DEPARTMENTS */}
          {activeTab === "departments" && data && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.departments.map((dept) => {
                const assetCount = data.mediaAssets.filter(
                  (a) => a.departmentId === dept.id
                ).length;
                const plCount = data.playlists.filter(
                  (p) => p.departmentId === dept.id
                ).length;
                return (
                  <Card key={dept.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <Badge
                          style={{ backgroundColor: dept.accentColor, color: "#fff" }}
                        >
                          {dept.code}
                        </Badge>
                        <Layers className="size-4 text-slate-400" />
                      </div>
                      <CardTitle className="mt-2 text-base">{dept.name}</CardTitle>
                      <CardDescription>{dept.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="text-xs text-slate-500">
                      {assetCount} media assets • {plCount} playlists
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* TAB: MEDIA LIBRARY */}
          {activeTab === "media" && data && (
            <div className="grid gap-6 lg:grid-cols-12">
              <Card className="lg:col-span-4">
                <CardHeader>
                  <CardTitle>Upload Video / Image</CardTitle>
                  <CardDescription>
                    Direct signed upload to Supabase Storage with automatic SHA-256
                    checksum for offline player caching.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleMediaUpload} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label>Asset Title</Label>
                      <Input
                        placeholder="e.g. Customer Service Tint Guide MP4"
                        value={mediaTitle}
                        onChange={(e) => setMediaTitle(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Owning Department</Label>
                      <ModernSelect
                        value={mediaDeptId}
                        onValueChange={setMediaDeptId}
                        options={data.departments.map((d) => ({
                          value: d.id,
                          label: d.name,
                        }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>MP4 Video or PNG/JPG Image</Label>
                      <Input
                        type="file"
                        accept="video/mp4,video/webm,image/*"
                        onChange={(e) => setMediaFile(e.target.files?.[0] ?? null)}
                        required
                      />
                      {mediaFile && mediaFile.type.startsWith("video/") && (() => {
                        const compat = inspectVideoForAndroidTv(mediaFile);
                        return (
                          <p
                            className={`rounded-md px-2 py-1 text-[11px] ${compat.level === "optimal"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                              : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                              }`}
                          >
                            {compat.tvReady ? "✓ " : "⚠ "}
                            {compat.summary}
                          </p>
                        );
                      })()}
                      {mediaFile && mediaFile.type.startsWith("image/") && (
                        <p className="text-[11px] text-slate-500">
                          Images are auto-compressed to 1080p WebP before upload to save Supabase storage.
                        </p>
                      )}
                    </div>
                    {data.playlists.length > 0 && (
                      <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50/70 p-2.5 dark:border-zinc-800 dark:bg-zinc-900/50">
                        <label className="flex items-center gap-2 text-xs font-medium">
                          <input
                            type="checkbox"
                            checked={mediaAddToPlaylist}
                            onChange={(e) => setMediaAddToPlaylist(e.target.checked)}
                            className="size-3.5 rounded border-zinc-300"
                          />
                          Add directly to target playlist &amp; push to TVs
                        </label>
                        {mediaAddToPlaylist && (
                          <ModernSelect
                            size="sm"
                            value={selectedPlaylistId}
                            onValueChange={setSelectedPlaylistId}
                            options={data.playlists.map((pl) => ({
                              value: pl.id,
                              label: `Target: ${pl.name} (${pl.items.length} items)`,
                            }))}
                          />
                        )}
                        <div className="space-y-1.5 pt-1">
                          <Label className="text-[11px] text-zinc-600">
                            Running Bottom Taglines (Optional — add multiple with Play Store / App Store / icons)
                          </Label>
                          <TaglineBuilder
                            compact
                            value={mediaTagline}
                            onChange={setMediaTagline}
                            placeholder="e.g. Download Team Kubwa App Today!"
                          />
                        </div>
                      </div>
                    )}
                    <Button type="submit" className="w-full" disabled={uploadingMedia}>
                      <Upload className="size-4" />
                      {uploadingMedia
                        ? "Optimizing & Uploading..."
                        : mediaAddToPlaylist && selectedPlaylistId
                          ? "Upload & Push to Playlist"
                          : "Upload to Library"}
                    </Button>
                  </form>

                  <form
                    onSubmit={handleAddExternalMedia}
                    className="mt-4 space-y-2.5 border-t pt-4"
                  >
                    <p className="flex items-center gap-1.5 text-xs font-semibold">
                      <Globe className="size-3.5 text-sky-500" />
                      Zero-Disk Web / YouTube / Canva / Slides / PDF
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Uses <strong>0 MB</strong> of Supabase Storage &amp; 0 GB egress.
                    </p>
                    <Input
                      placeholder="Slide Title (e.g. Crown TV Commercial)"
                      value={externalTitle}
                      onChange={(e) => setExternalTitle(e.target.value)}
                      required
                    />
                    <Input
                      placeholder="https://youtube.com/watch?v=... or Canva / Slides / PDF URL"
                      value={externalUrl}
                      onChange={(e) => setExternalUrl(e.target.value)}
                      required
                    />
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={5}
                        max={600}
                        value={externalDuration}
                        onChange={(e) =>
                          setExternalDuration(Number(e.target.value) || 20)
                        }
                        className="w-24"
                      />
                      <span className="text-[11px] text-slate-500">sec duration</span>
                      <Button type="submit" size="sm" variant="secondary" className="ml-auto">
                        + Add URL
                      </Button>
                    </div>
                  </form>

                  <div className="mt-4 space-y-2.5 border-t pt-4">
                    <div className="space-y-1">
                      <Label className="text-xs">
                        Target Playlist (for + Playlist &amp; 6s Sample Video)
                      </Label>
                      <ModernSelect
                        size="sm"
                        value={selectedPlaylistId}
                        onValueChange={setSelectedPlaylistId}
                        options={data.playlists.map((pl) => ({
                          value: pl.id,
                          label: `${pl.name} (${pl.items.length} items • v${pl.version})`,
                        }))}
                      />
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Need a quick test clip for your TV? Generates a 6s video,
                      saves it, and pushes immediately to the target playlist:
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      disabled={uploadingMedia}
                      onClick={() => void handleGenerateSampleVideo()}
                    >
                      <Sparkles className="size-4 text-amber-500" />
                      Generate &amp; Upload 6s Sample Video
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="lg:col-span-8">
                <CardHeader>
                  <CardTitle>Media Assets</CardTitle>
                  <CardDescription>
                    Cached locally on Android TV &amp; Mini PC screens for 0ms playback
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  {data.mediaAssets.length === 0 ? (
                    <div className="col-span-2 rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">
                      No uploaded videos or images yet.
                    </div>
                  ) : (
                    data.mediaAssets.map((asset) => (
                      <div
                        key={asset.id}
                        className="flex flex-col justify-between rounded-xl border border-slate-200 p-3.5 dark:border-slate-800"
                      >
                        <div>
                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline">{asset.mediaType}</Badge>
                              {asset.approvalStatus === "pending_approval" && (
                                <Badge variant="secondary">Pending Approval</Badge>
                              )}
                              {asset.approvalStatus === "rejected" && (
                                <Badge variant="destructive">Rejected</Badge>
                              )}
                            </div>
                            <span className="text-xs text-slate-500">
                              {asset.durationSeconds}s •{" "}
                              {asset.mediaType === "web_url" ||
                                asset.mediaType === "pdf" ||
                                asset.fileSizeBytes === 0
                                ? "0 MB (Zero-Disk)"
                                : asset.fileSizeBytes < 1024 * 1024
                                  ? `${Math.max(1, Math.round(asset.fileSizeBytes / 1024))} KB`
                                  : `${(asset.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`}
                            </span>
                          </div>
                          <p className="mt-2 font-semibold text-sm">{asset.title}</p>
                          <p className="text-xs text-slate-500">
                            {deptById.get(asset.departmentId)?.name ?? "Department"}
                            {asset.mediaType === "video" &&
                              (asset.mimeType === "video/mp4"
                                ? " • Android TV Ready ✓"
                                : " • WebM")}
                          </p>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2 border-t pt-2">
                          <span className="font-mono text-[10px] text-slate-400">
                            sha256:{asset.sha256Checksum.slice(0, 10)}…
                          </span>
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() =>
                                handleAppendToPlaylist(
                                  "media_asset",
                                  asset.id,
                                  asset.durationSeconds
                                )
                              }
                            >
                              + Playlist
                            </Button>
                            <Button
                              size="xs"
                              variant="destructive"
                              onClick={() => handleArchiveMedia(asset.id)}
                            >
                              <Trash2 className="size-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB: PLAYLISTS */}
          {activeTab === "playlists" && data && (
            <div className="grid gap-6 lg:grid-cols-12">
              <Card className="lg:col-span-4">
                <CardHeader>
                  <CardTitle>Create Playlist</CardTitle>
                  <CardDescription>
                    Combine Customer Service videos, Marketing promos, and SHE slides
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <form onSubmit={handleCreatePlaylist} className="space-y-3">
                    <div className="space-y-1">
                      <Label>Playlist Name</Label>
                      <Input
                        placeholder="e.g. Kenya Showrooms Customer Loop"
                        value={playlistName}
                        onChange={(e) => setPlaylistName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Department Owner</Label>
                      <ModernSelect
                        value={playlistDeptId}
                        onValueChange={setPlaylistDeptId}
                        options={data.departments.map((d) => ({
                          value: d.id,
                          label: d.name,
                        }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Canvas Zone Layout</Label>
                      <ModernSelect
                        value={playlistLayoutId}
                        onValueChange={setPlaylistLayoutId}
                        options={data.layouts.map((lay) => ({
                          value: lay.id,
                          label: lay.name,
                        }))}
                      />
                    </div>
                    <Button type="submit" variant="brand" className="w-full">
                      <Plus className="size-4" />
                      Create Playlist
                    </Button>
                  </form>

                  <div className="space-y-1.5 border-t pt-4">
                    <Label className="text-xs text-slate-500">
                      Active Target Playlist (for quick-adding items)
                    </Label>
                    <ModernSelect
                      value={selectedPlaylistId}
                      onValueChange={setSelectedPlaylistId}
                      options={data.playlists.map((pl) => ({
                        value: pl.id,
                        label: `${pl.name} (v${pl.version})`,
                      }))}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="lg:col-span-8">
                <CardHeader>
                  <CardTitle>Playlists &amp; Quick Add</CardTitle>
                  <CardDescription>
                    Add Crown Studio slides or uploaded media to your selected playlist
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    {data.playlists.map((pl) => (
                      <div
                        key={pl.id}
                        className={`rounded-xl border p-3.5 transition-colors ${pl.id === selectedPlaylistId
                          ? "border-zinc-950 bg-zinc-50/70 dark:border-zinc-200 dark:bg-zinc-900"
                          : "border-zinc-200 bg-white dark:border-zinc-800"
                          }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold text-sm">{pl.name}</p>
                            <p className="text-xs text-slate-500">
                              {deptById.get(pl.departmentId)?.name ?? "General"} •{" "}
                              {pl.items.length} items • Version {pl.version}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="w-48">
                              <ModernSelect
                                size="xs"
                                value={pl.layoutId ?? ""}
                                onValueChange={(v) =>
                                  handleChangePlaylistLayout(pl.id, v)
                                }
                                options={[
                                  { value: "", label: "Full Screen (Default)" },
                                  ...data.layouts.map((lay) => ({
                                    value: lay.id,
                                    label: lay.name,
                                  })),
                                ]}
                              />
                            </div>
                            <Button
                              size="xs"
                              variant={pl.id === selectedPlaylistId ? "default" : "outline"}
                              onClick={() => setSelectedPlaylistId(pl.id)}
                            >
                              {pl.id === selectedPlaylistId ? "Selected" : "Select"}
                            </Button>
                            {pl.id === selectedPlaylistId && (
                              <Button
                                size="xs"
                                variant="secondary"
                                onClick={() =>
                                  handleUpdatePlaylistSequence(
                                    pl.id,
                                    pl.items,
                                    `Saved "${pl.name}" & pushed to paired TVs`
                                  )
                                }
                              >
                                <CheckCircle2 className="size-3 text-emerald-600" />
                                Save &amp; Push to TVs
                              </Button>
                            )}
                            <Button
                              size="xs"
                              variant="destructive"
                              onClick={() => handleDeletePlaylist(pl.id)}
                            >
                              <Trash2 className="size-3" />
                            </Button>
                          </div>
                        </div>
                        {pl.id === selectedPlaylistId && (
                          <div className="mt-3 space-y-2 border-t border-zinc-200/80 pt-3">
                            <div className="space-y-1.5">
                              <Label className="text-[11px] font-medium text-zinc-600">
                                Running Bottom Taglines (add multiple with Google Play, App Store, WhatsApp &amp; icons — shows on videos &amp; templates)
                              </Label>
                              <TaglineBuilder
                                value={tickerDrafts[pl.id] ?? pl.tickerText ?? ""}
                                onChange={(next) =>
                                  setTickerDrafts((prev) => ({
                                    ...prev,
                                    [pl.id]: next,
                                  }))
                                }
                                onSave={(next) =>
                                  void handleSavePlaylistTicker(pl, next)
                                }
                              />
                            </div>
                            <div className="flex items-center justify-between pt-1">
                              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                                Playback Sequence ({pl.items.length} items — auto-saved)
                              </p>
                            </div>
                            {pl.items.map((item, idx) => {
                              const label =
                                item.itemKind === "media_asset"
                                  ? data.mediaAssets.find((a) => a.id === item.mediaAssetId)?.title ??
                                  "Media Asset"
                                  : data.quickPosts.find((q) => q.id === item.quickPostId)?.title ??
                                  "Quick Post";
                              return (
                                <div
                                  key={`${item.id ?? idx}-${idx}`}
                                  className="flex items-center justify-between rounded-lg bg-white px-2.5 py-1.5 text-xs dark:bg-slate-900"
                                >
                                  <span className="truncate font-medium">
                                    {idx + 1}. {label} ({item.itemKind})
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      size="xs"
                                      variant="ghost"
                                      disabled={idx === 0}
                                      onClick={() => handleMovePlaylistItem(pl, idx, -1)}
                                    >
                                      <ArrowUp className="size-3" />
                                    </Button>
                                    <Button
                                      size="xs"
                                      variant="ghost"
                                      disabled={idx === pl.items.length - 1}
                                      onClick={() => handleMovePlaylistItem(pl, idx, 1)}
                                    >
                                      <ArrowDown className="size-3" />
                                    </Button>
                                    <Button
                                      size="xs"
                                      variant="ghost"
                                      onClick={() => handleRemovePlaylistItem(pl, idx)}
                                    >
                                      <Trash2 className="size-3 text-red-500" />
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="border-t pt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Append Crown Studio Quick Posts to Selected Playlist
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {data.quickPosts.map((qp) => (
                        <div
                          key={qp.id}
                          className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-xs"
                        >
                          <span className="truncate font-medium">{qp.title}</span>
                          <div className="flex items-center gap-1">
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => {
                                loadQuickPostIntoStudio(qp);
                                setActiveTab("studio");
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() =>
                                handleAppendToPlaylist(
                                  "quick_post",
                                  qp.id,
                                  qp.durationSeconds
                                )
                              }
                            >
                              + Add
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => handleArchiveQuickPost(qp.id)}
                            >
                              <Trash2 className="size-3 text-slate-400" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {data.mediaAssets.length > 0 && (
                    <div className="border-t pt-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Append Uploaded Media to Selected Playlist
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {data.mediaAssets.map((asset) => (
                          <div
                            key={asset.id}
                            className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-xs"
                          >
                            <span className="truncate font-medium">
                              {asset.title} ({asset.mediaType})
                            </span>
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() =>
                                handleAppendToPlaylist(
                                  "media_asset",
                                  asset.id,
                                  asset.durationSeconds
                                )
                              }
                            >
                              + Add
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB: DAYPART SCHEDULES */}
          {activeTab === "schedules" && data && (
            <div className="grid gap-6 lg:grid-cols-12">
              <Card className="lg:col-span-5">
                <CardHeader>
                  <CardTitle>Create Daypart &amp; Priority Schedule</CardTitle>
                  <CardDescription>
                    Automate Customer Mode (08:00–17:30) vs Staff Mode in each
                    country&apos;s local EAT timezone.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateSchedule} className="space-y-3">
                    <div className="space-y-1">
                      <Label>Schedule Name</Label>
                      <Input
                        placeholder="e.g. Kenya Showrooms Business Hours"
                        value={schName}
                        onChange={(e) => setSchName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Playlist</Label>
                      <ModernSelect
                        value={schPlaylistId}
                        onValueChange={setSchPlaylistId}
                        options={data.playlists.map((pl) => ({
                          value: pl.id,
                          label: pl.name,
                        }))}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label>Target Scope</Label>
                        <ModernSelect
                          value={schTargetType}
                          onValueChange={(v) => {
                            const t = v as typeof schTargetType;
                            setSchTargetType(t);
                            if (t === "country" && data.countries[0]) {
                              setSchTargetId(data.countries[0].id);
                            } else if (t === "branch" && data.branches[0]) {
                              setSchTargetId(data.branches[0].id);
                            } else if (t === "screen" && data.screens[0]) {
                              setSchTargetId(data.screens[0].id);
                            }
                          }}
                          options={[
                            { value: "global", label: "All East Africa" },
                            { value: "country", label: "Specific Country" },
                            { value: "branch", label: "Specific Showroom" },
                            { value: "screen_role", label: "Screen Role" },
                            { value: "screen", label: "Single Screen" },
                          ]}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Priority (Higher Wins)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={1000}
                          value={schPriority}
                          onChange={(e) => setSchPriority(Number(e.target.value))}
                        />
                      </div>
                    </div>

                    {schTargetType === "country" && (
                      <div className="space-y-1">
                        <Label>Country</Label>
                        <ModernSelect
                          value={schTargetId}
                          onValueChange={setSchTargetId}
                          options={data.countries.map((c) => ({
                            value: c.id,
                            label: `${c.name} (${c.timezone})`,
                          }))}
                        />
                      </div>
                    )}

                    {schTargetType === "branch" && (
                      <div className="space-y-1">
                        <Label>Showroom / Branch</Label>
                        <ModernSelect
                          value={schTargetId}
                          onValueChange={setSchTargetId}
                          options={data.branches.map((b) => ({
                            value: b.id,
                            label: b.name,
                          }))}
                        />
                      </div>
                    )}

                    {schTargetType === "screen_role" && (
                      <div className="space-y-1">
                        <Label>Screen Role</Label>
                        <ModernSelect
                          value={schTargetRole}
                          onValueChange={(v) =>
                            setSchTargetRole(v as typeof schTargetRole)
                          }
                          options={[
                            { value: "showroom_customer", label: "Showroom Customer" },
                            { value: "back_office", label: "Back Office (HR / ICT)" },
                            { value: "factory_floor", label: "Factory Floor (SHE / Ops)" },
                            { value: "reception", label: "Reception" },
                          ]}
                        />
                      </div>
                    )}

                    {schTargetType === "screen" && (
                      <div className="space-y-1">
                        <Label>Target Screen</Label>
                        <ModernSelect
                          value={schTargetId}
                          onValueChange={setSchTargetId}
                          options={data.screens.map((s) => ({
                            value: s.id,
                            label: s.name,
                          }))}
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label>Daypart Start (Local)</Label>
                        <Input
                          type="time"
                          value={schStart}
                          onChange={(e) => setSchStart(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Daypart End (Local)</Label>
                        <Input
                          type="time"
                          value={schEnd}
                          onChange={(e) => setSchEnd(e.target.value)}
                        />
                      </div>
                    </div>

                    <Button type="submit" className="w-full">
                      <CalendarClock className="size-4" />
                      Save Schedule Rule
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="lg:col-span-7">
                <CardHeader>
                  <CardTitle>Active Scheduling Rules</CardTitle>
                  <CardDescription>
                    Highest priority matching rule automatically takes over the screen
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.schedules.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">
                      No dayparting schedules created yet. Screens use their default
                      assigned playlist.
                    </div>
                  ) : (
                    data.schedules.map((sch) => (
                      <div
                        key={sch.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-sm">{sch.name}</p>
                            <Badge variant={sch.isActive ? "default" : "secondary"}>
                              {sch.isActive ? "Active" : "Paused"}
                            </Badge>
                            <Badge variant="outline">Priority {sch.priority}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            Scope: {sch.targetType} • Window {sch.daypartStart}–
                            {sch.daypartEnd} EAT
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => handleToggleSchedule(sch.id, !sch.isActive)}
                          >
                            {sch.isActive ? "Pause" : "Resume"}
                          </Button>
                          <Button
                            size="xs"
                            variant="destructive"
                            onClick={() => handleDeleteSchedule(sch.id)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB: EMERGENCY & VIP BROADCASTS */}
          {activeTab === "broadcasts" && data && (
            <div className="grid gap-6 lg:grid-cols-12">
              <Card className="lg:col-span-5">
                <CardHeader>
                  <CardTitle>Instant Fleet Broadcast / Override</CardTitle>
                  <CardDescription>
                    Immediately overrides all targeted screens via Supabase Realtime
                    for VIP welcomes, flash notices, or SHE safety alerts.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleTriggerOverride} className="space-y-3">
                    <div className="space-y-1">
                      <Label>Broadcast Headline</Label>
                      <Input
                        placeholder="e.g. Welcome Architectural Association of Kenya"
                        value={ovTitle}
                        onChange={(e) => setOvTitle(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Message</Label>
                      <Textarea
                        rows={3}
                        placeholder="Full-screen message displayed across selected showrooms..."
                        value={ovMessage}
                        onChange={(e) => setOvMessage(e.target.value)}
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label>Severity / Theme</Label>
                        <ModernSelect
                          value={ovSeverity}
                          onValueChange={(v) =>
                            setOvSeverity(v as typeof ovSeverity)
                          }
                          options={[
                            { value: "info", label: "VIP / Info (Blue)" },
                            { value: "warning", label: "Notice / Flash (Amber)" },
                            { value: "critical", label: "SHE Emergency (Red)" },
                          ]}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Auto-Expire (Mins)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={1440}
                          value={ovDurationMin}
                          onChange={(e) => setOvDurationMin(Number(e.target.value))}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label>Target Scope</Label>
                        <ModernSelect
                          value={ovTargetType}
                          onValueChange={(v) => {
                            const t = v as typeof ovTargetType;
                            setOvTargetType(t);
                            if (t === "country" && data.countries[0]) {
                              setOvTargetId(data.countries[0].id);
                            } else if (t === "branch" && data.branches[0]) {
                              setOvTargetId(data.branches[0].id);
                            }
                          }}
                          options={[
                            { value: "global", label: "All East Africa" },
                            { value: "country", label: "Specific Country" },
                            { value: "branch", label: "Specific Showroom" },
                          ]}
                        />
                      </div>
                      {ovTargetType !== "global" && (
                        <div className="space-y-1">
                          <Label>Target</Label>
                          <ModernSelect
                            value={ovTargetId}
                            onValueChange={setOvTargetId}
                            options={(ovTargetType === "country"
                              ? data.countries
                              : data.branches
                            ).map((item) => ({
                              value: item.id,
                              label: item.name,
                            }))}
                          />
                        </div>
                      )}
                    </div>
                    <Button type="submit" className="w-full">
                      <Radio className="size-4" />
                      Broadcast Now
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="lg:col-span-7">
                <CardHeader>
                  <CardTitle>Broadcast History &amp; Active Overrides</CardTitle>
                  <CardDescription>
                    Clear an active override to return showrooms to normal playlists
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.overrides.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">
                      No emergency or VIP overrides triggered yet.
                    </div>
                  ) : (
                    data.overrides.map((ov) => (
                      <div
                        key={ov.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
                      >
                        <div className="max-w-lg">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-sm">{ov.title}</p>
                            <Badge variant={ov.isActive ? "destructive" : "secondary"}>
                              {ov.isActive ? `Live • ${ov.severity}` : "Ended"}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">{ov.message}</p>
                        </div>
                        {ov.isActive && (
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => handleClearOverride(ov.id)}
                          >
                            End Broadcast
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB: DATA FEEDS (ERP / SHE / SALES WEBHOOKS) */}
          {activeTab === "feeds" && data && (
            <div className="grid gap-6 lg:grid-cols-12">
              <Card className="lg:col-span-5">
                <CardHeader>
                  <CardTitle>Register Live Data Feed</CardTitle>
                  <CardDescription>
                    Push KPI snapshots from Crown ERP, POS, Google Sheets, or SHE
                    trackers to Recharts slides with zero TV credential exposure.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <form onSubmit={handleCreateFeed} className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label>Feed Key</Label>
                        <Input
                          placeholder="e.g. east-africa-sales-q4"
                          value={feedKey}
                          onChange={(e) => setFeedKey(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Department</Label>
                        <ModernSelect
                          value={feedDeptId}
                          onValueChange={setFeedDeptId}
                          options={data.departments.map((d) => ({
                            value: d.id,
                            label: d.name,
                          }))}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label>Feed Name</Label>
                      <Input
                        placeholder="e.g. Q4 East Africa Showroom Sales"
                        value={feedName}
                        onChange={(e) => setFeedName(e.target.value)}
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full">
                      <Webhook className="size-4" />
                      Create Feed &amp; Generate Webhook Key
                    </Button>
                  </form>

                  {generatedFeedApiKey && (
                    <Alert>
                      <AlertTitle>One-Time Webhook Key Generated</AlertTitle>
                      <AlertDescription className="text-xs break-all">
                        <code>x-feed-key: {generatedFeedApiKey}</code>
                      </AlertDescription>
                    </Alert>
                  )}

                  <form onSubmit={handlePushFeedSnapshot} className="space-y-2 border-t pt-4">
                    <Label>Push JSON Snapshot Directly to Feed</Label>
                    <ModernSelect
                      value={selectedFeedKey}
                      onValueChange={setSelectedFeedKey}
                      options={data.dataFeeds.map((f) => ({
                        value: f.key,
                        label: `${f.name} (${f.key})`,
                      }))}
                    />
                    <Textarea
                      rows={6}
                      className="font-mono text-xs"
                      value={feedJsonText}
                      onChange={(e) => setFeedJsonText(e.target.value)}
                    />
                    <Button type="submit" variant="outline" className="w-full">
                      <Send className="size-4" />
                      Push Snapshot to Screens
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="lg:col-span-7">
                <CardHeader>
                  <CardTitle>Connected Feeds &amp; Webhook Endpoints</CardTitle>
                  <CardDescription>
                    External scripts POST JSON to{" "}
                    <code>/api/integrations/feeds/[key]</code> with{" "}
                    <code>x-feed-key</code>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.dataFeeds.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">
                      No data feeds registered yet.
                    </div>
                  ) : (
                    data.dataFeeds.map((feed) => (
                      <div
                        key={feed.id}
                        className="rounded-xl border border-slate-200 p-4 dark:border-slate-800"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold text-sm">{feed.name}</p>
                            <p className="font-mono text-xs text-slate-500">
                              POST /api/integrations/feeds/{feed.key}
                            </p>
                          </div>
                          <Badge variant="outline">
                            {deptById.get(feed.departmentId)?.code ?? "FEED"}
                          </Badge>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          Last synced:{" "}
                          {feed.lastSyncedAt
                            ? new Date(feed.lastSyncedAt).toLocaleString()
                            : "Never"}
                        </p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB: ANALYTICS, QR ATTRIBUTION & AUDIT */}
          {activeTab === "analytics" && data && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold">
                    Proof-of-Play &amp; Showroom Engagement
                  </h2>
                  <p className="text-xs text-slate-500">
                    Compliance metrics across Kenya, Tanzania, and Uganda showrooms
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={loadingReport}
                    onClick={() => void handleLoadExecutiveReport()}
                  >
                    <RefreshCw className={`size-3.5 ${loadingReport ? "animate-spin" : ""}`} />
                    {loadingReport ? "Generating..." : "Load Executive SLA & ROI Report"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => window.print()}>
                    <Printer className="size-3.5" />
                    Print / Save PDF
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleExportTelemetryCsv}>
                    <Download className="size-3.5" />
                    Export CSV
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void handlePruneTelemetry()}
                    title="Delete Proof-of-Play logs older than 90 days to save DB storage"
                  >
                    Prune &gt;90d Logs
                  </Button>
                </div>
              </div>

              {/* Maker-Checker Content Approval Queue */}
              {(() => {
                const pendingMedia = data.mediaAssets.filter(
                  (a) => a.approvalStatus === "pending_approval"
                );
                const pendingSlides = data.quickPosts.filter(
                  (q) => q.approvalStatus === "pending_approval"
                );
                if (pendingMedia.length === 0 && pendingSlides.length === 0) {
                  return null;
                }
                return (
                  <Card className="border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-950">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <span className="size-2 rounded-full bg-amber-500" />
                        Content Approval Queue ({pendingMedia.length + pendingSlides.length} pending)
                      </CardTitle>
                      <CardDescription>
                        Maker-Checker Governance: review content submitted by Branch Managers or Editors before it airs on showroom TVs.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {pendingMedia.map((m) => (
                        <div
                          key={m.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white p-3 text-xs dark:bg-slate-900"
                        >
                          <div>
                            <span className="font-semibold">{m.title}</span>{" "}
                            <Badge variant="outline">{m.mediaType}</Badge>
                          </div>
                          {data.canApprove && (
                            <div className="flex items-center gap-1.5">
                              <Button
                                size="xs"
                                onClick={() =>
                                  handleApprovalDecision("media_asset", m.id, "approved")
                                }
                              >
                                Approve &amp; Air
                              </Button>
                              <Button
                                size="xs"
                                variant="destructive"
                                onClick={() =>
                                  handleApprovalDecision("media_asset", m.id, "rejected")
                                }
                              >
                                Reject
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                      {pendingSlides.map((q) => (
                        <div
                          key={q.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white p-3 text-xs dark:bg-slate-900"
                        >
                          <div>
                            <span className="font-semibold">{q.title}</span>{" "}
                            <Badge variant="outline">Crown Studio</Badge>
                          </div>
                          {data.canApprove && (
                            <div className="flex items-center gap-1.5">
                              <Button
                                size="xs"
                                onClick={() =>
                                  handleApprovalDecision("quick_post", q.id, "approved")
                                }
                              >
                                Approve &amp; Air
                              </Button>
                              <Button
                                size="xs"
                                variant="destructive"
                                onClick={() =>
                                  handleApprovalDecision("quick_post", q.id, "rejected")
                                }
                              >
                                Reject
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })()}

              {/* Executive SLA & Commercial ROI Report */}
              {executiveReport && (
                <Card className="border-emerald-200 dark:border-emerald-900">
                  <CardHeader>
                    <CardTitle>Executive Fleet SLA &amp; TCO Savings Report</CardTitle>
                    <CardDescription>
                      Generated {new Date(executiveReport.generatedAt).toLocaleString()} • Live Uptime SLA: {executiveReport.fleet.fleetUptimePercent}% ({executiveReport.fleet.online}/{executiveReport.fleet.totalScreens} screens online)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-3 text-xs">
                    <div className="rounded-xl border p-3.5">
                      <p className="font-semibold text-slate-500">
                        3-Year Savings vs. ScreenCloud Pro ({executiveReport.roiComparison.modeledScreenCount} Screens)
                      </p>
                      <p className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400">
                        ${executiveReport.roiComparison.threeYearSavingsVsScreenCloudProUsd.toLocaleString()}
                      </p>
                      <p className="mt-1 text-slate-500">
                        ScreenCloud Pro: ${executiveReport.roiComparison.screenCloudProAnnualUsd.toLocaleString()}/yr vs. Crown Canvas one-off ${executiveReport.roiComparison.crownCanvasOneOffUsd.toLocaleString()} + ${executiveReport.roiComparison.crownCanvasAnnualInfraUsd}/yr infra
                      </p>
                    </div>
                    <div className="rounded-xl border p-3.5">
                      <p className="font-semibold text-slate-500">
                        Verified Impressions by Department
                      </p>
                      <div className="mt-2 space-y-1">
                        {executiveReport.impressionsByDepartment.length === 0 ? (
                          <p className="text-slate-400">No impressions logged yet.</p>
                        ) : (
                          executiveReport.impressionsByDepartment.slice(0, 5).map((d) => (
                            <div key={d.departmentName} className="flex justify-between">
                              <span className="truncate">{d.departmentName}</span>
                              <span className="font-semibold">
                                {d.plays} plays ({d.totalMinutes}m)
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="rounded-xl border p-3.5">
                      <p className="font-semibold text-slate-500">
                        Branch Impressions &amp; QR Conversions
                      </p>
                      <div className="mt-2 space-y-1">
                        {executiveReport.impressionsByBranch.length === 0 ? (
                          <p className="text-slate-400">No branch logs yet.</p>
                        ) : (
                          executiveReport.impressionsByBranch.slice(0, 5).map((b) => (
                            <div key={b.branchId} className="flex justify-between">
                              <span className="truncate">{b.branchName}</span>
                              <span className="font-semibold">
                                {b.plays} plays • {b.qrScans} QR
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
              <div className="grid gap-4 sm:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Proof-of-Play Impressions</CardDescription>
                    <CardTitle className="text-3xl">
                      {data.telemetry.totalImpressions}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-slate-500">
                    Verified completed playback cycles from paired TVs
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Showroom QR Scans</CardDescription>
                    <CardTitle className="text-3xl">
                      {data.telemetry.totalQrScans}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-slate-500">
                    Tracked via <code>/q/[code]</code> branch attribution links
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Recorded Audit Events</CardDescription>
                    <CardTitle className="text-3xl">
                      {data.auditLogs.length}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-slate-500">
                    Pairing, schedule, broadcast &amp; feed mutations
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Recent QR Scans &amp; Proof-of-Play</CardTitle>
                    <CardDescription>
                      Live showroom engagement and playback verification
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    {data.telemetry.recentQrScans.length === 0 &&
                      data.telemetry.recentPlays.length === 0 ? (
                      <p className="text-slate-500">
                        No telemetry events recorded yet. Pair a screen on{" "}
                        <code>/player</code> or scan a QR link to see live stats.
                      </p>
                    ) : (
                      <>
                        {data.telemetry.recentQrScans.slice(0, 6).map((qr) => (
                          <div
                            key={qr.id}
                            className="flex items-center justify-between rounded-lg border p-2.5"
                          >
                            <span>
                              QR <strong>{qr.shortCode}</strong> →{" "}
                              {branchById.get(qr.branchId ?? "")?.name ??
                                "Showroom"}
                            </span>
                            <span className="text-slate-400">
                              {new Date(qr.scannedAt).toLocaleTimeString()}
                            </span>
                          </div>
                        ))}
                        {data.telemetry.recentPlays.slice(0, 6).map((play) => (
                          <div
                            key={play.id}
                            className="flex items-center justify-between rounded-lg border p-2.5"
                          >
                            <span>
                              Played {play.durationPlayedSeconds}s at{" "}
                              <strong>
                                {branchById.get(play.branchId)?.name ?? "Branch"}
                              </strong>
                            </span>
                            <span className="text-slate-400">
                              {new Date(play.startedAt).toLocaleTimeString()}
                            </span>
                          </div>
                        ))}
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Enterprise Audit Log</CardTitle>
                    <CardDescription>
                      Immutable governance trail across East Africa operations
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    {data.auditLogs.length === 0 ? (
                      <p className="text-slate-500">No audit events recorded yet.</p>
                    ) : (
                      data.auditLogs.slice(0, 10).map((log) => (
                        <div
                          key={log.id}
                          className="flex items-center justify-between rounded-lg border p-2.5"
                        >
                          <div>
                            <span className="font-mono font-semibold">
                              {log.action}
                            </span>
                            <span className="ml-2 text-slate-500">
                              ({log.entityType})
                            </span>
                          </div>
                          <span className="text-slate-400">
                            {new Date(log.createdAt).toLocaleString()}
                          </span>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* TAB: TEAM & RBAC */}
          {activeTab === "team" && data && (
            <div className="grid gap-6 lg:grid-cols-12">
              <Card className="lg:col-span-5">
                <CardHeader>
                  <CardTitle>Assign Role &amp; Regional/Department Scope</CardTitle>
                  <CardDescription>
                    Scope permissions by Country (KE/TZ/UG), Showroom, or Department
                    (ICT, SHE, Marketing, HR, Customer Service).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleAssignRbacScope} className="space-y-3">
                    <div className="space-y-1">
                      <Label>Full Name</Label>
                      <Input
                        placeholder="e.g. Jane Wanjiku"
                        value={rbacName}
                        onChange={(e) => setRbacName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Work Email</Label>
                      <Input
                        type="email"
                        placeholder="jane@crownpaints.co.ke"
                        value={rbacEmail}
                        onChange={(e) => setRbacEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Role</Label>
                      <ModernSelect
                        value={rbacRole}
                        onValueChange={(v) => setRbacRole(v as typeof rbacRole)}
                        options={[
                          { value: "super_admin", label: "Super Admin (HQ Global)" },
                          { value: "country_manager", label: "Country Manager (KE / TZ / UG)" },
                          { value: "department_lead", label: "Department Lead (PMG / SHE / ICT / Marketing / HR)" },
                          { value: "branch_manager", label: "Showroom / Branch Manager" },
                          { value: "content_editor", label: "Content Editor" },
                          { value: "auditor", label: "Auditor (Read-Only)" },
                        ]}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label>Country</Label>
                        <ModernSelect
                          size="sm"
                          value={rbacCountryId}
                          onValueChange={setRbacCountryId}
                          options={[
                            { value: "", label: "All" },
                            ...data.countries.map((c) => ({
                              value: c.id,
                              label: c.code,
                            })),
                          ]}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Showroom</Label>
                        <ModernSelect
                          size="sm"
                          value={rbacBranchId}
                          onValueChange={setRbacBranchId}
                          options={[
                            { value: "", label: "All" },
                            ...data.branches.map((b) => ({
                              value: b.id,
                              label: b.code,
                            })),
                          ]}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Department</Label>
                        <ModernSelect
                          size="sm"
                          value={rbacDeptId}
                          onValueChange={setRbacDeptId}
                          options={[
                            { value: "", label: "All" },
                            ...data.departments.map((d) => ({
                              value: d.id,
                              label: d.code,
                            })),
                          ]}
                        />
                      </div>
                    </div>
                    <Button type="submit" className="w-full">
                      <Shield className="size-4" />
                      Assign Access Scope
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="lg:col-span-7">
                <CardHeader>
                  <CardTitle>Team Members &amp; Active Scopes</CardTitle>
                  <CardDescription>
                    Set <code>NEXT_PUBLIC_REQUIRE_AUTH=true</code> in{" "}
                    <code>.env.local</code> / Vercel to enforce login
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.teamUsers.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">
                      No team members assigned yet. Sign in via <code>/login</code>{" "}
                      (first user auto-bootstraps as Super Admin) or assign scopes on
                      the left.
                    </div>
                  ) : (
                    data.teamUsers.map((u) => (
                      <div
                        key={u.id}
                        className="rounded-xl border border-slate-200 p-4 dark:border-slate-800"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-sm">{u.fullName}</p>
                            <p className="text-xs text-slate-500">{u.email}</p>
                          </div>
                        </div>
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          {u.scopes.map((sc) => (
                            <div
                              key={sc.id}
                              className="inline-flex items-center gap-1.5 rounded-full border bg-slate-50 px-2.5 py-1 text-xs dark:bg-slate-900"
                            >
                              <span className="font-semibold">{sc.role}</span>
                              {sc.countryId && (
                                <span>• {countryById.get(sc.countryId)?.code}</span>
                              )}
                              {sc.branchId && (
                                <span>• {branchById.get(sc.branchId)?.code}</span>
                              )}
                              {sc.departmentId && (
                                <span>• {deptById.get(sc.departmentId)?.code}</span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveRbacScope(sc.id)}
                                className="ml-1 text-red-500 hover:text-red-700"
                                title="Remove scope"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB: TEMPLATES GALLERY (DECORATIVE, AUTOMOTIVE, INDUSTRIAL & DEPARTMENTS) */}
          {activeTab === "templates" && data && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <div>
                  <h2 className="text-lg font-bold tracking-tight">
                    Crown Paints Template Hub
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Industry-tailored designs for Decorative, Automotive &amp; Industrial Coatings plus PMG, Production, SHE, ICT, HR, Marketing &amp; Sales — click any template to customize in Visual Studio.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openBlankCanvasInStudio("portrait")}
                  >
                    <Plus className="size-3.5" />
                    Blank 9:16 Portrait
                  </Button>
                  <Button
                    variant="brand"
                    size="sm"
                    onClick={() => openBlankCanvasInStudio("landscape")}
                  >
                    <Sparkles className="size-3.5" />
                    Create Blank 16:9 Canvas
                  </Button>
                </div>
              </div>

              {/* Division & Department Filter Pills */}
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    { id: "all", label: `All Templates (${BUILT_IN_STUDIO_TEMPLATES.length + (data.customTemplates?.length ?? 0)})` },
                    { id: "decorative", label: "Decorative Paints (4)" },
                    { id: "automotive", label: "Automotive Refinish (3)" },
                    { id: "industrial", label: "Industrial & Marine (3)" },
                    { id: "department", label: "Departments: PMG / Prod / SHE / ICT / HR / Mktg (6)" },
                    { id: "custom", label: `My Custom Templates (${data.customTemplates?.length ?? 0})` },
                  ] as const
                ).map((pill) => (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => setTemplateFilter(pill.id)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${templateFilter === pill.id
                      ? "bg-zinc-950 text-white shadow-2xs dark:bg-white dark:text-zinc-950"
                      : "border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
                      }`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>

              {/* Custom Company Templates */}
              {(templateFilter === "all" || templateFilter === "custom") &&
                (data.customTemplates?.length ?? 0) > 0 && (
                  <div className="space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                      My Custom Company Templates
                    </p>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {(data.customTemplates ?? []).map((ct) => (
                        <Card
                          key={ct.id}
                          className="overflow-hidden border-zinc-200 transition hover:border-zinc-400 hover:shadow-sm"
                        >
                          <div className="aspect-video w-full overflow-hidden border-b border-zinc-200 bg-zinc-950">
                            <CanvasRenderer doc={ct.canvasDoc} />
                          </div>
                          <CardContent className="space-y-3 p-4">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold">{ct.name}</p>
                                <p className="text-[11px] text-zinc-500">
                                  Custom • {ct.category} • {ct.orientation}
                                </p>
                              </div>
                              <Button
                                size="icon-xs"
                                variant="ghost"
                                onClick={() => handleDeleteCustomTemplate(ct.id)}
                              >
                                <Trash2 className="size-3.5 text-red-500" />
                              </Button>
                            </div>
                            <Button
                              variant="brand"
                              size="sm"
                              className="w-full"
                              onClick={() => openCustomTemplateInStudio(ct)}
                            >
                              <Sparkles className="size-3.5" />
                              Customize in Studio
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

              {templateFilter === "custom" &&
                (data.customTemplates?.length ?? 0) === 0 && (
                  <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
                    You haven&apos;t saved any custom company templates yet. Open any design in{" "}
                    <strong>Crown Studio</strong> and click <strong>Save Template</strong>.
                  </div>
                )}

              {/* Built-In Paint Manufacturing & Corporate Templates */}
              {templateFilter !== "custom" && (
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {BUILT_IN_STUDIO_TEMPLATES.filter(
                    (tpl) =>
                      templateFilter === "all" || tpl.category === templateFilter
                  ).map((tpl) => (
                    <Card
                      key={tpl.id}
                      className="group overflow-hidden transition hover:border-zinc-400 hover:shadow-sm"
                    >
                      <div className="aspect-video w-full overflow-hidden border-b border-zinc-200 bg-zinc-950">
                        <CanvasRenderer doc={tpl.canvasDoc} />
                      </div>
                      <CardContent className="space-y-3 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="outline">{tpl.divisionLabel}</Badge>
                          <span className="font-mono text-[10px] text-zinc-400">
                            {tpl.departmentCode} • 0 MB
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold leading-snug text-zinc-950 dark:text-zinc-50">
                            {tpl.name}
                          </p>
                          <p className="mt-1 line-clamp-2 text-xs text-zinc-500">
                            {tpl.description}
                          </p>
                        </div>
                        <Button
                          variant="brand"
                          size="sm"
                          className="w-full"
                          onClick={() => openBuiltInTemplateInStudio(tpl)}
                        >
                          <Sparkles className="size-3.5" />
                          Customize in Studio
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: CROWN STUDIO (FIGMA/CANVA-GRADE VISUAL STUDIO + LIVE ERP RECHARTS MODE) */}
          {activeTab === "studio" && data && (
            <div className="space-y-4">
              {/* Studio Mode Switcher & Existing Slide Picker */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-800 dark:bg-zinc-900">
                    <button
                      type="button"
                      onClick={() => setStudioMode("canvas")}
                      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${studioMode === "canvas"
                        ? "bg-zinc-950 text-white shadow-2xs dark:bg-white dark:text-zinc-950"
                        : "text-zinc-600 hover:text-zinc-950 dark:text-zinc-400"
                        }`}
                    >
                      <Sparkles className="size-3.5" />
                      Visual Canvas Studio
                    </button>
                    <button
                      type="button"
                      onClick={() => setStudioMode("kpi")}
                      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${studioMode === "kpi"
                        ? "bg-zinc-950 text-white shadow-2xs dark:bg-white dark:text-zinc-950"
                        : "text-zinc-600 hover:text-zinc-950 dark:text-zinc-400"
                        }`}
                    >
                      <Activity className="size-3.5" />
                      Live ERP / Quick-Form Mode
                    </button>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setActiveTab("templates")}
                  >
                    <LayoutTemplate className="size-3.5" />
                    Browse Templates
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="w-64">
                    <ModernSelect
                      size="sm"
                      value={editingQuickPostId ?? ""}
                      onValueChange={(val) => {
                        if (!val) {
                          resetStudioToNew();
                          setStudioCanvasDoc(createBlankCanvasDoc("landscape"));
                          setStudioEditorKey((k) => k + 1);
                          return;
                        }
                        const found = data.quickPosts.find((q) => q.id === val);
                        if (found) loadQuickPostIntoStudio(found);
                      }}
                      options={[
                        { value: "", label: "+ New Slide (Create)" },
                        ...data.quickPosts.map((qp) => ({
                          value: qp.id,
                          label: `Edit: ${qp.title}`,
                          description: qp.slideConfig.canvasDoc
                            ? "Visual Canvas Slide"
                            : `Quick-Form (${qp.templateType})`,
                        })),
                      ]}
                    />
                  </div>
                </div>
              </div>

              {selectedPlaylistId && (() => {
                const targetPl = data.playlists.find((p) => p.id === selectedPlaylistId);
                if (!targetPl) return null;
                return (
                  <div className="space-y-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-xs shadow-[0_1px_2px_rgba(0,0,0,0.02)] dark:border-zinc-800 dark:bg-zinc-950">
                    <p className="font-semibold text-zinc-700 dark:text-zinc-300">
                      Running Bottom Taglines ({targetPl.name}) — add multiple with Play Store / App Store / icons:
                    </p>
                    <TaglineBuilder
                      compact
                      value={tickerDrafts[targetPl.id] ?? targetPl.tickerText ?? ""}
                      onChange={(next) =>
                        setTickerDrafts((prev) => ({
                          ...prev,
                          [targetPl.id]: next,
                        }))
                      }
                      onSave={(next) =>
                        void handleSavePlaylistTicker(targetPl, next)
                      }
                    />
                  </div>
                );
              })()}

              {studioMode === "canvas" ? (
                <CanvasEditor
                  key={studioEditorKey}
                  initialDoc={studioCanvasDoc}
                  slideTitle={qpTitle}
                  onSlideTitleChange={setQpTitle}
                  departmentId={qpDeptId}
                  onDepartmentChange={setQpDeptId}
                  departments={data.departments}
                  playlists={data.playlists}
                  selectedPlaylistId={selectedPlaylistId}
                  onSelectedPlaylistChange={setSelectedPlaylistId}
                  addToPlaylist={qpAddToPlaylist}
                  onAddToPlaylistChange={setQpAddToPlaylist}
                  mediaImages={data.mediaAssets
                    .filter((a) => a.mediaType === "image")
                    .map((a) => ({
                      id: a.id,
                      title: a.title,
                      publicUrl: a.publicUrl,
                    }))}
                  customTemplates={data.customTemplates ?? []}
                  isEditingExisting={Boolean(editingQuickPostId)}
                  savingSlide={savingStudio}
                  onSaveSlide={handleSaveCanvasSlide}
                  onSaveAsTemplate={handleSaveAsCustomTemplate}
                />
              ) : (
                <div className="grid gap-6 lg:grid-cols-12">
                  <Card className="lg:col-span-5">
                    <CardHeader>
                      <CardTitle>Live ERP &amp; Structured Quick-Post Mode</CardTitle>
                      <CardDescription>
                        Ideal for linking live ERP/POS Recharts dashboards (`Sales Analytics`) or fast structured notices.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={handlePublishQuickPost} className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label>Template</Label>
                            <ModernSelect
                              size="sm"
                              value={qpTemplate}
                              onValueChange={(v) => {
                                const val = v as typeof qpTemplate;
                                setQpTemplate(val);
                                if (val === "she_safety") {
                                  setQpTheme("she_emerald");
                                  setQpBadge("SHE SAFETY ALERT");
                                } else if (val === "ict_notice") {
                                  setQpTheme("ict_slate");
                                  setQpBadge("ICT SYSTEMS NOTICE");
                                } else if (val === "marketing_promo") {
                                  setQpTheme("crown_gold");
                                  setQpBadge("CROWN PAINTS PROMO");
                                } else if (val === "hr_spotlight") {
                                  setQpTheme("hr_violet");
                                  setQpBadge("HR • PEOPLE & CULTURE");
                                  setQpHeadline("Showroom Star of the Month");
                                  setQpSubheadline("Celebrating 98.5% Customer Satisfaction");
                                } else if (val === "kpi_chart") {
                                  setQpTheme("crown_navy");
                                  setQpBadge("COMMERCIAL ANALYTICS");
                                  setQpHeadline("East Africa Showroom Sales vs. Target");
                                  setQpSubheadline("Kenya, Tanzania & Uganda Retail Snapshot");
                                } else {
                                  setQpTheme("crown_navy");
                                  setQpBadge("CUSTOMER SERVICE");
                                }
                              }}
                              options={[
                                { value: "kpi_chart", label: "Sales Analytics (Recharts)" },
                                { value: "marketing_promo", label: "Marketing Promo (KES/TZS/UGX)" },
                                { value: "customer_service_qr", label: "Customer Service + QR" },
                                { value: "hr_spotlight", label: "HR People & Culture Spotlight" },
                                { value: "she_safety", label: "SHE Safety Counter" },
                                { value: "ict_notice", label: "ICT Systems Notice" },
                                { value: "general_announcement", label: "General Announcement" },
                              ]}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>Department</Label>
                            <ModernSelect
                              size="sm"
                              value={qpDeptId}
                              onValueChange={setQpDeptId}
                              options={data.departments.map((d) => ({
                                value: d.id,
                                label: d.name,
                              }))}
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <Label>Slide Title (Internal)</Label>
                          <Input value={qpTitle} onChange={(e) => setQpTitle(e.target.value)} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label>Badge Text</Label>
                            <Input value={qpBadge} onChange={(e) => setQpBadge(e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label>Theme</Label>
                            <ModernSelect
                              size="sm"
                              value={qpTheme}
                              onValueChange={(v) => setQpTheme(v as typeof qpTheme)}
                              options={[
                                { value: "crown_navy", label: "Crown Navy" },
                                { value: "crown_gold", label: "Crown Gold" },
                                { value: "she_emerald", label: "SHE Emerald" },
                                { value: "ict_slate", label: "ICT Slate" },
                                { value: "hr_violet", label: "HR Violet" },
                                { value: "light", label: "Clean Light" },
                              ]}
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label>Headline</Label>
                          <Input
                            value={qpHeadline}
                            onChange={(e) => setQpHeadline(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Subheadline</Label>
                          <Input
                            value={qpSubheadline}
                            onChange={(e) => setQpSubheadline(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Body Message</Label>
                          <Textarea
                            rows={2}
                            value={qpBody}
                            onChange={(e) => setQpBody(e.target.value)}
                          />
                        </div>

                        {(qpTemplate === "kpi_chart" || qpTemplate === "she_safety") &&
                          data.dataFeeds.length > 0 && (
                            <div className="space-y-1">
                              <Label>Link Live Data Feed (Optional)</Label>
                              <ModernSelect
                                size="sm"
                                value={qpDataFeedId}
                                onValueChange={setQpDataFeedId}
                                options={[
                                  { value: "", label: "Static Slide Config" },
                                  ...data.dataFeeds.map((f) => ({
                                    value: f.id,
                                    label: `${f.name} (${f.key})`,
                                  })),
                                ]}
                              />
                            </div>
                          )}

                        {qpTemplate === "hr_spotlight" && (
                          <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                              <Label>Staff Name</Label>
                              <Input
                                value={qpPersonName}
                                onChange={(e) => setQpPersonName(e.target.value)}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Role</Label>
                              <Input
                                value={qpPersonRole}
                                onChange={(e) => setQpPersonRole(e.target.value)}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Branch</Label>
                              <Input
                                value={qpPersonBranch}
                                onChange={(e) => setQpPersonBranch(e.target.value)}
                              />
                            </div>
                          </div>
                        )}

                        {qpTemplate === "marketing_promo" && (
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label>Currency</Label>
                              <ModernSelect
                                size="sm"
                                value={qpCurrency}
                                onValueChange={(v) =>
                                  setQpCurrency(v as "KES" | "TZS" | "UGX")
                                }
                                options={[
                                  { value: "KES", label: "KES (Kenya)" },
                                  { value: "TZS", label: "TZS (Tanzania)" },
                                  { value: "UGX", label: "UGX (Uganda)" },
                                ]}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Price / Offer</Label>
                              <Input
                                value={qpPrice}
                                onChange={(e) => setQpPrice(e.target.value)}
                              />
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label>QR Destination URL</Label>
                            <Input
                              value={qpQrUrl}
                              onChange={(e) => setQpQrUrl(e.target.value)}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>QR Label</Label>
                            <Input
                              value={qpQrLabel}
                              onChange={(e) => setQpQrLabel(e.target.value)}
                            />
                          </div>
                        </div>

                        {data.playlists.length > 0 && (
                          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-900/50">
                            <label className="flex items-center gap-2 text-xs font-medium">
                              <input
                                type="checkbox"
                                checked={qpAddToPlaylist}
                                onChange={(e) => setQpAddToPlaylist(e.target.checked)}
                                className="size-3.5 rounded border-slate-300"
                              />
                              Ensure slide is in target playlist &amp; push to TVs
                            </label>
                            {qpAddToPlaylist && (
                              <ModernSelect
                                size="sm"
                                value={selectedPlaylistId}
                                onValueChange={setSelectedPlaylistId}
                                options={data.playlists.map((pl) => ({
                                  value: pl.id,
                                  label: `Target: ${pl.name} (${pl.items.length} items)`,
                                }))}
                              />
                            )}
                          </div>
                        )}

                        <Button
                          type="submit"
                          variant="brand"
                          className="w-full"
                          disabled={savingStudio}
                        >
                          <Send className="size-4" />
                          {savingStudio
                            ? "Saving & Pushing to TVs..."
                            : editingQuickPostId
                              ? "Save Changes & Push to TVs"
                              : qpAddToPlaylist
                                ? "Save Slide & Add to Playlist"
                                : "Save Quick Post Slide"}
                        </Button>
                      </form>
                    </CardContent>
                  </Card>

                  <Card className="lg:col-span-7">
                    <CardHeader>
                      <CardTitle>Live 16:9 TV Preview</CardTitle>
                      <CardDescription>
                        Exact preview of how Android TV &amp; Mini PC screens render this slide
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="aspect-video w-full overflow-hidden rounded-xl border border-slate-200 shadow-lg">
                        <QuickPostSlide
                          templateType={qpTemplate}
                          departmentName={
                            deptById.get(qpDeptId)?.name ?? "Marketing & Brand"
                          }
                          config={liveQuickPostConfig}
                          branchName="Nairobi Likoni Rd HQ & Showroom"
                          countryCode="KE"
                          compact
                        />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
