/**
 * @file src/lib/permissions.ts
 * @description Canonical granular RBAC permissions registry, built-in system role definitions,
 * CMS navigation tab guards, password policy validator, password expiry evaluator, and
 * cryptographically strong temporary password generator.
 */

import type { NavTab } from "@/components/dashboard/cms-types";

export const ALL_PERMISSIONS = [
  "overview:view",
  "fleet:view",
  "fleet:manage",
  "locations:manage",
  "departments:manage",
  "media:upload",
  "media:approve",
  "media:delete",
  "playlists:manage",
  "schedules:manage",
  "broadcasts:trigger",
  "studio:design",
  "feeds:manage",
  "analytics:view",
  "team:manage",
  "roles:manage",
] as const;

export type RolePermission = (typeof ALL_PERMISSIONS)[number];

export interface PermissionMeta {
  key: RolePermission;
  label: string;
  description: string;
  group: "Network & Fleet" | "Content & Playback" | "Design Studio" | "Data & Governance";
}

export const PERMISSION_CATALOG: PermissionMeta[] = [
  {
    key: "overview:view",
    label: "View Overview Dashboard",
    description: "Access live KPIs, fleet health charts, and activity summary.",
    group: "Network & Fleet",
  },
  {
    key: "fleet:view",
    label: "View Connected Fleet",
    description: "Inspect screen status, snapshots, and currently playing media.",
    group: "Network & Fleet",
  },
  {
    key: "fleet:manage",
    label: "Manage Fleet & Pairing",
    description: "Pair screens, edit/pause displays, reload/clear cache, and manage groups.",
    group: "Network & Fleet",
  },
  {
    key: "locations:manage",
    label: "Manage Locations & Regions",
    description: "Create, edit, pause, or delete showrooms, depots, and regions.",
    group: "Network & Fleet",
  },
  {
    key: "departments:manage",
    label: "Manage Departments",
    description: "Create, edit, colour-code, or deactivate company departments.",
    group: "Network & Fleet",
  },
  {
    key: "media:upload",
    label: "Upload & Link Media",
    description: "Upload compressed videos/images and register external web/YouTube embeds.",
    group: "Content & Playback",
  },
  {
    key: "media:approve",
    label: "Approve Content (Maker-Checker)",
    description: "Auto-approve own uploads and approve/reject pending submissions.",
    group: "Content & Playback",
  },
  {
    key: "media:delete",
    label: "Delete Media Assets",
    description: "Permanently purge media files from cloud storage.",
    group: "Content & Playback",
  },
  {
    key: "playlists:manage",
    label: "Manage Playlists & Layouts",
    description: "Create/edit playlists, drag-reorder slides, change layouts, and edit taglines.",
    group: "Content & Playback",
  },
  {
    key: "schedules:manage",
    label: "Manage Daypart Schedules",
    description: "Create, pause, or delete time-of-day playlist automation rules.",
    group: "Content & Playback",
  },
  {
    key: "broadcasts:trigger",
    label: "Trigger Emergency Broadcasts",
    description: "Push instant alert, clip, or full-playlist takeovers to live displays.",
    group: "Content & Playback",
  },
  {
    key: "studio:design",
    label: "Design in Crown Studio & Templates",
    description: "Create/edit visual slides and manage custom reusable studio templates.",
    group: "Design Studio",
  },
  {
    key: "feeds:manage",
    label: "Manage Data Feeds & Webhooks",
    description: "Create API data feeds, rotate keys, push JSON payloads, and pull remote feeds.",
    group: "Data & Governance",
  },
  {
    key: "analytics:view",
    label: "View Analytics & Executive Reports",
    description: "Inspect Proof-of-Play telemetry, QR scans, audit logs, and SLA reports.",
    group: "Data & Governance",
  },
  {
    key: "team:manage",
    label: "Manage Users & Access",
    description: "Create accounts, reset temporary passwords, assign scopes, and suspend users.",
    group: "Data & Governance",
  },
  {
    key: "roles:manage",
    label: "Manage Roles & Security Policy",
    description: "Create/edit custom roles and configure organization password expiry policy.",
    group: "Data & Governance",
  },
];

