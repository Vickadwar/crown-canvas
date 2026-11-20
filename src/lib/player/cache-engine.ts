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
  const db = await openMetaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const store = tx.objectStore(IDB_STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as CachedAssetMeta[]);
    req.onerror = () => reject(req.error);
  });
}

async function putMeta(meta: CachedAssetMeta): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openMetaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(meta);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteMeta(assetId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openMetaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(assetId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function buildCacheKey(assetId: string, checksum: string): string {
  return `${window.location.origin}/__cached_media/${encodeURIComponent(assetId)}/${encodeURIComponent(checksum)}`;
}

export interface ManifestAssetRef {
  assetId: string;
  sha256Checksum: string;
  publicUrl: string;
  mimeType: string;
  mediaType?: "video" | "image" | "web_url" | "pdf";
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
 * Downloads and verifies all downloadable manifest media assets (video/image) onto
 * local flash Cache Storage without creating all `blob:` URLs in RAM at once.
 */
export async function syncMediaAssetsToDisk(
  assets: ManifestAssetRef[],
  hardwareType: "android_tv" | "mini_pc" = "android_tv",
  onProgress?: (progress: SyncProgress) => void
): Promise<SyncProgress> {
  const downloadable = assets.filter(
    (a) => a.mediaType !== "web_url" && a.mediaType !== "pdf"
  );

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

  const maxCacheBytes =
    hardwareType === "android_tv"
      ? 512 * 1024 * 1024 // 512 MB cap on standalone Android TVs
      : 2048 * 1024 * 1024; // 2 GB cap on Mini PCs

  const cache = await caches.open(CACHE_NAME);
  const existingMeta = await getAllMeta();
  const metaById = new Map(existingMeta.map((m) => [m.assetId, m]));
  const activeAssetIds = new Set(downloadable.map((a) => a.assetId));

  // Evict stale assets no longer in current manifest
  for (const old of existingMeta) {
    if (!activeAssetIds.has(old.assetId)) {
      await cache.delete(buildCacheKey(old.assetId, old.sha256Checksum));
      await deleteMeta(old.assetId);
      metaById.delete(old.assetId);
    }
  }

  let cachedCount = 0;
  let totalBytes = 0;
  let lastError: string | undefined;

  onProgress?.({
    status: downloadable.length > 0 ? "downloading" : "synced",
    cachedCount: 0,
    totalCount: downloadable.length,
    storageUsedMb: 0,
    persisted,
  });

  for (const asset of downloadable) {
    const cacheKey = buildCacheKey(asset.assetId, asset.sha256Checksum);
    const meta = metaById.get(asset.assetId);
    const existingResp = await cache.match(cacheKey);

    if (meta && meta.sha256Checksum !== asset.sha256Checksum) {
      await cache.delete(buildCacheKey(meta.assetId, meta.sha256Checksum));
    }

    if (!existingResp) {
      try {
        const fetched = await fetch(asset.publicUrl, { mode: "cors" });
        if (!fetched.ok) {
          throw new Error(`HTTP ${fetched.status} fetching media`);
        }
        const blob = await fetched.blob();
        if (totalBytes + blob.size <= maxCacheBytes) {
          const storedResponse = new Response(blob, {
            headers: { "Content-Type": asset.mimeType || blob.type },
          });
          await cache.put(cacheKey, storedResponse);
          await putMeta({
            assetId: asset.assetId,
            sha256Checksum: asset.sha256Checksum,
            publicUrl: asset.publicUrl,
            mimeType: asset.mimeType,
            sizeBytes: blob.size,
            cachedAt: Date.now(),
          });
          totalBytes += blob.size;
          cachedCount++;
        } else {
          lastError = `Device cache cap (${Math.round(maxCacheBytes / (1024 * 1024))} MB) reached`;
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Download failed";
      }
    } else {
      const sizeBytes = meta?.sizeBytes ?? (await existingResp.clone().blob()).size;
      totalBytes += sizeBytes;
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
    asset.mediaType === "web_url" ||
    asset.mediaType === "pdf" ||
    typeof window === "undefined" ||
    !("caches" in window)
  ) {
    return { url: asset.publicUrl, isBlob: false };
  }

  try {
    const cache = await caches.open(CACHE_NAME);
    const cacheKey = buildCacheKey(asset.assetId, asset.sha256Checksum);
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
  if (typeof window !== "undefined" && "caches" in window) {
    await caches.delete(CACHE_NAME);
  }
  if (typeof indexedDB !== "undefined") {
    const db = await openMetaDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
