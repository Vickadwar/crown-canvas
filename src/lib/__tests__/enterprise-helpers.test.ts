import test from "node:test";
import assert from "node:assert/strict";
import {
  computeScreenHealth,
  evaluateOperatingStatus,
  isWithinOperatingHours,
  STANDARD_RETAIL_SCHEDULE,
} from "../screen-health";
import type { BranchOperatingSchedule } from "@/db/schema/locations";
import {
  inspectVideoForAndroidTv,
  normalizeExternalMediaUrl,
} from "../media-optimizer";

test("computeScreenHealth classifies online, degraded, and offline accurately", () => {
  const now = Date.parse("2026-11-20T09:00:00Z");

  const online = computeScreenHealth(new Date(now - 35_000), now);
  assert.equal(online.isOnline, true);
  assert.equal(online.healthStatus, "online");

  const degraded = computeScreenHealth(new Date(now - 150_000), now);
  assert.equal(degraded.isOnline, false);
  assert.equal(degraded.healthStatus, "degraded");

  const offline = computeScreenHealth(new Date(now - 600_000), now);
  assert.equal(offline.isOnline, false);
  assert.equal(offline.healthStatus, "offline");

  const neverSeen = computeScreenHealth(null, now);
  assert.equal(neverSeen.isOnline, false);
  assert.equal(neverSeen.healthStatus, "offline");
});

test("isWithinOperatingHours evaluates showroom opening & closing windows in EAT", () => {
  // 2026-11-20T07:30:00Z = 10:30 Africa/Nairobi (inside 08:00-17:30)
  const midMorning = new Date("2026-11-20T07:30:00Z");
  assert.equal(
    isWithinOperatingHours("08:00", "17:30", "Africa/Nairobi", midMorning),
    true
  );

  // 2026-11-20T16:30:00Z = 19:30 Africa/Nairobi (after 17:30 closing)
  const evening = new Date("2026-11-20T16:30:00Z");
  assert.equal(
    isWithinOperatingHours("08:00", "17:30", "Africa/Nairobi", evening),
    false
  );
});

test("evaluateOperatingStatus enforces Mon-Fri 08:00-18:00, Sat 08:00-13:00, Sun Closed, and Public Holiday overrides", () => {
  const schedule: BranchOperatingSchedule = {
    days: { ...STANDARD_RETAIL_SCHEDULE.days },
    exceptions: [
      { date: "2026-12-12", label: "Jamhuri Day", mode: "closed" },
      {
        date: "2026-11-22",
        label: "Special Sunday Expo",
        mode: "open_override",
        start: "10:00",
        end: "15:00",
      },
    ],
  };

  // Friday 2026-11-20 17:30 EAT (14:30Z) -> Open (Mon-Fri 08:00-18:00)
  const friLate = evaluateOperatingStatus({
    operatingSchedule: schedule,
    timezone: "Africa/Nairobi",
    now: new Date("2026-11-20T14:30:00Z"),
  });
  assert.equal(friLate.isOpen, true);

  // Saturday 2026-11-21 12:30 EAT (09:30Z) -> Open (Sat 08:00-13:00)
  const satMidday = evaluateOperatingStatus({
    operatingSchedule: schedule,
    timezone: "Africa/Nairobi",
    now: new Date("2026-11-21T09:30:00Z"),
  });
  assert.equal(satMidday.isOpen, true);

  // Saturday 2026-11-21 13:30 EAT (10:30Z) -> Closed (after 13:00 Sat close)
  const satAfternoon = evaluateOperatingStatus({
    operatingSchedule: schedule,
    timezone: "Africa/Nairobi",
    now: new Date("2026-11-21T10:30:00Z"),
  });
  assert.equal(satAfternoon.isOpen, false);

  // Normal Sunday 2026-11-29 11:00 EAT (08:00Z) -> Closed by default
  const normalSunday = evaluateOperatingStatus({
    operatingSchedule: schedule,
    timezone: "Africa/Nairobi",
    now: new Date("2026-11-29T08:00:00Z"),
  });
  assert.equal(normalSunday.isOpen, false);
  assert.match(normalSunday.reason, /Sunday/i);

  // Public Holiday Saturday 2026-12-12 10:00 EAT (07:00Z) -> Closed for Jamhuri Day
  const holiday = evaluateOperatingStatus({
    operatingSchedule: schedule,
    timezone: "Africa/Nairobi",
    now: new Date("2026-12-12T07:00:00Z"),
  });
  assert.equal(holiday.isOpen, false);
  assert.match(holiday.reason, /Jamhuri Day/);

  // Sunday Open Override 2026-11-22 12:00 EAT (09:00Z) -> Open during 10:00-15:00
  const openSunday = evaluateOperatingStatus({
    operatingSchedule: schedule,
    timezone: "Africa/Nairobi",
    now: new Date("2026-11-22T09:00:00Z"),
  });
  assert.equal(openSunday.isOpen, true);
  assert.match(openSunday.reason, /Special Sunday Expo/);

  // Sunday Open Override 2026-11-22 16:00 EAT (13:00Z) -> Closed after 15:00
  const openSundayAfter = evaluateOperatingStatus({
    operatingSchedule: schedule,
    timezone: "Africa/Nairobi",
    now: new Date("2026-11-22T13:00:00Z"),
  });
  assert.equal(openSundayAfter.isOpen, false);
});

test("normalizeExternalMediaUrl converts YouTube, Canva, Google Slides, and PDF links to zero-disk embeds", () => {
  const yt = normalizeExternalMediaUrl(
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  );
  assert.equal(yt.provider, "youtube");
  assert.equal(yt.mediaType, "web_url");
  assert.match(yt.normalizedUrl, /youtube\.com\/embed\/dQw4w9WgXcQ/);
  assert.match(yt.normalizedUrl, /autoplay=1/);

  const canva = normalizeExternalMediaUrl(
    "https://www.canva.com/design/DAF123/view"
  );
  assert.equal(canva.provider, "canva");
  assert.match(canva.normalizedUrl, /\?embed/);

  const slides = normalizeExternalMediaUrl(
    "https://docs.google.com/presentation/d/abc123/edit"
  );
  assert.equal(slides.provider, "google_slides");
  assert.match(slides.normalizedUrl, /\/embed\?/);

  const pdf = normalizeExternalMediaUrl("https://cdn.crownpaints.co.ke/shade-card.pdf");
  assert.equal(pdf.provider, "pdf");
  assert.equal(pdf.mediaType, "pdf");
});

test("inspectVideoForAndroidTv flags WebM and >48MB files while passing compact MP4s", () => {
  const good = inspectVideoForAndroidTv({
    name: "promo.mp4",
    type: "video/mp4",
    size: 12 * 1024 * 1024,
  });
  assert.equal(good.tvReady, true);
  assert.equal(good.level, "optimal");

  const webm = inspectVideoForAndroidTv({
    name: "clip.webm",
    type: "video/webm",
    size: 6 * 1024 * 1024,
  });
  assert.equal(webm.tvReady, false);

  const huge = inspectVideoForAndroidTv({
    name: "raw-4k.mp4",
    type: "video/mp4",
    size: 60 * 1024 * 1024,
  });
  assert.equal(huge.tvReady, false);
});
