/**
 * @file src/db/schema/campaigns.ts
 * @description Strictly additive campaign & corporate communications schema:
 *  - `audio_tracks`: Cloudflare R2 background music tracks with ambient volume & mood tags
 *  - `promotions`: Agency-ready promotional designs with date-range auto-expiry & multi-screen targeting
 *  - `employee_recognitions`: Employee of the Month/Quarter/Year records (Excel/CSV ingestible) with vector avatars
 *  - `partner_logos`: Official partner logos rendered at equal optical height in the bottom tagline bar
 */

import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  bigint,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { branches } from "./locations";
import { users } from "./auth";
import { scheduleTargetEnum } from "./schedules";

export const audioMoodEnum = pgEnum("audio_mood", [
  "showroom_lounge",
  "upbeat_promo",
  "corporate_ambient",
  "celebration",
]);

export const promotionMediaTypeEnum = pgEnum("promotion_media_type", [
  "image",
  "video",
  "pdf",
]);

export const recognitionPeriodEnum = pgEnum("recognition_period_type", [
  "month",
  "quarter",
  "year",
  "special",
]);

export const avatarStyleEnum = pgEnum("avatar_style", [
  "illustrated",
  "geometric",
  "crown_badge",
]);

export const audioTracks = pgTable("audio_tracks", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 160 }).notNull(),
  artist: varchar("artist", { length: 120 }).default("Royalty-Free Audio").notNull(),
  moodTag: audioMoodEnum("mood_tag").default("showroom_lounge").notNull(),
  publicUrl: text("public_url").notNull(),
  storagePath: text("storage_path").notNull(),
  mimeType: varchar("mime_type", { length: 100 }).default("audio/mpeg").notNull(),
  fileSizeBytes: bigint("file_size_bytes", { mode: "number" }).default(0).notNull(),
  durationSeconds: integer("duration_seconds").default(180).notNull(),
  volumePercent: integer("volume_percent").default(35).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const promotions = pgTable("promotions", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 180 }).notNull(),
  description: text("description").default("").notNull(),
  agencyName: varchar("agency_name", { length: 120 }).default("Campaign Agency").notNull(),
  campaignCode: varchar("campaign_code", { length: 64 }),
  mediaType: promotionMediaTypeEnum("media_type").default("image").notNull(),
  publicUrl: text("public_url").notNull(),
  storagePath: text("storage_path").notNull(),
  mimeType: varchar("mime_type", { length: 100 }).default("image/webp").notNull(),
  fileSizeBytes: bigint("file_size_bytes", { mode: "number" }).default(0).notNull(),
  sha256Checksum: varchar("sha256_checksum", { length: 64 }).default("").notNull(),
  durationSeconds: integer("duration_seconds").default(15).notNull(),
  displayFitMode: varchar("display_fit_mode", { length: 32 }).default("auto").notNull(),
  audioTrackId: uuid("audio_track_id").references(() => audioTracks.id, {
    onDelete: "set null",
  }),
  targetType: scheduleTargetEnum("target_type").default("global").notNull(),
  targetId: uuid("target_id"),
  targetScreenIds: jsonb("target_screen_ids").$type<string[] | null>(),
  priority: integer("priority").default(50).notNull(),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const employeeRecognitions = pgTable("employee_recognitions", {
  id: uuid("id").defaultRandom().primaryKey(),
  employeeName: varchar("employee_name", { length: 160 }).notNull(),
  locationName: varchar("location_name", { length: 150 }).notNull(),
  branchId: uuid("branch_id").references(() => branches.id, {
    onDelete: "set null",
  }),
  departmentName: varchar("department_name", { length: 120 }).notNull(),
  awardPeriodType: recognitionPeriodEnum("award_period_type").default("month").notNull(),
  awardPeriodLabel: varchar("award_period_label", { length: 80 }).notNull(),
  citation: text("citation").default("").notNull(),
  avatarStyle: avatarStyleEnum("avatar_style").default("illustrated").notNull(),
  avatarSeed: varchar("avatar_seed", { length: 80 }).notNull(),
  accentColor: varchar("accent_color", { length: 24 }).default("#2563eb").notNull(),
  audioTrackId: uuid("audio_track_id").references(() => audioTracks.id, {
    onDelete: "set null",
  }),
  targetType: scheduleTargetEnum("target_type").default("global").notNull(),
  targetId: uuid("target_id"),
  targetScreenIds: jsonb("target_screen_ids").$type<string[] | null>(),
  injectEveryNSlides: integer("inject_every_n_slides").default(6).notNull(),
  durationSeconds: integer("duration_seconds").default(14).notNull(),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const partnerLogos = pgTable("partner_logos", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  logoUrl: text("logo_url").notNull(),
  storagePath: text("storage_path"),
  tagline: varchar("tagline", { length: 160 }),
  sortOrder: integer("sort_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
