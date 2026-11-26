import test from "node:test";
import assert from "node:assert/strict";
import { resolveQrCodeValue } from "../qr-url";
import {
  generateEmployeeAvatarDataUri,
  generateEmployeeAvatarSvg,
  getEmployeeInitials,
} from "../avatar-generator";
import {
  buildDailyBroadcastTimeline,
  chunkRecognitionsIntoWallPages,
  getStableSlideContentKey,
  interleavePlaybackItems,
  matchesPromotionForScreen,
  matchesScreenTarget,
  resolveActiveRotationStep,
  resolveEffectivePromoCadence,
  resolvePreservedSlideIndex,
  type ScheduleRecord,
} from "../schedule-resolver";

test("resolveQrCodeValue shows destination domain directly in direct mode and custom branded domain in tracked mode", () => {
  const direct = resolveQrCodeValue({
    destinationUrl: "https://www.crownpaints.co.ke/product-category/decorative",
    mode: "direct",
    kind: "sidebar",
    screenId: "11111111-1111-4111-8111-111111111111",
    currentOrigin: "https://digital-screen-three.vercel.app",
  });
  assert.equal(direct, "https://www.crownpaints.co.ke/product-category/decorative");

  const trackedCustom = resolveQrCodeValue({
    destinationUrl: "https://www.crownpaints.co.ke/product-category/decorative",
    mode: "tracked",
    kind: "sidebar",
    screenId: "11111111-1111-4111-8111-111111111111",
    sidebarProfileId: "22222222-2222-4222-8222-222222222222",
    currentOrigin: "http://localhost:3000",
    configuredAppUrl: "https://go.crownpaints.co.ke",
  });
  assert.equal(
    trackedCustom,
    "https://go.crownpaints.co.ke/q/sb?s=11111111-1111-4111-8111-111111111111&sp=22222222-2222-4222-8222-222222222222"
  );
});

test("generateEmployeeAvatarSvg produces crisp deterministic vector avatars across all 3 styles", () => {
  assert.equal(getEmployeeInitials("Grace Wanjiku"), "GW");
  assert.equal(getEmployeeInitials("Amina"), "AM");

  const illustrated = generateEmployeeAvatarSvg({
    name: "Grace Wanjiku",
    style: "illustrated",
  });
  assert.match(illustrated, /^<svg /);
  assert.match(illustrated, /<\/svg>$/);

  const crownBadge = generateEmployeeAvatarSvg({
    name: "David Ochieng",
    style: "crown_badge",
  });
  assert.match(crownBadge, />DO</);

  const uri = generateEmployeeAvatarDataUri({
    name: "Amina Hassan",
    style: "geometric",
  });
  assert.ok(uri.startsWith("data:image/svg+xml;charset=utf-8,"));
});

test("matchesScreenTarget enforces date windows and multi-screen targeting", () => {
  const ctx = {
    screenId: "scr-2",
    branchId: "br-1",
    countryId: "ke",
    groupId: "grp-1",
    screenRole: "showroom_customer",
    timezone: "Africa/Nairobi",
  };
  const now = new Date("2026-11-26T09:00:00Z");

  assert.equal(
    matchesScreenTarget(
      {
        targetType: "screen",
        targetId: "scr-1",
        targetScreenIds: ["scr-1", "scr-2"],
        startDate: "2026-11-01T00:00:00Z",
        endDate: "2026-12-01T00:00:00Z",
        isActive: true,
      },
      ctx,
      now
    ),
    true
  );

  // Expired campaign must not match
  assert.equal(
    matchesScreenTarget(
      {
        targetType: "global",
        targetId: null,
        endDate: "2026-11-20T00:00:00Z",
        isActive: true,
      },
      ctx,
      now
    ),
    false
  );
});

