/**
 * @file src/lib/studio-assets.ts
 * @description Shared creative registries for Crown Studio & `/player` CanvasRenderer:
 * 7 self-hosted Studio fonts, 12 Paint-Industry background presets, Crown swatch palettes,
 * and 36+ categorized Lucide vector icons.
 */

import type { StudioFontKey } from "@/db/schema";

export interface StudioFontMeta {
  key: StudioFontKey;
  label: string;
  category: string;
  cssFamily: string;
}

export const STUDIO_FONTS: StudioFontMeta[] = [
  {
    key: "satoshi",
    label: "Satoshi",
    category: "Brand Geometric",
    cssFamily: "var(--font-satoshi), system-ui, sans-serif",
  },
  {
    key: "playfair",
    label: "Playfair Display",
    category: "Luxury Decorative",
    cssFamily: "var(--font-playfair), Georgia, serif",
  },
  {
    key: "oswald",
    label: "Oswald",
    category: "Automotive & Industrial",
    cssFamily: "var(--font-oswald), Impact, sans-serif",
  },
  {
    key: "montserrat",
    label: "Montserrat",
    category: "Retail Marketing",
    cssFamily: "var(--font-montserrat), system-ui, sans-serif",
  },
  {
    key: "space_grotesk",
    label: "Space Grotesk",
    category: "ICT & Analytics",
    cssFamily: "var(--font-space-grotesk), system-ui, sans-serif",
  },
  {
    key: "bebas",
    label: "Bebas Neue",
    category: "Showroom Poster",
    cssFamily: "var(--font-bebas), Impact, sans-serif",
  },
  {
    key: "jetbrains_mono",
    label: "JetBrains Mono",
    category: "Specs & Counters",
    cssFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
  },
];

export function getStudioFontFamily(key?: StudioFontKey): string {
  return (
    STUDIO_FONTS.find((f) => f.key === key)?.cssFamily ??
    "var(--font-satoshi), system-ui, sans-serif"
  );
}

export interface StudioBackgroundPreset {
  id: string;
  name: string;
  division: string;
  css: string;
  isLight: boolean;
  accent: string;
}

export const STUDIO_BACKGROUNDS: StudioBackgroundPreset[] = [
  {
    id: "decorative_navy",
    name: "Crown Architectural Navy",
    division: "Decorative",
    css: "linear-gradient(135deg, #050b1c 0%, #0d224f 52%, #071229 100%)",
    isLight: false,
    accent: "#f59e0b",
  },
  {
    id: "gallery_white",
    name: "Clean Gallery White",
    division: "Decorative",
    css: "linear-gradient(135deg, #ffffff 0%, #fafaf9 55%, #fef3c7 100%)",
    isLight: true,
    accent: "#d97706",
  },
  {
    id: "savannah_sand",
    name: "Warm Savannah Sand",
    division: "Decorative",
    css: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 55%, #fde68a 100%)",
    isLight: true,
    accent: "#b45309",
  },
  {
    id: "silk_pearl",
    name: "Silk Pearl Minimal",
    division: "Decorative",
    css: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 60%, #e2e8f0 100%)",
    isLight: true,
    accent: "#0d9488",
  },
  {
    id: "auto_gunmetal",
    name: "Automotive 2K Gunmetal",
    division: "Automotive",
    css: "linear-gradient(135deg, #09090b 0%, #18181b 50%, #27272a 100%)",
    isLight: false,
    accent: "#ef4444",
  },
  {
    id: "auto_crimson",
    name: "Refinish Carbon Crimson",
    division: "Automotive",
    css: "linear-gradient(135deg, #1a0608 0%, #450a0a 52%, #0f0708 100%)",
    isLight: false,
    accent: "#f97316",
  },
  {
    id: "industrial_steel",
    name: "Industrial Protective Steel",
    division: "Industrial",
    css: "linear-gradient(135deg, #0f172a 0%, #1e293b 52%, #0c1424 100%)",
    isLight: false,
    accent: "#f59e0b",
  },
  {
    id: "industrial_marine",
    name: "Marine Epoxy Deep Teal",
    division: "Industrial",
    css: "linear-gradient(135deg, #042f2e 0%, #115e59 52%, #042022 100%)",
    isLight: false,
    accent: "#2dd4bf",
  },
  {
    id: "she_emerald",
    name: "SHE Zero Harm Emerald",
    division: "SHE",
    css: "linear-gradient(135deg, #022c22 0%, #064e3b 52%, #041f18 100%)",
    isLight: false,
    accent: "#34d399",
  },
  {
    id: "ict_indigo",
    name: "ICT Systems Midnight",
    division: "ICT",
    css: "linear-gradient(135deg, #0c0a24 0%, #1e1b4b 55%, #090d1a 100%)",
    isLight: false,
    accent: "#818cf8",
  },
  {
    id: "hr_violet",
    name: "HR People & Culture",
    division: "HR",
    css: "linear-gradient(135deg, #1b0b2e 0%, #3b0764 55%, #120821 100%)",
    isLight: false,
    accent: "#c084fc",
  },
  {
    id: "crown_gold_prestige",
    name: "Crown Gold Prestige",
    division: "Marketing",
    css: "linear-gradient(135deg, #1c1204 0%, #451a03 55%, #170e04 100%)",
    isLight: false,
    accent: "#fbbf24",
  },
];

