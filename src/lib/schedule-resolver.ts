/**
 * @file src/lib/schedule-resolver.ts
 * @description Evaluates dayparting and priority schedules in each East Africa country's
 * local timezone (`Africa/Nairobi`, `Africa/Dar_es_Salaam`, `Africa/Kampala`).
 */

import type { ScheduleRotationStep } from "@/db/schema/schedules";

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
  rotationSequence?: ScheduleRotationStep[] | null;
  isActive: boolean;
}

export interface TargetableCampaign {
  targetType:
    | "screen"
    | "screen_group"
    | "branch"
    | "country"
    | "screen_role"
    | "global";
  targetId: string | null;
  targetScreenIds?: string[] | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  isActive: boolean;
}

/**
 * Shared screen & date-window matcher for Promotions, Employee Recognitions, and Schedules.
 */
export function matchesScreenTarget(
  item: TargetableCampaign,
  ctx: SchedulableScreenContext,
  now: Date = new Date()
): boolean {
  if (!item.isActive) return false;
  if (item.startDate) {
    const start =
      typeof item.startDate === "string" ? new Date(item.startDate) : item.startDate;
    if (Number.isFinite(start.getTime()) && now < start) return false;
  }
  if (item.endDate) {
    const end =
      typeof item.endDate === "string" ? new Date(item.endDate) : item.endDate;
    if (Number.isFinite(end.getTime()) && now > end) return false;
  }

  if (Array.isArray(item.targetScreenIds) && item.targetScreenIds.length > 0) {
    return item.targetScreenIds.includes(ctx.screenId);
  }

  switch (item.targetType) {
    case "global":
      return true;
    case "country":
      return Boolean(ctx.countryId && item.targetId === ctx.countryId);
    case "branch":
      return item.targetId === ctx.branchId;
    case "screen_group":
      return Boolean(ctx.groupId && item.targetId === ctx.groupId);
    case "screen_role":
      return item.targetId ? item.targetId === ctx.screenRole : true;
    case "screen":
      return item.targetId === ctx.screenId;
    default:
      return false;
  }
}

/**
 * Evaluates whether an active Promotion should air on a given display.
 * When `targetPlaylistIds` explicitly embeds the Promotion into specific playlists,
 * ANY screen currently playing one of those playlists receives the Promotion (still
 * enforcing `isActive` and `startDate`/`endDate` expiry) — avoiding the trap where
 * an older narrow screen target silently hides a newly embedded playlist promotion.
 */
export function matchesPromotionForScreen(
  promo: TargetableCampaign & { targetPlaylistIds?: string[] | null },
  ctx: SchedulableScreenContext,
  options: {
    activePlaylistId?: string | null;
    isDedicatedPromotionsStep?: boolean;
    now?: Date;
  } = {}
): boolean {
  const now = options.now ?? new Date();
  if (!promo.isActive) return false;
  if (promo.startDate) {
    const start =
      typeof promo.startDate === "string"
        ? new Date(promo.startDate)
        : promo.startDate;
    if (Number.isFinite(start.getTime()) && now < start) return false;
  }
  if (promo.endDate) {
    const end =
      typeof promo.endDate === "string" ? new Date(promo.endDate) : promo.endDate;
    if (Number.isFinite(end.getTime()) && now > end) return false;
  }

  const explicitPlaylists = Array.isArray(promo.targetPlaylistIds)
    ? promo.targetPlaylistIds
    : [];

  if (explicitPlaylists.length > 0 && !options.isDedicatedPromotionsStep) {
    return Boolean(
      options.activePlaylistId &&
        explicitPlaylists.includes(options.activePlaylistId)
    );
  }

  return matchesScreenTarget(promo, ctx, now);
}

/**
 * Resolves effective Promotion ad-break cadence for a playlist:
 * - `-1` = explicitly blocked on this playlist
 * - `0`  = Auto (1 promotion every 3 slides whenever matching promotions exist)
 * - `N > 0` = exact configured cadence (1 promotion every N slides)
 */
export function resolveEffectivePromoCadence(
  configuredPromoEveryN: number | null | undefined,
  hasMatchingPromotions: boolean
): number {
  if (!hasMatchingPromotions) return 0;
  const raw = typeof configuredPromoEveryN === "number" ? configuredPromoEveryN : 0;
  if (raw < 0) return 0;
  if (raw === 0) return 3;
  return Math.max(1, Math.floor(raw));
}

