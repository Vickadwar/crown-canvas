/**
 * @file src/db/schema/auth.ts
 * @description Identity, Scoped RBAC, and Audit schema: `users` (synced with Supabase Auth),
 * `user_scopes` (role + country/branch/department scopes), and immutable `audit_logs`.
 */

import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { countries, branches } from "./locations";
import { departments } from "./departments";

export const userRoleEnum = pgEnum("user_role", [
  "super_admin",
  "country_manager",
  "department_lead",
  "branch_manager",
  "content_editor",
  "auditor",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey(), // Matches Supabase Auth user UUID
  email: varchar("email", { length: 255 }).notNull().unique(),
  fullName: varchar("full_name", { length: 150 }).notNull(),
  avatarUrl: text("avatar_url"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const userScopes = pgTable("user_scopes", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: userRoleEnum("role").default("content_editor").notNull(),
  countryId: uuid("country_id").references(() => countries.id, {
    onDelete: "cascade",
  }),
  branchId: uuid("branch_id").references(() => branches.id, {
    onDelete: "cascade",
  }),
  departmentId: uuid("department_id").references(() => departments.id, {
    onDelete: "cascade",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 80 }).notNull(),
  entityType: varchar("entity_type", { length: 64 }).notNull(),
  entityId: uuid("entity_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  ipAddress: varchar("ip_address", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
