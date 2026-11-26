"use client";

/**
 * @file src/lib/player/cache-engine.ts
 * @description Offline-First Local Media Cache Engine for Standalone Android TVs & Mini PCs.
 *
 * Uses Cache Storage (`crown-canvas-media-v1`) + IndexedDB metadata + `navigator.storage.persist()`
 * with hardware-aware disk caps (`512 MB` on Android TV, `2,048 MB` on Mini PC) and lazy
 * 2-slot `blob:` URL resolution so low-RAM Android TVs never crash holding full playlists in memory.
 */

const CACHE_NAME = "crown-canvas-media-v1";
const IDB_NAME = "crown-canvas-player-db";
const IDB_STORE = "asset-meta";

// Tracks active asset downloads so `/player` never double-downloads the same video
// simultaneously from cloud storage while it is being saved to local Cache Storage.
const inFlightDownloads = new Map<string, Promise<boolean>>();

function isCacheableCloudAsset(asset: ManifestAssetRef): boolean {
  if (asset.mediaType === "web_url") return false;
  if (!asset.publicUrl) return false;
  if (asset.mediaType === "pdf") {
    // Cache uploaded cloud PDFs (same-origin, Cloudflare R2, or Supabase Storage) locally
    // so multi-page brochures download ONCE instead of on every playlist rotation.
    return (
      asset.publicUrl.startsWith("/") ||
      /\.(r2\.dev|r2\.cloudflarestorage\.com|supabase\.co|supabase\.in)\//i.test(
        asset.publicUrl
      )
    );
  }
  return true;
}

export interface CachedAssetMeta {
  assetId: string;
  sha256Checksum: string;
  publicUrl: string;
  mimeType: string;
  sizeBytes: number;
  cachedAt: number;
}

export interface SyncProgress {
  status: "pending" | "downloading" | "synced" | "error";
  cachedCount: number;
  totalCount: number;
  storageUsedMb: number;
  persisted?: boolean;
  lastError?: string;
}

function openMetaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: "assetId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllMeta(): Promise<CachedAssetMeta[]> {
  if (typeof indexedDB === "undefined") return [];
  try {
    const db = await openMetaDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const store = tx.objectStore(IDB_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result as CachedAssetMeta[]);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

async function putMeta(meta: CachedAssetMeta): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openMetaDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(meta);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Non-fatal on Smart TV browsers with restricted IndexedDB
  }
}

async function deleteMeta(assetId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openMetaDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(assetId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Non-fatal on Smart TV browsers with restricted IndexedDB
  }
}

function buildCacheKey(assetId: string, checksum: string): string {
  return `${window.location.origin}/__cached_media/${encodeURIComponent(assetId)}/${encodeURIComponent(checksum)}`;
}

export interface ManifestAssetRef {
  assetId: string;
  sha256Checksum: string;
  publicUrl: string;
  mimeType: string;
  mediaType?: "video" | "image" | "web_url" | "pdf" | "audio";
}

/**
 * Requests persistent browser/WebView storage so Android TV OS does not
 * evict downloaded signage videos under storage pressure.
 */
export async function requestPersistentPlayerStorage(): Promise<boolean> {
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.storage &&
      typeof navigator.storage.persist === "function"
    ) {
      const already = await navigator.storage.persisted?.();
      if (already) return true;
      return await navigator.storage.persist();
    }
  } catch {
    // Non-fatal
  }
  return false;
}

/**
 * Estimates a safe local Cache Storage budget so inbuilt Smart TV browsers
 * (Samsung Tizen, LG webOS, Hisense VIDAA) with tight storage quotas never crash.
 */
async function computeSafeCacheBudget(profileMaxBytes: number): Promise<number> {
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.storage &&
      typeof navigator.storage.estimate === "function"
    ) {
      const est = await navigator.storage.estimate();
      if (typeof est.quota === "number" && est.quota > 0) {
        const usage = typeof est.usage === "number" ? est.usage : 0;
        const available = Math.max(0, est.quota - usage);
        // Reserve 40% headroom for OS/browser stability on Smart TVs
        const quotaSafeCap = Math.floor((available + usage * 0.5) * 0.6);
        return Math.min(profileMaxBytes, Math.max(0, quotaSafeCap));
      }
    }
  } catch {
    // Fallback to device profile ceiling
  }
  return profileMaxBytes;
}

/**
 * Downloads and verifies all downloadable manifest media assets (video/image) onto
 * local flash Cache Storage without creating all `blob:` URLs in RAM at once.
 */
