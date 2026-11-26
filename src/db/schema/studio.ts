/**
 * @file src/db/schema/studio.ts
 * @description Crown Studio & Playlist schema: multi-zone `layouts`, ERP/KPI `data_feeds`,
 * structured `quick_posts` (HR, SHE, ICT, Marketing, Sales Recharts), `playlists`, and `playlist_items`.
 */

import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { countries } from "./locations";
import { departments } from "./departments";
import { users } from "./auth";
import { mediaAssets, approvalStatusEnum } from "./assets";
import { screenOrientationEnum } from "./screens";

export interface PlaylistSidebarConfig {
  displayName?: string;
  showWeather?: boolean;
  showClock?: boolean;
  showQr?: boolean;
  qrTargetUrl?: string;
  shadeTitle?: string;
  shadeName?: string;
  shadeHex?: string;
  promoLabel?: string;
}

export interface LayoutZone {
  id: string;
  label: string;
  xPercent: number;
  yPercent: number;
  wPercent: number;
  hPercent: number;
  role: "primary_media" | "sidebar" | "ticker" | "qr_promo" | "weather_clock";
}

export type StudioFontKey =
  | "satoshi"
  | "playfair"
  | "oswald"
  | "montserrat"
  | "space_grotesk"
  | "bebas"
  | "jetbrains_mono";

export type StudioElementType =
  | "text"
  | "badge"
  | "shape"
  | "icon"
  | "swatch"
  | "price_tag"
  | "image"
  | "qr"
  | "emblem"
  | "chart_bar"
  | "chart_donut"
  | "chart_progress"
  | "table_spec"
  | "separator"
  | "step_number"
  | "list_block";

export interface StudioCanvasElement {
  id: string;
  type: StudioElementType;
  label: string;
  x: number; // 0-100 percentage of canvas width
  y: number; // 0-100 percentage of canvas height
  w: number; // 1-100 percentage of canvas width
  h: number; // 1-100 percentage of canvas height
  zIndex: number;
  rotation?: number; // Exact integer degrees (-360..360)
  opacity?: number;
  locked?: boolean;
  flipX?: boolean;
  flipY?: boolean;
  // Text / Badge / Price / Emblem fields
  text?: string;
  subtext?: string;
  currency?: "KES" | "TZS" | "UGX";
  fontFamily?: StudioFontKey;
  fontSize?: number; // Virtual 1080p canvas px (e.g., 16-140)
  fontWeight?: "400" | "500" | "600" | "700" | "800" | "900";
  textAlign?: "left" | "center" | "right";
  lineHeight?: number;
  uppercase?: boolean;
  letterSpacing?: number;
  color?: string;
  // Shape / Card / Background fields
  shapeKind?:
    | "rect"
    | "circle"
    | "pill"
    | "line"
    | "stripe"
    | "triangle"
    | "diamond"
    | "arrow_right"
    | "chevron"
    | "star"
    | "ring";
  fill?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  // Icon fields
  iconName?: string;
  // Crown Paint Swatch fields
  swatchHex?: string;
  swatchCode?: string;
  // Image & QR fields
  imageUrl?: string;
  objectFit?: "cover" | "contain";
  qrUrl?: string;
  qrLabel?: string;
  qrTrackingMode?: "direct" | "tracked";
  qrShowLogo?: boolean;
  // Infographics & Charts (Recharts + Progress + Spec Table)
  chartTitle?: string;
  chartSeries?: Array<{ label: string; value: number; target?: number }>;
  donutSlices?: Array<{ name: string; value: number; color: string }>;
  centerLabel?: string;
  centerValue?: string;
  barColor?: string;
  secondaryColor?: string;
  showGrid?: boolean;
  progressValue?: number;
  progressMax?: number;
  progressStyle?: "bar" | "ring";
  trackColor?: string;
  tableHeaders?: string[];
  tableRows?: string[][];
  // Modern Separators, Numbered Steps & Lists
  separatorStyle?: "solid" | "dashed" | "dotted" | "gradient";
  separatorOrientation?: "horizontal" | "vertical";
  lineThickness?: number;
  stepNumber?: string;
  stepStyle?: "circle" | "square" | "outline";
  listStyle?: "numbered" | "check" | "bullet";
  listItems?: string[];
}

