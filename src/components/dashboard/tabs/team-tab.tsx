"use client";

/**
 * @file src/components/dashboard/tabs/team-tab.tsx
 * @description Full 360° Team, Custom Roles & Password Policy workspace:
 * 1) Users & Access: Zero-email account creation with temporary passwords, forced
 *    first-login change, multi-role/scope assignment, admin temp-password reset,
 *    suspend/reactivate with instant lockout, and safe user deletion.
 * 2) Roles & Permissions: Create, edit, clone, and delete custom roles via a 16-permission matrix.
 * 3) Password Policy: Configure password expiry days (0 = never) and complexity rules.
 */

import { useMemo, useState } from "react";
import {
  Check,
  Clock,
  Copy,
  Edit3,
  KeyRound,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModernSelect } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  DEFAULT_PASSWORD_POLICY,
  PERMISSION_CATALOG,
  computePasswordExpiryStatus,
  generateTemporaryPassword,
  type RolePermission,
} from "@/lib/permissions";
import type { OverviewPayload, RoleItem, TeamUserItem } from "../cms-types";

interface TeamTabProps {
  data: OverviewPayload;
  onRefresh: () => Promise<void>;
}

type BadgeVariant = "purple" | "info" | "success" | "warning" | "outline" | "danger";

const VALID_BADGES = new Set<string>([
  "purple",
  "info",
  "success",
  "warning",
  "outline",
  "danger",
]);

function asBadgeVariant(color?: string | null): BadgeVariant {
  if (color && VALID_BADGES.has(color)) return color as BadgeVariant;
  return "info";
}

const ROLE_COLOR_OPTIONS: Array<{ value: BadgeVariant; label: string; dot: string }> = [
  { value: "purple", label: "Violet", dot: "bg-violet-500" },
  { value: "info", label: "Blue", dot: "bg-blue-500" },
  { value: "success", label: "Emerald", dot: "bg-emerald-500" },
  { value: "warning", label: "Amber", dot: "bg-amber-500" },
  { value: "danger", label: "Rose", dot: "bg-rose-500" },
  { value: "outline", label: "Slate", dot: "bg-zinc-500" },
];

const EXPIRY_PRESETS = [
  { days: 0, label: "Never" },
  { days: 30, label: "30 days" },
  { days: 60, label: "60 days" },
  { days: 90, label: "90 days" },
  { days: 180, label: "180 days" },
  { days: 365, label: "365 days" },
];