export type SystemRoleSlug =
  | "super_admin"
  | "country_manager"
  | "department_lead"
  | "branch_manager"
  | "content_editor"
  | "auditor";

export interface SystemRoleDefinition {
  slug: SystemRoleSlug;
  name: string;
  description: string;
  color: "purple" | "info" | "success" | "warning" | "outline" | "danger";
  permissions: RolePermission[];
}

export const SYSTEM_ROLE_DEFINITIONS: SystemRoleDefinition[] = [
  {
    slug: "super_admin",
    name: "Super Admin",
    description: "Unrestricted platform administrator with full network, role, and security control.",
    color: "purple",
    permissions: [...ALL_PERMISSIONS],
  },
  {
    slug: "country_manager",
    name: "Regional Manager",
    description: "Full operational & approval authority across assigned regions and showrooms.",
    color: "info",
    permissions: [
      "overview:view",
      "fleet:view",
      "fleet:manage",
      "locations:manage",
      "departments:manage",
      "media:upload",
      "media:approve",
      "media:delete",
      "playlists:manage",
      "schedules:manage",
      "broadcasts:trigger",
      "studio:design",
      "feeds:manage",
      "analytics:view",
      "team:manage",
    ],
  },
  {
    slug: "department_lead",
    name: "Department Lead",
    description: "Publishes, designs, and approves content for assigned departments.",
    color: "success",
    permissions: [
      "overview:view",
      "fleet:view",
      "media:upload",
      "media:approve",
      "media:delete",
      "playlists:manage",
      "schedules:manage",
      "broadcasts:trigger",
      "studio:design",
      "feeds:manage",
      "analytics:view",
    ],
  },
  {
    slug: "branch_manager",
    name: "Location Manager",
    description: "Operates local showroom screens and submits content for Maker-Checker approval.",
    color: "warning",
    permissions: [
      "overview:view",
      "fleet:view",
      "fleet:manage",
      "media:upload",
      "playlists:manage",
      "schedules:manage",
      "studio:design",
      "analytics:view",
    ],
  },
  {
    slug: "content_editor",
    name: "Content Editor",
    description: "Uploads media and designs studio slides (requires approval before TV playback).",
    color: "info",
    permissions: [
      "overview:view",
      "media:upload",
      "playlists:manage",
      "studio:design",
    ],
  },
  {
    slug: "auditor",
    name: "Read-Only Auditor",
    description: "Inspects network health, playback analytics, and compliance audit logs (read-only).",
    color: "outline",
    permissions: ["overview:view", "fleet:view", "analytics:view"],
  },
];

const SYSTEM_ROLE_MAP = new Map<string, SystemRoleDefinition>(
  SYSTEM_ROLE_DEFINITIONS.map((r) => [r.slug, r])
);

export function getSystemRolePermissions(roleSlug: string): RolePermission[] {
  return SYSTEM_ROLE_MAP.get(roleSlug)?.permissions ?? [];
}

export function getSystemRoleName(roleSlug: string): string {
  return SYSTEM_ROLE_MAP.get(roleSlug)?.name ?? roleSlug.replace(/_/g, " ");
}

export interface ScopePermissionInput {
  role: string;
  roleId?: string | null;
}

export function resolveEffectivePermissions(
  scopes: ScopePermissionInput[],
  customRolesById?: Map<string, { permissions: RolePermission[] }>
): RolePermission[] {
  const granted = new Set<RolePermission>();

  for (const scope of scopes) {
    if (scope.role === "super_admin") {
      return [...ALL_PERMISSIONS];
    }
    if (scope.roleId && customRolesById?.has(scope.roleId)) {
      const customPerms = customRolesById.get(scope.roleId)?.permissions ?? [];
      for (const p of customPerms) granted.add(p);
    } else {
      for (const p of getSystemRolePermissions(scope.role)) {
        granted.add(p);
      }
    }
  }

  return Array.from(granted);
}

export function hasPermission(
  permissions: readonly RolePermission[],
  required: RolePermission
): boolean {
  return permissions.includes(required);
}

