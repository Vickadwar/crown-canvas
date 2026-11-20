/**
 * @file src/lib/schedule-resolver.ts
 * @description Evaluates dayparting and priority schedules in each East Africa country's
 * local timezone (`Africa/Nairobi`, `Africa/Dar_es_Salaam`, `Africa/Kampala`).
 */

export interface SchedulableScreenContext {
  screenId: string;
  branchId: string;
  countryId?: string | null;
  groupId?: string | null;
  screenRole: string;
  timezone: string;
}

export interface ScheduleRecord {
  id: string;
  name: string;
  playlistId: string;
  targetType:
    | "screen"
    | "screen_group"
    | "branch"
    | "country"
    | "screen_role"
    | "global";
  targetId: string | null;
  targetScreenRole: string | null;
  priority: number;
  startDate: Date | null;
  endDate: Date | null;
  daysOfWeek: number[];
  daypartStart: string;
  daypartEnd: string;
  isActive: boolean;
}

function getLocalClockAndDay(now: Date, timezone: string): {
  dayOfWeek: number;
  hhmm: string;
} {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "Africa/Nairobi",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);

    const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
    const hour = parts.find((p) => p.type === "hour")?.value ?? "12";
    const minute = parts.find((p) => p.type === "minute")?.value ?? "00";

    const dayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };

    return {
      dayOfWeek: dayMap[weekdayStr] ?? now.getDay(),
      hhmm: `${hour === "24" ? "00" : hour}:${minute}`,
    };
  } catch {
    return {
      dayOfWeek: now.getDay(),
      hhmm: now.toTimeString().slice(0, 5),
    };
  }
}

function isWithinDaypart(hhmm: string, start: string, end: string): boolean {
  if (start <= end) {
    return hhmm >= start && hhmm <= end;
  }
  // Overnight window (e.g. 22:00 - 06:00)
  return hhmm >= start || hhmm <= end;
}

/**
 * Resolves the highest-priority active schedule matching the given screen
 * in its country's local East Africa timezone.
 */
export function resolveActiveSchedule(
  allSchedules: ScheduleRecord[],
  ctx: SchedulableScreenContext,
  now: Date = new Date()
): ScheduleRecord | null {
  const { dayOfWeek, hhmm } = getLocalClockAndDay(now, ctx.timezone);

  const matching = allSchedules.filter((sch) => {
    if (!sch.isActive) return false;
    if (sch.startDate && now < sch.startDate) return false;
    if (sch.endDate && now > sch.endDate) return false;
    if (!sch.daysOfWeek.includes(dayOfWeek)) return false;
    if (!isWithinDaypart(hhmm, sch.daypartStart, sch.daypartEnd)) return false;

    switch (sch.targetType) {
      case "global":
        return true;
      case "country":
        return Boolean(ctx.countryId && sch.targetId === ctx.countryId);
      case "branch":
        return sch.targetId === ctx.branchId;
      case "screen_group":
        return Boolean(ctx.groupId && sch.targetId === ctx.groupId);
      case "screen_role":
        return Boolean(
          sch.targetScreenRole && sch.targetScreenRole === ctx.screenRole
        );
      case "screen":
        return sch.targetId === ctx.screenId;
      default:
        return false;
    }
  });

  if (matching.length === 0) return null;

  // Highest priority wins; specificity breaks ties
  const specificityRank: Record<ScheduleRecord["targetType"], number> = {
    screen: 6,
    screen_group: 5,
    branch: 4,
    screen_role: 3,
    country: 2,
    global: 1,
  };

  matching.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return specificityRank[b.targetType] - specificityRank[a.targetType];
  });

  return matching[0];
}
