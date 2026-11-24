/**
 * @file src/lib/screen-health.ts
 * @description Real-time screen health evaluator (`online` | `degraded` | `offline`)
 * derived from `lastHeartbeatAt` plus flexible per-day (Mon–Sun) & Public Holiday
 * operating-hours Eco-Standby evaluator.
 */

import type { BranchOperatingSchedule } from "@/db/schema/locations";

export type ScreenHealthStatus = "online" | "degraded" | "offline";

export const ONLINE_THRESHOLD_MS = 90_000; // < 90s since last 30s heartbeat
export const DEGRADED_THRESHOLD_MS = 300_000; // 90s - 5m = degraded

export const STANDARD_RETAIL_SCHEDULE: BranchOperatingSchedule = {
  days: {
    "0": { open: false, start: "09:00", end: "13:00" }, // Sunday: Closed
    "1": { open: true, start: "08:00", end: "18:00" },  // Monday
    "2": { open: true, start: "08:00", end: "18:00" },  // Tuesday
    "3": { open: true, start: "08:00", end: "18:00" },  // Wednesday
    "4": { open: true, start: "08:00", end: "18:00" },  // Thursday
    "5": { open: true, start: "08:00", end: "18:00" },  // Friday
    "6": { open: true, start: "08:00", end: "13:00" },  // Saturday: Half day
  },
  exceptions: [],
};

const DAY_NAMES: Record<string, string> = {
  "0": "Sunday",
  "1": "Monday",
  "2": "Tuesday",
  "3": "Wednesday",
  "4": "Thursday",
  "5": "Friday",
  "6": "Saturday",
};

export function computeScreenHealth(
  lastHeartbeatAt: Date | string | null | undefined,
  nowMs: number = Date.now()
): { isOnline: boolean; healthStatus: ScreenHealthStatus; ageSeconds: number | null } {
  if (!lastHeartbeatAt) {
    return { isOnline: false, healthStatus: "offline", ageSeconds: null };
  }
  const ts =
    typeof lastHeartbeatAt === "string"
      ? Date.parse(lastHeartbeatAt)
      : lastHeartbeatAt.getTime();
  if (!Number.isFinite(ts)) {
    return { isOnline: false, healthStatus: "offline", ageSeconds: null };
  }
  const diffMs = Math.max(0, nowMs - ts);
  const ageSeconds = Math.round(diffMs / 1000);
  if (diffMs <= ONLINE_THRESHOLD_MS) {
    return { isOnline: true, healthStatus: "online", ageSeconds };
  }
  if (diffMs <= DEGRADED_THRESHOLD_MS) {
    return { isOnline: false, healthStatus: "degraded", ageSeconds };
  }
  return { isOnline: false, healthStatus: "offline", ageSeconds };
}

function getLocalDateClock(
  timezone: string,
  now: Date
): { dateIso: string; dayKey: "0" | "1" | "2" | "3" | "4" | "5" | "6"; hhmm: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const year = parts.find((p) => p.type === "year")?.value ?? "2026";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = parts.find((p) => p.type === "hour")?.value ?? "12";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";

  const dayMap: Record<string, "0" | "1" | "2" | "3" | "4" | "5" | "6"> = {
    Sun: "0",
    Mon: "1",
    Tue: "2",
    Wed: "3",
    Thu: "4",
    Fri: "5",
    Sat: "6",
  };

  return {
    dateIso: `${year}-${month}-${day}`,
    dayKey: dayMap[weekday] ?? "1",
    hhmm: `${hour === "24" ? "00" : hour}:${minute}`,
  };
}

function isTimeInsideWindow(hhmm: string, start: string, end: string): boolean {
  if (start === "00:00" && end === "23:59") return true;
  if (start <= end) {
    return hhmm >= start && hhmm <= end;
  }
  return hhmm >= start || hhmm <= end;
}

export interface OperatingStatusResult {
  isOpen: boolean;
  reason: string;
  activeWindow?: string;
}

/**
 * Evaluates full weekly operating hours (Mon–Sun) + Public Holidays / Special Open Overrides
 * in the location's local timezone. Falls back cleanly to legacy `openingTime`/`closingTime`.
 */
export function evaluateOperatingStatus(params: {
  openingTime?: string | null;
  closingTime?: string | null;
  operatingSchedule?: BranchOperatingSchedule | null;
  timezone?: string;
  now?: Date;
}): OperatingStatusResult {
  const tz = params.timezone || "Africa/Nairobi";
  const now = params.now ?? new Date();

  try {
    const { dateIso, dayKey, hhmm } = getLocalDateClock(tz, now);
    const sched = params.operatingSchedule;

    if (sched && sched.days) {
      // 1. Check exact-date holiday / special open override first
      const exception = (sched.exceptions ?? []).find((ex) => ex.date === dateIso);
      if (exception) {
        if (exception.mode === "closed") {
          return {
            isOpen: false,
            reason: `Closed — ${exception.label || "Public Holiday"}`,
          };
        }
        const ovStart = exception.start || "08:00";
        const ovEnd = exception.end || "17:00";
        const openNow = isTimeInsideWindow(hhmm, ovStart, ovEnd);
        return {
          isOpen: openNow,
          reason: openNow
            ? `Special Opening — ${exception.label}`
            : `After Special Hours (${ovStart} – ${ovEnd})`,
          activeWindow: `${ovStart} – ${ovEnd}`,
        };
      }

      // 2. Evaluate specific day-of-week rule (e.g., Mon-Fri 08:00-18:00, Sat 08:00-13:00, Sun Closed)
      const dayRule = sched.days[dayKey];
      if (dayRule) {
        if (!dayRule.open) {
          return {
            isOpen: false,
            reason: `Closed — ${DAY_NAMES[dayKey] ?? "Weekend"}`,
          };
        }
        const openNow = isTimeInsideWindow(hhmm, dayRule.start, dayRule.end);
        return {
          isOpen: openNow,
          reason: openNow
            ? `Open (${dayRule.start} – ${dayRule.end})`
            : `Eco-Standby (${DAY_NAMES[dayKey]} Hours: ${dayRule.start} – ${dayRule.end})`,
          activeWindow: `${dayRule.start} – ${dayRule.end}`,
        };
      }
    }

    // 3. Legacy flat openingTime / closingTime fallback
    const opening = params.openingTime;
    const closing = params.closingTime;
    if (!opening || !closing) {
      return { isOpen: true, reason: "Always Open" };
    }
    const openNow = isTimeInsideWindow(hhmm, opening, closing);
    return {
      isOpen: openNow,
      reason: openNow
        ? `Open (${opening} – ${closing})`
        : `Operating Hours: ${opening} – ${closing}`,
      activeWindow: `${opening} – ${closing}`,
    };
  } catch {
    return { isOpen: true, reason: "Open" };
  }
}

/**
 * Legacy helper preserved for backward compatibility with existing callers & tests.
 */
export function isWithinOperatingHours(
  openingTime: string | null | undefined,
  closingTime: string | null | undefined,
  timezone: string = "Africa/Nairobi",
  now: Date = new Date()
): boolean {
  return evaluateOperatingStatus({
    openingTime,
    closingTime,
    timezone,
    now,
  }).isOpen;
}
