/**
 * @file src/db/schema/screens.ts
 * @description Device fleet schema: `screen_groups`, `screens` (Android TV / Mini PC
 * hardware profile, heartbeat & local cache telemetry), 6-digit `pairing_codes`, and `screen_commands`.
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
import { countries, branches } from "./locations";
import { departments } from "./departments";
import { users } from "./auth";

export const screenOrientationEnum = pgEnum("screen_orientation", [
  "landscape",
  "portrait",
]);

export const screenHardwareEnum = pgEnum("screen_hardware", [
  "android_tv",
  "mini_pc",
  "other",
]);

export const screenRoleEnum = pgEnum("screen_role", [
  "showroom_customer",
  "back_office",
  "factory_floor",
  "reception",
]);

export const screenCacheStatusEnum = pgEnum("screen_cache_status", [
  "pending",
  "downloading",
  "synced",
  "error",
]);

export const commandTypeEnum = pgEnum("screen_command_type", [
  "reload",
  "clear_cache",
  "identify",
  "restart_player",
  "screenshot",
]);

export const commandStatusEnum = pgEnum("screen_command_status", [
  "pending",
  "acknowledged",
  "executed",
  "failed",
]);

export const screenGroups = pgTable("screen_groups", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  countryId: uuid("country_id").references(() => countries.id, {
    onDelete: "set null",
  }),
  branchId: uuid("branch_id").references(() => branches.id, {
    onDelete: "set null",
  }),
  departmentId: uuid("department_id").references(() => departments.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const screens = pgTable("screens", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 150 }).notNull(),
  branchId: uuid("branch_id")
    .notNull()
    .references(() => branches.id, { onDelete: "cascade" }),
  departmentId: uuid("department_id").references(() => departments.id, {
    onDelete: "set null",
  }),
  groupId: uuid("group_id").references(() => screenGroups.id, {
    onDelete: "set null",
  }),
  screenRole: screenRoleEnum("screen_role").default("showroom_customer").notNull(),
  hardwareType: screenHardwareEnum("hardware_type").default("android_tv").notNull(),
  orientation: screenOrientationEnum("orientation").default("landscape").notNull(),
  resolution: varchar("resolution", { length: 32 }).default("1920x1080"),
  deviceTokenHash: varchar("device_token_hash", { length: 128 }).unique(),
  isPaired: boolean("is_paired").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  isOnline: boolean("is_online").default(false).notNull(),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
  appVersion: varchar("app_version", { length: 32 }),
  cacheStatus: screenCacheStatusEnum("cache_status").default("pending").notNull(),
  cachedAssetCount: integer("cached_asset_count").default(0).notNull(),
  storageUsedMb: integer("storage_used_mb").default(0).notNull(),
  activePlaylistId: uuid("active_playlist_id"),
  currentItemTitle: varchar("current_item_title", { length: 200 }),
  lastSnapshotUrl: text("last_snapshot_url"),
  lastSnapshotAt: timestamp("last_snapshot_at", { withTimezone: true }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const pairingCodes = pgTable("pairing_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 6 }).notNull().unique(),
  hardwareType: screenHardwareEnum("hardware_type").default("android_tv").notNull(),
  resolution: varchar("resolution", { length: 32 }),
  userAgent: text("user_agent"),
  claimedScreenId: uuid("claimed_screen_id").references(() => screens.id, {
    onDelete: "cascade",
  }),
  handoffToken: varchar("handoff_token", { length: 128 }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const screenCommands = pgTable("screen_commands", {
  id: uuid("id").defaultRandom().primaryKey(),
  screenId: uuid("screen_id")
    .notNull()
    .references(() => screens.id, { onDelete: "cascade" }),
  command: commandTypeEnum("command").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  status: commandStatusEnum("status").default("pending").notNull(),
  issuedBy: uuid("issued_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  executedAt: timestamp("executed_at", { withTimezone: true }),
});
