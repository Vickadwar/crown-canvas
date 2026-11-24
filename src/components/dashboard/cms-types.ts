/**
 * @file src/components/dashboard/cms-types.ts
 * @description Shared TypeScript data contracts for the modular Crown Canvas CMS tabs.
 */

import type {
  BranchOperatingSchedule,
  PlaylistSidebarConfig,
  QuickPostSlideConfig,
} from "@/db/schema";
import type { CustomTemplateRecord } from "@/components/studio/canvas-editor";
import type { PasswordPolicyConfig, RolePermission } from "@/lib/permissions";

export type NavTab =
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

export interface CountryItem {
  id: string;
  code: string;
  name: string;
  currencyCode: string;
  timezone: string;
}

export interface BranchItem {
  id: string;
  countryId: string;
  code: string;
  name: string;
  branchType: "showroom" | "depot" | "factory" | "hq";
  city: string;
  address?: string | null;
  phone?: string | null;
  openingTime: string;
  closingTime: string;
  operatingSchedule?: BranchOperatingSchedule | null;
  isActive?: boolean;
}

export interface DepartmentItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  accentColor: string;
  icon: string;
  isActive?: boolean;
}

export interface ScreenGroupItem {
  id: string;
  name: string;
  description: string | null;
  countryId: string | null;
  branchId: string | null;
  departmentId: string | null;
}

export interface ScreenItem {
  id: string;
  name: string;
  branchId: string;
  departmentId: string | null;
  groupId?: string | null;
  screenRole: string;
  hardwareType: string;
  orientation: "landscape" | "portrait" | string;
  isActive?: boolean;
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
  metadata?: Record<string, unknown> | null;
}

