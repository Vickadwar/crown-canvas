"use client";

/**
 * @file src/components/dashboard/tabs/departments-tab.tsx
 * @description Full CRUD Departments workspace (Add, Edit, Accent Colour Picker,
 * Activate/Deactivate, Delete) with detailed screen, media, slide & playlist counts.
 */

import { useMemo, useState } from "react";
import {
  Building2,
  Edit3,
  Film,
  ListVideo,
  PauseCircle,
  PlayCircle,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Tv,
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
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { DepartmentItem, OverviewPayload } from "../cms-types";

interface DepartmentsTabProps {
  data: OverviewPayload;
  onRefresh: () => Promise<void>;
}

const ACCENT_PRESETS = [
  "#2563eb",
  "#10b981",
  "#f59e0b",
  "#7c3aed",
  "#e11d48",
  "#0891b2",
  "#ea580c",
  "#09090b",
];

export function DepartmentsTab({ data, onRefresh }: DepartmentsTabProps) {
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingDept, setEditingDept] = useState<DepartmentItem | null>(null);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [accentColor, setAccentColor] = useState("#2563eb");
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data.departments;
    return data.departments.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.code.toLowerCase().includes(q) ||
        (d.description?.toLowerCase().includes(q) ?? false)
    );
  }, [data.departments, search]);

  function resetForm() {
    setEditingDept(null);
    setCode("");
    setName("");
    setDescription("");
    setAccentColor("#2563eb");
  }

  function startEdit(dept: DepartmentItem) {
    setEditingDept(dept);
    setShowForm(true);
    setCode(dept.code);
    setName(dept.name);
    setDescription(dept.description ?? "");
    setAccentColor(dept.accentColor || "#2563eb");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const url = editingDept
        ? `/api/departments/${editingDept.id}`
        : "/api/departments";
      const method = editingDept ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          name: name.trim(),
          description: description.trim() || null,
          accentColor,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error || "Failed to save department");
        return;
      }
      toast.success(
        editingDept
          ? `Updated department "${name.trim()}"`
          : `Created department "${name.trim()}"`
      );
      resetForm();
      setShowForm(false);
      await onRefresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(dept: DepartmentItem) {
    const nextActive = dept.isActive === false;
    const res = await fetch(`/api/departments/${dept.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: nextActive }),
    });
    if (!res.ok) {
      toast.error("Failed to update department status");
      return;
    }
    toast.success(
      nextActive ? `Activated "${dept.name}"` : `Deactivated "${dept.name}"`
    );
    await onRefresh();
  }

  async function handleDelete(dept: DepartmentItem) {
    const ok = await confirm({
      title: `Delete department "${dept.name}"?`,
      description: `Deleting "${dept.name}" (${dept.code}) is permanent. If it still owns playlists or media, deactivate it instead.`,
      confirmLabel: "Delete Department",
      variant: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/departments/${dept.id}`, {
      method: "DELETE",
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(j.error || "Failed to delete department");
      return;
    }
    toast.success(`Deleted "${dept.name}"`);
    await onRefresh();
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-zinc-400" />
            <Input
              className="h-8 pl-8 text-xs"
              placeholder="Search departments..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Badge variant="info">{data.departments.length} Departments</Badge>
        </div>
        <Button
          size="sm"
          onClick={() => {
            resetForm();
            setShowForm((v) => !v);
          }}
        >
          <Plus className="size-3.5" />
          New Department
        </Button>
      </div>

      {/* Create / Edit Form */}
      {showForm && (
        <Card className="border-blue-300">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">
                {editingDept
                  ? `Edit Department — ${editingDept.name}`
                  : "Create Department"}
              </CardTitle>
              <CardDescription>
                Organize content ownership, Studio templates, and role-based permissions by department.
              </CardDescription>
            </div>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
            >
              <X className="size-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-12">
              <div className="space-y-1 md:col-span-3">
                <Label className="text-xs">Short Code</Label>
                <Input
                  className="h-8 font-mono text-xs uppercase"
                  placeholder="e.g. PMG, ICT, SHE"
                  maxLength={24}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1 md:col-span-5">
                <Label className="text-xs">Department Name</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="e.g. Product Management Group"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1 md:col-span-4">
                <Label className="text-xs">Accent Colour</Label>
                <div className="flex items-center gap-1.5">
                  {ACCENT_PRESETS.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setAccentColor(hex)}
                      className={`size-6 rounded-full border-2 transition ${accentColor === hex
                          ? "scale-110 border-zinc-950"
                          : "border-transparent"
                        }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                  <input
                    type="color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="ml-1 h-7 w-8 cursor-pointer rounded border border-zinc-200"
                  />
                </div>
              </div>
              <div className="space-y-1 md:col-span-9">
                <Label className="text-xs">Description</Label>
                <Textarea
                  rows={2}
                  className="text-xs"
                  placeholder="Brief overview of what signage content this department owns..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="flex items-end justify-end gap-2 md:col-span-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving}>
                  {saving
                    ? "Saving..."
                    : editingDept
                      ? "Update"
                      : "Create Department"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Detailed Department Cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((dept) => {
          const screensCount = data.screens.filter(
            (s) => s.departmentId === dept.id
          ).length;
          const mediaCount = data.mediaAssets.filter(
            (m) => m.departmentId === dept.id
          ).length;
          const slidesCount = data.quickPosts.filter(
            (q) => q.departmentId === dept.id
          ).length;
          const playlistsCount = data.playlists.filter(
            (p) => p.departmentId === dept.id
          ).length;
          const active = dept.isActive !== false;

          return (
            <Card key={dept.id} className="overflow-hidden">
              <div
                className="h-1.5 w-full"
                style={{ backgroundColor: dept.accentColor || "#2563eb" }}
              />
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex size-8 items-center justify-center rounded-lg text-white shadow-2xs"
                      style={{ backgroundColor: dept.accentColor || "#2563eb" }}
                    >
                      <Building2 className="size-4" />
                    </span>
                    <div>
                      <CardTitle className="text-sm font-semibold">
                        {dept.name}
                      </CardTitle>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {dept.code}
                        </Badge>
                        <Badge variant={active ? "success" : "secondary"}>
                          {active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      title="Edit Department"
                      onClick={() => startEdit(dept)}
                    >
                      <Edit3 className="size-3.5 text-blue-600" />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      title={active ? "Deactivate" : "Activate"}
                      onClick={() => void handleToggleActive(dept)}
                    >
                      {active ? (
                        <PauseCircle className="size-3.5 text-amber-600" />
                      ) : (
                        <PlayCircle className="size-3.5 text-emerald-600" />
                      )}
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      title="Delete Department"
                      onClick={() => void handleDelete(dept)}
                    >
                      <Trash2 className="size-3.5 text-rose-500" />
                    </Button>
                  </div>
                </div>
                <CardDescription className="mt-2 line-clamp-2 text-xs">
                  {dept.description || "Signage content & display ownership unit."}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-4 gap-2 border-t border-zinc-100 bg-zinc-50/40 pt-3 text-center">
                <div className="rounded-lg border border-zinc-200/70 bg-white py-2">
                  <Tv className="mx-auto size-3.5 text-emerald-600" />
                  <p className="mt-1 font-mono text-sm font-bold">{screensCount}</p>
                  <p className="text-[10px] text-zinc-500">TVs</p>
                </div>
                <div className="rounded-lg border border-zinc-200/70 bg-white py-2">
                  <ListVideo className="mx-auto size-3.5 text-blue-600" />
                  <p className="mt-1 font-mono text-sm font-bold">{playlistsCount}</p>
                  <p className="text-[10px] text-zinc-500">Playlists</p>
                </div>
                <div className="rounded-lg border border-zinc-200/70 bg-white py-2">
                  <Film className="mx-auto size-3.5 text-amber-600" />
                  <p className="mt-1 font-mono text-sm font-bold">{mediaCount}</p>
                  <p className="text-[10px] text-zinc-500">Media</p>
                </div>
                <div className="rounded-lg border border-zinc-200/70 bg-white py-2">
                  <Sparkles className="mx-auto size-3.5 text-violet-600" />
                  <p className="mt-1 font-mono text-sm font-bold">{slidesCount}</p>
                  <p className="text-[10px] text-zinc-500">Slides</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
