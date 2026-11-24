/**
 * @file src/db/schema/locations.ts
 * @description Tenancy & East Africa geography schema: Countries (KE, TZ, UG with
 * currencies & EAT timezones), Regions, and Crown Paints Branches (Showrooms, Depots, Factories, HQ).
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

export interface DayHoursRule {
  open: boolean;
  start: string; // "08:00"
  end: string;   // "18:00"
}

export interface HolidayExceptionRule {
  date: string; // "YYYY-MM-DD"
  label: string;
  mode: "closed" | "open_override";
  start?: string;
  end?: string;
}

export interface BranchOperatingSchedule {
  days: Record<"0" | "1" | "2" | "3" | "4" | "5" | "6", DayHoursRule>; // 0=Sun..6=Sat
  exceptions: HolidayExceptionRule[];
}

export const branchTypeEnum = pgEnum("branch_type", [
  "showroom",
  "depot",
  "factory",
  "hq",
]);

export const countries = pgTable("countries", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 3 }).notNull().unique(), // KE, TZ, UG
  name: varchar("name", { length: 100 }).notNull(),
  currencyCode: varchar("currency_code", { length: 3 }).notNull(), // KES, TZS, UGX
  timezone: varchar("timezone", { length: 64 }).notNull(), // Africa/Nairobi, etc.
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const regions = pgTable("regions", {
  id: uuid("id").defaultRandom().primaryKey(),
  countryId: uuid("country_id")
    .notNull()
    .references(() => countries.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const branches = pgTable("branches", {
  id: uuid("id").defaultRandom().primaryKey(),
  countryId: uuid("country_id")
    .notNull()
    .references(() => countries.id, { onDelete: "cascade" }),
  regionId: uuid("region_id").references(() => regions.id, {
    onDelete: "set null",
  }),
  code: varchar("code", { length: 32 }).notNull().unique(),
  name: varchar("name", { length: 150 }).notNull(),
  branchType: branchTypeEnum("branch_type").default("showroom").notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  address: text("address"),
  phone: varchar("phone", { length: 40 }),
  openingTime: varchar("opening_time", { length: 5 }).default("08:00").notNull(),
  closingTime: varchar("closing_time", { length: 5 }).default("17:30").notNull(),
  operatingSchedule: jsonb("operating_schedule").$type<BranchOperatingSchedule | null>(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
