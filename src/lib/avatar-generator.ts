/**
 * @file src/lib/avatar-generator.ts
 * @description Pure, deterministic, 100%-offline illustrated SVG avatar & color generator
 * for Employee of the Month / Quarter / Year spotlights — zero external image hosting
 * or manual photo cropping required.
 */

export type EmployeeAvatarStyle = "illustrated" | "geometric" | "crown_badge";

export interface AvatarPalette {
  bgFrom: string;
  bgTo: string;
  ring: string;
  accent: string;
  skin: string;
  shirt: string;
  hair: string;
}

const AVATAR_PALETTES: AvatarPalette[] = [
  {
    bgFrom: "#1e3a8a",
    bgTo: "#2563eb",
    ring: "#fbbf24",
    accent: "#93c5fd",
    skin: "#c68642",
    shirt: "#0f172a",
    hair: "#1c1917",
  },
  {
    bgFrom: "#065f46",
    bgTo: "#10b981",
    ring: "#fcd34d",
    accent: "#6ee7b7",
    skin: "#8d5524",
    shirt: "#064e3b",
    hair: "#09090b",
  },
  {
    bgFrom: "#581c87",
    bgTo: "#9333ea",
    ring: "#f59e0b",
    accent: "#d8b4fe",
    skin: "#a5694f",
    shirt: "#1e1b4b",
    hair: "#171717",
  },
  {
    bgFrom: "#9a3412",
    bgTo: "#ea580c",
    ring: "#fde047",
    accent: "#fed7aa",
    skin: "#7b4b2a",
    shirt: "#18181b",
    hair: "#0c0a09",
  },
  {
    bgFrom: "#0f766e",
    bgTo: "#0284c7",
    ring: "#fbbf24",
    accent: "#7dd3fc",
    skin: "#b57c52",
    shirt: "#1e293b",
    hair: "#1c1917",
  },
  {
    bgFrom: "#881337",
    bgTo: "#e11d48",
    ring: "#fcd34d",
    accent: "#fda4af",
    skin: "#9c623e",
    shirt: "#1f2937",
    hair: "#111827",
  },
];

export function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

export function getEmployeeInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "CP";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

export function pickAvatarPalette(seed: string): AvatarPalette {
  const idx = hashSeed(seed || "crown-star") % AVATAR_PALETTES.length;
  return AVATAR_PALETTES[idx];
}

