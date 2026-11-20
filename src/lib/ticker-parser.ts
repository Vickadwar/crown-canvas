/**
 * @file src/lib/ticker-parser.ts
 * @description Zero-migration structured parser/serializer for multi-tagline bottom tickers
 * with inline store badges (`[appstores]`, `[playstore]`, `[appstore]`, `[whatsapp]`) and
 * corporate Lucide icons (`[paint]`, `[sparkles]`, `[tag]`, `[shield]`, `[phone]`, `[globe]`,
 * `[truck]`, `[award]`). Backwards-compatible with plain `|`-separated strings.
 */

export type TickerIconKey =
  | "none"
  | "appstores"
  | "playstore"
  | "appstore"
  | "whatsapp"
  | "paint"
  | "sparkles"
  | "tag"
  | "shield"
  | "phone"
  | "globe"
  | "truck"
  | "award";

export interface TickerTaglineItem {
  icon: TickerIconKey;
  text: string;
}

export const TICKER_ICON_OPTIONS: Array<{
  value: TickerIconKey;
  label: string;
  description?: string;
}> = [
  { value: "none", label: "No Icon", description: "Plain gold dot separator" },
  {
    value: "appstores",
    label: "Google Play + App Store",
    description: "Both mobile app store badges",
  },
  { value: "playstore", label: "Google Play", description: "Android store badge" },
  { value: "appstore", label: "App Store", description: "iOS store badge" },
  { value: "whatsapp", label: "WhatsApp", description: "WhatsApp chat badge" },
  { value: "paint", label: "Paint / Colour", description: "Decorative & tinting" },
  { value: "sparkles", label: "Promo / New", description: "Featured campaign" },
  { value: "tag", label: "Special Offer", description: "Discount or price promo" },
  { value: "shield", label: "Safety / Quality", description: "SHE & ISO certified" },
  { value: "phone", label: "Hotline / Call", description: "Customer care line" },
  { value: "globe", label: "Website / Online", description: "Web portal link" },
  { value: "truck", label: "Delivery / Fleet", description: "Supply & dispatch" },
  { value: "award", label: "Award / Excellence", description: "Recognition & quality" },
];

const VALID_ICON_SET = new Set<string>(TICKER_ICON_OPTIONS.map((o) => o.value));

export function parseTickerItem(raw: string): TickerTaglineItem {
  const trimmed = raw.trim();
  const match = trimmed.match(/^\[([a-z_]+)\]\s*(.*)$/i);
  if (match) {
    const key = match[1].toLowerCase();
    if (VALID_ICON_SET.has(key)) {
      return {
        icon: key as TickerIconKey,
        text: match[2].trim(),
      };
    }
  }
  return { icon: "none", text: trimmed };
}

export function parseTickerString(raw?: string | null): TickerTaglineItem[] {
  if (!raw || !raw.trim()) return [];
  return raw
    .split("|")
    .map((part) => parseTickerItem(part))
    .filter((item) => item.text.length > 0);
}

export function serializeTickerItems(items: TickerTaglineItem[]): string {
  return items
    .map((item) => {
      const cleanText = item.text.replace(/\|/g, " ").trim();
      if (!cleanText) return "";
      return item.icon && item.icon !== "none"
        ? `[${item.icon}] ${cleanText}`
        : cleanText;
    })
    .filter(Boolean)
    .join(" | ");
}
