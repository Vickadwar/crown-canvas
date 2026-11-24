"use client";

/**
 * @file src/components/dashboard/tabs/showrooms-tab.tsx
 * @description Universal Locations & Showrooms full CRUD workspace (Add, Edit,
 * Activate/Deactivate, Delete) plus dynamic Region/Country creation — zero hardcoded
 * regional labels and scalable pagination for 100+ sites.
 */

import { useMemo, useState } from "react";
import {
  CalendarOff,
  ChevronDown,
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
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type {
  BranchOperatingSchedule,
  DayHoursRule,
  HolidayExceptionRule,
} from "@/db/schema";
import { STANDARD_RETAIL_SCHEDULE } from "@/lib/screen-health";
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

const WEEKDAY_ROWS: Array<{
  key: "0" | "1" | "2" | "3" | "4" | "5" | "6";
  label: string;
  short: string;
}> = [
    { key: "1", label: "Monday", short: "Mon" },
    { key: "2", label: "Tuesday", short: "Tue" },
    { key: "3", label: "Wednesday", short: "Wed" },
    { key: "4", label: "Thursday", short: "Thu" },
    { key: "5", label: "Friday", short: "Fri" },
    { key: "6", label: "Saturday", short: "Sat" },
    { key: "0", label: "Sunday", short: "Sun" },
  ];

function cloneSchedule(
  source?: BranchOperatingSchedule | null,
  fallbackOpen = "08:00",
  fallbackClose = "18:00"
): BranchOperatingSchedule {
  if (source?.days) {
    return {
      days: {
        "0": { ...(source.days["0"] ?? STANDARD_RETAIL_SCHEDULE.days["0"]) },
        "1": { ...(source.days["1"] ?? { open: true, start: fallbackOpen, end: fallbackClose }) },
        "2": { ...(source.days["2"] ?? { open: true, start: fallbackOpen, end: fallbackClose }) },
        "3": { ...(source.days["3"] ?? { open: true, start: fallbackOpen, end: fallbackClose }) },
        "4": { ...(source.days["4"] ?? { open: true, start: fallbackOpen, end: fallbackClose }) },
        "5": { ...(source.days["5"] ?? { open: true, start: fallbackOpen, end: fallbackClose }) },
        "6": { ...(source.days["6"] ?? STANDARD_RETAIL_SCHEDULE.days["6"]) },
      },
      exceptions: (source.exceptions ?? []).map((ex) => ({ ...ex })),
    };
  }
  return {
    days: {
      "0": { open: false, start: "09:00", end: "13:00" },
      "1": { open: true, start: fallbackOpen, end: fallbackClose },
      "2": { open: true, start: fallbackOpen, end: fallbackClose },
      "3": { open: true, start: fallbackOpen, end: fallbackClose },
      "4": { open: true, start: fallbackOpen, end: fallbackClose },
      "5": { open: true, start: fallbackOpen, end: fallbackClose },
      "6": { open: true, start: "08:00", end: "13:00" },
    },
    exceptions: [],
  };
}

function buildStandardPublicHolidays(year: number): HolidayExceptionRule[] {
  return [
    { date: `${year}-01-01`, label: "New Year's Day", mode: "closed" },
    { date: `${year}-05-01`, label: "Labour Day", mode: "closed" },
    { date: `${year}-06-01`, label: "Madaraka Day", mode: "closed" },
    { date: `${year}-10-20`, label: "Mashujaa Day", mode: "closed" },
    { date: `${year}-12-12`, label: "Jamhuri Day", mode: "closed" },
    { date: `${year}-12-25`, label: "Christmas Day", mode: "closed" },
    { date: `${year}-12-26`, label: "Boxing Day", mode: "closed" },
  ];
}

function formatOperatingSummary(b: BranchItem): {
  primary: string;
  secondary?: string;
} {
  const sched = b.operatingSchedule;
  if (!sched?.days) {
    return { primary: `${b.openingTime} – ${b.closingTime}` };
  }
  const mon = sched.days["1"];
  const sat = sched.days["6"];
  const sun = sched.days["0"];
  const parts: string[] = [];
  if (mon?.open) {
    parts.push(`Mon–Fri ${mon.start}–${mon.end}`);
  } else {
    parts.push("Mon–Fri Custom");
  }
  parts.push(sat?.open ? `Sat ${sat.start}–${sat.end}` : "Sat Off");
  parts.push(sun?.open ? `Sun ${sun.start}–${sun.end}` : "Sun Off");
  const holidayCount = sched.exceptions?.length ?? 0;
  return {
    primary: parts.join(" • "),
    secondary:
      holidayCount > 0
        ? `${holidayCount} holiday/date rule${holidayCount === 1 ? "" : "s"}`
        : undefined,
  };
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
  const [closingTime, setClosingTime] = useState("18:00");
  const [operatingSchedule, setOperatingSchedule] =
    useState<BranchOperatingSchedule>(() => cloneSchedule(null, "08:00", "18:00"));
  const [showWeeklyEditor, setShowWeeklyEditor] = useState(true);
  const [newExDate, setNewExDate] = useState("");
  const [newExLabel, setNewExLabel] = useState("");
  const [newExMode, setNewExMode] = useState<"closed" | "open_override">("closed");
  const [newExStart, setNewExStart] = useState("09:00");
  const [newExEnd, setNewExEnd] = useState("14:00");
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
    setClosingTime("18:00");
    setOperatingSchedule(cloneSchedule(null, "08:00", "18:00"));
    setShowWeeklyEditor(true);
    setNewExDate("");
    setNewExLabel("");
    setNewExMode("closed");
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
    const openT = b.openingTime || "08:00";
    const closeT = b.closingTime || "18:00";
    setOpeningTime(openT);
    setClosingTime(closeT);
    setOperatingSchedule(cloneSchedule(b.operatingSchedule, openT, closeT));
    setShowWeeklyEditor(true);
    setPhone(b.phone ?? "");
    setAddress(b.address ?? "");
  }

  function updateDayRule(
    dayKey: "0" | "1" | "2" | "3" | "4" | "5" | "6",
    patch: Partial<DayHoursRule>
  ) {
    setOperatingSchedule((prev) => {
      const nextDays = {
        ...prev.days,
        [dayKey]: { ...prev.days[dayKey], ...patch },
      };
      if (dayKey === "1") {
        if (patch.start) setOpeningTime(patch.start);
        if (patch.end) setClosingTime(patch.end);
      }
      return { ...prev, days: nextDays };
    });
  }

  function applySchedulePreset(preset: "sat13" | "sat14" | "always") {
    if (preset === "always") {
      setOpeningTime("00:00");
      setClosingTime("23:59");
      setOperatingSchedule((prev) => ({
        ...prev,
        days: {
          "0": { open: true, start: "00:00", end: "23:59" },
          "1": { open: true, start: "00:00", end: "23:59" },
          "2": { open: true, start: "00:00", end: "23:59" },
          "3": { open: true, start: "00:00", end: "23:59" },
          "4": { open: true, start: "00:00", end: "23:59" },
          "5": { open: true, start: "00:00", end: "23:59" },
          "6": { open: true, start: "00:00", end: "23:59" },
        },
      }));
      return;
    }
    const satEnd = preset === "sat14" ? "14:00" : "13:00";
    setOpeningTime("08:00");
    setClosingTime("18:00");
    setOperatingSchedule((prev) => ({
      ...prev,
      days: {
        "0": { open: false, start: "09:00", end: "13:00" },
        "1": { open: true, start: "08:00", end: "18:00" },
        "2": { open: true, start: "08:00", end: "18:00" },
        "3": { open: true, start: "08:00", end: "18:00" },
        "4": { open: true, start: "08:00", end: "18:00" },
        "5": { open: true, start: "08:00", end: "18:00" },
        "6": { open: true, start: "08:00", end: satEnd },
      },
    }));
  }

  function handleLoadPublicHolidays() {
    const year = new Date().getFullYear();
    const defaults = buildStandardPublicHolidays(year);
    setOperatingSchedule((prev) => {
      const existingByDate = new Map(
        (prev.exceptions ?? []).map((ex) => [ex.date, ex])
      );
      for (const h of defaults) {
        if (!existingByDate.has(h.date)) {
          existingByDate.set(h.date, h);
        }
      }
      return {
        ...prev,
        exceptions: Array.from(existingByDate.values()).sort((a, b) =>
          a.date.localeCompare(b.date)
        ),
      };
    });
    toast.success(`Loaded standard ${year} public holidays (closed by default)`);
  }

  function handleAddException() {
    if (!newExDate || !newExLabel.trim()) {
      toast.error("Select a date and enter a holiday or event label.");
      return;
    }
    const entry: HolidayExceptionRule = {
      date: newExDate,
      label: newExLabel.trim(),
      mode: newExMode,
      ...(newExMode === "open_override"
        ? { start: newExStart || "09:00", end: newExEnd || "14:00" }
        : {}),
    };
    setOperatingSchedule((prev) => {
      const others = (prev.exceptions ?? []).filter((x) => x.date !== entry.date);
      return {
        ...prev,
        exceptions: [...others, entry].sort((a, b) => a.date.localeCompare(b.date)),
      };
    });
    setNewExDate("");
    setNewExLabel("");
  }

  function handleToggleExceptionMode(date: string) {
    setOperatingSchedule((prev) => ({
      ...prev,
      exceptions: (prev.exceptions ?? []).map((ex) =>
        ex.date === date
          ? ex.mode === "closed"
            ? { ...ex, mode: "open_override", start: ex.start || "09:00", end: ex.end || "14:00" }
            : { date: ex.date, label: ex.label, mode: "closed" }
          : ex
      ),
    }));
  }

  function handleRemoveException(date: string) {
    setOperatingSchedule((prev) => ({
      ...prev,
      exceptions: (prev.exceptions ?? []).filter((ex) => ex.date !== date),
    }));
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
          openingTime: operatingSchedule.days["1"]?.start || openingTime,
          closingTime: operatingSchedule.days["1"]?.end || closingTime,
          operatingSchedule,
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

              {/* Weekly Operating Hours & Public Holidays Editor */}
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3.5 md:col-span-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setShowWeeklyEditor((v) => !v)}
                    className="flex items-center gap-2 text-left text-xs font-semibold text-zinc-900"
                  >
                    <Clock className="size-3.5 text-blue-600" />
                    <span>Weekly Operating Hours &amp; Public Holidays (Eco-Standby)</span>
                    <ChevronDown
                      className={`size-3.5 text-zinc-400 transition-transform ${showWeeklyEditor ? "rotate-180" : ""}`}
                    />
                  </button>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => applySchedulePreset("sat13")}
                      className="rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 text-[10px] font-semibold text-zinc-700 transition hover:border-blue-400 hover:text-blue-700"
                    >
                      Mon–Fri 8–6, Sat 8–1, Sun Off
                    </button>
                    <button
                      type="button"
                      onClick={() => applySchedulePreset("sat14")}
                      className="rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 text-[10px] font-semibold text-zinc-700 transition hover:border-blue-400 hover:text-blue-700"
                    >
                      Mon–Fri 8–6, Sat 8–2, Sun Off
                    </button>
                    <button
                      type="button"
                      onClick={() => applySchedulePreset("always")}
                      className="rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 text-[10px] font-semibold text-zinc-700 transition hover:border-blue-400 hover:text-blue-700"
                    >
                      24/7 Always On
                    </button>
                  </div>
                </div>

                {showWeeklyEditor && (
                  <div className="mt-3 grid gap-4 lg:grid-cols-2">
                    {/* Per-Day Grid */}
                    <div className="space-y-1.5 rounded-lg border border-zinc-200/80 bg-white p-2.5">
                      <p className="text-[11px] font-semibold text-zinc-700">
                        Per-Day Schedule (Displays enter Eco-Standby outside these windows)
                      </p>
                      <div className="divide-y divide-zinc-100">
                        {WEEKDAY_ROWS.map((row) => {
                          const rule = operatingSchedule.days[row.key] ?? {
                            open: row.key !== "0",
                            start: "08:00",
                            end: row.key === "6" ? "13:00" : "18:00",
                          };
                          return (
                            <div
                              key={row.key}
                              className="flex items-center justify-between gap-2 py-1.5"
                            >
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateDayRule(row.key, { open: !rule.open })
                                  }
                                  className={`w-16 rounded-md px-2 py-0.5 text-[10px] font-semibold transition ${rule.open
                                      ? "bg-emerald-600 text-white"
                                      : "bg-zinc-200 text-zinc-600"
                                    }`}
                                >
                                  {rule.open ? "Open" : "Closed"}
                                </button>
                                <span className="w-20 text-xs font-medium text-zinc-800">
                                  {row.label}
                                </span>
                              </div>
                              {rule.open ? (
                                <div className="flex items-center gap-1.5">
                                  <Input
                                    type="time"
                                    className="h-7 w-28 text-[11px]"
                                    value={rule.start}
                                    onChange={(e) =>
                                      updateDayRule(row.key, { start: e.target.value })
                                    }
                                  />
                                  <span className="text-[11px] text-zinc-400">to</span>
                                  <Input
                                    type="time"
                                    className="h-7 w-28 text-[11px]"
                                    value={rule.end}
                                    onChange={(e) =>
                                      updateDayRule(row.key, { end: e.target.value })
                                    }
                                  />
                                </div>
                              ) : (
                                <span className="text-[11px] italic text-zinc-400">
                                  Closed all day (Eco-Standby)
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Public Holidays & Special Opening Overrides */}
                    <div className="flex flex-col justify-between space-y-2.5 rounded-lg border border-zinc-200/80 bg-white p-2.5">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-700">
                            <CalendarOff className="size-3.5 text-rose-500" />
                            Public Holidays &amp; Special Date Overrides
                          </p>
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={handleLoadPublicHolidays}
                          >
                            <Sparkles className="size-3 text-amber-500" />
                            Load Public Holidays
                          </Button>
                        </div>

                        <div className="grid grid-cols-12 gap-1.5">
                          <Input
                            type="date"
                            className="col-span-4 h-7 text-[11px]"
                            value={newExDate}
                            onChange={(e) => setNewExDate(e.target.value)}
                          />
                          <Input
                            className="col-span-5 h-7 text-[11px]"
                            placeholder="Holiday or Event name..."
                            value={newExLabel}
                            onChange={(e) => setNewExLabel(e.target.value)}
                          />
                          <select
                            value={newExMode}
                            onChange={(e) =>
                              setNewExMode(
                                e.target.value as "closed" | "open_override"
                              )
                            }
                            className="col-span-3 h-7 rounded-md border border-zinc-200 bg-white px-1.5 text-[11px] text-zinc-800"
                          >
                            <option value="closed">Closed</option>
                            <option value="open_override">Special Open</option>
                          </select>
                          {newExMode === "open_override" && (
                            <div className="col-span-9 flex items-center gap-1.5">
                              <span className="text-[10px] text-zinc-500">
                                Override Hours:
                              </span>
                              <Input
                                type="time"
                                className="h-7 w-28 text-[11px]"
                                value={newExStart}
                                onChange={(e) => setNewExStart(e.target.value)}
                              />
                              <span className="text-[10px] text-zinc-400">to</span>
                              <Input
                                type="time"
                                className="h-7 w-28 text-[11px]"
                                value={newExEnd}
                                onChange={(e) => setNewExEnd(e.target.value)}
                              />
                            </div>
                          )}
                          <Button
                            type="button"
                            size="xs"
                            variant="secondary"
                            onClick={handleAddException}
                            className={
                              newExMode === "open_override"
                                ? "col-span-3"
                                : "col-span-12"
                            }
                          >
                            <Plus className="size-3" />
                            Add Date Rule
                          </Button>
                        </div>

                        <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                          {(operatingSchedule.exceptions ?? []).length === 0 ? (
                            <p className="py-3 text-center text-[11px] text-zinc-400">
                              No public holidays or special dates added yet. Click{" "}
                              <strong>Load Public Holidays</strong> to auto-populate closed dates.
                            </p>
                          ) : (
                            (operatingSchedule.exceptions ?? []).map((ex) => (
                              <div
                                key={ex.date}
                                className="flex items-center justify-between gap-2 rounded-md border border-zinc-100 bg-zinc-50 px-2 py-1 text-[11px]"
                              >
                                <div className="min-w-0">
                                  <span className="font-mono font-semibold text-zinc-700">
                                    {ex.date}
                                  </span>{" "}
                                  <span className="truncate text-zinc-600">
                                    — {ex.label}
                                  </span>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleExceptionMode(ex.date)}
                                    title="Click to toggle Closed / Special Open Override"
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ex.mode === "closed"
                                        ? "bg-rose-100 text-rose-700"
                                        : "bg-emerald-100 text-emerald-700"
                                      }`}
                                  >
                                    {ex.mode === "closed"
                                      ? "Closed"
                                      : `Open ${ex.start ?? "09:00"}–${ex.end ?? "14:00"}`}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveException(ex.date)}
                                    className="rounded p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-rose-600"
                                  >
                                    <X className="size-3" />
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                      <p className="text-[10px] text-zinc-500">
                        Tip: Click any holiday badge to switch it between{" "}
                        <strong>Closed</strong> and <strong>Special Open Override</strong>{" "}
                        (e.g., if opening on a Sunday or holiday).
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-end justify-end gap-2 md:col-span-4">
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
                      <td className="px-4 py-3 text-[11px] text-zinc-600">
                        {(() => {
                          const summary = formatOperatingSummary(b);
                          return (
                            <div>
                              <span className="inline-flex items-center gap-1 font-mono">
                                <Clock className="size-3 shrink-0 text-zinc-400" />
                                {summary.primary}
                              </span>
                              {summary.secondary && (
                                <p className="mt-0.5 text-[10px] text-zinc-400">
                                  {summary.secondary}
                                </p>
                              )}
                            </div>
                          );
                        })()}
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
