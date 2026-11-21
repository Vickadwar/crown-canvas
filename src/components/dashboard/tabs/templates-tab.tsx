"use client";

/**
 * @file src/components/dashboard/tabs/templates-tab.tsx
 * @description Cleanly aligned Templates Gallery with search, coloured division tabs,
 * uniform card heights, custom company templates, and 1-click launch into Crown Studio.
 */

import { useMemo, useState } from "react";
import { Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CanvasRenderer } from "@/components/player/canvas-renderer";
import type { CustomTemplateRecord } from "@/components/studio/canvas-editor";
import {
  BUILT_IN_STUDIO_TEMPLATES,
  type BuiltInStudioTemplate,
  type TemplateCategoryFilter,
} from "@/lib/studio-templates";
import type { OverviewPayload } from "../cms-types";

interface TemplatesTabProps {
  data: OverviewPayload;
  onOpenBuiltIn: (tpl: BuiltInStudioTemplate) => void;
  onOpenCustom: (ct: CustomTemplateRecord) => void;
  onDeleteCustom: (id: string) => Promise<void>;
  onCreateBlank: (orientation: "landscape" | "portrait") => void;
}

const CATEGORY_BADGE: Record<
  BuiltInStudioTemplate["category"],
  "info" | "danger" | "warning" | "purple"
> = {
  decorative: "info",
  automotive: "danger",
  industrial: "warning",
  department: "purple",
};

export function TemplatesTab({
  data,
  onOpenBuiltIn,
  onOpenCustom,
  onDeleteCustom,
  onCreateBlank,
}: TemplatesTabProps) {
  const [filter, setFilter] = useState<TemplateCategoryFilter>("all");
  const [search, setSearch] = useState("");

  const customList = useMemo(
    () => data.customTemplates ?? [],
    [data.customTemplates]
  );

  const filteredCustom = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customList;
    return customList.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q)
    );
  }, [customList, search]);

  const filteredBuiltIn = useMemo(() => {
    const q = search.trim().toLowerCase();
    return BUILT_IN_STUDIO_TEMPLATES.filter((tpl) => {
      if (filter !== "all" && tpl.category !== filter) return false;
      if (!q) return true;
      return (
        tpl.name.toLowerCase().includes(q) ||
        tpl.description.toLowerCase().includes(q) ||
        tpl.divisionLabel.toLowerCase().includes(q) ||
        tpl.departmentCode.toLowerCase().includes(q)
      );
    });
  }, [filter, search]);

  return (
    <div className="space-y-5">
      {/* Unified Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-zinc-400" />
            <Input
              className="h-8 pl-8 text-xs"
              placeholder="Search 16+ industry & dept templates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Badge variant="purple">
            {BUILT_IN_STUDIO_TEMPLATES.length + customList.length} Templates
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onCreateBlank("portrait")}
          >
            <Plus className="size-3.5" />
            Blank 9:16 Portrait
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => onCreateBlank("landscape")}
          >
            <Sparkles className="size-3.5" />
            Blank 16:9 Canvas
          </Button>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            {
              id: "all",
              label: `All (${BUILT_IN_STUDIO_TEMPLATES.length + customList.length})`,
            },
            { id: "decorative", label: "Decorative Paints (4)" },
            { id: "automotive", label: "Automotive Refinish (3)" },
            { id: "industrial", label: "Industrial & Marine (3)" },
            { id: "department", label: "Departments (6)" },
            { id: "custom", label: `My Custom (${customList.length})` },
          ] as const
        ).map((pill) => (
          <button
            key={pill.id}
            type="button"
            onClick={() => setFilter(pill.id)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
              filter === pill.id
                ? "bg-zinc-950 text-white shadow-2xs"
                : "border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-950"
            }`}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* Custom Company Templates */}
      {(filter === "all" || filter === "custom") && filteredCustom.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              My Custom Company Templates
            </p>
            <Badge variant="success">{filteredCustom.length}</Badge>
          </div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filteredCustom.map((ct) => (
              <Card
                key={ct.id}
                className="flex flex-col overflow-hidden transition hover:border-zinc-400 hover:shadow-sm"
              >
                <div className="aspect-video w-full overflow-hidden border-b border-zinc-200 bg-zinc-950">
                  <CanvasRenderer doc={ct.canvasDoc} />
                </div>
                <CardContent className="flex flex-1 flex-col justify-between gap-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="mb-1 flex items-center gap-1.5">
                        <Badge variant="success">Custom</Badge>
                        <span className="font-mono text-[10px] text-zinc-400">
                          {ct.orientation}
                        </span>
                      </div>
                      <p className="truncate text-sm font-semibold text-zinc-950">
                        {ct.name}
                      </p>
                    </div>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => void onDeleteCustom(ct.id)}
                    >
                      <Trash2 className="size-3.5 text-rose-500" />
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => onOpenCustom(ct)}
                  >
                    <Sparkles className="size-3.5" />
                    Customize in Studio
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {filter === "custom" && filteredCustom.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center text-sm text-zinc-500">
            No custom templates saved yet. Open any design in{" "}
            <strong>Crown Studio</strong> and click <strong>Save Template</strong>.
          </CardContent>
        </Card>
      )}

      {/* Built-In Industry & Corporate Templates — Uniform Height Grid */}
      {filter !== "custom" && (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredBuiltIn.map((tpl) => (
            <Card
              key={tpl.id}
              className="group flex flex-col overflow-hidden transition hover:border-zinc-400 hover:shadow-sm"
            >
              <div className="aspect-video w-full overflow-hidden border-b border-zinc-200 bg-zinc-950">
                <CanvasRenderer doc={tpl.canvasDoc} />
              </div>
              <CardContent className="flex flex-1 flex-col justify-between gap-3 p-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant={CATEGORY_BADGE[tpl.category]}>
                      {tpl.divisionLabel}
                    </Badge>
                    <span className="font-mono text-[10px] text-zinc-400">
                      {tpl.departmentCode}
                    </span>
                  </div>
                  <p className="line-clamp-1 text-sm font-semibold text-zinc-950">
                    {tpl.name}
                  </p>
                  <p className="line-clamp-2 min-h-[2.5em] text-xs leading-relaxed text-zinc-500">
                    {tpl.description}
                  </p>
                </div>

                <Button
                  size="sm"
                  className="mt-auto w-full"
                  onClick={() => onOpenBuiltIn(tpl)}
                >
                  <Sparkles className="size-3.5" />
                  Customize in Studio
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
