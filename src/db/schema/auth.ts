/**
 * @file src/db/schema/auth.ts
 * @description Identity, Custom Roles & Granular Permissions, Password Policy, Scoped RBAC,
 * and Audit schema: `roles`, `auth_settings`, `users` (synced with Supabase Auth),
 * `user_scopes`, and immutable `audit_logs`.
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
import type { RolePermission } from "@/lib/permissions";

export const userRoleEnum = pgEnum("user_role", [
  "super_admin",
  "country_manager",
  "department_lead",
  "branch_manager",
  "content_editor",
  "auditor",
]);

export const roles = pgTable("roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 24 }).default("info").notNull(),
  isSystem: boolean("is_system").default(false).notNull(),
  permissions: jsonb("permissions")
    .$type<RolePermission[]>()
    .default([])
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const authSettings = pgTable("auth_settings", {
  id: varchar("id", { length: 32 }).primaryKey().default("default"),
  passwordExpiryDays: integer("password_expiry_days").default(90).notNull(),
  minPasswordLength: integer("min_password_length").default(8).notNull(),
  requireUppercase: boolean("require_uppercase").default(true).notNull(),
  requireNumber: boolean("require_number").default(true).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey(), // Matches Supabase Auth user UUID
  email: varchar("email", { length: 255 }).notNull().unique(),
  fullName: varchar("full_name", { length: 150 }).notNull(),
  avatarUrl: text("avatar_url"),
  isActive: boolean("is_active").default(true).notNull(),
  mustChangePassword: boolean("must_change_password").default(false).notNull(),
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const userScopes = pgTable("user_scopes", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: userRoleEnum("role").default("content_editor").notNull(),
  roleId: uuid("role_id").references(() => roles.id, { onDelete: "set null" }),
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
