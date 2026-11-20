/**
 * @file src/db/schema/assets.ts
 * @description Media library schema: `media_folders` and `media_assets` storing Supabase Storage
 * paths, SHA-256 checksums (for zero-buffering offline player sync), and department ownership.
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
  timestamp,
} from "drizzle-orm/pg-core";
import { countries } from "./locations";
import { departments } from "./departments";
import { users } from "./auth";

export const mediaTypeEnum = pgEnum("media_type", [
  "video",
  "image",
  "web_url",
  "pdf",
]);

export const approvalStatusEnum = pgEnum("approval_status", [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
]);

export const mediaFolders = pgTable("media_folders", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  departmentId: uuid("department_id").references(() => departments.id, {
    onDelete: "set null",
  }),
  parentId: uuid("parent_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const mediaAssets = pgTable("media_assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 180 }).notNull(),
  description: text("description"),
  mediaType: mediaTypeEnum("media_type").notNull(),
  storagePath: text("storage_path").notNull(),
  publicUrl: text("public_url").notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  fileSizeBytes: bigint("file_size_bytes", { mode: "number" }).default(0).notNull(),
  sha256Checksum: varchar("sha256_checksum", { length: 64 }).notNull(),
  durationSeconds: integer("duration_seconds").default(15).notNull(),
  width: integer("width"),
  height: integer("height"),
  thumbnailUrl: text("thumbnail_url"),
  departmentId: uuid("department_id")
    .notNull()
    .references(() => departments.id, { onDelete: "restrict" }),
  countryId: uuid("country_id").references(() => countries.id, {
    onDelete: "set null",
  }), // Null = available across KE, TZ, UG
  folderId: uuid("folder_id").references(() => mediaFolders.id, {
    onDelete: "set null",
  }),
  uploadedBy: uuid("uploaded_by").references(() => users.id, {
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
