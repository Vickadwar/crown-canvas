/**
 * @file src/db/schema/index.ts
 * @description Barrel export combining all 8 Drizzle schema modules (22 tables) and their relations.
 */

import { relations } from "drizzle-orm";

export * from "./locations";
export * from "./departments";
export * from "./auth";
export * from "./screens";
export * from "./assets";
export * from "./studio";
export * from "./schedules";
export * from "./analytics";

import { countries, regions, branches } from "./locations";
import { departments } from "./departments";
import { users, userScopes, roles } from "./auth";
import { screenGroups, screens, screenCommands, pairingCodes } from "./screens";
import { mediaAssets, mediaFolders } from "./assets";
import { layouts, dataFeeds, quickPosts, playlists, playlistItems } from "./studio";
import { schedules, emergencyOverrides } from "./schedules";
import { proofOfPlayLogs, qrScanEvents } from "./analytics";

export const countriesRelations = relations(countries, ({ many }) => ({
  regions: many(regions),
  branches: many(branches),
}));

export const regionsRelations = relations(regions, ({ one, many }) => ({
  country: one(countries, {
    fields: [regions.countryId],
    references: [countries.id],
  }),
  branches: many(branches),
}));

export const branchesRelations = relations(branches, ({ one, many }) => ({
  country: one(countries, {
    fields: [branches.countryId],
    references: [countries.id],
  }),
  region: one(regions, {
    fields: [branches.regionId],
    references: [regions.id],
  }),
  screens: many(screens),
}));

export const departmentsRelations = relations(departments, ({ many }) => ({
  mediaAssets: many(mediaAssets),
  playlists: many(playlists),
  quickPosts: many(quickPosts),
  dataFeeds: many(dataFeeds),
  screens: many(screens),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  userScopes: many(userScopes),
}));

export const usersRelations = relations(users, ({ many }) => ({
  scopes: many(userScopes),
}));

export const userScopesRelations = relations(userScopes, ({ one }) => ({
  user: one(users, {
    fields: [userScopes.userId],
    references: [users.id],
  }),
  customRole: one(roles, {
    fields: [userScopes.roleId],
    references: [roles.id],
  }),
  country: one(countries, {
    fields: [userScopes.countryId],
    references: [countries.id],
  }),
  branch: one(branches, {
    fields: [userScopes.branchId],
    references: [branches.id],
  }),
  department: one(departments, {
    fields: [userScopes.departmentId],
    references: [departments.id],
  }),
}));

export const screensRelations = relations(screens, ({ one, many }) => ({
  branch: one(branches, {
    fields: [screens.branchId],
    references: [branches.id],
  }),
  department: one(departments, {
    fields: [screens.departmentId],
    references: [departments.id],
  }),
  group: one(screenGroups, {
    fields: [screens.groupId],
    references: [screenGroups.id],
  }),
  commands: many(screenCommands),
  proofOfPlayLogs: many(proofOfPlayLogs),
}));

export const screenCommandsRelations = relations(screenCommands, ({ one }) => ({
  screen: one(screens, {
    fields: [screenCommands.screenId],
    references: [screens.id],
  }),
}));

export const pairingCodesRelations = relations(pairingCodes, ({ one }) => ({
  claimedScreen: one(screens, {
    fields: [pairingCodes.claimedScreenId],
    references: [screens.id],
  }),
}));

export const mediaAssetsRelations = relations(mediaAssets, ({ one }) => ({
  department: one(departments, {
    fields: [mediaAssets.departmentId],
    references: [departments.id],
  }),
  country: one(countries, {
    fields: [mediaAssets.countryId],
    references: [countries.id],
  }),
  folder: one(mediaFolders, {
    fields: [mediaAssets.folderId],
    references: [mediaFolders.id],
  }),
}));

export const quickPostsRelations = relations(quickPosts, ({ one }) => ({
  department: one(departments, {
    fields: [quickPosts.departmentId],
    references: [departments.id],
  }),
  country: one(countries, {
    fields: [quickPosts.countryId],
    references: [countries.id],
  }),
  dataFeed: one(dataFeeds, {
    fields: [quickPosts.dataFeedId],
    references: [dataFeeds.id],
  }),
}));

export const playlistsRelations = relations(playlists, ({ one, many }) => ({
  department: one(departments, {
    fields: [playlists.departmentId],
    references: [departments.id],
  }),
  country: one(countries, {
    fields: [playlists.countryId],
    references: [countries.id],
  }),
  layout: one(layouts, {
    fields: [playlists.layoutId],
    references: [layouts.id],
  }),
  items: many(playlistItems),
  schedules: many(schedules),
}));

export const playlistItemsRelations = relations(playlistItems, ({ one }) => ({
  playlist: one(playlists, {
    fields: [playlistItems.playlistId],
    references: [playlists.id],
  }),
  mediaAsset: one(mediaAssets, {
    fields: [playlistItems.mediaAssetId],
    references: [mediaAssets.id],
  }),
  quickPost: one(quickPosts, {
    fields: [playlistItems.quickPostId],
    references: [quickPosts.id],
  }),
}));

export const schedulesRelations = relations(schedules, ({ one }) => ({
  playlist: one(playlists, {
    fields: [schedules.playlistId],
    references: [playlists.id],
  }),
}));

export const emergencyOverridesRelations = relations(emergencyOverrides, ({ one }) => ({
  department: one(departments, {
    fields: [emergencyOverrides.departmentId],
    references: [departments.id],
  }),
}));

export const proofOfPlayLogsRelations = relations(proofOfPlayLogs, ({ one }) => ({
  screen: one(screens, {
    fields: [proofOfPlayLogs.screenId],
    references: [screens.id],
  }),
  branch: one(branches, {
    fields: [proofOfPlayLogs.branchId],
    references: [branches.id],
  }),
}));

export const qrScanEventsRelations = relations(qrScanEvents, ({ one }) => ({
  screen: one(screens, {
    fields: [qrScanEvents.screenId],
    references: [screens.id],
  }),
  branch: one(branches, {
    fields: [qrScanEvents.branchId],
    references: [branches.id],
  }),
}));