export interface StudioCanvasDoc {
  version: 1;
  orientation: "landscape" | "portrait";
  backgroundPreset: string;
  backgroundCss: string;
  backgroundColor?: string;
  backgroundImageUrl?: string;
  accentColor?: string;
  elements: StudioCanvasElement[];
}

export interface QuickPostSlideConfig {
  headline: string;
  subheadline?: string;
  body?: string;
  badgeText?: string;
  metricValue?: string;
  metricLabel?: string;
  currency?: "KES" | "TZS" | "UGX";
  price?: string;
  qrUrl?: string;
  qrLabel?: string;
  qrTrackingMode?: "direct" | "tracked";
  qrShowLogo?: boolean;
  accentColor?: string;
  backgroundTheme?:
    | "crown_navy"
    | "crown_gold"
    | "she_emerald"
    | "ict_slate"
    | "hr_violet"
    | "light";
  personName?: string;
  personRole?: string;
  personBranch?: string;
  swatchColors?: Array<{ name: string; hex: string }>;
  kpis?: Array<{ label: string; value: string; delta?: string }>;
  chartData?: Array<{ label: string; value: number; target?: number }>;
  categoryMix?: Array<{ name: string; value: number; color: string }>;
  canvasDoc?: StudioCanvasDoc;
}

export const dataFeedSourceEnum = pgEnum("data_feed_source", [
  "push_webhook",
  "google_sheet",
  "manual_json",
]);

export const quickPostTemplateEnum = pgEnum("quick_post_template", [
  "she_safety",
  "ict_notice",
  "marketing_promo",
  "customer_service_qr",
  "kpi_chart",
  "hr_spotlight",
  "general_announcement",
]);

export const playlistItemKindEnum = pgEnum("playlist_item_kind", [
  "media_asset",
  "quick_post",
  "web_widget",
]);