export interface StudioIconMeta {
  name: string;
  label: string;
  category: "paint" | "automotive_industrial" | "safety" | "corporate";
}

export const STUDIO_ICONS: StudioIconMeta[] = [
  // Paint & Decorative
  { name: "Paintbrush", label: "Paintbrush", category: "paint" },
  { name: "PaintBucket", label: "Paint Bucket", category: "paint" },
  { name: "Palette", label: "Colour Palette", category: "paint" },
  { name: "Droplets", label: "Coatings Drop", category: "paint" },
  { name: "Sparkles", label: "Finish Sheen", category: "paint" },
  { name: "Sun", label: "UV Shield", category: "paint" },
  { name: "CloudRain", label: "Rainproof", category: "paint" },
  { name: "Home", label: "Exterior Home", category: "paint" },
  { name: "Layers", label: "Multi-Coat", category: "paint" },
  // Automotive & Industrial
  { name: "Car", label: "Automotive", category: "automotive_industrial" },
  { name: "Gauge", label: "Fast Cure", category: "automotive_industrial" },
  { name: "Factory", label: "Plant / Factory", category: "automotive_industrial" },
  { name: "Wrench", label: "Bodyshop", category: "automotive_industrial" },
  { name: "Hammer", label: "Industrial", category: "automotive_industrial" },
  { name: "Package", label: "PMG Pack / SKU", category: "automotive_industrial" },
  { name: "Truck", label: "Fleet / Supply", category: "automotive_industrial" },
  { name: "Cog", label: "Manufacturing", category: "automotive_industrial" },
  { name: "Anchor", label: "Marine Coat", category: "automotive_industrial" },
  // SHE & Compliance
  { name: "ShieldCheck", label: "Zero Harm", category: "safety" },
  { name: "HardHat", label: "Mandatory PPE", category: "safety" },
  { name: "AlertTriangle", label: "Safety Alert", category: "safety" },
  { name: "Flame", label: "Solvent Caution", category: "safety" },
  { name: "CheckCircle2", label: "ISO Certified", category: "safety" },
  { name: "HeartHandshake", label: "Customer Care", category: "safety" },
  // Corporate & Departments
  { name: "TrendingUp", label: "Sales Growth", category: "corporate" },
  { name: "Award", label: "Star Award", category: "corporate" },
  { name: "Users", label: "HR Team", category: "corporate" },
  { name: "Cpu", label: "ICT Systems", category: "corporate" },
  { name: "Wifi", label: "Network", category: "corporate" },
  { name: "Megaphone", label: "Marketing Promo", category: "corporate" },
  { name: "Store", label: "Showroom", category: "corporate" },
  { name: "Phone", label: "Hotline", category: "corporate" },
  { name: "Globe", label: "East Africa", category: "corporate" },
  { name: "Clock", label: "Turnaround", category: "corporate" },
  { name: "Star", label: "Featured", category: "corporate" },
  { name: "Zap", label: "Flash Offer", category: "corporate" },
];

export const CROWN_DESIGNER_SWATCHES = [
  { name: "Savannah Ochre", code: "CP-104", hex: "#D97706" },
  { name: "Coastal Teal", code: "CP-402", hex: "#0D9488" },
  { name: "Kilimanjaro Slate", code: "CP-718", hex: "#334155" },
  { name: "Crown Crimson", code: "CP-209", hex: "#DC2626" },
  { name: "Serengeti Gold", code: "CP-118", hex: "#EAB308" },
  { name: "Lamu White", code: "CP-001", hex: "#F8FAFC" },
  { name: "Rift Terracotta", code: "CP-315", hex: "#C2410C" },
  { name: "Nairobi Indigo", code: "CP-512", hex: "#1D4ED8" },
];
