/**
 * @file src/lib/app-license.ts
 * @description Pure cryptographic 32-character OEM Activation Key & Trial License
 * engine for Crown Canvas Application Authentication (Cloudflare / OEM single-instance
 * lifetime licensing). Zero external dependencies.
 */

import crypto from "crypto";

export type LicenseMode = "trial" | "oem_lifetime";

export interface AppLicenseInfo {
  mode: LicenseMode;
  statusLabel: string;
  maskedKey: string;
  /** Full 32-char key is ONLY populated server-side for Super Admins; always null for other roles. */
  fullKey: string | null;
  activatedAt: string | null;
  activatedByName: string | null;
  singleInstanceNotice: string;
}

const LICENSE_SIGNING_SALT = "crown-canvas-oem-v1-cloudflare-edge-license";
const KEY_PREFIX = "CCOEM";

export const DEFAULT_TRIAL_KEY = "CCTRIAL00000000000000000000TRIAL";

export const SINGLE_INSTANCE_NOTICE =
  "Licensed for single-instance deployment — you can use this activation key on one application instance at a time.";

export function normalizeLicenseKey(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function formatLicenseKeyDisplay(raw: string): string {
  const clean = normalizeLicenseKey(raw);
  return clean.match(/.{1,4}/g)?.join("-") ?? clean;
}

export function maskLicenseKey(raw: string): string {
  const clean = normalizeLicenseKey(raw);
  if (clean.length < 8) return "••••-••••-••••-••••";
  const head = clean.slice(0, 5);
  const tail = clean.slice(-4);
  return `${head}-••••-••••-••••-••••-${tail}`;
}

function signPayload(payload15: string): string {
  return crypto
    .createHmac("sha256", LICENSE_SIGNING_SALT)
    .update(payload15)
    .digest("hex")
    .toUpperCase()
    .slice(0, 12);
}

/**
 * Generates a cryptographically valid 32-character OEM Lifetime Activation Key:
 * `CCOEM` (5) + payload (15) + HMAC-SHA256 digest (12) = 32 chars.
 */
export function generateOemLicenseKey(seedPayload?: string): string {
  const cleanSeed = seedPayload
    ? normalizeLicenseKey(seedPayload).padEnd(15, "X").slice(0, 15)
    : crypto.randomBytes(10).toString("hex").toUpperCase().slice(0, 15);
  const sig = signPayload(cleanSeed);
  return `${KEY_PREFIX}${cleanSeed}${sig}`;
}

/**
 * Verifies a 32-character OEM Lifetime Activation Key (accepts dashed or raw input).
 * Also honors an optional `APP_OEM_LICENSE_KEY` environment override if configured.
 */
export function verifyOemLicenseKey(
  rawInput: string,
  envOverrideKey?: string
): { valid: boolean; normalizedKey: string; reason?: string } {
  const normalized = normalizeLicenseKey(rawInput);

  if (normalized.length !== 32) {
    return {
      valid: false,
      normalizedKey: normalized,
      reason: `OEM activation key must be exactly 32 characters (received ${normalized.length}).`,
    };
  }

  const override = envOverrideKey ? normalizeLicenseKey(envOverrideKey) : "";
  if (override && override.length === 32 && normalized === override) {
    return { valid: true, normalizedKey: normalized };
  }

  if (!normalized.startsWith(KEY_PREFIX)) {
    return {
      valid: false,
      normalizedKey: normalized,
      reason: "Invalid OEM activation key format or signature.",
    };
  }

  const payload = normalized.slice(5, 20);
  const providedSig = normalized.slice(20, 32);
  const expectedSig = signPayload(payload);

  if (
    providedSig.length === expectedSig.length &&
    crypto.timingSafeEqual(Buffer.from(providedSig), Buffer.from(expectedSig))
  ) {
    return { valid: true, normalizedKey: normalized };
  }

  return {
    valid: false,
    normalizedKey: normalized,
    reason: "Invalid OEM activation key checksum. Please verify the 32-character key.",
  };
}

/** Deterministic official Crown Canvas Enterprise OEM key (32 chars) for company activation. */
export const OFFICIAL_ENTERPRISE_OEM_KEY = generateOemLicenseKey("CROWN2026CFEDGE");