test("resolveActiveRotationStep cycles seamlessly across chained Playlist -> Promotions -> Recognitions steps", () => {
  const sequence = [
    { kind: "playlist" as const, playlistId: "pl-a", label: "Main", durationMinutes: 15 },
    { kind: "promotions" as const, playlistId: null, label: "Promos", durationMinutes: 5 },
    { kind: "recognitions" as const, playlistId: null, label: "Stars", durationMinutes: 10 },
  ];

  // Total cycle = 30 min. At 09:10 EAT (06:10Z) -> minuteOfDay % 30 = 10 -> Step 0 (Main)
  const stepA = resolveActiveRotationStep(
    sequence,
    new Date("2026-11-26T06:10:00Z"),
    "Africa/Nairobi"
  );
  assert.equal(stepA?.step.kind, "playlist");
  assert.equal(stepA?.stepIndex, 0);

  // At 09:17 EAT (06:17Z) -> minuteOfDay % 30 = 17 -> Step 1 (Promotions)
  const stepB = resolveActiveRotationStep(
    sequence,
    new Date("2026-11-26T06:17:00Z"),
    "Africa/Nairobi"
  );
  assert.equal(stepB?.step.kind, "promotions");
  assert.equal(stepB?.stepIndex, 1);

  // At 09:24 EAT (06:24Z) -> minuteOfDay % 30 = 24 -> Step 2 (Recognitions)
  const stepC = resolveActiveRotationStep(
    sequence,
    new Date("2026-11-26T06:24:00Z"),
    "Africa/Nairobi"
  );
  assert.equal(stepC?.step.kind, "recognitions");
  assert.equal(stepC?.stepIndex, 2);
});

test("interleavePlaybackItems injects targeted Promotions every N slides and Employee Spotlights cleanly", () => {
  const interleaved = interleavePlaybackItems({
    baseItems: ["S1", "S2", "S3", "S4", "S5", "S6"],
    promotions: ["P1", "P2"],
    promoEveryN: 3,
    recognitions: ["E1"],
    recognitionEveryN: 6,
  });

  assert.deepEqual(interleaved, ["S1", "S2", "S3", "P1", "S4", "S5", "S6", "P2", "E1"]);
});

test("buildDailyBroadcastTimeline builds 24 hourly broadcast slots for a screen", () => {
  const schedules: ScheduleRecord[] = [
    {
      id: "sch-1",
      name: "Weekday Showroom",
      playlistId: "pl-1",
      targetType: "global",
      targetId: null,
      targetScreenRole: null,
      priority: 20,
      startDate: null,
      endDate: null,
      daysOfWeek: [1, 2, 3, 4, 5],
      daypartStart: "08:00",
      daypartEnd: "18:00",
      rotationSequence: [
        { kind: "playlist", playlistId: "pl-1", durationMinutes: 15 },
        { kind: "promotions", playlistId: null, durationMinutes: 5 },
      ],
      isActive: true,
    },
  ];

  const slots = buildDailyBroadcastTimeline(
    schedules,
    {
      screenId: "s1",
      branchId: "b1",
      screenRole: "showroom_customer",
      timezone: "Africa/Nairobi",
    },
    1 // Monday
  );
  assert.equal(slots.length, 24);
  assert.equal(slots[7].scheduleName, null);
  assert.equal(slots[10].scheduleName, "Weekday Showroom");
  assert.equal(slots[10].hasRotation, true);
  assert.equal(slots[19].scheduleName, null);
});

test("chunkRecognitionsIntoWallPages paginates 25 employees into 3 sequential 10-per-slide pages", () => {
  const employees = Array.from({ length: 25 }, (_, i) => ({
    id: `emp-${i + 1}`,
    name: `Employee ${i + 1}`,
  }));

  const pages = chunkRecognitionsIntoWallPages(employees, 10);
  assert.equal(pages.length, 3);
  assert.equal(pages[0].page, 1);
  assert.equal(pages[0].totalPages, 3);
  assert.equal(pages[0].employees.length, 10);
  assert.equal(pages[1].page, 2);
  assert.equal(pages[1].employees.length, 10);
  assert.equal(pages[2].page, 3);
  assert.equal(pages[2].employees.length, 5);
  assert.equal(pages[0].employees[0].id, "emp-1");
  assert.equal(pages[1].employees[0].id, "emp-11");
  assert.equal(pages[2].employees[4].id, "emp-25");

  assert.deepEqual(chunkRecognitionsIntoWallPages([], 10), []);
});

