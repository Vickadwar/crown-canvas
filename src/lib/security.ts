/**
 * @file src/lib/security.ts
 * @description Cryptographic helpers for generating 6-digit TV pairing PINs,
 * opaque device/feed bearer tokens, and HMAC-SHA256 token hashes.
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
 * Hashes a device token using HMAC-SHA256 before storing in Postgres.
 */
export function hashDeviceToken(token: string): string {
  return crypto
    .createHmac("sha256", TOKEN_SECRET)
    .update(token)
    .digest("hex");
}