export interface MediaAssetItem {
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

export interface QuickPostItem {
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

export interface PlaylistItemRecord {
  id?: string;
  itemKind: "media_asset" | "quick_post";
  mediaAssetId?: string | null;
  quickPostId?: string | null;
  durationSeconds?: number | null;
  sortOrder?: number;
}

export interface LayoutRecord {
  id: string;
  name: string;
  description: string | null;
  orientation: string;
}

export interface ScheduleItem {
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
  daysOfWeek?: number[];
  daypartStart: string;
  daypartEnd: string;
  isActive: boolean;
}

export interface OverrideItem {
  id: string;
  title: string;
  message: string;
  overrideKind?: "alert" | "media_asset" | "playlist";
  mediaAssetId?: string | null;
  playlistId?: string | null;
  severity: "info" | "warning" | "critical";
  targetType: string;
  targetId?: string | null;
  targetScreenIds?: string[] | null;
  isActive: boolean;
  expiresAt: string | null;
  createdAt?: string;
}

export interface ShowcaseProductItem {
  id: string;
  name: string;
  badgeHeader: string;
  description: string;
  imageUrl: string;
  storagePath?: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface SidebarProfileItem {
  id: string;
  name: string;
  description: string | null;
  theme: "white_minimal" | "warm_editorial" | "navy_dark" | "slate_industrial" | string;
  displayName: string | null;
  showClock: boolean;
  showWeather: boolean;
  showQr: boolean;
  qrTitle: string | null;
  promoLabel: string | null;
  qrTargetUrl: string | null;
  slideIntervalSeconds: number;
  productIds: string[];
  isDefault: boolean;
}

export interface StudioBackgroundItem {
  id: string;
  name: string;
  category: string;
  imageUrl: string;
  storagePath?: string | null;
}

export interface PlaylistRecord {
  id: string;
  name: string;
  description: string | null;
  departmentId: string;
  layoutId?: string | null;
  sidebarProfileId?: string | null;
  tickerText?: string | null;
  sidebarConfig?: PlaylistSidebarConfig | null;
  isActive: boolean;
  version: number;
  items: PlaylistItemRecord[];
}

export interface PendingPairing {
  id: string;
  code: string;
  hardwareType: string;
  resolution: string | null;
}

export interface DataFeedItem {
  id: string;
  key: string;
  name: string;
  departmentId: string;
  sourceType: "push_webhook" | "google_sheet" | "manual_json";
  payload: Record<string, unknown>;
  lastSyncedAt: string | null;
}

export interface TelemetrySummary {
  totalImpressions: number;
  totalQrScans: number;
  recentPlays: Array<{
    id: string;
    screenId: string;
    branchId: string;
    departmentId?: string | null;
    durationPlayedSeconds: number;
    startedAt: string;
  }>;
  recentQrScans: Array<{
    id: string;
    shortCode: string;
    sourceType?: string | null;
    campaignLabel?: string | null;
    screenId?: string | null;
    branchId: string | null;
    quickPostId?: string | null;
    targetUrl: string;
    userAgent?: string | null;
    scannedAt: string;
  }>;
}

export interface AuditLogItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface RoleItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  color: "purple" | "info" | "success" | "warning" | "outline" | "danger" | string;
  isSystem: boolean;
  permissions: RolePermission[];
  memberCount?: number;
}

export interface TeamUserItem {
  id: string;
  email: string;
  fullName: string;
  isActive?: boolean;
  mustChangePassword?: boolean;
  passwordChangedAt?: string | null;
  lastLoginAt?: string | null;
  createdAt?: string | null;
  scopes: Array<{
    id: string;
    role: string;
    roleId?: string | null;
    roleName?: string | null;
    roleColor?: string | null;
    countryId: string | null;
    branchId: string | null;
    departmentId: string | null;
  }>;
}

export interface SessionInfo {
  enforceAuth: boolean;
  authenticated: boolean;
  userId?: string | null;
  email: string | null;
  fullName: string | null;
  isActive?: boolean;
  mustChangePassword?: boolean;
  passwordExpired?: boolean;
  passwordExpiresInDays?: number | null;
  passwordPolicy?: PasswordPolicyConfig;
  permissions?: RolePermission[];
  scopes?: Array<{
    id: string;
    role: string;
    roleId?: string | null;
    roleName?: string | null;
    countryId: string | null;
    branchId: string | null;
    departmentId: string | null;
  }>;
}

export interface StorageStats {
  totalBytesUsed: number;
  quotaBytes: number;
  uploadedCount: number;
  zeroDiskCount: number;
  provider: string;
}

export interface ExecutiveReportPayload {
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
  }>;
  qrScansTotal: number;
  storageStats: StorageStats;
}

export interface AppLicenseInfo {
  mode: "trial" | "oem_lifetime";
  statusLabel: string;
  maskedKey: string;
  fullKey: string | null;
  activatedAt: string | null;
  activatedByName: string | null;
  singleInstanceNotice: string;
}

export interface OverviewPayload {
  configured: boolean;
  storageReady: boolean;
  session?: SessionInfo;
  canApprove?: boolean;
  pendingApprovalsCount?: number;
  storageStats?: StorageStats;
  authPolicy?: PasswordPolicyConfig;
  appLicense?: AppLicenseInfo;
  roles?: RoleItem[];
  countries: CountryItem[];
  branches: BranchItem[];
  departments: DepartmentItem[];
  screenGroups: ScreenGroupItem[];
  screens: ScreenItem[];
  pendingPairings: PendingPairing[];
  mediaAssets: MediaAssetItem[];
  quickPosts: QuickPostItem[];
  customTemplates?: CustomTemplateRecord[];
  showcaseProducts?: ShowcaseProductItem[];
  sidebarProfiles?: SidebarProfileItem[];
  studioBackgrounds?: StudioBackgroundItem[];
  layouts: LayoutRecord[];
  playlists: PlaylistRecord[];
  schedules: ScheduleItem[];
  overrides: OverrideItem[];
  dataFeeds: DataFeedItem[];
  telemetry: TelemetrySummary;
  auditLogs: AuditLogItem[];
  teamUsers: TeamUserItem[];
}
