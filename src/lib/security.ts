/**
 * @file src/lib/security.ts
 * @description Cryptographic helpers for generating 6-digit TV pairing PINs,
 * opaque device/feed bearer tokens, HMAC-SHA256 token hashes, and timing-safe comparisons.
 */

import crypto from "crypto";

const TOKEN_SECRET =
  process.env.SIGNAGE_TOKEN_SECRET || "crown-canvas-dev-fallback-secret";

/**
 * Generates a high-contrast 6-digit numeric pairing code suitable for Android TV display.
 */
export function generatePairingPin(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Generates an opaque bearer token for an authenticated screen player.
 */
export function generateDeviceToken(): string {
  return `cp_scr_${crypto.randomBytes(32).toString("hex")}`;
}

/**
 * Hashes a device token or feed API key using HMAC-SHA256 before storing in Postgres.
 */
export function hashDeviceToken(token: string): string {
  return crypto
    .createHmac("sha256", TOKEN_SECRET)
    .update(token)
    .digest("hex");
}

/**
 * Constant-time string comparison preventing timing side-channel attacks on hashes & signatures.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