export const layouts = pgTable("layouts", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  orientation: screenOrientationEnum("orientation").default("landscape").notNull(),
  zonesConfig: jsonb("zones_config").$type<LayoutZone[]>().notNull(),
  isSystem: boolean("is_system").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const dataFeeds = pgTable("data_feeds", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: varchar("key", { length: 80 }).notNull().unique(),
  name: varchar("name", { length: 150 }).notNull(),
  departmentId: uuid("department_id")
    .notNull()
    .references(() => departments.id, { onDelete: "restrict" }),
  sourceType: dataFeedSourceEnum("source_type").default("push_webhook").notNull(),
  apiKeyHash: varchar("api_key_hash", { length: 128 }),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const quickPosts = pgTable("quick_posts", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 180 }).notNull(),
  templateType: quickPostTemplateEnum("template_type").notNull(),
  departmentId: uuid("department_id")
    .notNull()
    .references(() => departments.id, { onDelete: "restrict" }),
  countryId: uuid("country_id").references(() => countries.id, {
    onDelete: "set null",
  }),
  dataFeedId: uuid("data_feed_id").references(() => dataFeeds.id, {
    onDelete: "set null",
  }),
  slideConfig: jsonb("slide_config").$type<QuickPostSlideConfig>().notNull(),
  audioTrackId: uuid("audio_track_id"),
  durationSeconds: integer("duration_seconds").default(15).notNull(),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  approvalStatus: approvalStatusEnum("approval_status")
    .default("approved")
    .notNull(),
  approvedBy: uuid("approved_by").references(() => users.id, {
    onDelete: "set null",
  }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
  isArchived: boolean("is_archived").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SidebarThemeKey =
  | "white_minimal"
  | "warm_editorial"
  | "navy_dark"
  | "slate_industrial";

export const showcaseProducts = pgTable("showcase_products", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 140 }).notNull(),
  badgeHeader: varchar("badge_header", { length: 80 })
    .default("FEATURED PRODUCT")
    .notNull(),
  description: text("description").default("").notNull(),
  imageUrl: text("image_url").notNull(),
  storagePath: text("storage_path"),
  sortOrder: integer("sort_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sidebarProfiles = pgTable("sidebar_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 140 }).notNull(),
  description: text("description"),
  theme: varchar("theme", { length: 32 }).default("white_minimal").notNull(),
  displayName: varchar("display_name", { length: 140 }),
  showClock: boolean("show_clock").default(true).notNull(),
  showWeather: boolean("show_weather").default(true).notNull(),
  showQr: boolean("show_qr").default(true).notNull(),
  qrTitle: varchar("qr_title", { length: 100 }).default("Explore Decorative Range"),
  promoLabel: varchar("promo_label", { length: 200 }),
  qrTargetUrl: text("qr_target_url"),
  qrTrackingMode: varchar("qr_tracking_mode", { length: 16 }).default("direct").notNull(),
  qrShowLogo: boolean("qr_show_logo").default(true).notNull(),
  slideIntervalSeconds: integer("slide_interval_seconds").default(6).notNull(),
  productIds: jsonb("product_ids").$type<string[]>().default([]).notNull(),
  isDefault: boolean("is_default").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const studioBackgrounds = pgTable("studio_backgrounds", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 140 }).notNull(),
  category: varchar("category", { length: 64 }).default("Campaign").notNull(),
  imageUrl: text("image_url").notNull(),
  storagePath: text("storage_path"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const playlists = pgTable("playlists", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 150 }).notNull(),
  description: text("description"),
  departmentId: uuid("department_id")
    .notNull()
    .references(() => departments.id, { onDelete: "restrict" }),
  countryId: uuid("country_id").references(() => countries.id, {
    onDelete: "set null",
  }),
  layoutId: uuid("layout_id").references(() => layouts.id, {
    onDelete: "set null",
  }),
  tickerText: text("ticker_text"),
  sidebarConfig: jsonb("sidebar_config").$type<PlaylistSidebarConfig>(),
  sidebarProfileId: uuid("sidebar_profile_id").references(() => sidebarProfiles.id, {
    onDelete: "set null",
  }),
  audioTrackId: uuid("audio_track_id"),
  promoInjectEveryN: integer("promo_inject_every_n").default(0).notNull(),
  showPartnerLogos: boolean("show_partner_logos").default(true).notNull(),
  partnerTickerMode: varchar("partner_ticker_mode", { length: 16 })
    .default("pinned_right")
    .notNull(),
  mediaFitMode: varchar("media_fit_mode", { length: 16 })
    .default("ambient_fit")
    .notNull(),
  stageBackdrop: varchar("stage_backdrop", { length: 24 })
    .default("ambient_blur")
    .notNull(),
  defaultDurationSeconds: integer("default_duration_seconds").default(15).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  version: integer("version").default(1).notNull(),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const playlistItems = pgTable("playlist_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  playlistId: uuid("playlist_id")
    .notNull()
    .references(() => playlists.id, { onDelete: "cascade" }),
  itemKind: playlistItemKindEnum("item_kind").default("media_asset").notNull(),
  mediaAssetId: uuid("media_asset_id").references(() => mediaAssets.id, {
    onDelete: "cascade",
  }),
  quickPostId: uuid("quick_post_id").references(() => quickPosts.id, {
    onDelete: "cascade",
  }),
  widgetConfig: jsonb("widget_config").$type<Record<string, unknown>>(),
  zoneId: varchar("zone_id", { length: 48 }).default("main").notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  durationSeconds: integer("duration_seconds"),
  transition: varchar("transition", { length: 32 }).default("fade").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const studioTemplateCategoryEnum = pgEnum("studio_template_category", [
  "decorative",
  "automotive",
  "industrial",
  "department",
  "custom",
]);

export const studioTemplates = pgTable("studio_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  category: studioTemplateCategoryEnum("category").default("custom").notNull(),
  departmentCode: varchar("department_code", { length: 32 }),
  orientation: screenOrientationEnum("orientation").default("landscape").notNull(),
  canvasDoc: jsonb("canvas_doc").$type<StudioCanvasDoc>().notNull(),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
