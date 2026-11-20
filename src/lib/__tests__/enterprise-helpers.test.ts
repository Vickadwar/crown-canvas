import test from "node:test";
import assert from "node:assert/strict";
import {
  computeScreenHealth,
  isWithinOperatingHours,
} from "../screen-health";
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
