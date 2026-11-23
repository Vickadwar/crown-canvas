/**
 * @file src/lib/url-security.ts
 * @description Server-side URL security helpers: SSRF private-IP/DNS guard for external
 * feed pulls, HMAC-SHA256 QR redirect signing/verification (eliminating open redirects),
 * bot/crawler User-Agent filtering, and mobile OS label extraction.
 */

import crypto from "crypto";
import dns from "dns/promises";
import net from "net";
import { constantTimeEquals } from "./security";

const QR_SIGN_SECRET =
  process.env.SIGNAGE_TOKEN_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "crown-canvas-dev-qr-secret";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
]);

export function isPrivateOrReservedIp(ip: string): boolean {
  const clean = ip.trim().toLowerCase();
  if (net.isIPv4(clean)) {
    const parts = clean.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true; // 0.0.0.0/8, 10/8, 127/8
    if (a === 169 && b === 254) return true; // Link-local / Cloud metadata 169.254/16
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // Carrier-grade NAT 100.64/10
    if (a >= 224) return true; // Multicast / reserved
    return false;
  }

  if (net.isIPv6(clean)) {
    if (
      clean === "::1" ||
      clean === "::" ||
      clean.startsWith("fe80:") ||
      clean.startsWith("fc") ||
      clean.startsWith("fd") ||
      clean.startsWith("::ffff:127.") ||
      clean.startsWith("::ffff:10.") ||
      clean.startsWith("::ffff:192.168.") ||
      clean.startsWith("::ffff:169.254.")
    ) {
      return true;
    }
    return false;
  }

  return true;
}

/**
 * Validates that a remote URL is safe for server-side HTTP fetching (blocks SSRF against
 * localhost, RFC1918 LAN IPs, link-local cloud metadata 169.254.169.254, and DNS rebinding).
 */
export async function assertSafeExternalUrl(
  rawUrl: string,
  options?: { allowHttpInDev?: boolean; skipDnsLookup?: boolean }
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error("Invalid URL format.");
  }

  const allowHttp =
    options?.allowHttpInDev ?? process.env.NODE_ENV !== "production";
  if (parsed.protocol !== "https:" && !(allowHttp && parsed.protocol === "http:")) {
    throw new Error("Only HTTPS URLs are permitted for external data pulls.");
  }

  if (parsed.username || parsed.password) {
    throw new Error("Embedded URL credentials are not allowed.");
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    !host ||
    BLOCKED_HOSTNAMES.has(host) ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".localhost")
  ) {
    throw new Error("Private or internal hostnames are blocked.");
  }

  if (net.isIP(host)) {
    if (isPrivateOrReservedIp(host)) {
      throw new Error("Private, loopback, or cloud metadata IP addresses are blocked.");
    }
    return parsed;
  }

  if (!options?.skipDnsLookup) {
    try {
      const addresses = await dns.lookup(host, { all: true });
      if (addresses.length === 0) {
        throw new Error("Could not resolve remote host.");
      }
      for (const addr of addresses) {
        if (isPrivateOrReservedIp(addr.address)) {
          throw new Error(
            "Target hostname resolves to a private or reserved IP address."
          );
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("private")) {
        throw err;
      }
      throw new Error("Could not safely resolve target hostname.");
    }
  }

  return parsed;
}

/**
 * Generates a compact 16-hex-char HMAC-SHA256 signature binding a QR shortCode
 * and its target destination URL, preventing open-redirect abuse on `/q/[code]`.
 */
export function signQrRedirect(shortCode: string, targetUrl: string): string {
  return crypto
    .createHmac("sha256", QR_SIGN_SECRET)
    .update(`${shortCode.trim().toLowerCase()}|${targetUrl.trim()}`)
    .digest("hex")
    .slice(0, 16);
}

export function verifyQrRedirect(
  shortCode: string,
  targetUrl: string,
  sig: string | null | undefined
): boolean {
  if (!sig || sig.length !== 16) return false;
  const expected = signQrRedirect(shortCode, targetUrl);
  return constantTimeEquals(expected, sig);
}

export function isValidUuid(value: string | null | undefined): value is string {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

const BOT_UA_PATTERN =
  /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|slackbot|discordbot|headlesschrome|lighthouse|curl|wget|python-requests/i;

export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false;
  return BOT_UA_PATTERN.test(ua);
}

export function parseDeviceLabel(ua: string | null | undefined): string {
  if (!ua) return "Unknown";
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
  if (/android/i.test(ua)) return "Android";
  if (/windows|macintosh|linux/i.test(ua)) return "Desktop";
  return "Mobile";
}
