/**
 * @file src/lib/screen-health.ts
 * @description Real-time screen health evaluator (`online` | `degraded` | `offline`)
 * derived from `lastHeartbeatAt` plus branch operating-hours Eco-Standby check.
 */

export type ScreenHealthStatus = "online" | "degraded" | "offline";

export const ONLINE_THRESHOLD_MS = 90_000; // < 90s since last 30s heartbeat
export const DEGRADED_THRESHOLD_MS = 300_000; // 90s - 5m = degraded

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

/**
 * Evaluates whether the current local time in `timezone` falls inside
 * `[openingTime, closingTime]` (`HH:MM` 24-hour format). Used by `/player`
 * to enter Eco-Standby after showroom closing hours to protect TV panels.
 */
export function isWithinOperatingHours(
  openingTime: string | null | undefined,
  closingTime: string | null | undefined,
  timezone: string = "Africa/Nairobi",
  now: Date = new Date()
): boolean {
  if (!openingTime || !closingTime) return true;
  if (openingTime === "00:00" && closingTime === "23:59") return true;

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "Africa/Nairobi",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const hour = parts.find((p) => p.type === "hour")?.value ?? "12";
    const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
    const hhmm = `${hour === "24" ? "00" : hour}:${minute}`;

    if (openingTime <= closingTime) {
      return hhmm >= openingTime && hhmm <= closingTime;
    }
    // Overnight operating window
    return hhmm >= openingTime || hhmm <= closingTime;
  } catch {
    return true;
  }
}
