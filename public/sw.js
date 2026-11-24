// Crown Canvas Offline Player Service Worker
// 1. Caches the /player app shell & Next.js static chunks so standalone Smart TVs
//    and Mini PCs boot straight into their cached playlists even when Wi-Fi is down.
// 2. Cache-first intercepts static public images & PDFs served from Cloudflare R2 or
//    Supabase Storage CDN so sidebar product photos, Studio backgrounds, and brochures
//    never re-download on repeat slide rotations (zero range-video interference).

const SHELL_CACHE = "crown-canvas-shell-v2";
const CDN_ASSETS_CACHE = "crown-canvas-cdn-assets-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(["/player"]).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (k) =>
                (k.startsWith("crown-canvas-shell-") && k !== SHELL_CACHE) ||
                (k.startsWith("crown-canvas-cdn-assets-") &&
                  k !== CDN_ASSETS_CACHE)
            )
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isCacheableCdnStaticAsset(url, req) {
  const isMediaHost =
    url.hostname.endsWith(".r2.dev") ||
    url.hostname.endsWith(".r2.cloudflarestorage.com") ||
    (url.hostname.endsWith(".supabase.co") &&
      url.pathname.includes("/storage/v1/object/public/")) ||
    (url.hostname.endsWith(".supabase.in") &&
      url.pathname.includes("/storage/v1/object/public/"));

  if (!isMediaHost) return false;
  // Never intercept Range requests (large MP4 streaming is managed by cache-engine.ts)
  if (req.headers.get("range")) return false;

  const lowerPath = url.pathname.toLowerCase();
  const isImageOrPdf =
    req.destination === "image" ||
    /\.(webp|png|jpe?g|gif|svg|avif|pdf)$/i.test(lowerPath);
  return isImageOrPdf;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Cache-first for immutable public images & PDFs on Cloudflare R2 / Supabase CDN
  if (url.origin !== self.location.origin) {
    if (!isCacheableCdnStaticAsset(url, req)) return;
    event.respondWith(
      caches.open(CDN_ASSETS_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          if (cached) return cached;
          return fetch(req).then((res) => {
            if (res && (res.ok || res.type === "opaque")) {
              cache.put(req, res.clone()).catch(() => undefined);
            }
            return res;
          });
        })
      )
    );
    return;
  }

  // Never cache live API responses here (media is cached by Cache Engine in crown-canvas-media-v1)
  if (url.pathname.startsWith("/api/")) return;

  const isPlayerShell =
    url.pathname === "/player" ||
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/media/") ||
    url.pathname === "/pdf.worker.min.mjs";

  if (!isPlayerShell) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