export function generateEmployeeAvatarSvg(params: {
  name: string;
  seed?: string;
  style?: EmployeeAvatarStyle;
}): string {
  const seed = params.seed || params.name || "crown";
  const style: EmployeeAvatarStyle = params.style ?? "illustrated";
  const palette = pickAvatarPalette(seed);
  const h = hashSeed(seed);
  const initials = getEmployeeInitials(params.name);
  const safeInitials = initials.replace(/[^A-Z0-9]/g, "").slice(0, 2) || "CP";
  const gradId = `g_${h % 100000}`;

  if (style === "crown_badge") {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240">
  <defs>
    <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${palette.bgFrom}"/>
      <stop offset="100%" stop-color="${palette.bgTo}"/>
    </linearGradient>
  </defs>
  <circle cx="120" cy="120" r="114" fill="url(#${gradId})" stroke="${palette.ring}" stroke-width="6"/>
  <circle cx="120" cy="120" r="98" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="2" stroke-dasharray="6 6"/>
  <path d="M84 78 L98 54 L120 72 L142 54 L156 78 Z" fill="${palette.ring}"/>
  <rect x="86" y="81" width="68" height="7" rx="3.5" fill="${palette.ring}"/>
  <text x="120" y="150" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="68" fill="#ffffff" letter-spacing="2">${safeInitials}</text>
  <circle cx="120" cy="184" r="5" fill="${palette.ring}"/>
</svg>`;
  }

  if (style === "geometric") {
    const rot = (h % 4) * 30;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240">
  <defs>
    <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${palette.bgFrom}"/>
      <stop offset="100%" stop-color="${palette.bgTo}"/>
    </linearGradient>
    <clipPath id="c_${gradId}"><circle cx="120" cy="120" r="108"/></clipPath>
  </defs>
  <circle cx="120" cy="120" r="114" fill="url(#${gradId})" stroke="${palette.ring}" stroke-width="6"/>
  <g clip-path="url(#c_${gradId})" transform="rotate(${rot} 120 120)" opacity="0.25">
    <polygon points="120,10 230,120 120,230 10,120" fill="${palette.accent}"/>
    <circle cx="52" cy="52" r="46" fill="#ffffff"/>
    <circle cx="192" cy="188" r="54" fill="${palette.ring}"/>
  </g>
  <circle cx="120" cy="120" r="64" fill="rgba(9,9,11,0.34)" stroke="rgba(255,255,255,0.4)" stroke-width="3"/>
  <text x="120" y="142" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="56" fill="#ffffff" letter-spacing="2">${safeInitials}</text>
</svg>`;
  }

  // Default: Modern friendly illustrated portrait avatar with golden star aura
  const hasGlasses = h % 3 === 0;
  const hairVariant = h % 3;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240">
  <defs>
    <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${palette.bgFrom}"/>
      <stop offset="100%" stop-color="${palette.bgTo}"/>
    </linearGradient>
    <clipPath id="c_${gradId}"><circle cx="120" cy="120" r="108"/></clipPath>
  </defs>
  <circle cx="120" cy="120" r="114" fill="url(#${gradId})" stroke="${palette.ring}" stroke-width="6"/>
  <g clip-path="url(#c_${gradId})">
    <circle cx="120" cy="96" r="76" fill="rgba(255,255,255,0.12)"/>
    <!-- Shoulders & tailored blazer -->
    <path d="M40 238 C46 182 80 162 120 162 C160 162 194 182 200 238 Z" fill="${palette.shirt}"/>
    <path d="M98 164 L120 198 L142 164 Z" fill="#ffffff" opacity="0.92"/>
    <path d="M114 176 L120 206 L126 176 Z" fill="${palette.ring}"/>
    <!-- Neck -->
    <rect x="106" y="136" width="28" height="32" rx="12" fill="${palette.skin}"/>
    <!-- Hair back -->
    ${
      hairVariant === 1
        ? `<ellipse cx="120" cy="96" rx="46" ry="48" fill="${palette.hair}"/>`
        : `<ellipse cx="120" cy="84" rx="41" ry="34" fill="${palette.hair}"/>`
    }
    <!-- Head -->
    <ellipse cx="120" cy="102" rx="35" ry="41" fill="${palette.skin}"/>
    <!-- Hair top styling -->
    ${
      hairVariant === 2
        ? `<path d="M84 94 C84 56 156 56 156 94 C146 78 96 76 84 94 Z" fill="${palette.hair}"/>`
        : `<path d="M84 96 C84 62 156 62 156 96 C144 74 96 74 84 96 Z" fill="${palette.hair}"/>`
    }
    <!-- Eyes & warm smile -->
    <circle cx="107" cy="102" r="3.6" fill="#18181b"/>
    <circle cx="133" cy="102" r="3.6" fill="#18181b"/>
    ${
      hasGlasses
        ? `<rect x="96" y="94" width="21" height="15" rx="5" fill="none" stroke="#ffffff" stroke-width="2.4"/><rect x="123" y="94" width="21" height="15" rx="5" fill="none" stroke="#ffffff" stroke-width="2.4"/><line x1="117" y1="101" x2="123" y2="101" stroke="#ffffff" stroke-width="2.4"/>`
        : ""
    }
    <path d="M107 120 Q120 131 133 120" fill="none" stroke="#ffffff" stroke-width="3.4" stroke-linecap="round"/>
  </g>
  <!-- Golden achievement star badge -->
  <circle cx="188" cy="186" r="24" fill="#09090b" stroke="${palette.ring}" stroke-width="3"/>
  <polygon points="188,171 192.5,180.5 203,182 195.5,189.2 197.2,199.5 188,194.6 178.8,199.5 180.5,189.2 173,182 183.5,180.5" fill="${palette.ring}"/>
</svg>`;
}

export function generateEmployeeAvatarDataUri(params: {
  name: string;
  seed?: string;
  style?: EmployeeAvatarStyle;
}): string {
  const svg = generateEmployeeAvatarSvg(params);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