/**
 * Deterministically picks which step in a chained `rotationSequence` (e.g.
 * Playlist A 15 min -> Promotions 5 min -> Playlist B 15 min -> loop) should air
 * at `now`, keeping all screens in the same showroom synchronized without flickering.
 */
export function resolveActiveRotationStep(
  sequence: ScheduleRotationStep[] | null | undefined,
  now: Date = new Date(),
  timezone: string = "Africa/Nairobi"
): { step: ScheduleRotationStep; stepIndex: number; remainingSeconds: number } | null {
  if (!sequence || sequence.length === 0) return null;
  const validSteps = sequence.filter((s) => (s.durationMinutes ?? 0) > 0);
  if (validSteps.length === 0) return null;

  const totalMinutes = validSteps.reduce(
    (sum, s) => sum + Math.max(1, Math.round(s.durationMinutes)),
    0
  );
  const { hhmm } = getLocalClockAndDay(now, timezone);
  const [hStr, mStr] = hhmm.split(":");
  const minuteOfDay = (Number(hStr) || 0) * 60 + (Number(mStr) || 0);
  const secondOfMinute = now.getSeconds();
  const cyclePosSec = ((minuteOfDay % totalMinutes) * 60) + secondOfMinute;

  let cursorSec = 0;
  for (let idx = 0; idx < validSteps.length; idx++) {
    const step = validSteps[idx];
    const stepLenSec = Math.max(1, Math.round(step.durationMinutes)) * 60;
    if (cyclePosSec < cursorSec + stepLenSec) {
      return {
        step,
        stepIndex: idx,
        remainingSeconds: Math.max(5, cursorSec + stepLenSec - cyclePosSec),
      };
    }
    cursorSec += stepLenSec;
  }

  return {
    step: validSteps[0],
    stepIndex: 0,
    remainingSeconds: Math.max(60, Math.round(validSteps[0].durationMinutes) * 60),
  };
}

/**
 * Interleaves active targeted Promotions and/or Employee Recognition spotlights into a
 * base playlist queue at configurable intervals (e.g., 1 promotion every 3 slides,
 * 1 employee spotlight every 6 slides) while preserving smooth playback flow.
 */
export function interleavePlaybackItems<T>(params: {
  baseItems: T[];
  promotions?: T[];
  promoEveryN?: number;
  recognitions?: T[];
  recognitionEveryN?: number;
}): T[] {
  const base = params.baseItems;
  const promos = params.promotions ?? [];
  const recs = params.recognitions ?? [];
  const promoN = Math.max(0, Math.floor(params.promoEveryN ?? 0));
  const recN = Math.max(0, Math.floor(params.recognitionEveryN ?? 0));

  if (base.length === 0) {
    if (promos.length > 0 || recs.length > 0) {
      return [...promos, ...recs];
    }
    return [];
  }

  if ((promoN <= 0 || promos.length === 0) && (recN <= 0 || recs.length === 0)) {
    return base;
  }

  const out: T[] = [];
  let promoCursor = 0;
  let recCursor = 0;

  for (let i = 0; i < base.length; i++) {
    out.push(base[i]);
    const slideNumber = i + 1;

    if (promoN > 0 && promos.length > 0 && slideNumber % promoN === 0) {
      out.push(promos[promoCursor % promos.length]);
      promoCursor += 1;
    }

    if (recN > 0 && recs.length > 0 && slideNumber % recN === 0) {
      out.push(recs[recCursor % recs.length]);
      recCursor += 1;
    }
  }

  // Ensure at least one promo/recognition airs per loop if the playlist is shorter than N
  if (promoN > 0 && promos.length > 0 && promoCursor === 0) {
    out.push(promos[0]);
  }
  if (recN > 0 && recs.length > 0 && recCursor === 0) {
    out.push(recs[0]);
  }

  return out;
}

export interface AtomicBlockSchedule<T> {
  items: T[];
  everyN: number;
}

/**
 * Assembles the final playback queue while guaranteeing that multi-page Newsletters
 * and multi-page Employee Recognition Walls are NEVER split by promotions or by each
 * other. Every atomic block is inserted strictly at a base-slide boundary so Page 1 ->
 * Page 2 -> ... -> Page N always renders continuously without interruption.
 */