test("resolvePreservedSlideIndex keeps currently playing video uninterrupted when promotions shift the queue", () => {
  const refreshedQueue = [
    { id: "vid-1" },
    { id: "promo-new-1" },
    { id: "vid-2" },
    { id: "rec-wall-page-1" },
    { id: "rec-wall-page-2" },
  ];

  // Currently playing vid-2 (was index 1, shifted to index 2 after promo injection)
  assert.equal(resolvePreservedSlideIndex(refreshedQueue, "vid-2", 1), 2);

  // If the current slide was removed, safely clamp fallback index inside the queue
  assert.equal(resolvePreservedSlideIndex(refreshedQueue, "removed-slide", 9), 4);
  assert.equal(resolvePreservedSlideIndex(refreshedQueue, null, 2), 2);

  // Empty queue always returns 0
  assert.equal(resolvePreservedSlideIndex([], "vid-2", 2), 0);

  // Publishing edits to an existing playlist regenerates playlist_items.id UUIDs;
  // stable content key matching must still keep the actively playing video uninterrupted!
  const republishedQueue = [
    { id: "new-row-uuid-1", kind: "media_asset", assetId: "asset-promo", sha256Checksum: "sha-p1" },
    { id: "new-row-uuid-2", kind: "media_asset", assetId: "asset-video-a", sha256Checksum: "sha-va" },
    { id: "new-row-uuid-3", kind: "media_asset", assetId: "asset-video-b", sha256Checksum: "sha-vb" },
  ];
  const playingKey = getStableSlideContentKey({
    id: "old-row-uuid-99",
    kind: "media_asset",
    assetId: "asset-video-b",
    sha256Checksum: "sha-vb",
  });
  assert.equal(
    resolvePreservedSlideIndex(republishedQueue, "old-row-uuid-99", 0, playingKey),
    2
  );
});

test("matchesPromotionForScreen honors explicit targetPlaylistIds on any TV playing that playlist while enforcing expiry", () => {
  const homeTvCtx = {
    screenId: "home-tv-2",
    branchId: "br-home",
    countryId: "ke",
    groupId: null,
    screenRole: "showroom_customer",
    timezone: "Africa/Nairobi",
  };
  const now = new Date("2026-11-26T12:00:00Z");

  // Promo originally targeted screen-1 ONLY, but was later embedded into playlist-B:
  // Home TV playing playlist-B MUST display it!
  assert.equal(
    matchesPromotionForScreen(
      {
        targetType: "screen",
        targetId: "screen-1",
        targetScreenIds: ["screen-1"],
        targetPlaylistIds: ["playlist-B"],
        startDate: "2026-11-01T00:00:00Z",
        endDate: "2026-12-01T00:00:00Z",
        isActive: true,
      },
      homeTvCtx,
      { activePlaylistId: "playlist-B", now }
    ),
    true
  );

  // Home TV playing playlist-A (not embedded) must NOT display it
  assert.equal(
    matchesPromotionForScreen(
      {
        targetType: "screen",
        targetId: "screen-1",
        targetScreenIds: ["screen-1"],
        targetPlaylistIds: ["playlist-B"],
        isActive: true,
      },
      homeTvCtx,
      { activePlaylistId: "playlist-A", now }
    ),
    false
  );

  // Expired embedded promo must still stop airing
  assert.equal(
    matchesPromotionForScreen(
      {
        targetType: "global",
        targetId: null,
        targetPlaylistIds: ["playlist-B"],
        endDate: "2026-11-20T00:00:00Z",
        isActive: true,
      },
      homeTvCtx,
      { activePlaylistId: "playlist-B", now }
    ),
    false
  );
});

test("resolveEffectivePromoCadence auto-interleaves every 3 slides by default (0) and respects explicit block (-1)", () => {
  assert.equal(resolveEffectivePromoCadence(0, true), 3);
  assert.equal(resolveEffectivePromoCadence(null, true), 3);
  assert.equal(resolveEffectivePromoCadence(5, true), 5);
  assert.equal(resolveEffectivePromoCadence(-1, true), 0);
  assert.equal(resolveEffectivePromoCadence(0, false), 0);
});
