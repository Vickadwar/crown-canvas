/**
 * @file src/db/schema/analytics.ts
 * @description Engagement & Compliance telemetry schema: `proof_of_play_logs`
 * (verified screen playback impressions) and `qr_scan_events` (showroom mobile attribution).
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { branches } from "./locations";
import { departments } from "./departments";
import { screens } from "./screens";
import { mediaAssets } from "./assets";
import { playlists, quickPosts } from "./studio";

export const proofOfPlayLogs = pgTable("proof_of_play_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  screenId: uuid("screen_id")
    .notNull()
    .references(() => screens.id, { onDelete: "cascade" }),
  branchId: uuid("branch_id")
    .notNull()
    .references(() => branches.id, { onDelete: "cascade" }),
  playlistId: uuid("playlist_id").references(() => playlists.id, {
    onDelete: "set null",
  }),
  mediaAssetId: uuid("media_asset_id").references(() => mediaAssets.id, {
    onDelete: "set null",
  }),
  quickPostId: uuid("quick_post_id").references(() => quickPosts.id, {
    onDelete: "set null",
  }),
  departmentId: uuid("department_id").references(() => departments.id, {
    onDelete: "set null",
  }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  durationPlayedSeconds: integer("duration_played_seconds").notNull(),
  completed: boolean("completed").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const qrScanEvents = pgTable("qr_scan_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  shortCode: varchar("short_code", { length: 32 }).notNull(),
  sourceType: varchar("source_type", { length: 32 }).default("sidebar").notNull(),
  campaignLabel: varchar("campaign_label", { length: 160 }),
  screenId: uuid("screen_id").references(() => screens.id, {
    onDelete: "set null",
  }),
  branchId: uuid("branch_id").references(() => branches.id, {
    onDelete: "set null",
  }),
  quickPostId: uuid("quick_post_id").references(() => quickPosts.id, {
    onDelete: "set null",
  }),
  targetUrl: text("target_url").notNull(),
  userAgent: text("user_agent"),
  scannedAt: timestamp("scanned_at", { withTimezone: true }).defaultNow().notNull(),
});