export function assembleAtomicPlaybackQueue<T>(params: {
  baseItems: T[];
  promotions?: T[];
  promoEveryN?: number;
  newsletterBlocks?: AtomicBlockSchedule<T>[];
  recognitionBlocks?: AtomicBlockSchedule<T>[];
}): T[] {
  const base = params.baseItems;
  const promos = params.promotions ?? [];
  const promoN = Math.max(0, Math.floor(params.promoEveryN ?? 0));
  const nlBlocks = (params.newsletterBlocks ?? []).filter(
    (b) => b.items.length > 0
  );
  const recBlocks = (params.recognitionBlocks ?? []).filter(
    (b) => b.items.length > 0
  );

  if (base.length === 0) {
    return [
      ...promos,
      ...nlBlocks.flatMap((b) => b.items),
      ...recBlocks.flatMap((b) => b.items),
    ];
  }

  // Assign each atomic newsletter and recognition block to a deterministic base-slide boundary
  const nlAtSlide = new Map<number, T[][]>();
  nlBlocks.forEach((block, idx) => {
    const cadence = Math.max(1, Math.floor(block.everyN || 4));
    const slot = Math.min(base.length, cadence * (idx + 1));
    const existing = nlAtSlide.get(slot) ?? [];
    existing.push(block.items);
    nlAtSlide.set(slot, existing);
  });

  const recAtSlide = new Map<number, T[][]>();
  recBlocks.forEach((block, idx) => {
    const cadence = Math.max(1, Math.floor(block.everyN || 6));
    const slot = Math.min(base.length, cadence * (idx + 1));
    const existing = recAtSlide.get(slot) ?? [];
    existing.push(block.items);
    recAtSlide.set(slot, existing);
  });

  const out: T[] = [];
  let promoCursor = 0;

  for (let i = 0; i < base.length; i++) {
    out.push(base[i]);
    const slideNumber = i + 1;

    if (promoN > 0 && promos.length > 0 && slideNumber % promoN === 0) {
      out.push(promos[promoCursor % promos.length]);
      promoCursor += 1;
    }

    const nlHere = nlAtSlide.get(slideNumber);
    if (nlHere) {
      for (const blockItems of nlHere) {
        out.push(...blockItems);
      }
    }

    const recHere = recAtSlide.get(slideNumber);
    if (recHere) {
      for (const blockItems of recHere) {
        out.push(...blockItems);
      }
    }
  }

  // Ensure at least one promotion airs per loop if the base playlist is shorter than promoEveryN
  if (promoN > 0 && promos.length > 0 && promoCursor === 0) {
    out.push(promos[0]);
  }

  return out;
}

export interface NewsletterSpreadSlide<P> {
  left: P;
  right: P | null;
  pageNumbers: number[];
  durationSeconds: number;
}

/**
 * Pairs sequential A4 portrait newsletter pages into wide 2-page magazine spreads
 * ([P1, P2], [P3, P4], ...). Two side-by-side A4 pages create a 1.414:1 editorial
 * aspect ratio that fills ~95% of a 16:9 TV stage naturally with zero cropping.
 */
export function pairNewsletterPagesIntoSpreads<
  P extends { pageNumber: number; durationSeconds?: number | null }
>(pages: P[]): NewsletterSpreadSlide<P>[] {
  const sorted = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const spreads: NewsletterSpreadSlide<P>[] = [];

  for (let i = 0; i < sorted.length; i += 2) {
    const left = sorted[i];
    const right = sorted[i + 1] ?? null;
    const leftDur = Math.max(5, Number(left.durationSeconds) || 15);
    if (right) {
      const rightDur = Math.max(5, Number(right.durationSeconds) || 15);
      spreads.push({
        left,
        right,
        pageNumbers: [left.pageNumber, right.pageNumber],
        durationSeconds: Math.min(45, Math.max(leftDur, rightDur) + 5),
      });
    } else {
      spreads.push({
        left,
        right: null,
        pageNumbers: [left.pageNumber],
        durationSeconds: leftDur,
      });
    }
  }

  return spreads;
}