export async function syncMediaAssetsToDisk(
  assets: ManifestAssetRef[],
  hardwareType: "android_tv" | "mini_pc" | "other" = "android_tv",
  onProgress?: (progress: SyncProgress) => void,
  maxCacheBytesOverride?: number
): Promise<SyncProgress> {
  const downloadable = assets.filter(isCacheableCloudAsset);

  const persisted = await requestPersistentPlayerStorage();

  if (typeof window === "undefined" || !("caches" in window)) {
    const progress: SyncProgress = {
      status: "synced",
      cachedCount: downloadable.length,
      totalCount: downloadable.length,
      storageUsedMb: 0,
      persisted,
    };
    onProgress?.(progress);
    return progress;
  }

  const profileCapBytes =
    maxCacheBytesOverride ??
    (hardwareType === "mini_pc"
      ? 2048 * 1024 * 1024 // 2 GB cap on Mini PCs
      : hardwareType === "other"
        ? 192 * 1024 * 1024 // 192 MB conservative cap on inbuilt Smart TV browsers
        : 512 * 1024 * 1024); // 512 MB cap on Android TVs

  const maxCacheBytes = await computeSafeCacheBudget(profileCapBytes);

  // If Smart TV browser has < 25 MB available storage, stream directly over HTTPS
  if (maxCacheBytes < 25 * 1024 * 1024) {
    const progress: SyncProgress = {
      status: "synced",
      cachedCount: 0,
      totalCount: downloadable.length,
      storageUsedMb: 0,
      persisted,
    };
    onProgress?.(progress);
    return progress;
  }

  let cache: Cache;
  try {
    cache = await caches.open(CACHE_NAME);
  } catch {
    const progress: SyncProgress = {
      status: "synced",
      cachedCount: 0,
      totalCount: downloadable.length,
      storageUsedMb: 0,
      persisted,
    };
    onProgress?.(progress);
    return progress;
  }
  const existingMeta = await getAllMeta();
  const metaById = new Map(existingMeta.map((m) => [m.assetId, m]));
  const activeAssetIds = new Set(downloadable.map((a) => a.assetId));

  // IMPORTANT: Do NOT blindly evict cached playlist videos just because the current rotation
  // step temporarily switched to a Promotion or Employee Recognition wall! Doing so caused a
  // ~1-minute cold re-download blackout every time playback returned from a Promo to the playlist.
  // Instead, track total cached bytes and only evict oldest LRU non-active entries if storage
  // space is actually needed for a new download.
  let totalBytes = 0;
  for (const m of existingMeta) {
    totalBytes += Math.max(0, m.sizeBytes || 0);
  }

  async function ensureCacheSpaceFor(incomingBytes: number): Promise<boolean> {
    if (totalBytes + incomingBytes <= maxCacheBytes) return true;
    const evictable = Array.from(metaById.values())
      .filter((m) => !activeAssetIds.has(m.assetId))
      .sort((a, b) => (a.cachedAt || 0) - (b.cachedAt || 0));

    for (const candidate of evictable) {
      await cache
        .delete(buildCacheKey(candidate.assetId, candidate.sha256Checksum))
        .catch(() => false);
      await deleteMeta(candidate.assetId);
      metaById.delete(candidate.assetId);
      totalBytes = Math.max(0, totalBytes - (candidate.sizeBytes || 0));
      if (totalBytes + incomingBytes <= maxCacheBytes) {
        return true;
      }
    }
    return totalBytes + incomingBytes <= maxCacheBytes;
  }

  let cachedCount = 0;
  let lastError: string | undefined;
  let quotaExhausted = false;

  onProgress?.({
    status: downloadable.length > 0 ? "downloading" : "synced",
    cachedCount: 0,
    totalCount: downloadable.length,
    storageUsedMb: Math.round(totalBytes / (1024 * 1024)),
    persisted,
  });

  for (const asset of downloadable) {
    const cacheKey = buildCacheKey(asset.assetId, asset.sha256Checksum);
    const meta = metaById.get(asset.assetId);
    const existingResp = await cache.match(cacheKey).catch(() => undefined);

    if (meta && meta.sha256Checksum !== asset.sha256Checksum) {
      await cache.delete(buildCacheKey(meta.assetId, meta.sha256Checksum)).catch(() => false);
      totalBytes = Math.max(0, totalBytes - (meta.sizeBytes || 0));
      metaById.delete(meta.assetId);
    }

    if (!existingResp) {
      if (quotaExhausted) {
        continue;
      }
      const existingFlight = inFlightDownloads.get(cacheKey);
      if (existingFlight) {
        await existingFlight;
        const nowCached = await cache.match(cacheKey).catch(() => undefined);
        if (nowCached) {
          cachedCount++;
          continue;
        }
      }
      const downloadPromise = (async (): Promise<boolean> => {
        try {
          const fetched = await fetch(asset.publicUrl, { mode: "cors" });
          if (!fetched.ok) {
            throw new Error(`HTTP ${fetched.status} fetching media`);
          }
          const blob = await fetched.blob();
          const hasRoom = await ensureCacheSpaceFor(blob.size);
          if (hasRoom) {
            const storedResponse = new Response(blob, {
              headers: {
                "Content-Type": asset.mimeType || blob.type,
                "Cache-Control": "public, max-age=31536000, immutable",
              },
            });
            await cache.put(cacheKey, storedResponse);
            const nextMeta: CachedAssetMeta = {
              assetId: asset.assetId,
              sha256Checksum: asset.sha256Checksum,
              publicUrl: asset.publicUrl,
              mimeType: asset.mimeType,
              sizeBytes: blob.size,
              cachedAt: Date.now(),
            };
            await putMeta(nextMeta);
            metaById.set(asset.assetId, nextMeta);
            totalBytes += blob.size;
            cachedCount++;
            return true;
          } else {
            lastError = `Device cache cap (${Math.round(maxCacheBytes / (1024 * 1024))} MB) reached`;
            return false;
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === "QuotaExceededError") {
            quotaExhausted = true;
            lastError = "TV browser storage full — streaming remaining media";
          } else {
            lastError = err instanceof Error ? err.message : "Download failed";
          }
          return false;
        }
      })();
      inFlightDownloads.set(cacheKey, downloadPromise);
      try {
        await downloadPromise;
      } finally {
        inFlightDownloads.delete(cacheKey);
      }
    } else {
      // Touch cachedAt so active playlist/promo assets stay hot in LRU cache
      if (meta) {
        const refreshed = { ...meta, cachedAt: Date.now() };
        metaById.set(asset.assetId, refreshed);
        void putMeta(refreshed);
      }
      cachedCount++;
    }

    onProgress?.({
      status: cachedCount === downloadable.length ? "synced" : "downloading",
      cachedCount,
      totalCount: downloadable.length,
      storageUsedMb: Math.round(totalBytes / (1024 * 1024)),
      persisted,
      lastError,
    });
  }

  const finalProgress: SyncProgress = {
    status: lastError && cachedCount < downloadable.length ? "error" : "synced",
    cachedCount,
    totalCount: downloadable.length,
    storageUsedMb: Math.round(totalBytes / (1024 * 1024)),
    persisted,
    lastError,
  };

  onProgress?.(finalProgress);
  return finalProgress;
}