export function TeamTab({ data, onRefresh }: TeamTabProps) {
  const confirm = useConfirm();
  const [subTab, setSubTab] = useState<"users" | "roles" | "policy">("users");

  // Shared lookup maps
  const countryById = useMemo(
    () => new Map(data.countries.map((c) => [c.id, c])),
    [data.countries]
  );
  const branchById = useMemo(
    () => new Map(data.branches.map((b) => [b.id, b])),
    [data.branches]
  );
  const deptById = useMemo(
    () => new Map(data.departments.map((d) => [d.id, d])),
    [data.departments]
  );
  const rolesList = useMemo(() => data.roles ?? [], [data.roles]);
  const policy = data.authPolicy ?? DEFAULT_PASSWORD_POLICY;

  // ── 1. Users Sub-tab State ────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newFullName, setNewFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newTempPassword, setNewTempPassword] = useState(() =>
    generateTemporaryPassword(12)
  );
  const [newRoleId, setNewRoleId] = useState<string>(
    rolesList.find((r) => r.slug === "branch_manager")?.id ??
      rolesList[0]?.id ??
      ""
  );
  const [newCountryId, setNewCountryId] = useState("");
  const [newBranchId, setNewBranchId] = useState("");
  const [newDeptId, setNewDeptId] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);

  // Issued one-time temporary credentials banner
  const [issuedCreds, setIssuedCreds] = useState<{
    heading: string;
    fullName: string;
    email: string;
    temporaryPassword: string;
  } | null>(null);
  const [copiedCreds, setCopiedCreds] = useState(false);

  // Add scope inline per user
  const [addingScopeUserId, setAddingScopeUserId] = useState<string | null>(null);
  const [scopeRoleId, setScopeRoleId] = useState(rolesList[0]?.id ?? "");
  const [scopeCountryId, setScopeCountryId] = useState("");
  const [scopeBranchId, setScopeBranchId] = useState("");
  const [scopeDeptId, setScopeDeptId] = useState("");
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  // ── 2. Roles Sub-tab State ────────────────────────────────────────────────
  const [showRoleBuilder, setShowRoleBuilder] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null);
  const [roleName, setRoleName] = useState("");
  const [roleDesc, setRoleDesc] = useState("");
  const [roleColor, setRoleColor] = useState<BadgeVariant>("info");
  const [rolePerms, setRolePerms] = useState<RolePermission[]>([
    "overview:view",
    "media:upload",
    "studio:design",
  ]);
  const [savingRole, setSavingRole] = useState(false);

  // ── 3. Password Policy Sub-tab State ──────────────────────────────────────
  const [expiryDays, setExpiryDays] = useState(policy.passwordExpiryDays);
  const [minLen, setMinLen] = useState(policy.minPasswordLength);
  const [reqUpper, setReqUpper] = useState(policy.requireUppercase);
  const [reqNum, setReqNum] = useState(policy.requireNumber);
  const [savingPolicy, setSavingPolicy] = useState(false);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.teamUsers.filter((u) => {
      const active = u.isActive !== false;
      if (statusFilter === "active" && !active) return false;
      if (statusFilter === "suspended" && active) return false;
      if (!q) return true;
      return (
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
      );
    });
  }, [data.teamUsers, search, statusFilter]);

  const permissionGroups = useMemo(() => {
    const groups = new Map<string, typeof PERMISSION_CATALOG>();
    for (const p of PERMISSION_CATALOG) {
      const list = groups.get(p.group) ?? [];
      list.push(p);
      groups.set(p.group, list);
    }
    return Array.from(groups.entries());
  }, []);

  // ── User Handlers ─────────────────────────────────────────────────────────

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!newFullName.trim() || !newEmail.trim()) return;
    setCreatingUser(true);
    try {
      const chosenRole = rolesList.find((r) => r.id === newRoleId);
      const isValidUuid =
        newRoleId && !newRoleId.startsWith("sys-");

      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "create",
          fullName: newFullName.trim(),
          email: newEmail.trim().toLowerCase(),
          temporaryPassword: newTempPassword.trim() || undefined,
          roleId: isValidUuid ? newRoleId : null,
          role:
            chosenRole &&
            [
              "super_admin",
              "country_manager",
              "department_lead",
              "branch_manager",
              "content_editor",
              "auditor",
            ].includes(chosenRole.slug)
              ? chosenRole.slug
              : undefined,
          countryId: newCountryId || null,
          branchId: newBranchId || null,
          departmentId: newDeptId || null,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        temporaryPassword?: string | null;
      };
      if (!res.ok) {
        toast.error(json.error || "Failed to create user");
        return;
      }

      if (json.temporaryPassword) {
        setIssuedCreds({
          heading: "Account Created — Share Temporary Credentials",
          fullName: newFullName.trim(),
          email: newEmail.trim().toLowerCase(),
          temporaryPassword: json.temporaryPassword,
        });
        setCopiedCreds(false);
      }

      toast.success(`Created account for ${newFullName.trim()}`);
      setNewFullName("");
      setNewEmail("");
      setNewTempPassword(generateTemporaryPassword(12));
      setNewCountryId("");
      setNewBranchId("");
      setNewDeptId("");
      setShowCreateUser(false);
      await onRefresh();
    } finally {
      setCreatingUser(false);
    }
  }

  async function handleAddScopeToUser(user: TeamUserItem) {
    setBusyUserId(user.id);
    try {
      const chosenRole = rolesList.find((r) => r.id === scopeRoleId);
      const isValidUuid = scopeRoleId && !scopeRoleId.startsWith("sys-");
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "scope_only",
          email: user.email,
          fullName: user.fullName,
          roleId: isValidUuid ? scopeRoleId : null,
          role:
            chosenRole &&
            [
              "super_admin",
              "country_manager",
              "department_lead",
              "branch_manager",
              "content_editor",
              "auditor",
            ].includes(chosenRole.slug)
              ? chosenRole.slug
              : undefined,
          countryId: scopeCountryId || null,
          branchId: scopeBranchId || null,
          departmentId: scopeDeptId || null,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(json.error || "Failed to assign role scope");
        return;
      }
      toast.success(`Added role to ${user.fullName}`);
      setAddingScopeUserId(null);
      setScopeCountryId("");
      setScopeBranchId("");
      setScopeDeptId("");
      await onRefresh();
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleRemoveScope(scopeId: string) {
    const res = await fetch(`/api/users/scopes/${scopeId}`, {
      method: "DELETE",
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toast.error(json.error || "Failed to remove role scope");
      return;
    }
    toast.success("Role scope removed");
    await onRefresh();
  }

  async function handleResetUserPassword(user: TeamUserItem) {
    const ok = await confirm({
      title: `Reset ${user.fullName}'s password?`,
      description:
        "A new temporary password will be issued, all active sessions will be signed out immediately, and they will be forced to set a new password on next login.",
      confirmLabel: "Issue Temporary Password",
      variant: "warning",
    });
    if (!ok) return;
    setBusyUserId(user.id);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset_password" }),
      });
      const json = (await res.json()) as {
        error?: string;
        temporaryPassword?: string;
      };
      if (!res.ok || !json.temporaryPassword) {
        toast.error(json.error || "Failed to reset password");
        return;
      }
      setIssuedCreds({
        heading: "Password Reset — Share New Temporary Password",
        fullName: user.fullName,
        email: user.email,
        temporaryPassword: json.temporaryPassword,
      });
      setCopiedCreds(false);
      toast.success(`Temporary password generated for ${user.fullName}`);
      await onRefresh();
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleToggleSuspend(user: TeamUserItem) {
    const nextActive = user.isActive === false;
    setBusyUserId(user.id);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_active", isActive: nextActive }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(json.error || "Failed to update user status");
        return;
      }
      toast.success(
        nextActive
          ? `Reactivated ${user.fullName}`
          : `Suspended ${user.fullName} & revoked sessions`
      );
      await onRefresh();
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleDeleteUser(user: TeamUserItem) {
    const ok = await confirm({
      title: `Delete ${user.fullName}?`,
      description: `This permanently deletes ${user.email} and revokes all access immediately. This action cannot be undone.`,
      confirmLabel: "Delete Account",
      variant: "danger",
    });
    if (!ok) return;
    setBusyUserId(user.id);
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(json.error || "Failed to delete user");
        return;
      }
      toast.success(`Deleted ${user.fullName}`);
      await onRefresh();
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleCopyCredentials() {
    if (!issuedCreds) return;
    const text = `Crown Canvas Sign-In\nURL: ${window.location.origin}/login\nEmail: ${issuedCreds.email}\nTemporary Password: ${issuedCreds.temporaryPassword}\nNote: You will be prompted to set a new personal password on first sign-in.`;
    await navigator.clipboard.writeText(text);
    setCopiedCreds(true);
    toast.success("Credentials copied to clipboard");
  }

  // ── Role Handlers ─────────────────────────────────────────────────────────

  function openNewRoleBuilder() {
    setEditingRole(null);
    setRoleName("");
    setRoleDesc("");
    setRoleColor("info");
    setRolePerms(["overview:view", "media:upload", "studio:design"]);
    setShowRoleBuilder(true);
  }

  function openEditRole(r: RoleItem) {
    setEditingRole(r);
    setRoleName(r.name);
    setRoleDesc(r.description ?? "");
    setRoleColor(asBadgeVariant(r.color));
    setRolePerms([...r.permissions]);
    setShowRoleBuilder(true);
  }

  function openCloneRole(r: RoleItem) {
    setEditingRole(null);
    setRoleName(`${r.name} Copy`);
    setRoleDesc(r.description ?? "");
    setRoleColor(asBadgeVariant(r.color));
    setRolePerms([...r.permissions]);
    setShowRoleBuilder(true);
  }

  function togglePermission(perm: RolePermission) {
    setRolePerms((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  }

  async function handleSaveRole(e: React.FormEvent) {
    e.preventDefault();
    if (!roleName.trim() || rolePerms.length === 0) {
      toast.error("Provide a role name and at least one permission.");
      return;
    }
    setSavingRole(true);
    try {
      const isEdit = Boolean(editingRole && !editingRole.id.startsWith("sys-"));
      const res = await fetch(
        isEdit ? `/api/roles/${editingRole!.id}` : "/api/roles",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: roleName.trim(),
            description: roleDesc.trim() || null,
            color: roleColor,
            permissions:
              editingRole?.slug === "super_admin" ? undefined : rolePerms,
          }),
        }
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(json.error || "Failed to save role");
        return;
      }
      toast.success(
        isEdit ? `Updated role "${roleName.trim()}"` : `Created custom role "${roleName.trim()}"`
      );
      setShowRoleBuilder(false);
      setEditingRole(null);
      await onRefresh();
    } finally {
      setSavingRole(false);
    }
  }

  async function handleDeleteRole(r: RoleItem) {
    const ok = await confirm({
      title: `Delete custom role "${r.name}"?`,
      description:
        "This removes the custom role definition permanently. Users currently assigned this role must be reassigned first.",
      confirmLabel: "Delete Role",
      variant: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/roles/${r.id}`, { method: "DELETE" });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toast.error(json.error || "Failed to delete role");
      return;
    }
    toast.success(`Deleted role "${r.name}"`);
    await onRefresh();
  }

  // ── Policy Handler ────────────────────────────────────────────────────────

  async function handleSavePolicy(e: React.FormEvent) {
    e.preventDefault();
    setSavingPolicy(true);
    try {
      const res = await fetch("/api/auth/policy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passwordExpiryDays: Math.max(0, Math.min(3650, Number(expiryDays) || 0)),
          minPasswordLength: Math.max(6, Math.min(32, Number(minLen) || 8)),
          requireUppercase: reqUpper,
          requireNumber: reqNum,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(json.error || "Failed to update password policy");
        return;
      }
      toast.success("Password policy updated across all user accounts");
      await onRefresh();
    } finally {
      setSavingPolicy(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Sub-Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-1">
          {[
            {
              id: "users" as const,
              label: `Users & Access (${data.teamUsers.length})`,
              icon: Users,
            },
            {
              id: "roles" as const,
              label: `Roles & Permissions (${rolesList.length})`,
              icon: Shield,
            },
            {
              id: "policy" as const,
              label: "Password Policy",
              icon: SlidersHorizontal,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? "bg-white text-zinc-950 shadow-2xs ring-1 ring-zinc-200/80"
                    : "text-zinc-500 hover:text-zinc-900"
                }`}
              >
                <Icon className="size-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={policy.passwordExpiryDays > 0 ? "info" : "outline"}>
            <Clock className="size-3" />
            {policy.passwordExpiryDays > 0
              ? `Passwords expire every ${policy.passwordExpiryDays}d`
              : "Password expiry: Off"}
          </Badge>
          {subTab === "users" && (
            <Button
              size="sm"
              onClick={() => {
                setNewTempPassword(generateTemporaryPassword(12));
                setShowCreateUser((v) => !v);
              }}
            >
              <UserPlus className="size-3.5" />
              Create User
            </Button>
          )}
          {subTab === "roles" && (
            <Button size="sm" onClick={openNewRoleBuilder}>
              <Plus className="size-3.5" />
              Create Custom Role
            </Button>
          )}
        </div>
      </div>

      {/* One-Time Temporary Credentials Banner */}
      {issuedCreds && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-xs text-emerald-950 shadow-xs">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-900">
                <ShieldCheck className="size-4 text-emerald-600" />
                {issuedCreds.heading}
              </p>
              <p className="text-emerald-800">
                Share these one-time credentials with{" "}
                <strong>{issuedCreds.fullName}</strong>. They will be{" "}
                <strong>forced to change this password</strong> immediately on their next sign-in.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-white px-3 py-2 font-mono text-xs text-zinc-900">
                <span>
                  <span className="text-zinc-400">Email:</span> {issuedCreds.email}
                </span>
                <span className="text-zinc-300">|</span>
                <span>
                  <span className="text-zinc-400">Temp Password:</span>{" "}
                  <strong className="select-all text-blue-700">
                    {issuedCreds.temporaryPassword}
                  </strong>
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="default" onClick={handleCopyCredentials}>
                {copiedCreds ? (
                  <Check className="size-3.5" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                {copiedCreds ? "Copied!" : "Copy Credentials"}
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={() => setIssuedCreds(null)}
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────── TAB 1: USERS & ACCESS ────────────────────── */}
      {subTab === "users" && (
        <div className="space-y-4">
          {showCreateUser && (
            <Card className="border-zinc-200 bg-white">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <UserPlus className="size-4 text-blue-600" />
                    Create User Account (Temporary Password)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Account is activated immediately — user must replace the temporary password on first login.
                  </CardDescription>
                </div>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => setShowCreateUser(false)}
                >
                  <X className="size-4" />
                </Button>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateUser} className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Full Name</Label>
                      <Input
                        className="h-8 text-xs"
                        placeholder="Jane Doe"
                        value={newFullName}
                        onChange={(e) => setNewFullName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Work Email</Label>
                      <Input
                        type="email"
                        className="h-8 text-xs"
                        placeholder="jane@company.com"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Temporary Password</Label>
                      <div className="flex gap-1.5">
                        <Input
                          className="h-8 font-mono text-xs"
                          value={newTempPassword}
                          onChange={(e) => setNewTempPassword(e.target.value)}
                          required
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 shrink-0 px-2.5"
                          title="Generate strong temporary password"
                          onClick={() =>
                            setNewTempPassword(generateTemporaryPassword(12))
                          }
                        >
                          <RefreshCw className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="space-y-1">
                      <Label className="text-xs">Assigned Role</Label>
                      <ModernSelect
                        size="sm"
                        value={newRoleId}
                        onValueChange={setNewRoleId}
                        options={rolesList.map((r) => ({
                          value: r.id,
                          label: r.isSystem ? r.name : `${r.name} (Custom)`,
                        }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Region Scope</Label>
                      <ModernSelect
                        size="sm"
                        value={newCountryId}
                        onValueChange={setNewCountryId}
                        options={[
                          { value: "", label: "All Regions" },
                          ...data.countries.map((c) => ({
                            value: c.id,
                            label: `${c.code} — ${c.name}`,
                          })),
                        ]}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Location Scope</Label>
                      <ModernSelect
                        size="sm"
                        value={newBranchId}
                        onValueChange={setNewBranchId}
                        options={[
                          { value: "", label: "All Locations" },
                          ...data.branches.map((b) => ({
                            value: b.id,
                            label: `${b.code} — ${b.name}`,
                          })),
                        ]}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Department Scope</Label>
                      <ModernSelect
                        size="sm"
                        value={newDeptId}
                        onValueChange={setNewDeptId}
                        options={[
                          { value: "", label: "All Departments" },
                          ...data.departments.map((d) => ({
                            value: d.id,
                            label: d.name,
                          })),
                        ]}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setShowCreateUser(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" disabled={creatingUser}>
                      <UserPlus className="size-3.5" />
                      {creatingUser ? "Creating Account..." : "Create Account"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Filter & Search Row */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="relative w-72">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-zinc-400" />
              <Input
                className="h-8 bg-white pl-8 text-xs"
                placeholder="Search users by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-1">
              {(["all", "active", "suspended"] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${
                    statusFilter === st
                      ? "bg-zinc-950 text-white"
                      : "border border-zinc-200 bg-white text-zinc-600 hover:text-zinc-950"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* User Directory */}
          {filteredUsers.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center text-xs text-zinc-500">
                No user accounts found. Click <strong>Create User</strong> above to provision your first team member.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {filteredUsers.map((u) => {
                const isActive = u.isActive !== false;
                const expiry = computePasswordExpiryStatus(
                  u.passwordChangedAt,
                  policy.passwordExpiryDays
                );
                const isSelf = data.session?.userId === u.id;
                const isBusy = busyUserId === u.id;

                return (
                  <Card
                    key={u.id}
                    className={`border-zinc-200 bg-white transition ${
                      !isActive ? "opacity-75" : ""
                    }`}
                  >
                    <CardContent className="space-y-3 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-zinc-950">
                              {u.fullName}
                            </p>
                            {isSelf && (
                              <Badge variant="outline" className="text-[10px]">
                                You
                              </Badge>
                            )}
                            <Badge
                              variant={isActive ? "success" : "danger"}
                              className="text-[10px]"
                            >
                              {isActive ? "Active" : "Suspended"}
                            </Badge>
                            {u.mustChangePassword && (
                              <Badge variant="warning" className="text-[10px]">
                                Temp Password Pending
                              </Badge>
                            )}
                            {!u.mustChangePassword && expiry.expired && (
                              <Badge variant="danger" className="text-[10px]">
                                Password Expired
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-zinc-500">
                            {u.email}
                            {u.lastLoginAt && (
                              <span className="ml-2 text-zinc-400">
                                • Last active{" "}
                                {new Date(u.lastLoginAt).toLocaleDateString()}
                              </span>
                            )}
                            {!u.mustChangePassword &&
                              !expiry.expired &&
                              expiry.expiresInDays !== null && (
                                <span className="ml-2 text-zinc-400">
                                  • Password expires in {expiry.expiresInDays}d
                                </span>
                              )}
                          </p>
                        </div>

                        {/* User Actions */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={isBusy}
                            onClick={() => {
                              setScopeRoleId(rolesList[0]?.id ?? "");
                              setAddingScopeUserId(
                                addingScopeUserId === u.id ? null : u.id
                              );
                            }}
                          >
                            <Plus className="size-3" />
                            Add Role
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={isBusy}
                            onClick={() => void handleResetUserPassword(u)}
                          >
                            <KeyRound className="size-3 text-blue-600" />
                            Reset Password
                          </Button>
                          {!isSelf && (
                            <>
                              <Button
                                size="xs"
                                variant="outline"
                                disabled={isBusy}
                                onClick={() => void handleToggleSuspend(u)}
                              >
                                {isActive ? (
                                  <>
                                    <PauseCircle className="size-3 text-amber-600" />
                                    Suspend
                                  </>
                                ) : (
                                  <>
                                    <PlayCircle className="size-3 text-emerald-600" />
                                    Reactivate
                                  </>
                                )}
                              </Button>
                              <Button
                                size="icon-xs"
                                variant="ghost"
                                disabled={isBusy}
                                title="Delete user permanently"
                                onClick={() => void handleDeleteUser(u)}
                              >
                                <Trash2 className="size-3.5 text-zinc-400 hover:text-rose-600" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Assigned Role & Scope Chips */}
                      <div className="flex flex-wrap gap-1.5">
                        {u.scopes.length === 0 ? (
                          <span className="text-xs italic text-zinc-400">
                            No roles assigned yet — click Add Role above.
                          </span>
                        ) : (
                          u.scopes.map((sc) => (
                            <span
                              key={sc.id}
                              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-xs"
                            >
                              <Badge
                                variant={asBadgeVariant(sc.roleColor)}
                                className="h-4 border-0 px-1.5 text-[10px]"
                              >
                                {sc.roleName || sc.role.replace(/_/g, " ")}
                              </Badge>
                              {sc.countryId && (
                                <span className="text-[11px] text-zinc-600">
                                  • {countryById.get(sc.countryId)?.code}
                                </span>
                              )}
                              {sc.branchId && (
                                <span className="text-[11px] text-zinc-600">
                                  • {branchById.get(sc.branchId)?.code}
                                </span>
                              )}
                              {sc.departmentId && (
                                <span className="text-[11px] text-zinc-600">
                                  • {deptById.get(sc.departmentId)?.code}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => void handleRemoveScope(sc.id)}
                                className="rounded p-0.5 text-zinc-400 hover:text-rose-600"
                                title="Remove role assignment"
                              >
                                <X className="size-3" />
                              </button>
                            </span>
                          ))
                        )}
                      </div>

                      {/* Inline Add Role/Scope Drawer */}
                      {addingScopeUserId === u.id && (
                        <div className="grid gap-2 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 md:grid-cols-5">
                          <ModernSelect
                            size="sm"
                            value={scopeRoleId}
                            onValueChange={setScopeRoleId}
                            options={rolesList.map((r) => ({
                              value: r.id,
                              label: r.name,
                            }))}
                          />
                          <ModernSelect
                            size="sm"
                            value={scopeCountryId}
                            onValueChange={setScopeCountryId}
                            options={[
                              { value: "", label: "All Regions" },
                              ...data.countries.map((c) => ({
                                value: c.id,
                                label: c.code,
                              })),
                            ]}
                          />
                          <ModernSelect
                            size="sm"
                            value={scopeBranchId}
                            onValueChange={setScopeBranchId}
                            options={[
                              { value: "", label: "All Locations" },
                              ...data.branches.map((b) => ({
                                value: b.id,
                                label: b.code,
                              })),
                            ]}
                          />
                          <ModernSelect
                            size="sm"
                            value={scopeDeptId}
                            onValueChange={setScopeDeptId}
                            options={[
                              { value: "", label: "All Depts" },
                              ...data.departments.map((d) => ({
                                value: d.id,
                                label: d.code,
                              })),
                            ]}
                          />
                          <div className="flex gap-1.5">
                            <Button
                              size="sm"
                              className="flex-1"
                              disabled={isBusy}
                              onClick={() => void handleAddScopeToUser(u)}
                            >
                              Assign
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="outline"
                              onClick={() => setAddingScopeUserId(null)}
                            >
                              <X className="size-3.5" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ────────────────── TAB 2: ROLES & PERMISSIONS ───────────────────── */}
      {subTab === "roles" && (
        <div className="space-y-4">
          {showRoleBuilder && (
            <Card className="border-zinc-200 bg-white">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Shield className="size-4 text-violet-600" />
                    {editingRole
                      ? `Edit Role — ${editingRole.name}`
                      : "Create Custom Role"}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Choose exact permissions granted to team members assigned this role.
                  </CardDescription>
                </div>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => {
                    setShowRoleBuilder(false);
                    setEditingRole(null);
                  }}
                >
                  <X className="size-4" />
                </Button>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveRole} className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Role Name</Label>
                      <Input
                        className="h-8 text-xs"
                        placeholder="e.g. Marketing Designer"
                        value={roleName}
                        onChange={(e) => setRoleName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Description</Label>
                      <Input
                        className="h-8 text-xs"
                        placeholder="Designs studio slides & manages playlists"
                        value={roleDesc}
                        onChange={(e) => setRoleDesc(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Badge Colour</Label>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {ROLE_COLOR_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setRoleColor(opt.value)}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${
                              roleColor === opt.value
                                ? "border-zinc-950 bg-zinc-950 text-white"
                                : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400"
                            }`}
                          >
                            <span className={`size-2 rounded-full ${opt.dot}`} />
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Grouped Permission Matrix */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-zinc-800">
                        Permission Matrix ({rolePerms.length}/{PERMISSION_CATALOG.length} selected)
                      </Label>
                      {editingRole?.slug !== "super_admin" && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="text-[11px] font-medium text-blue-600 hover:underline"
                            onClick={() =>
                              setRolePerms(PERMISSION_CATALOG.map((p) => p.key))
                            }
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            className="text-[11px] font-medium text-zinc-500 hover:underline"
                            onClick={() => setRolePerms(["overview:view"])}
                          >
                            Reset Minimal
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      {permissionGroups.map(([groupName, perms]) => (
                        <div
                          key={groupName}
                          className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50/50 p-3"
                        >
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                            {groupName}
                          </p>
                          <div className="space-y-1.5">
                            {perms.map((perm) => {
                              const checked = rolePerms.includes(perm.key);
                              const locked = editingRole?.slug === "super_admin";
                              return (
                                <label
                                  key={perm.key}
                                  className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-xs transition ${
                                    checked
                                      ? "border-blue-200 bg-white text-zinc-950"
                                      : "border-transparent bg-transparent text-zinc-600 hover:bg-white/70"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    className="mt-0.5 rounded border-zinc-300"
                                    checked={checked}
                                    disabled={locked}
                                    onChange={() => togglePermission(perm.key)}
                                  />
                                  <span className="min-w-0">
                                    <span className="block font-medium">
                                      {perm.label}
                                    </span>
                                    <span className="block text-[11px] text-zinc-400">
                                      {perm.description}
                                    </span>
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setShowRoleBuilder(false);
                        setEditingRole(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" disabled={savingRole}>
                      <Shield className="size-3.5" />
                      {savingRole
                        ? "Saving Role..."
                        : editingRole
                          ? "Save Role Changes"
                          : "Create Custom Role"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Roles Grid */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rolesList.map((r) => (
              <Card key={r.id} className="flex flex-col border-zinc-200 bg-white">
                <CardHeader className="pb-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={asBadgeVariant(r.color)}>{r.name}</Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {r.isSystem ? "System" : "Custom"}
                        </Badge>
                      </div>
                      <p className="text-xs text-zinc-500">
                        {r.description || "Custom role with tailored permissions."}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                      {r.memberCount ?? 0} user{(r.memberCount ?? 0) === 1 ? "" : "s"}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-between gap-3">
                  <div className="flex flex-wrap gap-1">
                    {r.permissions.slice(0, 6).map((p) => (
                      <span
                        key={p}
                        className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600"
                      >
                        {p}
                      </span>
                    ))}
                    {r.permissions.length > 6 && (
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                        +{r.permissions.length - 6} more
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-1.5 border-t border-zinc-100 pt-2.5">
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => openCloneRole(r)}
                    >
                      <Copy className="size-3" />
                      Clone
                    </Button>
                    {!r.id.startsWith("sys-") && (
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => openEditRole(r)}
                      >
                        <Edit3 className="size-3" />
                        Edit
                      </Button>
                    )}
                    {!r.isSystem && (
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        title="Delete custom role"
                        onClick={() => void handleDeleteRole(r)}
                      >
                        <Trash2 className="size-3.5 text-zinc-400 hover:text-rose-600" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ────────────────── TAB 3: PASSWORD EXPIRY POLICY ────────────────── */}
      {subTab === "policy" && (
        <div className="grid gap-6 lg:grid-cols-12">
          <Card className="border-zinc-200 bg-white lg:col-span-7">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <SlidersHorizontal className="size-4 text-blue-600" />
                Password Expiry &amp; Complexity Policy
              </CardTitle>
              <CardDescription>
                Control how often users must rotate their password and the minimum security requirements enforced on login &amp; password changes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSavePolicy} className="space-y-5">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">
                    Password Expiry Interval (Days)
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {EXPIRY_PRESETS.map((preset) => (
                      <button
                        key={preset.days}
                        type="button"
                        onClick={() => setExpiryDays(preset.days)}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                          expiryDays === preset.days
                            ? "bg-zinc-950 text-white"
                            : "border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Input
                      type="number"
                      min={0}
                      max={3650}
                      className="h-8 w-32 text-xs"
                      value={expiryDays}
                      onChange={(e) => setExpiryDays(Number(e.target.value) || 0)}
                    />
                    <span className="text-xs text-zinc-500">
                      days (set to <code>0</code> to disable expiry)
                    </span>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">
                      Minimum Password Length
                    </Label>
                    <Input
                      type="number"
                      min={6}
                      max={32}
                      className="h-8 text-xs"
                      value={minLen}
                      onChange={(e) => setMinLen(Number(e.target.value) || 8)}
                    />
                  </div>
                  <div className="space-y-2 pt-5">
                    <label className="flex items-center gap-2 text-xs text-zinc-700">
                      <input
                        type="checkbox"
                        checked={reqUpper}
                        onChange={(e) => setReqUpper(e.target.checked)}
                      />
                      Require at least one uppercase letter (A-Z)
                    </label>
                    <label className="flex items-center gap-2 text-xs text-zinc-700">
                      <input
                        type="checkbox"
                        checked={reqNum}
                        onChange={(e) => setReqNum(e.target.checked)}
                      />
                      Require at least one number (0-9)
                    </label>
                  </div>
                </div>

                <div className="flex justify-end border-t border-zinc-100 pt-3">
                  <Button type="submit" size="sm" disabled={savingPolicy}>
                    <ShieldCheck className="size-3.5" />
                    {savingPolicy ? "Saving Policy..." : "Save Security Policy"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="border-zinc-200 bg-white lg:col-span-5">
            <CardHeader>
              <CardTitle className="text-sm">How Password Lifecycle Works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-zinc-600">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <p className="font-semibold text-zinc-900">1. First Login (Temporary Password)</p>
                <p className="mt-1">
                  New accounts and admin-reset accounts are flagged automatically. On sign-in,
                  the user is routed straight to <code>/change-password</code> and cannot access
                  the CMS until they enter their temporary password and set a new personal password.
                </p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <p className="font-semibold text-zinc-900">2. Automatic Expiry Enforcement</p>
                <p className="mt-1">
                  {expiryDays > 0
                    ? `Every ${expiryDays} days, users receive a 7-day warning inside the CMS. Once expired, they are prompted to verify their current password and set a fresh password.`
                    : "Expiry is currently disabled. Users can still change their own password anytime via My Account."}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <p className="font-semibold text-zinc-900">
                  3. Self-Service &amp; Administrator Resets
                </p>
                <p className="mt-1">
                  Users can update their password anytime from <strong>My Account</strong> by
                  verifying their current password. Administrators can also issue a one-time
                  temporary reset password directly from <strong>Users &amp; Access</strong>.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
