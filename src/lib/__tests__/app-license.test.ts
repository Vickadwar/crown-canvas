import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_TRIAL_KEY,
  OFFICIAL_ENTERPRISE_OEM_KEY,
  formatLicenseKeyDisplay,
  generateOemLicenseKey,
  maskLicenseKey,
  verifyOemLicenseKey,
} from "../app-license";

describe("Application Authentication — 32-char OEM Lifetime License", () => {
  it("generates and verifies cryptographically signed 32-char OEM keys", () => {
    assert.equal(OFFICIAL_ENTERPRISE_OEM_KEY.length, 32);
    const dashed = formatLicenseKeyDisplay(OFFICIAL_ENTERPRISE_OEM_KEY);
    assert.equal(verifyOemLicenseKey(OFFICIAL_ENTERPRISE_OEM_KEY).valid, true);
    assert.equal(verifyOemLicenseKey(dashed).valid, true);

    const fresh = generateOemLicenseKey("TESTCORP2026OEM");
    assert.equal(fresh.length, 32);
    assert.equal(verifyOemLicenseKey(fresh).valid, true);
  });

  it("rejects forged, truncated, or trial keys as OEM lifetime keys", () => {
    assert.equal(verifyOemLicenseKey(DEFAULT_TRIAL_KEY).valid, false);
    assert.equal(verifyOemLicenseKey("SHORT123").valid, false);
    const tampered =
      OFFICIAL_ENTERPRISE_OEM_KEY.slice(0, 31) +
      (OFFICIAL_ENTERPRISE_OEM_KEY.endsWith("A") ? "B" : "A");
    assert.equal(verifyOemLicenseKey(tampered).valid, false);
  });

  it("masks keys cleanly so non-Super-Admins never see the full code", () => {
    const masked = maskLicenseKey(OFFICIAL_ENTERPRISE_OEM_KEY);
    assert.ok(masked.includes("••••"));
    assert.ok(!masked.includes(OFFICIAL_ENTERPRISE_OEM_KEY));
  });
});