/**
 * Resolves a single asset from local Cache Storage into a short-lived `blob:` URL.
 * Caller is responsible for revoking the returned `blob:` URL when the item leaves
 * the `[current, next]` playback window (keeps Android TV RAM usage minimal).
 */
export async function resolveAssetPlaybackUrl(
  asset: ManifestAssetRef
): Promise<{ url: string; isBlob: boolean }> {
  if (
    !isCacheableCloudAsset(asset) ||
    typeof window === "undefined" ||
    !("caches" in window)
  ) {
    return { url: asset.publicUrl, isBlob: false };
  }

  try {
    const cacheKey = buildCacheKey(asset.assetId, asset.sha256Checksum);
    // If this asset is actively downloading into Cache Storage right now, wait for it
    // instead of opening a duplicate cloud stream (cuts first-load bandwidth by 50%).
    const inflight = inFlightDownloads.get(cacheKey);
    if (inflight) {
      await inflight.catch(() => false);
    }

    const cache = await caches.open(CACHE_NAME);
    const match = await cache.match(cacheKey);
    if (match) {
      const blob = await match.blob();
      return { url: URL.createObjectURL(blob), isBlob: true };
    }
  } catch {
    // Fallback to remote URL if cache read fails
  }

  return { url: asset.publicUrl, isBlob: false };
}

export async function clearPlayerMediaCache(): Promise<void> {
  try {
    if (typeof window !== "undefined" && "caches" in window) {
      await caches.delete(CACHE_NAME);
    }
  } catch {
    // Non-fatal on restricted Smart TV browsers
  }
  try {
    if (typeof indexedDB !== "undefined") {
      const db = await openMetaDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
  } catch {
    // Non-fatal on restricted Smart TV browsers
  }
}
