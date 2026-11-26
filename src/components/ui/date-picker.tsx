"use client";

/**
 * @file src/components/ui/date-picker.tsx
 * @description Sleek, modern minimalist Calendar Date Picker (`YYYY-MM-DD` value contract)
 * replacing native browser `<input type="date">` controls across Crown Canvas CMS.
 */

import { useEffect, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from "lucide-react";

interface DatePickerProps {
  value: string; // "YYYY-MM-DD" or ""
  onChange: (nextValue: string) => void;
  placeholder?: string;
  size?: "xs" | "sm";
  className?: string;
  align?: "left" | "right";
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function parseIsoSafe(raw: string): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = parseISO(raw);
  return isValid(d) ? d : null;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date...",
  size = "sm",
  className = "",
  align = "left",
}: DatePickerProps) {
  const selected = parseIsoSafe(value);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(() => selected ?? new Date());
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function openCalendar() {
    setViewMonth(selected ?? new Date());
    setOpen((v) => !v);
  }

  function pickDate(d: Date) {
    onChange(format(d, "yyyy-MM-dd"));
    setOpen(false);
  }

  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(monthStart);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const days: Date[] = [];
  let cursor = gridStart;
  while (cursor <= gridEnd) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }

  const today = new Date();
  const heightClass = size === "xs" ? "h-7 text-[11px]" : "h-8 text-xs";

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div
        className={`flex w-full items-center justify-between gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 shadow-2xs transition hover:border-zinc-300 focus-within:border-zinc-400 focus-within:ring-2 focus-within:ring-zinc-950/10 ${heightClass}`}
      >
        <button
          type="button"
          onClick={openCalendar}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <CalendarIcon className="size-3.5 shrink-0 text-zinc-400" />
          <span
            className={`truncate ${
              selected ? "font-medium text-zinc-900" : "text-zinc-400"
            }`}
          >
            {selected ? format(selected, "MMM d, yyyy") : placeholder}
          </span>
        </button>
        {selected && (
          <button
            type="button"
            title="Clear date"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            className="rounded p-0.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
          >
            <X className="size-3" />
          </button>
        )}
      </div>

      {open && (
        <div
          className={`absolute top-full z-50 mt-1.5 w-[264px] rounded-xl border border-zinc-200 bg-white p-3 shadow-[0_12px_36px_rgba(0,0,0,0.12)] ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {/* Month Header */}
          <div className="mb-2.5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewMonth((m) => subMonths(m, 1))}
              className="flex size-7 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950"
              aria-label="Previous month"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <span className="text-xs font-semibold tracking-tight text-zinc-950">
              {format(viewMonth, "MMMM yyyy")}
            </span>
            <button
              type="button"
              onClick={() => setViewMonth((m) => addMonths(m, 1))}
              className="flex size-7 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950"
              aria-label="Next month"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>

          {/* Weekday Labels */}
          <div className="mb-1 grid grid-cols-7 text-center">
            {WEEKDAYS.map((wd) => (
              <span
                key={wd}
                className="py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400"
              >
                {wd}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {days.map((day) => {
              const inMonth = isSameMonth(day, monthStart);
              const isSelected = Boolean(selected && isSameDay(day, selected));
              const isToday = isSameDay(day, today);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => pickDate(day)}
                  className={`flex size-8 items-center justify-center rounded-lg text-xs transition ${
                    isSelected
                      ? "bg-zinc-950 font-semibold text-white shadow-2xs"
                      : isToday
                        ? "border border-blue-500/60 bg-blue-50 font-semibold text-blue-700 hover:bg-blue-100"
                        : inMonth
                          ? "font-medium text-zinc-800 hover:bg-zinc-100"
                          : "text-zinc-300 hover:bg-zinc-50 hover:text-zinc-500"
                  }`}
                >
                  {format(day, "d")}
                </button>
              );
            })}
          </div>

          {/* Footer Shortcuts */}
          <div className="mt-2.5 flex items-center justify-between border-t border-zinc-100 pt-2">
            <button
              type="button"
              onClick={() => pickDate(new Date())}
              className="rounded-md px-2 py-1 text-[11px] font-semibold text-blue-600 transition hover:bg-blue-50"
            >
              Today
            </button>
            {selected && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="rounded-md px-2 py-1 text-[11px] font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
