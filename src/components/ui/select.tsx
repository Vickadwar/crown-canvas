"use client";

/**
 * @file src/components/ui/select.tsx
 * @description Vercel/Linear-inspired minimalist Select dropdown built on `@base-ui/react/select`
 * with crisp white surfaces, hairline borders, and neutral monochrome focus states.
 */

import { Select } from "@base-ui/react/select";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "cn";

const EMPTY_SENTINEL = "__crown_empty__";

export interface ModernSelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface ModernSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: ModernSelectOption[];
  placeholder?: string;
  size?: "xs" | "sm" | "default";
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}

export function ModernSelect({
  value,
  onValueChange,
  options,
  placeholder = "Select...",
  size = "default",
  className,
  disabled = false,
  ariaLabel,
}: ModernSelectProps) {
  const mappedValue = value === "" ? EMPTY_SENTINEL : value;
  const activeOption = options.find((opt) => opt.value === value);

  const triggerHeight =
    size === "xs"
      ? "h-7 px-2.5 text-xs rounded-md"
      : size === "sm"
        ? "h-8 px-2.5 text-xs rounded-lg"
        : "h-9 px-3 text-sm rounded-lg";

  return (
    <Select.Root
      value={mappedValue}
      disabled={disabled}
      onValueChange={(next) => {
        if (next === null || next === undefined) return;
        onValueChange(next === EMPTY_SENTINEL ? "" : String(next));
      }}
    >
      <Select.Trigger
        aria-label={ariaLabel}
        className={cn(
          "inline-flex w-full cursor-pointer items-center justify-between gap-2 border border-zinc-200 bg-white font-medium text-zinc-900 shadow-2xs transition-all duration-150 outline-none hover:border-zinc-300 hover:bg-zinc-50/70 focus-visible:border-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-950/10 data-[popup-open]:border-zinc-950 data-[popup-open]:ring-2 data-[popup-open]:ring-zinc-950/10 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:border-zinc-700 dark:focus-visible:border-zinc-400",
          triggerHeight,
          className
        )}
      >
        <span className="truncate text-left">
          {activeOption ? (
            activeOption.label
          ) : (
            <span className="text-zinc-400">{placeholder}</span>
          )}
        </span>
        <Select.Icon className="shrink-0 text-zinc-400">
          <ChevronsUpDown className="size-3.5" />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Positioner
          sideOffset={6}
          alignItemWithTrigger={false}
          className="z-50 outline-none"
        >
          <Select.Popup className="max-h-72 min-w-[var(--anchor-width)] max-w-[340px] origin-[var(--transform-origin)] overflow-hidden rounded-xl border border-zinc-200 bg-white p-1 text-zinc-950 shadow-lg shadow-zinc-950/8 transition-all duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:shadow-black/50">
            <Select.List className="max-h-68 overflow-y-auto py-0.5">
              {options.map((opt) => {
                const itemVal = opt.value === "" ? EMPTY_SENTINEL : opt.value;
                return (
                  <Select.Item
                    key={itemVal}
                    value={itemVal}
                    disabled={opt.disabled}
                    className="group relative flex cursor-pointer select-none items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-700 outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-zinc-100 data-[highlighted]:text-zinc-950 data-[selected]:text-zinc-950 dark:text-zinc-300 dark:data-[highlighted]:bg-zinc-900 dark:data-[highlighted]:text-white dark:data-[selected]:text-white"
                  >
                    <div className="min-w-0 flex-1">
                      <Select.ItemText className="block truncate">
                        {opt.label}
                      </Select.ItemText>
                      {opt.description && (
                        <span className="mt-0.5 block truncate text-[10px] font-normal text-zinc-400">
                          {opt.description}
                        </span>
                      )}
                    </div>
                    <Select.ItemIndicator className="shrink-0 text-zinc-950 dark:text-white">
                      <Check className="size-3.5" />
                    </Select.ItemIndicator>
                  </Select.Item>
                );
              })}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
