"use client";

/**
 * @file src/components/dashboard/account-modal.tsx
 * @description Self-service My Account & Security modal: update profile name, change
 * password by verifying current password, inspect password expiry countdown, view
 * active roles/permissions/scopes, and sign out across all devices.
 */

import { useState } from "react";
import {
  CheckCircle2,
  Circle,
  Clock,
  KeyRound,
  LogOut,
  Shield,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_PASSWORD_POLICY,
  PERMISSION_CATALOG,
  validatePasswordPolicy,
} from "@/lib/permissions";
import {
  createSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import type { OverviewPayload } from "./cms-types";

interface AccountModalProps {
  data: OverviewPayload;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onSignOut: () => Promise<void>;
}

export function AccountModal({
  data,
  onClose,
  onRefresh,
  onSignOut,
}: AccountModalProps) {
  const session = data.session;
  const policy =
    session?.passwordPolicy ?? data.authPolicy ?? DEFAULT_PASSWORD_POLICY;

  const [tab, setTab] = useState<"profile" | "password" | "access">("profile");
  const [fullName, setFullName] = useState(session?.fullName ?? "");
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const validation = validatePasswordPolicy(
    newPassword,
    policy,
    currentPassword || undefined
  );
  const matches = newPassword.length > 0 && newPassword === confirmPassword;

  const countryById = new Map(data.countries.map((c) => [c.id, c]));
  const branchById = new Map(data.branches.map((b) => [b.id, b]));
  const deptById = new Map(data.departments.map((d) => [d.id, d]));

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return;
    setSavingProfile(true);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: fullName.trim() }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(json.error || "Failed to update profile");
        return;
      }
      toast.success("Profile updated");
      await onRefresh();
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!validation.valid) {
      toast.error(validation.errors[0]);
      return;
    }
    if (!matches) {
      toast.error("Passwords do not match.");
      return;
    }
    setSavingPassword(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(json.error || "Could not change password");
        return;
      }
      toast.success("Password changed & expiry timer reset");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      await onRefresh();
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleSignOutEverywhere() {
    if (isSupabaseConfigured()) {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut({ scope: "global" });
    }
    toast.success("Signed out from all devices");
    await onSignOut();
  }

  const grantedSet = new Set(session?.permissions ?? []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-950">
              My Account &amp; Security
            </h2>
            <p className="text-xs text-zinc-500">
              {session?.email || "Active session"}
            </p>
          </div>
          <Button size="icon-xs" variant="ghost" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        {/* Sub-nav */}
        <div className="flex gap-1 border-b border-zinc-100 bg-zinc-50/60 px-5 py-2">
          {[
            { id: "profile" as const, label: "Profile", icon: User },
            { id: "password" as const, label: "Change Password", icon: KeyRound },
            { id: "access" as const, label: "My Roles & Access", icon: Shield },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  tab === item.id
                    ? "bg-white text-zinc-950 shadow-2xs ring-1 ring-zinc-200"
                    : "text-zinc-500 hover:text-zinc-900"
                }`}
              >
                <Icon className="size-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5">
          {tab === "profile" && (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Full Name</Label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Work Email</Label>
                <Input value={session?.email ?? ""} disabled />
              </div>

              <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-medium text-zinc-700">
                    <Clock className="size-3.5 text-blue-600" />
                    Password Expiry Policy
                  </span>
                  {policy.passwordExpiryDays > 0 ? (
                    <Badge
                      variant={
                        (session?.passwordExpiresInDays ?? 99) <= 7
                          ? "warning"
                          : "success"
                      }
                    >
                      {session?.passwordExpiresInDays !== null &&
                      session?.passwordExpiresInDays !== undefined
                        ? `Expires in ${session.passwordExpiresInDays}d`
                        : `${policy.passwordExpiryDays}-day rotation`}
                    </Badge>
                  ) : (
                    <Badge variant="outline">No Expiry</Badge>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleSignOutEverywhere}
                >
                  <LogOut className="size-3.5" />
                  Sign Out Everywhere
                </Button>
                <Button type="submit" size="sm" disabled={savingProfile}>
                  {savingProfile ? "Saving..." : "Save Profile"}
                </Button>
              </div>
            </form>
          )}

          {tab === "password" && (
            <form onSubmit={handleChangePassword} className="space-y-3.5">
              <div className="space-y-1">
                <Label className="text-xs">Current Password</Label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">New Password</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Confirm New Password</Label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-[11px]">
                <Row
                  ok={newPassword.length >= policy.minPasswordLength}
                  label={`At least ${policy.minPasswordLength} characters`}
                />
                {policy.requireUppercase && (
                  <Row
                    ok={/[A-Z]/.test(newPassword)}
                    label="Includes uppercase letter (A-Z)"
                  />
                )}
                <Row
                  ok={/[a-z]/.test(newPassword)}
                  label="Includes lowercase letter (a-z)"
                />
                {policy.requireNumber && (
                  <Row
                    ok={/[0-9]/.test(newPassword)}
                    label="Includes number (0-9)"
                  />
                )}
                <Row ok={matches} label="Passwords match" />
              </div>

              <div className="flex justify-end pt-1">
                <Button
                  type="submit"
                  size="sm"
                  disabled={
                    savingPassword ||
                    !currentPassword ||
                    !validation.valid ||
                    !matches
                  }
                >
                  <KeyRound className="size-3.5" />
                  {savingPassword ? "Updating..." : "Update Password"}
                </Button>
              </div>
            </form>
          )}

          {tab === "access" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-zinc-700">
                  Assigned Roles &amp; Scopes
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(session?.scopes ?? []).length === 0 ? (
                    <Badge variant="outline">
                      {session?.enforceAuth
                        ? "No assigned roles"
                        : "Open Preview Mode (Full Access)"}
                    </Badge>
                  ) : (
                    session?.scopes?.map((sc) => (
                      <span
                        key={sc.id}
                        className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs"
                      >
                        <Badge variant="purple" className="h-4 px-1.5 text-[10px]">
                          {sc.roleName || sc.role.replace("_", " ")}
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
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-zinc-700">
                  Effective Permissions ({grantedSet.size}/{PERMISSION_CATALOG.length})
                </p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {PERMISSION_CATALOG.map((perm) => {
                    const allowed = grantedSet.has(perm.key);
                    return (
                      <div
                        key={perm.key}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
                          allowed
                            ? "border-emerald-200 bg-emerald-50/50 text-emerald-950"
                            : "border-zinc-100 bg-zinc-50/50 text-zinc-400"
                        }`}
                      >
                        {allowed ? (
                          <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" />
                        ) : (
                          <Circle className="size-3.5 shrink-0 text-zinc-300" />
                        )}
                        <span className="truncate">{perm.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div
      className={`flex items-center gap-1.5 ${
        ok ? "text-emerald-700" : "text-zinc-500"
      }`}
    >
      {ok ? (
        <CheckCircle2 className="size-3.5 text-emerald-600" />
      ) : (
        <Circle className="size-3.5 text-zinc-300" />
      )}
      <span>{label}</span>
    </div>
  );
}
