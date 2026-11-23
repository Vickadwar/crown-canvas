/**
 * @file src/lib/__tests__/security-hardening.test.ts
 * @description Unit tests verifying SSRF private-IP/host blocking, HMAC-signed QR redirect
 * verification (open-redirect prevention), constant-time comparisons, bot filtering,
 * device OS extraction, and sliding-window rate limiting.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { constantTimeEquals } from "../security";
import {
  assertSafeExternalUrl,
  isBotUserAgent,
  isPrivateOrReservedIp,
  isValidUuid,
  parseDeviceLabel,
  signQrRedirect,
  verifyQrRedirect,
} from "../url-security";
import { checkRateLimit } from "../rate-limit";

describe("security hardening & QR redirect signing", () => {
  it("blocks localhost, link-local cloud metadata, and RFC1918 private IPs (SSRF)", async () => {
    assert.equal(isPrivateOrReservedIp("127.0.0.1"), true);
    assert.equal(isPrivateOrReservedIp("169.254.169.254"), true);
    assert.equal(isPrivateOrReservedIp("10.0.1.5"), true);
    assert.equal(isPrivateOrReservedIp("192.168.1.10"), true);
    assert.equal(isPrivateOrReservedIp("172.16.0.1"), true);
    assert.equal(isPrivateOrReservedIp("::1"), true);
    assert.equal(isPrivateOrReservedIp("8.8.8.8"), false);

    await assert.rejects(() =>
      assertSafeExternalUrl("http://169.254.169.254/latest/meta-data/", {
        allowHttpInDev: true,
        skipDnsLookup: true,
      })
    );
    await assert.rejects(() =>
      assertSafeExternalUrl("https://localhost:3000/api/users", {
        skipDnsLookup: true,
      })
    );
    await assert.rejects(() =>
      assertSafeExternalUrl("http://example.com/feed.json", {
        allowHttpInDev: false,
        skipDnsLookup: true,
      })
    );

    const safe = await assertSafeExternalUrl("https://api.example.com/sales.json", {
      allowHttpInDev: false,
      skipDnsLookup: true,
    });
    assert.equal(safe.hostname, "api.example.com");
  });

  it("signs and verifies QR redirects while rejecting tampered phishing destinations", () => {
    const dest = "https://www.crownpaints.co.ke/product-category/decorative";
    const sig = signQrRedirect("concierge", dest);
    assert.equal(sig.length, 16);
    assert.equal(verifyQrRedirect("concierge", dest, sig), true);

    // Tampered destination URL must fail verification
    assert.equal(
      verifyQrRedirect("concierge", "https://evil-phishing.example.com", sig),
      false
    );
    assert.equal(verifyQrRedirect("other", dest, sig), false);
    assert.equal(verifyQrRedirect("concierge", dest, "0000000000000000"), false);
  });

  it("validates UUIDs, constant-time equality, bot UAs, and device OS labels", () => {
    assert.equal(isValidUuid("550e8400-e29b-41d4-a716-446655440000"), true);
    assert.equal(isValidUuid("not-a-uuid"), false);
    assert.equal(constantTimeEquals("abc123", "abc123"), true);
    assert.equal(constantTimeEquals("abc123", "abc124"), false);
    assert.equal(constantTimeEquals("abc", "abcd"), false);

    assert.equal(isBotUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1)"), true);
    assert.equal(isBotUserAgent("curl/8.4.0"), true);
    assert.equal(
      isBotUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"),
      false
    );

    assert.equal(parseDeviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)"), "iOS");
    assert.equal(parseDeviceLabel("Mozilla/5.0 (Linux; Android 14; Pixel 8)"), "Android");
    assert.equal(parseDeviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64)"), "Desktop");
  });

  it("enforces sliding-window rate limits cleanly", () => {
    const key = `test-rl-${Date.now()}`;
    const base = 1_700_000_000_000;
    assert.equal(checkRateLimit(key, 2, 10_000, base).allowed, true);
    assert.equal(checkRateLimit(key, 2, 10_000, base + 1000).allowed, true);
    const blocked = checkRateLimit(key, 2, 10_000, base + 2000);
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterSeconds >= 1);
    // After window slides past first request, request succeeds again
    assert.equal(checkRateLimit(key, 2, 10_000, base + 11_000).allowed, true);
  });
});
