"use client";

/**
 * @file src/components/dashboard/tabs/showrooms-tab.tsx
 * @description Universal Locations & Showrooms full CRUD workspace (Add, Edit,
 * Activate/Deactivate, Delete) plus dynamic Region/Country creation — zero hardcoded
 * regional labels and scalable pagination for 100+ sites.
 */

import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  Globe,
  MapPin,
  PauseCircle,
  PlayCircle,
  Plus,
  Search,
  Trash2,
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
import type { BranchItem, OverviewPayload } from "../cms-types";

interface ShowroomsTabProps {
  data: OverviewPayload;
  onRefresh: () => Promise<void>;
}

const BRANCH_TYPE_BADGE: Record<
  BranchItem["branchType"],
  { label: string; variant: "info" | "purple" | "warning" | "success" }
> = {
  showroom: { label: "Showroom", variant: "info" },
  hq: { label: "Head Office", variant: "purple" },
  factory: { label: "Factory / Plant", variant: "warning" },
  depot: { label: "Depot / Hub", variant: "success" },
};

export function ShowroomsTab({ data, onRefresh }: ShowroomsTabProps) {
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [regionFilter, setRegionFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [showAddForm, setShowAddForm] = useState(false);
  const [showRegionForm, setShowRegionForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState<BranchItem | null>(null);

  // Branch form fields (shared for Create & Edit)
  const [countryId, setCountryId] = useState(data.countries[0]?.id ?? "");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [branchType, setBranchType] = useState<BranchItem["branchType"]>("showroom");
  const [openingTime, setOpeningTime] = useState("08:00");
  const [closingTime, setClosingTime] = useState("17:30");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);

  // Dynamic Region/Country form
  const [regCode, setRegCode] = useState("");
  const [regName, setRegName] = useState("");
  const [regCurrency, setRegCurrency] = useState("USD");
  const [regTimezone, setRegTimezone] = useState("UTC");

  const countryById = useMemo(
    () => new Map(data.countries.map((c) => [c.id, c])),
    [data.countries]
  );

  const filteredBranches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.branches.filter((b) => {
      if (typeFilter !== "all" && b.branchType !== typeFilter) return false;
      if (regionFilter && b.countryId !== regionFilter) return false;
      const active = b.isActive !== false;
      if (statusFilter === "active" && !active) return false;
      if (statusFilter === "inactive" && active) return false;
      if (!q) return true;
      return (
        b.name.toLowerCase().includes(q) ||
        b.code.toLowerCase().includes(q) ||
        b.city.toLowerCase().includes(q)
      );
    });
  }, [data.branches, search, typeFilter, regionFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredBranches.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filteredBranches.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

  function resetForm() {
    setEditingBranch(null);
    setCountryId(data.countries[0]?.id ?? "");
    setCode("");
    setName("");
    setCity("");
    setBranchType("showroom");
    setOpeningTime("08:00");
    setClosingTime("17:30");
    setPhone("");
    setAddress("");
  }

  function startEdit(b: BranchItem) {
    setEditingBranch(b);
    setShowAddForm(true);
    setCountryId(b.countryId);
    setCode(b.code);
    setName(b.name);
    setCity(b.city);
    setBranchType(b.branchType);
    setOpeningTime(b.openingTime || "08:00");
    setClosingTime(b.closingTime || "17:30");
    setPhone(b.phone ?? "");
    setAddress(b.address ?? "");
  }

  async function handleSaveBranch(e: React.FormEvent) {
    e.preventDefault();
    if (!countryId) {
      toast.error("Add or select a Region/Country first.");
      return;
    }
    setSaving(true);
    try {
      const url = editingBranch
        ? `/api/branches/${editingBranch.id}`
        : "/api/branches";
      const method = editingBranch ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          countryId,
          code: code.trim().toUpperCase(),
          name: name.trim(),
          city: city.trim(),
          branchType,
          openingTime,
          closingTime,
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Could not save location");
        return;
      }
      toast.success(
        editingBranch
          ? `Updated "${name.trim()}"`
          : `Added location "${name.trim()}"`
      );
      resetForm();
      setShowAddForm(false);
      await onRefresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(b: BranchItem) {
    const nextActive = b.isActive === false;
    const res = await fetch(`/api/branches/${b.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: nextActive }),
    });
    if (!res.ok) {
      toast.error("Failed to update location status");
      return;
    }
    toast.success(
      nextActive ? `Activated "${b.name}"` : `Deactivated "${b.name}"`
    );
    await onRefresh();
  }

  async function handleDeleteBranch(b: BranchItem) {
    const attachedScreens = data.screens.filter((s) => s.branchId === b.id).length;
    const confirmMsg =
      attachedScreens > 0
        ? `"${b.name}" currently has ${attachedScreens} paired screen(s). Deleting it will also remove those paired screens.`
        : `This permanently deletes location "${b.name}".`;
    const ok = await confirm({
      title: `Delete location "${b.name}"?`,
      description: confirmMsg,
      confirmLabel: "Delete Location",
      variant: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/branches/${b.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete location");
      return;
    }
    toast.success(`Deleted "${b.name}"`);
    await onRefresh();
  }

  async function handleAddRegion(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/countries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: regCode.trim().toUpperCase(),
        name: regName.trim(),
        currencyCode: regCurrency.trim().toUpperCase(),
        timezone: regTimezone.trim() || "UTC",
      }),
    });
    const j = await res.json();
    if (!res.ok) {
      toast.error(j.error || "Could not add region");
      return;
    }
    toast.success(`Added region "${regName.trim()}"`);
    setRegCode("");
    setRegName("");
    setShowRegionForm(false);
    await onRefresh();
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-zinc-400" />
            <Input
              className="h-8 pl-8 text-xs"
              placeholder="Search name, code, or city..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="w-40">
            <ModernSelect
              size="sm"
              value={regionFilter}
              onValueChange={(v) => {
                setRegionFilter(v);
                setPage(1);
              }}
              options={[
                { value: "", label: "All Regions" },
                ...data.countries.map((c) => ({
                  value: c.id,
                  label: `${c.name} (${c.code})`,
                })),
              ]}
            />
          </div>
          <div className="w-36">
            <ModernSelect
              size="sm"
              value={typeFilter}
              onValueChange={(v) => {
                setTypeFilter(v);
                setPage(1);
              }}
              options={[
                { value: "all", label: "All Types" },
                { value: "showroom", label: "Showroom" },
                { value: "depot", label: "Depot" },
                { value: "factory", label: "Factory" },
                { value: "hq", label: "Head Office" },
              ]}
            />
          </div>
          <div className="w-32">
            <ModernSelect
              size="sm"
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v as typeof statusFilter);
                setPage(1);
              }}
              options={[
                { value: "all", label: "All Status" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowRegionForm((v) => !v)}
          >
            <Globe className="size-3.5" />
            + Region
          </Button>
          <Button
            size="sm"
            onClick={() => {
              resetForm();
              setShowAddForm((v) => !v);
            }}
          >
            <Plus className="size-3.5" />
            Add Location
          </Button>
        </div>
      </div>

      {/* Add Region/Country Drawer */}
      {showRegionForm && (
        <Card className="border-zinc-300">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Add Operating Region / Country</CardTitle>
              <CardDescription>
                Add any country or region with its local currency and IANA timezone.
              </CardDescription>
            </div>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => setShowRegionForm(false)}
            >
              <X className="size-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleAddRegion}
              className="grid gap-3 md:grid-cols-5"
            >
              <Input
                className="h-8 text-xs font-mono uppercase"
                placeholder="Code (e.g. RW, UK, US)"
                maxLength={3}
                value={regCode}
                onChange={(e) => setRegCode(e.target.value)}
                required
              />
              <Input
                className="h-8 text-xs"
                placeholder="Region / Country Name"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                required
              />
              <Input
                className="h-8 text-xs font-mono uppercase"
                placeholder="Currency (e.g. USD)"
                maxLength={3}
                value={regCurrency}
                onChange={(e) => setRegCurrency(e.target.value)}
                required
              />
              <Input
                className="h-8 text-xs"
                placeholder="Timezone (e.g. Africa/Kigali)"
                value={regTimezone}
                onChange={(e) => setRegTimezone(e.target.value)}
                required
              />
              <Button type="submit" size="sm">
                Save Region
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Create / Edit Location Drawer */}
      {showAddForm && (
        <Card className="border-blue-300">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">
                {editingBranch
                  ? `Edit Location — ${editingBranch.name}`
                  : "Create New Location / Showroom"}
              </CardTitle>
              <CardDescription>
                Configure site details and operating hours for Eco-Standby scheduling.
              </CardDescription>
            </div>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => {
                setShowAddForm(false);
                resetForm();
              }}
            >
              <X className="size-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleSaveBranch}
              className="grid gap-3 md:grid-cols-4"
            >
              <div className="space-y-1">
                <Label className="text-xs">Region / Country</Label>
                <ModernSelect
                  size="sm"
                  value={countryId}
                  onValueChange={setCountryId}
                  options={data.countries.map((c) => ({
                    value: c.id,
                    label: `${c.name} (${c.code})`,
                  }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Location Code</Label>
                <Input
                  className="h-8 text-xs font-mono uppercase"
                  placeholder="e.g. LOC-01"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label className="text-xs">Location / Showroom Name</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="e.g. Central Flagship Showroom"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">City</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="City"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Site Type</Label>
                <ModernSelect
                  size="sm"
                  value={branchType}
                  onValueChange={(v) =>
                    setBranchType(v as BranchItem["branchType"])
                  }
                  options={[
                    { value: "showroom", label: "Showroom" },
                    { value: "depot", label: "Depot / Distribution" },
                    { value: "factory", label: "Factory / Plant" },
                    { value: "hq", label: "Head Office" },
                  ]}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Opening Time</Label>
                <Input
                  type="time"
                  className="h-8 text-xs"
                  value={openingTime}
                  onChange={(e) => setOpeningTime(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Closing Time</Label>
                <Input
                  type="time"
                  className="h-8 text-xs"
                  value={closingTime}
                  onChange={(e) => setClosingTime(e.target.value)}
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label className="text-xs">Address (Optional)</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="Street address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Phone (Optional)</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="+..."
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="flex items-end justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShowAddForm(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving}>
                  {saving
                    ? "Saving..."
                    : editingBranch
                      ? "Update Location"
                      : "Save Location"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Scalable Locations Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-200 bg-zinc-50/80 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-2.5">Location</th>
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5">City / Region</th>
                <th className="px-4 py-2.5">Operating Hours</th>
                <th className="px-4 py-2.5">Displays</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-zinc-500"
                  >
                    No locations match your search. Click{" "}
                    <strong>Add Location</strong> to create one.
                  </td>
                </tr>
              ) : (
                pageRows.map((b) => {
                  const region = countryById.get(b.countryId);
                  const screenCount = data.screens.filter(
                    (s) => s.branchId === b.id
                  ).length;
                  const typeMeta = BRANCH_TYPE_BADGE[b.branchType];
                  const active = b.isActive !== false;
                  return (
                    <tr
                      key={b.id}
                      className="transition hover:bg-zinc-50/70"
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-zinc-950">{b.name}</p>
                        <p className="font-mono text-[10px] text-zinc-400">
                          {b.code}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={typeMeta.variant}>
                          {typeMeta.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <p className="flex items-center gap-1 font-medium text-zinc-800">
                          <MapPin className="size-3 text-zinc-400" />
                          {b.city}
                        </p>
                        <p className="text-[10px] text-zinc-500">
                          {region ? `${region.name} (${region.code})` : "Global"}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-zinc-600">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3 text-zinc-400" />
                          {b.openingTime} – {b.closingTime}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{screenCount} TVs</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={active ? "success" : "secondary"}>
                          {active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            title="Edit Location"
                            onClick={() => startEdit(b)}
                          >
                            <Edit3 className="size-3.5 text-blue-600" />
                          </Button>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            title={active ? "Deactivate" : "Activate"}
                            onClick={() => void handleToggleActive(b)}
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
                            title="Delete Location"
                            onClick={() => void handleDeleteBranch(b)}
                          >
                            <Trash2 className="size-3.5 text-rose-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-2.5 text-xs text-zinc-500">
          <span>
            {filteredBranches.length} location
            {filteredBranches.length === 1 ? "" : "s"}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="icon-xs"
              variant="outline"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <span className="font-mono text-[11px]">
              {safePage} / {totalPages}
            </span>
            <Button
              size="icon-xs"
              variant="outline"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
