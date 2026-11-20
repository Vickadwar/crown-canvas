// Crown Canvas Offline Player Service Worker
// Caches the /player app shell & Next.js static chunks so standalone Android TVs
// and Mini PCs boot straight into their cached playlists even when Wi-Fi is down.

const SHELL_CACHE = "crown-canvas-shell-v1";

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
            .filter((k) => k.startsWith("crown-canvas-shell-") && k !== SHELL_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never cache live API responses here (media is cached by Cache Engine in crown-canvas-media-v1)
  if (url.pathname.startsWith("/api/")) return;

  const isPlayerShell =
    url.pathname === "/player" ||
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/media/");

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
