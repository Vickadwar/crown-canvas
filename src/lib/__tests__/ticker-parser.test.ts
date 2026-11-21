/**
 * @file src/lib/__tests__/ticker-parser.test.ts
 * @description Unit tests for structured multi-tagline ticker parsing and serialization.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseTickerItem,
  parseTickerString,
  serializeTickerItems,
} from "../ticker-parser";

describe("ticker-parser", () => {
  it("parses plain pipe-separated legacy ticker strings", () => {
    const items = parseTickerString(
      "Welcome to Crown Paints | Free Colour Consultation"
    );
    assert.deepEqual(items, [
      { icon: "none", text: "Welcome to Crown Paints" },
      { icon: "none", text: "Free Colour Consultation" },
    ]);
  });

  it("parses store and brand icon prefixes case-insensitively", () => {
    const items = parseTickerString(
      "[appstores] Download Team Kubwa App Today | [WHATSAPP] Chat on +254 700 000000 | [paint] 5,000+ Shades"
    );
    assert.deepEqual(items, [
      { icon: "appstores", text: "Download Team Kubwa App Today" },
      { icon: "whatsapp", text: "Chat on +254 700 000000" },
      { icon: "paint", text: "5,000+ Shades" },
    ]);
  });

  it("falls back to icon=none for unknown bracket prefixes", () => {
    const item = parseTickerItem("[unknown_tag] Custom Announcement");
    assert.deepEqual(item, {
      icon: "none",
      text: "[unknown_tag] Custom Announcement",
    });
  });

  it("serializes and round-trips structured items while stripping raw pipes", () => {
    const raw = serializeTickerItems([
      { icon: "playstore", text: "Get it on Google Play" },
      { icon: "appstore", text: "Available on iOS | Fast" },
      { icon: "none", text: "Crown Canvas Showroom Network" },
      { icon: "award", text: "   " },
    ]);
    assert.equal(
      raw,
      "[playstore] Get it on Google Play | [appstore] Available on iOS   Fast | Crown Canvas Showroom Network"
    );
    const parsed = parseTickerString(raw);
    assert.equal(parsed.length, 3);
    assert.equal(parsed[0].icon, "playstore");
    assert.equal(parsed[1].icon, "appstore");
    assert.equal(parsed[2].icon, "none");
  });

  it("returns empty array for null or blank inputs", () => {
    assert.deepEqual(parseTickerString(null), []);
    assert.deepEqual(parseTickerString("   "), []);
  });
});
