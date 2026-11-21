"use client";

/**
 * @file src/components/dashboard/tabs/team-tab.tsx
 * @description Universal Team & Role-Based Access Control (RBAC) workspace.
 */

import { useMemo, useState } from "react";
import { Shield, X } from "lucide-react";
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
import type { OverviewPayload } from "../cms-types";

interface TeamTabProps {
  data: OverviewPayload;
  onRefresh: () => Promise<void>;
}

const ROLE_BADGE: Record<
  string,
  "purple" | "info" | "success" | "warning" | "outline"
> = {
  super_admin: "purple",
  country_manager: "info",
  department_lead: "success",
  branch_manager: "warning",
  content_editor: "info",
  auditor: "outline",
};

export function TeamTab({ data, onRefresh }: TeamTabProps) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("branch_manager");
  const [countryId, setCountryId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [deptId, setDeptId] = useState("");
  const [saving, setSaving] = useState(false);

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

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !fullName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          fullName: fullName.trim(),
          role,
          countryId: countryId || null,
          branchId: branchId || null,
          departmentId: deptId || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error || "Failed to assign access scope");
        return;
      }
      toast.success(`Assigned ${role.replace("_", " ")} to ${fullName.trim()}`);
      setEmail("");
      setFullName("");
      await onRefresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveScope(scopeId: string) {
    const res = await fetch(`/api/users/${scopeId}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to remove access scope");
      return;
    }
    toast.success("Access scope removed");
    await onRefresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <Card className="lg:col-span-5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="size-4 text-violet-600" />
            Assign Team Member &amp; Scope
          </CardTitle>
          <CardDescription>
            Restrict users to specific regions, locations, or departments with Maker-Checker approvals.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAssign} className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Full Name</Label>
              <Input
                className="h-8 text-xs"
                placeholder="Jane Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Work Email</Label>
              <Input
                type="email"
                className="h-8 text-xs"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Role</Label>
              <ModernSelect
                size="sm"
                value={role}
                onValueChange={setRole}
                options={[
                  { value: "super_admin", label: "Super Admin (Full Access)" },
                  { value: "country_manager", label: "Regional Manager" },
                  { value: "department_lead", label: "Department Lead (Approver)" },
                  { value: "branch_manager", label: "Location Manager (Requires Approval)" },
                  { value: "content_editor", label: "Content Editor (Requires Approval)" },
                  { value: "auditor", label: "Read-Only Auditor" },
                ]}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Region</Label>
                <ModernSelect
                  size="sm"
                  value={countryId}
                  onValueChange={setCountryId}
                  options={[
                    { value: "", label: "All" },
                    ...data.countries.map((c) => ({
                      value: c.id,
                      label: c.code,
                    })),
                  ]}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Location</Label>
                <ModernSelect
                  size="sm"
                  value={branchId}
                  onValueChange={setBranchId}
                  options={[
                    { value: "", label: "All" },
                    ...data.branches.map((b) => ({
                      value: b.id,
                      label: b.code,
                    })),
                  ]}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Department</Label>
                <ModernSelect
                  size="sm"
                  value={deptId}
                  onValueChange={setDeptId}
                  options={[
                    { value: "", label: "All" },
                    ...data.departments.map((d) => ({
                      value: d.id,
                      label: d.code,
                    })),
                  ]}
                />
              </div>
            </div>
            <Button type="submit" size="sm" className="w-full" disabled={saving}>
              <Shield className="size-3.5" />
              {saving ? "Assigning..." : "Assign Access Scope"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="lg:col-span-7">
        <CardHeader>
          <CardTitle className="text-base">
            Team Members &amp; Active Permissions
          </CardTitle>
          <CardDescription>
            {data.teamUsers.length} registered administrator
            {data.teamUsers.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.teamUsers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-200 p-8 text-center text-xs text-zinc-500">
              No team members assigned yet. Sign in via <code>/login</code> or assign scopes on the left.
            </div>
          ) : (
            data.teamUsers.map((u) => (
              <div
                key={u.id}
                className="rounded-xl border border-zinc-200 bg-zinc-50/40 p-3.5"
              >
                <p className="text-sm font-semibold text-zinc-950">
                  {u.fullName}
                </p>
                <p className="text-xs text-zinc-500">{u.email}</p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {u.scopes.map((sc) => (
                    <span
                      key={sc.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 text-xs"
                    >
                      <Badge
                        variant={ROLE_BADGE[sc.role] ?? "outline"}
                        className="h-4 border-0 px-1 text-[10px]"
                      >
                        {sc.role.replace("_", " ")}
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
                        title="Remove scope"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
