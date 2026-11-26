/**
 * @file src/db/schema/schedules.ts
 * @description Scheduling & Broadcast schema: priority-based dayparting `schedules`
 * (Customer Mode vs Staff Mode) and instant `emergency_overrides`.
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
import { departments } from "./departments";
import { users } from "./auth";
import { mediaAssets } from "./assets";
import { playlists } from "./studio";
import { screenRoleEnum } from "./screens";

export const scheduleTargetEnum = pgEnum("schedule_target_type", [
  "screen",
  "screen_group",
  "branch",
  "country",
  "screen_role",
  "global",
]);

export const overrideSeverityEnum = pgEnum("override_severity", [
  "info",
  "warning",
  "critical",
]);

export const overrideKindEnum = pgEnum("override_kind", [
  "alert",
  "media_asset",
  "playlist",
]);

export interface ScheduleRotationStep {
  kind: "playlist" | "promotions" | "recognitions";
  playlistId?: string | null;
  label?: string;
  durationMinutes: number; // How many minutes this step airs before rotating to the next step
}

export const schedules = pgTable("schedules", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 150 }).notNull(),
  playlistId: uuid("playlist_id")
    .notNull()
    .references(() => playlists.id, { onDelete: "cascade" }),
  targetType: scheduleTargetEnum("target_type").notNull(),
  targetId: uuid("target_id"), // Null when targetType is global or screen_role
  targetScreenRole: screenRoleEnum("target_screen_role"),
  priority: integer("priority").default(10).notNull(),
  startDate: timestamp("start_date", { withTimezone: true }),
  endDate: timestamp("end_date", { withTimezone: true }),
  daysOfWeek: jsonb("days_of_week").$type<number[]>().default([0, 1, 2, 3, 4, 5, 6]).notNull(),
  daypartStart: varchar("daypart_start", { length: 5 }).default("00:00").notNull(),
  daypartEnd: varchar("daypart_end", { length: 5 }).default("23:59").notNull(),
  rotationSequence: jsonb("rotation_sequence").$type<ScheduleRotationStep[] | null>(),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const emergencyOverrides = pgTable("emergency_overrides", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 180 }).notNull(),
  message: text("message").default("").notNull(),
  overrideKind: overrideKindEnum("override_kind").default("alert").notNull(),
  mediaAssetId: uuid("media_asset_id").references(() => mediaAssets.id, {
    onDelete: "set null",
  }),
  playlistId: uuid("playlist_id").references(() => playlists.id, {
    onDelete: "set null",
  }),
  severity: overrideSeverityEnum("severity").default("warning").notNull(),
  departmentId: uuid("department_id").references(() => departments.id, {
    onDelete: "set null",
  }),
  targetType: scheduleTargetEnum("target_type").default("global").notNull(),
  targetId: uuid("target_id"),
  targetScreenIds: jsonb("target_screen_ids").$type<string[] | null>(),
  isActive: boolean("is_active").default(true).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