export function canAccessTab(
  permissions: readonly RolePermission[],
  tab: NavTab
): boolean {
  switch (tab) {
    case "overview":
      return permissions.length > 0;
    case "fleet":
      return permissions.includes("fleet:view") || permissions.includes("fleet:manage");
    case "showrooms":
      return permissions.includes("locations:manage") || permissions.includes("fleet:view");
    case "departments":
      return permissions.includes("departments:manage") || permissions.includes("overview:view");
    case "media":
      return (
        permissions.includes("media:upload") ||
        permissions.includes("media:approve") ||
        permissions.includes("media:delete")
      );
    case "playlists":
      return permissions.includes("playlists:manage");
    case "schedules":
      return permissions.includes("schedules:manage");
    case "broadcasts":
      return permissions.includes("broadcasts:trigger");
    case "templates":
    case "studio":
      return permissions.includes("studio:design");
    case "feeds":
      return permissions.includes("feeds:manage");
    case "analytics":
      return permissions.includes("analytics:view") || permissions.includes("media:approve");
    case "team":
      return permissions.includes("team:manage") || permissions.includes("roles:manage");
    default:
      return false;
  }
}

export interface PasswordPolicyConfig {
  passwordExpiryDays: number; // 0 = never expires
  minPasswordLength: number;
  requireUppercase: boolean;
  requireNumber: boolean;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicyConfig = {
  passwordExpiryDays: 90,
  minPasswordLength: 8,
  requireUppercase: true,
  requireNumber: true,
};

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

export function validatePasswordPolicy(
  password: string,
  policy: PasswordPolicyConfig = DEFAULT_PASSWORD_POLICY,
  currentPassword?: string
): PasswordValidationResult {
  const errors: string[] = [];
  if (password.length < policy.minPasswordLength) {
    errors.push(`At least ${policy.minPasswordLength} characters required`);
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push("Must include at least one uppercase letter (A-Z)");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("Must include at least one lowercase letter (a-z)");
  }
  if (policy.requireNumber && !/[0-9]/.test(password)) {
    errors.push("Must include at least one number (0-9)");
  }
  if (currentPassword && password === currentPassword) {
    errors.push("New password must be different from your current password");
  }
  return { valid: errors.length === 0, errors };
}

export interface PasswordExpiryStatus {
  expired: boolean;
  expiresInDays: number | null;
  expiresAt: string | null;
}

export function computePasswordExpiryStatus(
  passwordChangedAt: Date | string | null | undefined,
  passwordExpiryDays: number,
  nowMs: number = Date.now()
): PasswordExpiryStatus {
  if (!passwordExpiryDays || passwordExpiryDays <= 0) {
    return { expired: false, expiresInDays: null, expiresAt: null };
  }
  const changedMs = passwordChangedAt
    ? new Date(passwordChangedAt).getTime()
    : nowMs;
  if (!Number.isFinite(changedMs)) {
    return { expired: false, expiresInDays: passwordExpiryDays, expiresAt: null };
  }
  const expiryMs = changedMs + passwordExpiryDays * 24 * 60 * 60 * 1000;
  const remainingMs = expiryMs - nowMs;
  const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
  return {
    expired: remainingMs <= 0,
    expiresInDays: Math.max(0, remainingDays),
    expiresAt: new Date(expiryMs).toISOString(),
  };
}

/**
 * Generates a readable, policy-compliant temporary password avoiding ambiguous
 * glyphs (0/O, 1/l/I) so admins can share it cleanly over phone/chat/print.
 */
export function generateTemporaryPassword(length = 12): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#%&*";
  const all = upper + lower + digits + symbols;

  const targetLen = Math.max(10, length);
  const bytes = new Uint8Array(targetLen + 4);
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  const chars: string[] = [
    upper[bytes[0] % upper.length],
    lower[bytes[1] % lower.length],
    digits[bytes[2] % digits.length],
    symbols[bytes[3] % symbols.length],
  ];
  for (let i = 4; i < targetLen; i++) {
    chars.push(all[bytes[i] % all.length]);
  }
  // Fisher-Yates shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = bytes[i % bytes.length] % (i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }
  return chars.join("");
}