export interface TimelineSlot {
  hour: number;
  label: string;
  scheduleName: string | null;
  playlistId: string | null;
  hasRotation: boolean;
}

/**
 * Generates a 24-hour broadcast schedule preview (00:00–23:00) for a given screen & weekday.
 */
export function buildDailyBroadcastTimeline(
  allSchedules: ScheduleRecord[],
  ctx: SchedulableScreenContext,
  dayOfWeek: number
): TimelineSlot[] {
  // Build a reference date matching `dayOfWeek` (2026-11-22 is a Sunday -> idx 0)
  const baseSunday = Date.UTC(2026, 10, 22, 0, 0, 0);
  const slots: TimelineSlot[] = [];

  for (let hour = 0; hour < 24; hour++) {
    const hhmm = `${String(hour).padStart(2, "0")}:30`;
    const matching = allSchedules.filter((sch) => {
      if (!sch.isActive) return false;
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

    const winner = matching[0] ?? null;
    void baseSunday;
    slots.push({
      hour,
      label: `${String(hour).padStart(2, "0")}:00`,
      scheduleName: winner?.name ?? null,
      playlistId: winner?.playlistId ?? null,
      hasRotation: Boolean(
        winner?.rotationSequence && winner.rotationSequence.length > 1
      ),
    });
  }

  return slots;
}

export interface RecognitionWallPage<T> {
  page: number;
  totalPages: number;
  employees: T[];
}

/**
 * Paginates a large list of Employee Recognitions into balanced wall slides of `pageSize`
 * (default 10 per slide -> 5x2 grid on TVs) so every winner cycles cleanly until complete.
 */
export function chunkRecognitionsIntoWallPages<T>(
  recognitions: T[],
  pageSize = 10
): RecognitionWallPage<T>[] {
  if (recognitions.length === 0) return [];
  const safeSize = Math.max(1, Math.min(20, Math.floor(pageSize)));
  const totalPages = Math.ceil(recognitions.length / safeSize);
  const pages: RecognitionWallPage<T>[] = [];
  for (let i = 0; i < totalPages; i++) {
    pages.push({
      page: i + 1,
      totalPages,
      employees: recognitions.slice(i * safeSize, (i + 1) * safeSize),
    });
  }
  return pages;
}

export interface IdentifiablePlayerSlide {
  id: string;
  kind?: string;
  assetId?: string;
  sha256Checksum?: string;
  quickPostId?: string;
  page?: number;
  employeeName?: string;
}

/**
 * Returns a stable content identity key that survives playlist republishing (where DB
 * `playlist_items.id` rows get fresh UUIDs) so actively playing videos never unmount or black out.
 */
export function getStableSlideContentKey(
  item: IdentifiablePlayerSlide | null | undefined
): string | null {
  if (!item) return null;
  if (item.kind === "media_asset" && item.assetId) {
    return `media_asset:${item.assetId}:${item.sha256Checksum ?? ""}`;
  }
  if (item.kind === "quick_post" && item.quickPostId) {
    return `quick_post:${item.quickPostId}`;
  }
  if (item.kind === "employee_recognition_wall") {
    return `rec_wall:${item.page ?? 1}`;
  }
  if (item.kind === "employee_recognition" && item.employeeName) {
    return `rec_single:${item.employeeName}`;
  }
  return item.id;
}

/**
 * Keeps the currently playing slide playing uninterrupted when a manifest refreshes in the
 * background (e.g., when a new Promotion, Employee Wall, or edited Playlist is published)
 * by locating either the exact item ID or its stable content key in the updated queue.
 */
export function resolvePreservedSlideIndex<T extends IdentifiablePlayerSlide>(
  nextItems: T[],
  activeItemId: string | null | undefined,
  fallbackIndex: number,
  activeContentKey?: string | null
): number {
  if (nextItems.length === 0) return 0;
  if (activeItemId) {
    const foundIdx = nextItems.findIndex((item) => item.id === activeItemId);
    if (foundIdx >= 0) return foundIdx;
  }
  if (activeContentKey) {
    const contentIdx = nextItems.findIndex(
      (item) => getStableSlideContentKey(item) === activeContentKey
    );
    if (contentIdx >= 0) return contentIdx;
  }
  return Math.max(0, fallbackIndex) % nextItems.length;
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
