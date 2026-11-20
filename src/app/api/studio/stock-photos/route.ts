/**
 * @file src/app/api/studio/stock-photos/route.ts
 * @description Zero-disk stock photo search proxy for Crown Studio: queries Unsplash
 * (`UNSPLASH_ACCESS_KEY`) or Pexels (`PEXELS_API_KEY`) when configured, with curated
 * architectural, paint, automotive, and industrial vector/photo scenes out of the box.
 */

import { requireAdminAccess } from "@/lib/auth-guard";

interface StockPhotoItem {
  id: string;
  title: string;
  category: string;
  url: string;
  thumb: string;
  credit: string;
}

const CURATED_SCENES: StockPhotoItem[] = [
  {
    id: "scene-living-1",
    title: "Modern Architectural Living Room",
    category: "decorative",
    url: "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=400&q=70",
    credit: "Unsplash Architectural",
  },
  {
    id: "scene-exterior-1",
    title: "Contemporary Villa Exterior Facade",
    category: "decorative",
    url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=400&q=70",
    credit: "Unsplash Exterior",
  },
  {
    id: "scene-paint-1",
    title: "Designer Paint Colour Swatches",
    category: "decorative",
    url: "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=400&q=70",
    credit: "Unsplash Colour Studio",
  },
  {
    id: "scene-auto-1",
    title: "Metallic Automotive Finish Gloss",
    category: "automotive",
    url: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=400&q=70",
    credit: "Unsplash Automotive",
  },
  {
    id: "scene-ind-1",
    title: "Industrial Steel & Warehouse Facility",
    category: "industrial",
    url: "https://images.unsplash.com/photo-1565793298595-6a879b1d9492?auto=format&fit=crop&w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1565793298595-6a879b1d9492?auto=format&fit=crop&w=400&q=70",
    credit: "Unsplash Industrial",
  },
  {
    id: "scene-office-1",
    title: "Minimalist Corporate Interior",
    category: "department",
    url: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80",
    thumb: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=400&q=70",
    credit: "Unsplash Workspace",
  },
];

export async function GET(request: Request) {
  const { errorResponse } = await requireAdminAccess();
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") || "").trim();

  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
  if (unsplashKey && query) {
    try {
      const res = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=8&orientation=landscape`,
        {
          headers: { Authorization: `Client-ID ${unsplashKey}` },
          signal: AbortSignal.timeout(5000),
        }
      );
      if (res.ok) {
        const json = (await res.json()) as {
          results?: Array<{
            id: string;
            alt_description?: string;
            urls: { regular: string; small: string };
            user: { name: string };
          }>;
        };
        const items: StockPhotoItem[] = (json.results ?? []).map((r) => ({
          id: r.id,
          title: r.alt_description || query,
          category: "unsplash",
          url: r.urls.regular,
          thumb: r.urls.small,
          credit: r.user.name,
        }));
        return Response.json({ source: "unsplash", photos: items });
      }
    } catch {
      // Fallback to curated scenes
    }
  }

  const pexelsKey = process.env.PEXELS_API_KEY;
  if (pexelsKey && query) {
    try {
      const res = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=8&orientation=landscape`,
        {
          headers: { Authorization: pexelsKey },
          signal: AbortSignal.timeout(5000),
        }
      );
      if (res.ok) {
        const json = (await res.json()) as {
          photos?: Array<{
            id: number;
            alt?: string;
            photographer: string;
            src: { large: string; medium: string };
          }>;
        };
        const items: StockPhotoItem[] = (json.photos ?? []).map((p) => ({
          id: String(p.id),
          title: p.alt || query,
          category: "pexels",
          url: p.src.large,
          thumb: p.src.medium,
          credit: p.photographer,
        }));
        return Response.json({ source: "pexels", photos: items });
      }
    } catch {
      // Fallback to curated scenes
    }
  }

  const lower = query.toLowerCase();
  const filtered = lower
    ? CURATED_SCENES.filter(
        (s) =>
          s.title.toLowerCase().includes(lower) ||
          s.category.toLowerCase().includes(lower)
      )
    : CURATED_SCENES;

  return Response.json({
    source: "curated",
    photos: filtered.length > 0 ? filtered : CURATED_SCENES,
  });
}
