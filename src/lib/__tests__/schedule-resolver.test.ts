import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveActiveSchedule,
  type ScheduleRecord,
  type SchedulableScreenContext,
} from "../schedule-resolver";

const nairobiShowroom: SchedulableScreenContext = {
  screenId: "scr-1",
  branchId: "br-nbo-wst",
  countryId: "cty-ke",
  groupId: "grp-ke-showrooms",
  screenRole: "showroom_customer",
  timezone: "Africa/Nairobi",
};

const baseSchedule: ScheduleRecord = {
  id: "sch-1",
  name: "Global Default",
  playlistId: "pl-global",
  targetType: "global",
  targetId: null,
  targetScreenRole: null,
  priority: 10,
  startDate: null,
  endDate: null,
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  daypartStart: "00:00",
  daypartEnd: "23:59",
  isActive: true,
};

test("selects highest priority matching schedule in EAT timezone", () => {
  // 2026-11-16T07:30:00Z = 10:30 AM Africa/Nairobi (Monday = day 1)
  const morningEat = new Date("2026-11-16T07:30:00.000Z");

  const schedules: ScheduleRecord[] = [
    baseSchedule,
    {
      ...baseSchedule,
      id: "sch-kenya-day",
      name: "Kenya Business Hours",
      playlistId: "pl-ke-day",
      targetType: "country",
      targetId: "cty-ke",
      priority: 50,
      daypartStart: "08:00",
      daypartEnd: "17:30",
    },
    {
      ...baseSchedule,
      id: "sch-tz-day",
      name: "Tanzania Business Hours",
      playlistId: "pl-tz-day",
      targetType: "country",
      targetId: "cty-tz",
      priority: 100,
    },
  ];

  const resolved = resolveActiveSchedule(schedules, nairobiShowroom, morningEat);
  assert.equal(resolved?.playlistId, "pl-ke-day");
});

test("falls back when daypart window does not match", () => {
  // 2026-11-16T18:00:00Z = 21:00 EAT (after 17:30)
  const nightEat = new Date("2026-11-16T18:00:00.000Z");

  const schedules: ScheduleRecord[] = [
    baseSchedule,
    {
      ...baseSchedule,
      id: "sch-kenya-day",
      playlistId: "pl-ke-day",
      targetType: "country",
      targetId: "cty-ke",
      priority: 50,
      daypartStart: "08:00",
      daypartEnd: "17:30",
    },
  ];

  const resolved = resolveActiveSchedule(schedules, nairobiShowroom, nightEat);
  assert.equal(resolved?.playlistId, "pl-global");
});

test("breaks equal-priority ties by target specificity (screen > branch > country > global)", () => {
  const now = new Date("2026-11-16T09:00:00.000Z");

  const schedules: ScheduleRecord[] = [
    { ...baseSchedule, id: "g", playlistId: "pl-g", priority: 20 },
    {
      ...baseSchedule,
      id: "b",
      playlistId: "pl-branch",
      targetType: "branch",
      targetId: "br-nbo-wst",
      priority: 20,
    },
    {
      ...baseSchedule,
      id: "s",
      playlistId: "pl-screen",
      targetType: "screen",
      targetId: "scr-1",
      priority: 20,
    },
  ];

  const resolved = resolveActiveSchedule(schedules, nairobiShowroom, now);
  assert.equal(resolved?.playlistId, "pl-screen");
});
