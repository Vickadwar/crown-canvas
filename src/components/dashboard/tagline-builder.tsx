"use client";

/**
 * @file src/components/dashboard/tagline-builder.tsx
 * @description Multi-tagline bottom ticker editor with inline Icon & Store Badge picker
 * (Google Play, App Store, WhatsApp, Paint, Promo, Safety, Hotline, etc.).
 */

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModernSelect } from "@/components/ui/select";
import { TickerIconBadge } from "@/components/player/ticker-bar";
import {
  parseTickerString,
  serializeTickerItems,
  TICKER_ICON_OPTIONS,
  type TickerIconKey,
} from "@/lib/ticker-parser";

interface TaglineBuilderProps {
  value: string;
  onChange: (nextSerialized: string) => void;
  onSave?: (nextSerialized: string) => void;
  saveLabel?: string;
  placeholder?: string;
  compact?: boolean;
}

export function TaglineBuilder({
  value,
  onChange,
  onSave,
  saveLabel = "Save Taglines",
  placeholder = "e.g. Download Team Kubwa App Today!",
  compact = false,
}: TaglineBuilderProps) {
  const [draftIcon, setDraftIcon] = useState<TickerIconKey>("none");
  const [draftText, setDraftText] = useState("");

  const items = parseTickerString(value);

  function addDraftItem() {
    const clean = draftText.trim();
    if (!clean) return;
    const next = serializeTickerItems([...items, { icon: draftIcon, text: clean }]);
    onChange(next);
    setDraftText("");
    setDraftIcon("none");
  }

  function removeItem(index: number) {
    const next = serializeTickerItems(items.filter((_, idx) => idx !== index));
    onChange(next);
  }

  function handleSaveClick() {
    let finalSerialized = value;
    if (draftText.trim()) {
      finalSerialized = serializeTickerItems([
        ...items,
        { icon: draftIcon, text: draftText.trim() },
      ]);
      onChange(finalSerialized);
      setDraftText("");
      setDraftIcon("none");
    }
    onSave?.(finalSerialized);
  }

  return (
    <div className="space-y-2">
      {/* Existing taglines list */}
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item, idx) => (
            <div
              key={`${idx}-${item.icon}-${item.text}`}
              className="inline-flex max-w-full items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <TickerIconBadge icon={item.icon} />
              <span className="truncate font-medium">{item.text}</span>
              <button
                type="button"
                onClick={() => removeItem(idx)}
                className="ml-0.5 rounded p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-900"
                title="Remove tagline"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add new tagline + icon/badge selector */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className={compact ? "w-44" : "w-48"}>
          <ModernSelect
            size="xs"
            value={draftIcon}
            onValueChange={(v) => setDraftIcon(v as TickerIconKey)}
            options={TICKER_ICON_OPTIONS}
            ariaLabel="Tagline Icon or Store Badge"
          />
        </div>
        <Input
          className="h-7 min-w-[180px] flex-1 text-xs"
          placeholder={placeholder}
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addDraftItem();
            }
          }}
        />
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={addDraftItem}
          disabled={!draftText.trim()}
        >
          <Plus className="size-3" />
          Add
        </Button>
        {onSave && (
          <Button
            type="button"
            size="xs"
            variant="default"
            onClick={handleSaveClick}
          >
            {saveLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
