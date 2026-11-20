/**
 * @file src/db/schema/departments.ts
 * @description Organizational departments schema (ICT, SHE, Marketing, Customer Service,
 * Sales, HR, Production) used for content ownership, visual badging, and RBAC scoping.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

export const departments = pgTable("departments", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 32 }).notNull().unique(), // ICT, SHE, MARKETING, CUSTOMER_SERVICE, HR, SALES, PRODUCTION
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  accentColor: varchar("accent_color", { length: 16 }).default("#1d4ed8").notNull(),
  icon: varchar("icon", { length: 48 }).default("Building2").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
