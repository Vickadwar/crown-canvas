"use client";

/**
 * @file src/components/player/player-client.tsx
 * @description Offline-first signage player for Android TVs and Mini PCs: handles Wake Lock,
 * 6-digit PIN pairing, local Cache Storage video sync, Supabase Realtime overrides,
 * 30s heartbeats, remote commands, and 45s batched Proof-of-Play telemetry.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  HardDrive,
  LayoutPanelLeft,
  Maximize2,
  Minimize2,
  Monitor,
  RefreshCw,
  RotateCcw,
  Tv,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from "lucide-react";
import type {
  LayoutZone,
  PlaylistSidebarConfig,
  QuickPostSlideConfig,
} from "@/db/schema";
import { DEMO_QUICK_POSTS } from "@/lib/demo-data";
import {
  CROWN_OFFICIAL_LOGO_URL,
  type CrownProductItem,
} from "@/lib/crown-products";
import {
  clearPlayerMediaCache,
  resolveAssetPlaybackUrl,
  syncMediaAssetsToDisk,
  type SyncProgress,
} from "@/lib/player/cache-engine";
import { isWithinOperatingHours } from "@/lib/screen-health";
import {
  createSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import {
  MultiZoneFrame,
  type ActiveSidebarProfile,
} from "./multi-zone-frame";
import { PdfSignageViewer } from "./pdf-signage-viewer";
import { QuickPostSlide } from "./quick-post-slide";
import { TickerBar } from "./ticker-bar";

type PlayerItem =
  | {
    id: string;
    kind: "media_asset";
    assetId: string;
    title: string;
    mediaType: "video" | "image" | "web_url" | "pdf";
    publicUrl: string;
    mimeType: string;
    sha256Checksum: string;
    durationSeconds: number;
    departmentCode: string;
    departmentName: string;
  }
  | {
    id: string;
    kind: "quick_post";
    quickPostId: string;
    title: string;
    templateType: string;
    slideConfig: QuickPostSlideConfig;
    durationSeconds: number;
    departmentCode: string;
    departmentName: string;
    accentColor?: string;
  };

interface PlayerManifest {
  screen: {
    id: string;
    name: string;
    orientation: "landscape" | "portrait";
    screenRole: string;
    hardwareType: string;
  };
  branch: {
    id: string;
    code: string;
    name: string;
    city: string;
    openingTime?: string;
    closingTime?: string;
  } | null;
  country: {
    id: string;
    code: string;
    name: string;
    currencyCode: string;
    timezone: string;
  } | null;
  playlist: {
    id: string;
    name: string;
    version: number;
    tickerText?: string | null;
    sidebarConfig?: PlaylistSidebarConfig | null;
    sidebarProfileId?: string | null;
  } | null;
  sidebarProfile?: ActiveSidebarProfile | null;
  showcaseProducts?: CrownProductItem[];
  qrSignatures?: Record<string, string>;
  layout?: {
    id: string;
    name: string;
    zonesConfig: LayoutZone[];
  } | null;
  screenPaused?: boolean;
  tickerMessages?: string[];
  emergencyOverride: {
    id: string;
    title: string;
    message: string;
    overrideKind?: "alert" | "media_asset" | "playlist";
    severity: "info" | "warning" | "critical";
    playlistId?: string | null;
    mediaAsset?: {
      id: string;
      title: string;
      mediaType: "video" | "image" | "web_url" | "pdf";
      publicUrl: string;
      mimeType: string;
    } | null;
  } | null;
  items: PlayerItem[];
  generatedAt: string;
}

const STORAGE_TOKEN_KEY = "crown_canvas_device_token";
const STORAGE_MANIFEST_KEY = "crown_canvas_last_manifest";
const STORAGE_PENDING_PIN_KEY = "crown_canvas_pending_pin";
const STORAGE_MUTED_KEY = "crown_canvas_player_muted";
const SESSION_EXECUTED_CMDS_KEY = "crown_canvas_executed_cmds";

function claimCommandOnce(commandId?: string | null): boolean {
  if (!commandId || typeof sessionStorage === "undefined") return true;
  try {
    const raw = sessionStorage.getItem(SESSION_EXECUTED_CMDS_KEY);
    const seen = raw ? (JSON.parse(raw) as string[]) : [];
    if (seen.includes(commandId)) return false;
    seen.push(commandId);
    sessionStorage.setItem(
      SESSION_EXECUTED_CMDS_KEY,
      JSON.stringify(seen.slice(-50))
    );
    return true;
  } catch {
    return true;
  }
}

const EMPTY_PLAYER_ITEMS: PlayerItem[] = [];

const DEMO_PLAYER_ITEMS: PlayerItem[] = DEMO_QUICK_POSTS.map((qp) => ({
  id: qp.id,
  kind: "quick_post" as const,
  quickPostId: qp.id,
  title: qp.title,
  templateType: qp.templateType,
  slideConfig: qp.slideConfig,
  durationSeconds: qp.durationSeconds,
  departmentCode: qp.departmentCode,
  departmentName: qp.departmentName,
  accentColor: qp.accentColor,
}));

function detectHardwareType(): "android_tv" | "mini_pc" {
  if (typeof navigator === "undefined") return "android_tv";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("android") || ua.includes("aft") || ua.includes("bravia")) {
    return "android_tv";
  }
  return "mini_pc";
}

function formatEastAfricaClock(timezone?: string): string {
  try {
    return new Intl.DateTimeFormat("en-KE", {
      timeZone: timezone || "Africa/Nairobi",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());
  } catch {
    return new Date().toTimeString().slice(0, 5);
  }
}

export function PlayerClient() {
  const [storageChecked, setStorageChecked] = useState(false);
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [refreshingPin, setRefreshingPin] = useState(false);
  const [pairingConfigured, setPairingConfigured] = useState(true);
  const [hardwareType, setHardwareType] = useState<"android_tv" | "mini_pc">("android_tv");
  const [demoMode, setDemoMode] = useState(false);
  const [demoSplitView, setDemoSplitView] = useState(true);

  const [manifest, setManifest] = useState<PlayerManifest | null>(null);
  const [slotUrls, setSlotUrls] = useState<Record<string, string>>({});
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({
    status: "pending",
    cachedCount: 0,
    totalCount: 0,
    storageUsedMb: 0,
  });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [identifyBanner, setIdentifyBanner] = useState(false);
  const [clockText, setClockText] = useState<string>("--:--");
  const [isMuted, setIsMuted] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [standbyBypass, setStandbyBypass] = useState(false);
  const [isStandby, setIsStandby] = useState(false);

  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const blobUrlsRef = useRef<Map<string, string>>(new Map());
  const pendingCommandAckRef = useRef<string[]>([]);
  const timezoneRef = useRef<string | undefined>(undefined);
  const manifestEtagRef = useRef<string | null>(null);
  const currentItemTitleRef = useRef<string | null>(null);
  const activeVideoRef = useRef<HTMLVideoElement | null>(null);
  const hardwareTypeRef = useRef<"android_tv" | "mini_pc">("android_tv");
  const branchHoursRef = useRef<{
    openingTime?: string;
    closingTime?: string;
  }>({});

  useEffect(() => {
    timezoneRef.current = manifest?.country?.timezone;
    branchHoursRef.current = {
      openingTime: manifest?.branch?.openingTime,
      closingTime: manifest?.branch?.closingTime,
    };
  }, [
    manifest?.country?.timezone,
    manifest?.branch?.openingTime,
    manifest?.branch?.closingTime,
  ]);

  // 1. Initialize stored device token, PWA Service Worker, clock, operating hours & Wake Lock
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Non-fatal in dev or restricted webviews
      });
    }

    const initTimer = setTimeout(() => {
      const detected = detectHardwareType();
      hardwareTypeRef.current = detected;
      setHardwareType(detected);
      const savedToken = localStorage.getItem(STORAGE_TOKEN_KEY);
      if (savedToken) {
        setDeviceToken(savedToken);
      }
      const cachedManifestRaw = localStorage.getItem(STORAGE_MANIFEST_KEY);
      if (cachedManifestRaw) {
        try {
          setManifest(JSON.parse(cachedManifestRaw) as PlayerManifest);
        } catch {
          // Ignore corrupt cache
        }
      }
      const savedMuted = localStorage.getItem(STORAGE_MUTED_KEY);
      if (savedMuted === "true") {
        setIsMuted(true);
      }
      setIsOnline(navigator.onLine);
      setClockText(formatEastAfricaClock(timezoneRef.current));
      setStorageChecked(true);
    }, 0);

    const clockInterval = setInterval(() => {
      setClockText(formatEastAfricaClock(timezoneRef.current));
      const { openingTime, closingTime } = branchHoursRef.current;
      if (openingTime && closingTime) {
        const openNow = isWithinOperatingHours(
          openingTime,
          closingTime,
          timezoneRef.current || "Africa/Nairobi"
        );
        setIsStandby(!openNow);
      } else {
        setIsStandby(false);
      }
    }, 15_000);

    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    let wakeLock: { release: () => Promise<void> } | null = null;
    if ("wakeLock" in navigator) {
      (
        navigator as unknown as {
          wakeLock: {
            request: (t: string) => Promise<{ release: () => Promise<void> }>;
          };
        }
      ).wakeLock
        .request("screen")
        .then((wl) => {
          wakeLock = wl;
        })
        .catch(() => { });
    }

    return () => {
      clearTimeout(initTimer);
      clearInterval(clockInterval);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      wakeLock?.release().catch(() => { });
    };
  }, []);

  // In-place pairing PIN refresh (regenerates ONLY the 6-digit code without reloading the page/logo)
  const handleRefreshPairingCode = useCallback(async () => {
    setRefreshingPin(true);
    try {
      localStorage.removeItem(STORAGE_PENDING_PIN_KEY);
      const detected = detectHardwareType();
      const res = await fetch("/api/player/pair/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hardwareType: detected,
          resolution: `${window.screen.width}x${window.screen.height}`,
        }),
      });
      const data = await res.json();
      setPairingConfigured(data.configured !== false);
      if (data.code) {
        setPairingCode(data.code);
        if (data.configured !== false && data.expiresAt) {
          localStorage.setItem(
            STORAGE_PENDING_PIN_KEY,
            JSON.stringify({ code: data.code, expiresAt: data.expiresAt })
          );
        }
      }
    } catch {
      setPairingCode("OFFLINE");
    } finally {
      setRefreshingPin(false);
    }
  }, []);

  // 2. Request or resume 6-digit pairing PIN only after localStorage is checked
  useEffect(() => {
    if (!storageChecked || deviceToken || demoMode || pairingCode) return;
    let active = true;

    async function ensurePairingPin() {
      // Reuse valid unclaimed PIN across browser refreshes
      try {
        const pendingRaw = localStorage.getItem(STORAGE_PENDING_PIN_KEY);
        if (pendingRaw) {
          const pending = JSON.parse(pendingRaw) as {
            code?: string;
            expiresAt?: string;
          };
          const expMs = pending.expiresAt ? Date.parse(pending.expiresAt) : 0;
          if (pending.code && expMs > Date.now() + 30_000) {
            const statusRes = await fetch(
              `/api/player/pair/status?code=${encodeURIComponent(pending.code)}`
            );
            if (statusRes.ok) {
              const statusJson = await statusRes.json();
              if (!active) return;
              if (statusJson.paired && statusJson.deviceToken) {
                localStorage.setItem(STORAGE_TOKEN_KEY, statusJson.deviceToken);
                localStorage.removeItem(STORAGE_PENDING_PIN_KEY);
                setDeviceToken(statusJson.deviceToken);
                return;
              }
              if (!statusJson.expired && !statusJson.paired) {
                setPairingConfigured(statusJson.configured !== false);
                setPairingCode(pending.code);
                return;
              }
            }
          }
          localStorage.removeItem(STORAGE_PENDING_PIN_KEY);
        }
      } catch {
        // Fall through to requesting a fresh PIN
      }

      const detected = detectHardwareType();
      try {
        const res = await fetch("/api/player/pair/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            hardwareType: detected,
            resolution: `${window.screen.width}x${window.screen.height}`,
          }),
        });
        const data = await res.json();
        if (!active) return;
        setPairingConfigured(data.configured !== false);
        setPairingCode(data.code);
        if (data.configured !== false && data.code && data.expiresAt) {
          localStorage.setItem(
            STORAGE_PENDING_PIN_KEY,
            JSON.stringify({ code: data.code, expiresAt: data.expiresAt })
          );
        }
      } catch {
        if (active) setPairingCode("OFFLINE");
      }
    }

    ensurePairingPin();
    return () => {
      active = false;
    };
  }, [storageChecked, deviceToken, demoMode, pairingCode]);

  // 3. Poll pairing status every 4 seconds until admin claims PIN
  useEffect(() => {
    if (deviceToken || demoMode || !pairingCode || !pairingConfigured) return;

    const timer = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/player/pair/status?code=${encodeURIComponent(pairingCode)}`
        );
        const data = await res.json();
        if (data.paired && data.deviceToken) {
          localStorage.setItem(STORAGE_TOKEN_KEY, data.deviceToken);
          localStorage.removeItem(STORAGE_PENDING_PIN_KEY);
          setDeviceToken(data.deviceToken);
        } else if (data.expired) {
          localStorage.removeItem(STORAGE_PENDING_PIN_KEY);
          setPairingCode(null);
        }
      } catch {
        // Ignore transient network errors while polling
      }
    }, 4000);

    return () => clearInterval(timer);
  }, [deviceToken, demoMode, pairingCode, pairingConfigured]);

  const resetLocalPairing = useCallback(() => {
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_MANIFEST_KEY);
    localStorage.removeItem(STORAGE_PENDING_PIN_KEY);
    manifestEtagRef.current = null;
    setDeviceToken(null);
    setManifest(null);
    setPairingCode(null);
  }, []);

  // Capture lightweight 480x270 JPEG snapshot of live video frame or active slide state
  const captureAndUploadSnapshot = useCallback(
    async (token: string) => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 480;
        canvas.height = 270;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const video = activeVideoRef.current;
        if (video && video.readyState >= 2 && video.videoWidth > 0) {
          ctx.fillStyle = "#000000";
          ctx.fillRect(0, 0, 480, 270);
          ctx.drawImage(video, 0, 0, 480, 270);
        } else {
          const grad = ctx.createLinearGradient(0, 0, 480, 270);
          grad.addColorStop(0, "#050a18");
          grad.addColorStop(1, "#0c1f4a");
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, 480, 270);
          ctx.fillStyle = "#f59e0b";
          ctx.fillRect(0, 0, 480, 6);
          ctx.fillStyle = "#94a3b8";
          ctx.font = "bold 12px sans-serif";
          ctx.fillText("CROWN CANVAS • LIVE PROOF-OF-PLAYBACK", 24, 42);
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 22px sans-serif";
          ctx.fillText(
            (currentItemTitleRef.current || "Active Signage Slide").slice(0, 36),
            24,
            120
          );
          ctx.fillStyle = "#cbd5e1";
          ctx.font = "14px sans-serif";
          ctx.fillText(
            `${manifest?.screen?.name ?? "Paired Screen"} • ${manifest?.branch?.name ?? ""}`.slice(
              0,
              56
            ),
            24,
            165
          );
        }

        // Overlay verification timestamp
        ctx.fillStyle = "rgba(0,0,0,0.68)";
        ctx.fillRect(14, 232, 452, 26);
        ctx.fillStyle = "#e2e8f0";
        ctx.font = "11px monospace";
        ctx.fillText(
          `LIVE • ${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC • ${(currentItemTitleRef.current || "").slice(0, 24)}`,
          22,
          249
        );

        const snapshotDataUrl = canvas.toDataURL("image/jpeg", 0.72);
        await fetch("/api/player/heartbeat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            cacheStatus: syncProgress.status,
            cachedAssetCount: syncProgress.cachedCount,
            storageUsedMb: syncProgress.storageUsedMb,
            appVersion: "2.0.0-enterprise",
            currentItemTitle: currentItemTitleRef.current,
            snapshotDataUrl,
            executedCommandIds: pendingCommandAckRef.current,
          }),
        });
        pendingCommandAckRef.current = [];
      } catch {
        // Non-fatal on tainted cross-origin video
      }
    },
    [manifest, syncProgress]
  );

  // 4. Fetch & sync manifest -> local disk Cache Storage (with ETag 304 short-circuit)
  const syncManifest = useCallback(
    async (token: string, forceFull = false) => {
      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${token}`,
        };
        if (!forceFull && manifestEtagRef.current) {
          headers["If-None-Match"] = manifestEtagRef.current;
        }

        const res = await fetch("/api/player/manifest", { headers });

        if (res.status === 401) {
          resetLocalPairing();
          return;
        }
        if (res.status === 304) {
          return;
        }
        if (!res.ok) return;

        const etag = res.headers.get("etag");
        if (etag) manifestEtagRef.current = etag;

        const data = (await res.json()) as PlayerManifest;
        setManifest(data);
        localStorage.setItem(STORAGE_MANIFEST_KEY, JSON.stringify(data));

        if (data.branch?.openingTime && data.branch?.closingTime) {
          const openNow = isWithinOperatingHours(
            data.branch.openingTime,
            data.branch.closingTime,
            data.country?.timezone || "Africa/Nairobi"
          );
          setIsStandby(!openNow);
        }

        const mediaRefs = data.items
          .filter(
            (item): item is Extract<PlayerItem, { kind: "media_asset" }> =>
              item.kind === "media_asset"
          )
          .map((item) => ({
            assetId: item.assetId,
            sha256Checksum: item.sha256Checksum,
            publicUrl: item.publicUrl,
            mimeType: item.mimeType,
            mediaType: item.mediaType,
          }));

        await syncMediaAssetsToDisk(
          mediaRefs,
          hardwareTypeRef.current,
          setSyncProgress
        );
      } catch {
        // Offline: continue using previously cached manifest & local disk Cache Storage
      }
    },
    [resetLocalPairing]
  );

  useEffect(() => {
    if (!deviceToken) return;
    const initialTimer = setTimeout(() => {
      void syncManifest(deviceToken, true);
    }, 0);
    const refreshTimer = setInterval(() => {
      void syncManifest(deviceToken);
    }, 60_000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(refreshTimer);
    };
  }, [deviceToken, syncManifest]);

  // 4B. Instant Supabase Realtime Listener (<2s Emergency Overrides, Playlist Updates & Snapshots)
  useEffect(() => {
    if (!deviceToken || !isSupabaseConfigured()) return;

    try {
      const supabase = createSupabaseBrowserClient();
      const channel = supabase
        .channel("crown-canvas-fleet")
        .on("broadcast", { event: "manifest_refresh" }, () => {
          void syncManifest(deviceToken, true);
        })
        .on("broadcast", { event: "emergency_override" }, () => {
          void syncManifest(deviceToken, true);
        })
        .on("broadcast", { event: "screen_removed" }, ({ payload }) => {
          if (
            payload?.screenId &&
            manifest?.screen?.id &&
            payload.screenId === manifest.screen.id
          ) {
            resetLocalPairing();
          }
        })
        .on("broadcast", { event: "screen_command" }, ({ payload }) => {
          if (
            payload?.screenId &&
            manifest?.screen?.id &&
            payload.screenId === manifest.screen.id
          ) {
            const cmdId =
              typeof payload.commandId === "string" ? payload.commandId : null;
            if (!claimCommandOnce(cmdId)) return;

            const ackImmediately = async () => {
              if (!cmdId) return;
              try {
                await fetch("/api/player/heartbeat", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${deviceToken}`,
                  },
                  body: JSON.stringify({
                    executedCommandIds: [cmdId],
                  }),
                  signal: AbortSignal.timeout(1500),
                });
              } catch {
                // Non-fatal
              }
            };

            if (payload.command === "identify") {
              void ackImmediately();
              setIdentifyBanner(true);
              setTimeout(() => setIdentifyBanner(false), 10_000);
            } else if (
              payload.command === "reload" ||
              payload.command === "restart_player"
            ) {
              // Mark command executed in DB BEFORE reloading so the next heartbeat never re-triggers reload
              void ackImmediately().finally(() => {
                window.location.reload();
              });
            } else if (payload.command === "clear_cache") {
              void ackImmediately()
                .then(() => clearPlayerMediaCache())
                .then(() => syncManifest(deviceToken, true));
            } else if (payload.command === "screenshot") {
              void ackImmediately().then(() =>
                captureAndUploadSnapshot(deviceToken)
              );
            }
          }
        })
        .subscribe();

      return () => {
        void supabase.removeChannel(channel);
      };
    } catch {
      return;
    }
  }, [
    deviceToken,
    manifest?.screen?.id,
    syncManifest,
    resetLocalPairing,
    captureAndUploadSnapshot,
  ]);

  // 5. Send 30s heartbeat + process queued remote commands
  useEffect(() => {
    if (!deviceToken) return;

    const sendHeartbeat = async () => {
      try {
        const res = await fetch("/api/player/heartbeat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${deviceToken}`,
          },
          body: JSON.stringify({
            cacheStatus: syncProgress.status,
            cachedAssetCount: syncProgress.cachedCount,
            storageUsedMb: syncProgress.storageUsedMb,
            appVersion: "2.0.0-enterprise",
            currentItemTitle: currentItemTitleRef.current,
            executedCommandIds: pendingCommandAckRef.current,
          }),
        });
        pendingCommandAckRef.current = [];

        if (res.status === 401) {
          resetLocalPairing();
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        const commands = (data.commands ?? []) as Array<{
          id: string;
          command: string;
        }>;

        for (const cmd of commands) {
          if (!claimCommandOnce(cmd.id)) continue;
          if (cmd.command === "identify") {
            setIdentifyBanner(true);
            setTimeout(() => setIdentifyBanner(false), 10_000);
          } else if (cmd.command === "clear_cache") {
            await clearPlayerMediaCache();
            await syncManifest(deviceToken, true);
          } else if (cmd.command === "screenshot") {
            await captureAndUploadSnapshot(deviceToken);
          } else if (
            cmd.command === "reload" ||
            cmd.command === "restart_player"
          ) {
            window.location.reload();
            return;
          }
        }
      } catch {
        // Offline — skip heartbeat silently
      }
    };

    const initialHb = setTimeout(() => {
      void sendHeartbeat();
    }, 3000);
    const hbTimer = setInterval(sendHeartbeat, 30_000);
    return () => {
      clearTimeout(initialHb);
      clearInterval(hbTimer);
    };
  }, [
    deviceToken,
    syncProgress,
    syncManifest,
    resetLocalPairing,
    captureAndUploadSnapshot,
  ]);

  // 5B. Proof-of-Play Telemetry Queue & Batch Flush (45s)
  useEffect(() => {
    if (!deviceToken) return;

    const flushTelemetry = async () => {
      const raw = localStorage.getItem("crown_canvas_telemetry_queue");
      if (!raw) return;
      try {
        const queued = JSON.parse(raw) as Array<{
          playlistId?: string | null;
          mediaAssetId?: string | null;
          quickPostId?: string | null;
          startedAt: string;
          durationPlayedSeconds: number;
          completed: boolean;
        }>;
        if (!Array.isArray(queued) || queued.length === 0) return;

        const batch = queued.slice(0, 50);
        const res = await fetch("/api/player/telemetry", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${deviceToken}`,
          },
          body: JSON.stringify({ items: batch }),
        });
        if (res.ok || res.status === 400) {
          const remaining = queued.slice(batch.length);
          localStorage.setItem(
            "crown_canvas_telemetry_queue",
            JSON.stringify(remaining)
          );
        }
      } catch {
        // Offline: keep queued plays in localStorage until back online
      }
    };

    const telTimer = setInterval(flushTelemetry, 45_000);
    return () => clearInterval(telTimer);
  }, [deviceToken]);

  // 6. Active playlist items (stable references across renders to avoid resetting effects/timers)
  const activeItems: PlayerItem[] = demoMode
    ? DEMO_PLAYER_ITEMS
    : (manifest?.items ?? EMPTY_PLAYER_ITEMS);

  const safeIndex =
    activeItems.length > 0 ? currentIndex % activeItems.length : 0;
  const currentItem = activeItems.length > 0 ? activeItems[safeIndex] : null;
  const nextIndex =
    activeItems.length > 1 ? (safeIndex + 1) % activeItems.length : null;
  const nextItem = nextIndex !== null ? activeItems[nextIndex] : null;

  useEffect(() => {
    currentItemTitleRef.current = currentItem?.title ?? null;
  }, [currentItem?.title]);

  const currentMediaKey =
    currentItem?.kind === "media_asset"
      ? `${currentItem.assetId}:${currentItem.sha256Checksum}`
      : null;
  const nextMediaKey =
    nextItem?.kind === "media_asset"
      ? `${nextItem.assetId}:${nextItem.sha256Checksum}`
      : null;

  const currentPlaybackUrl =
    currentItem?.kind === "media_asset"
      ? (currentMediaKey ? slotUrls[currentMediaKey] : undefined) ||
      currentItem.publicUrl
      : null;
  const nextPlaybackUrl =
    nextItem?.kind === "media_asset"
      ? (nextMediaKey ? slotUrls[nextMediaKey] : undefined) ||
      nextItem.publicUrl
      : null;

  // Revoke any remaining blob: URLs on unmount
  useEffect(() => {
    const blobs = blobUrlsRef.current;
    return () => {
      for (const u of blobs.values()) {
        URL.revokeObjectURL(u);
      }
      blobs.clear();
    };
  }, []);

  // Zero-delay 2-slot double-buffer blob: URL promotion (promotes pre-warmed [next] -> [current]
  // instantaneously without re-reading disk, while revoking anything outside the 2-slot window)
  useEffect(() => {
    let active = true;

    async function hydrateSlots() {
      const keepKeys = new Set<string>();
      const targets: Array<{
        key: string;
        item: Extract<PlayerItem, { kind: "media_asset" }>;
      }> = [];

      if (currentItem?.kind === "media_asset" && currentMediaKey) {
        keepKeys.add(currentMediaKey);
        targets.push({ key: currentMediaKey, item: currentItem });
      }
      if (nextItem?.kind === "media_asset" && nextMediaKey) {
        keepKeys.add(nextMediaKey);
        if (nextMediaKey !== currentMediaKey) {
          targets.push({ key: nextMediaKey, item: nextItem });
        }
      }

      const nextMap: Record<string, string> = {};
      for (const { key, item } of targets) {
        const existingBlob = blobUrlsRef.current.get(key);
        if (existingBlob) {
          nextMap[key] = existingBlob;
          continue;
        }
        const res = await resolveAssetPlaybackUrl({
          assetId: item.assetId,
          sha256Checksum: item.sha256Checksum,
          publicUrl: item.publicUrl,
          mimeType: item.mimeType,
          mediaType: item.mediaType,
        });
        if (!active) {
          if (res.isBlob) URL.revokeObjectURL(res.url);
          return;
        }
        if (res.isBlob) {
          blobUrlsRef.current.set(key, res.url);
        }
        nextMap[key] = res.url;
      }

      // Evict & revoke any blob URLs no longer in the active [current, next] window
      for (const [k, url] of blobUrlsRef.current.entries()) {
        if (!keepKeys.has(k)) {
          URL.revokeObjectURL(url);
          blobUrlsRef.current.delete(k);
        }
      }

      if (!active) return;
      setSlotUrls((prev) => {
        const prevKeys = Object.keys(prev);
        const nextKeys = Object.keys(nextMap);
        if (
          prevKeys.length === nextKeys.length &&
          nextKeys.every((k) => prev[k] === nextMap[k])
        ) {
          return prev;
        }
        return nextMap;
      });
    }

    void hydrateSlots();
    return () => {
      active = false;
    };
  }, [
    currentItem,
    nextItem,
    currentMediaKey,
    nextMediaKey,
    syncProgress.cachedCount,
  ]);

  const toggleMuted = useCallback(() => {
    if (audioBlocked) {
      setAudioBlocked(false);
      setIsMuted(false);
      try {
        localStorage.setItem(STORAGE_MUTED_KEY, "false");
      } catch {
        // Ignore storage errors
      }
      const video = activeVideoRef.current;
      if (video) {
        video.muted = false;
        video.volume = 1;
        void video.play().catch(() => { });
      }
      return;
    }

    setIsMuted((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_MUTED_KEY, String(next));
      } catch {
        // Ignore storage errors
      }
      const video = activeVideoRef.current;
      if (video) {
        video.muted = next;
        video.volume = 1;
        if (!next) {
          void video.play().catch(() => { });
        }
      }
      return next;
    });
  }, [audioBlocked]);

  const toggleFullscreen = useCallback(() => {
    const container = playerContainerRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => { });
    } else {
      void container.requestFullscreen().catch(() => { });
    }
  }, []);

  // Keep fullscreen locked to the outer player container (never a child <video>)
  // so Split-Screen sidebar stays visible and fullscreen never drops between slides.
  useEffect(() => {
    const onFullscreenChange = () => {
      const fsEl = document.fullscreenElement;
      const container = playerContainerRef.current;
      if (fsEl && container && fsEl !== container && container.contains(fsEl)) {
        // Browser put a child <video> into fullscreen; promote to whole player container
        void document
          .exitFullscreen()
          .then(() => container.requestFullscreen())
          .catch(() => { });
        return;
      }
      setIsFullscreen(Boolean(fsEl));
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  // Smart unmuted autoplay (ignores transient AbortError on source swap; silently recovers
  // if browser policy requires a first gesture before unmuting)
  useEffect(() => {
    const video = activeVideoRef.current;
    if (
      !video ||
      currentItem?.kind !== "media_asset" ||
      currentItem.mediaType !== "video"
    ) {
      return;
    }

    let cancelled = false;
    video.volume = 1;
    video.muted = isMuted;

    const attemptPlay = async () => {
      try {
        await video.play();
        if (!cancelled && !isMuted) {
          setAudioBlocked(false);
        }
      } catch (err) {
        if (cancelled) return;
        const errName = err instanceof DOMException ? err.name : "";
        if (errName === "AbortError") return;
        if (!isMuted && errName === "NotAllowedError") {
          // Browser blocked unmuted autoplay before first user interaction:
          // start playback smoothly muted without any intrusive popup, and auto-unmute on first gesture.
          video.muted = true;
          setAudioBlocked(true);
          try {
            await video.play();
          } catch {
            // Ignore secondary play errors
          }
        }
      }
    };

    void attemptPlay();
    return () => {
      cancelled = true;
    };
  }, [currentItem, safeIndex, currentPlaybackUrl, isMuted]);

  // Automatically unlock video audio on the very first click/tap/keypress anywhere on /player
  useEffect(() => {
    if (!audioBlocked || isMuted) return;
    const unlockAudio = () => {
      const video = activeVideoRef.current;
      if (video) {
        video.muted = false;
        video.volume = 1;
        void video.play().catch(() => { });
      }
      setAudioBlocked(false);
    };
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, [audioBlocked, isMuted]);

  // Android TV Remote D-Pad & Keyboard Controls (zero-mouse navigation)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && activeItems.length > 1) {
        setCurrentIndex((prev) => (prev + 1) % activeItems.length);
      } else if (e.key === "ArrowLeft" && activeItems.length > 1) {
        setCurrentIndex(
          (prev) => (prev - 1 + activeItems.length) % activeItems.length
        );
      } else if (e.key.toLowerCase() === "m") {
        toggleMuted();
      } else if (e.key.toLowerCase() === "f") {
        toggleFullscreen();
      } else if (e.key === "Escape" && demoMode) {
        setDemoMode(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeItems.length, demoMode, toggleMuted, toggleFullscreen]);

  // Record Proof-of-Play event into offline-safe queue whenever a slide finishes
  useEffect(() => {
    if (!deviceToken || !currentItem || demoMode) return;
    const startedAt = new Date().toISOString();
    const playlistId = manifest?.playlist?.id ?? null;

    return () => {
      const elapsedSec = Math.max(
        1,
        Math.round((Date.now() - new Date(startedAt).getTime()) / 1000)
      );
      try {
        const existingRaw = localStorage.getItem("crown_canvas_telemetry_queue");
        const existing = existingRaw ? (JSON.parse(existingRaw) as unknown[]) : [];
        existing.push({
          playlistId,
          mediaAssetId:
            currentItem.kind === "media_asset" ? currentItem.assetId : null,
          quickPostId:
            currentItem.kind === "quick_post" ? currentItem.quickPostId : null,
          startedAt,
          durationPlayedSeconds: elapsedSec,
          completed: true,
        });
        localStorage.setItem(
          "crown_canvas_telemetry_queue",
          JSON.stringify(existing.slice(-200))
        );
      } catch {
        // Ignore storage quota errors
      }
    };
  }, [deviceToken, currentItem, demoMode, manifest?.playlist?.id]);

  // Advance timer for images and Quick Posts (videos advance via onEnded)
  useEffect(() => {
    if (!currentItem) return;
    if (
      currentItem.kind === "media_asset" &&
      currentItem.mediaType === "video"
    ) {
      return;
    }
    const ms = Math.max(5, currentItem.durationSeconds || 15) * 1000;
    const t = setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % Math.max(1, activeItems.length));
    }, ms);
    return () => clearTimeout(t);
  }, [currentItem, activeItems.length]);

  // Render Pure White Minimalist Universal Pairing Screen if not paired
  if (!deviceToken && !demoMode) {
    const codeChars = (pairingCode || "------").slice(0, 6).split("");
    return (
      <div className="studio-dot-grid relative flex min-h-screen w-full flex-col items-center justify-between overflow-hidden bg-[#FAFAFA] p-6 text-zinc-950 md:p-12">
        {/* Top Minimalist Header */}
        <header className="relative z-10 flex w-full max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-zinc-200 bg-white px-3.5 py-1.5 shadow-2xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={CROWN_OFFICIAL_LOGO_URL}
                alt="Crown Paints"
                className="h-9 w-auto object-contain"
              />
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-semibold tracking-tight text-zinc-950">
                Crown Canvas
              </p>
              <p className="text-[11px] text-zinc-500">
                Digital Signage Display Player
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-2xs">
              {hardwareType === "android_tv" ? (
                <Tv className="size-3.5 text-zinc-900" />
              ) : (
                <Monitor className="size-3.5 text-zinc-900" />
              )}
              <span>
                {hardwareType === "android_tv" ? "Android TV" : "Display Kiosk"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 font-mono text-xs font-medium text-zinc-700 shadow-2xs">
              <Clock className="size-3.5 text-zinc-400" />
              <span>{clockText}</span>
            </div>
          </div>
        </header>

        {/* Center Minimalist Pairing Card */}
        <main className="relative z-10 my-auto w-full max-w-2xl rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-[0_8px_30px_rgba(0,0,0,0.04)] md:p-12">
          <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-700">
            <span className="size-2 rounded-full bg-emerald-500" />
            Ready to Pair Display
          </span>

          <h1 className="mt-5 text-3xl font-bold tracking-tight text-zinc-950 md:text-5xl">
            Connect This Screen
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-zinc-500 md:text-base">
            Enter this 6-digit pairing code in the Crown Canvas CMS under{" "}
            <strong className="font-semibold text-zinc-800">
              Fleet &amp; Pairing
            </strong>{" "}
            to link this display.
          </p>

          <div
            className={`mt-8 flex items-center justify-center gap-2.5 transition-opacity duration-200 md:gap-3.5 ${
              refreshingPin ? "opacity-45" : "opacity-100"
            }`}
          >
            {codeChars.map((ch, idx) => (
              <div
                key={`${idx}-${ch}`}
                className="flex h-16 w-12 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50 font-mono text-3xl font-black tracking-tight text-zinc-950 shadow-2xs md:h-24 md:w-20 md:text-5xl"
              >
                {ch}
              </div>
            ))}
          </div>

          {!pairingConfigured && (
            <p className="mx-auto mt-6 max-w-md rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-xs text-zinc-600">
              Backend database credentials are not configured yet. Add your
              cloud environment variables to activate screen pairing.
            </p>
          )}

          <div className="mt-8 flex items-center justify-center">
            <button
              type="button"
              disabled={refreshingPin}
              onClick={() => void handleRefreshPairingCode()}
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-zinc-200 bg-white px-5 text-xs font-semibold text-zinc-800 shadow-2xs transition hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-60"
            >
              <RefreshCw
                className={`size-3.5 ${refreshingPin ? "animate-spin" : ""}`}
              />
              {refreshingPin ? "Generating New Code..." : "Refresh Pairing Code"}
            </button>
          </div>
        </main>

        {/* Bottom Minimalist Footer */}
        <footer className="relative z-10 flex w-full max-w-5xl items-center justify-between text-xs text-zinc-400">
          <span>Offline-First Local Cache • Multi-Zone Display Engine</span>
          <span>Universal Screen Pairing</span>
        </footer>
      </div>
    );
  }

  // Admin-Paused / Deactivated Screen Standby (retains pairing token; resumes within 2s on reactivate)
  if (!demoMode && manifest?.screenPaused) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#09090b] p-12 text-center text-zinc-400 select-none">
        <div className="mb-6 rounded-2xl bg-white px-5 py-2.5 shadow-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={CROWN_OFFICIAL_LOGO_URL}
            alt="Crown Paints"
            className="h-10 w-auto object-contain"
          />
        </div>
        <p className="font-mono text-6xl font-black tracking-tight text-zinc-200">
          {clockText}
        </p>
        <p className="mt-4 text-base font-semibold text-zinc-300">
          {manifest.screen.name} — Display Paused
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Re-activate this screen in Fleet &amp; Pairing to resume playback immediately.
        </p>
      </div>
    );
  }

  // Emergency Override Screen (Supports 3 Modes: Custom Alert, Media Clip Takeover, or Playlist Takeover)
  if (
    manifest?.emergencyOverride &&
    manifest.emergencyOverride.overrideKind !== "playlist"
  ) {
    const ov = manifest.emergencyOverride;
    const badgeColor =
      ov.severity === "critical"
        ? "bg-rose-600 text-white"
        : ov.severity === "warning"
          ? "bg-amber-500 text-zinc-950"
          : "bg-blue-600 text-white";

    if (ov.overrideKind === "media_asset" && ov.mediaAsset) {
      return (
        <div
          ref={playerContainerRef}
          className="relative h-screen w-screen overflow-hidden bg-black text-white select-none"
        >
          <div className="absolute left-5 top-5 z-30 flex items-center gap-2 rounded-full bg-black/75 px-3.5 py-1.5 backdrop-blur-md">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${badgeColor}`}>
              LIVE BROADCAST
            </span>
            <span className="text-xs font-semibold text-white">{ov.title}</span>
          </div>
          {ov.mediaAsset.mediaType === "video" ? (
            <video
              src={ov.mediaAsset.publicUrl}
              className="h-full w-full bg-black object-contain"
              autoPlay
              loop
              muted={isMuted}
              playsInline
            />
          ) : ov.mediaAsset.mediaType === "web_url" ||
            ov.mediaAsset.mediaType === "pdf" ? (
            <iframe
              src={ov.mediaAsset.publicUrl}
              title={ov.title}
              className="h-full w-full border-0 bg-white"
              allow="autoplay; fullscreen"
            />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={ov.mediaAsset.publicUrl}
              alt={ov.title}
              className="h-full w-full bg-black object-contain"
            />
          )}
        </div>
      );
    }

    const bg =
      ov.severity === "critical"
        ? "bg-rose-950 text-rose-50"
        : ov.severity === "warning"
          ? "bg-amber-950 text-amber-50"
          : "bg-blue-950 text-blue-50";
    return (
      <div
        className={`flex h-screen w-screen flex-col items-center justify-center p-16 text-center ${bg}`}
      >
        <span className={`mb-5 rounded-full px-4 py-1 text-xs font-bold uppercase tracking-widest ${badgeColor}`}>
          EMERGENCY BROADCAST • {ov.severity}
        </span>
        <h1 className="max-w-4xl text-5xl font-black tracking-tight md:text-7xl">
          {ov.title}
        </h1>
        {ov.message && (
          <p className="mt-6 max-w-3xl text-2xl opacity-90">{ov.message}</p>
        )}
      </div>
    );
  }

  // Eco-Standby Screen outside showroom operating hours (saves TV burn-in & power; bypassed during emergency alerts)
  if (!demoMode && isStandby && !standbyBypass && manifest?.branch) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#02040a] p-12 text-center text-slate-400 select-none">
        <p className="font-mono text-7xl font-black tracking-tight text-slate-200/80">
          {clockText}
        </p>
        <p className="mt-4 text-lg font-semibold text-slate-300">
          {manifest.branch.name} — Eco-Standby Mode
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Operating Hours: {manifest.branch.openingTime} –{" "}
          {manifest.branch.closingTime} ({manifest.country?.timezone ?? "EAT"})
        </p>
        <button
          type="button"
          onClick={() => setStandbyBypass(true)}
          className="mt-8 rounded-full border border-white/15 bg-white/5 px-5 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/15"
        >
          Wake Display (After-Hours Override)
        </button>
      </div>
    );
  }

  const slideDurationSec = Math.max(5, currentItem?.durationSeconds || 15);
  const isVideoSlide =
    currentItem?.kind === "media_asset" && currentItem.mediaType === "video";
  const nextIsVideo =
    nextItem?.kind === "media_asset" &&
    nextItem.mediaType === "video" &&
    Boolean(nextPlaybackUrl);

  const hasMultiZoneLayout = demoMode
    ? demoSplitView
    : Boolean(
      manifest?.layout?.zonesConfig &&
      manifest.layout.zonesConfig.length > 1
    );

  const mainStageContent = !currentItem ? (
    <div className="flex h-full w-full flex-col items-center justify-center bg-[#060d1f] p-12 text-center">
      <div className="mb-5 rounded-2xl bg-white px-6 py-3 shadow-xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={CROWN_OFFICIAL_LOGO_URL}
          alt="Crown Paints"
          className="h-14 w-auto object-contain"
        />
      </div>
      <h2 className="text-3xl font-black">
        {manifest?.screen.name || "Screen Paired"}
      </h2>
      <p className="mt-2 text-slate-400">
        Waiting for a playlist or schedule to be assigned in Crown Canvas CMS.
      </p>
    </div>
  ) : currentItem.kind === "quick_post" ? (
    <QuickPostSlide
      key={`${currentItem.id}-${safeIndex}`}
      title={currentItem.title}
      departmentName={currentItem.departmentName}
      templateType={currentItem.templateType}
      config={currentItem.slideConfig}
      branchName={
        manifest?.branch?.name ||
        (demoMode ? "Nairobi Likoni Rd HQ & Showroom" : undefined)
      }
      countryCode={manifest?.country?.code || (demoMode ? "KE" : undefined)}
      screenId={!demoMode ? manifest?.screen?.id : undefined}
      branchId={!demoMode ? manifest?.branch?.id : undefined}
      quickPostId={!demoMode ? currentItem.quickPostId : undefined}
      qrSignatures={!demoMode ? manifest?.qrSignatures : undefined}
    />
  ) : currentItem.mediaType === "video" ? (
    <video
      ref={activeVideoRef}
      key={`${currentItem.id}-${safeIndex}`}
      src={currentPlaybackUrl || currentItem.publicUrl}
      className="h-full w-full bg-black object-contain"
      autoPlay
      muted={isMuted || audioBlocked}
      playsInline
      preload="auto"
      crossOrigin="anonymous"
      disablePictureInPicture
      controlsList="nodownload nofullscreen"
      onContextMenu={(e) => e.preventDefault()}
      onDoubleClick={toggleFullscreen}
      loop={activeItems.length === 1}
      onEnded={() =>
        setCurrentIndex((prev) => (prev + 1) % Math.max(1, activeItems.length))
      }
      onError={() =>
        setCurrentIndex((prev) => (prev + 1) % Math.max(1, activeItems.length))
      }
    />
  ) : currentItem.mediaType === "pdf" ? (
    <PdfSignageViewer
      key={`${currentItem.id}-${safeIndex}`}
      url={currentPlaybackUrl || currentItem.publicUrl}
      title={currentItem.title}
      durationSeconds={currentItem.durationSeconds}
    />
  ) : currentItem.mediaType === "web_url" ? (
    <iframe
      key={`${currentItem.id}-${safeIndex}`}
      src={currentItem.publicUrl}
      title={currentItem.title}
      className="h-full w-full border-0 bg-white"
      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
      allowFullScreen
      referrerPolicy="no-referrer-when-downgrade"
    />
  ) : (
    /* Offline player renders local CacheStorage blob: URLs directly */
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      key={`${currentItem.id}-${safeIndex}`}
      src={currentPlaybackUrl || currentItem.publicUrl}
      alt={currentItem.title}
      className="animate-crown-slide h-full w-full bg-black object-contain"
    />
  );

  return (
    <div
      ref={playerContainerRef}
      className="relative h-screen w-screen overflow-hidden bg-black text-white select-none"
    >
      {/* Dual-Buffer Next-Video Preloader for 0ms gapless transitions */}
      {nextIsVideo && nextPlaybackUrl && (
        <video
          key={`preload-${nextItem.id}`}
          src={nextPlaybackUrl}
          preload="auto"
          muted
          playsInline
          aria-hidden="true"
          className="pointer-events-none absolute -z-10 size-1 opacity-0"
        />
      )}

      {hasMultiZoneLayout ? (
        <MultiZoneFrame
          branchName={
            manifest?.branch?.name || "Nairobi Likoni Rd HQ & Showroom"
          }
          city={manifest?.branch?.city || "Nairobi"}
          countryCode={manifest?.country?.code || "KE"}
          currencyCode={manifest?.country?.currencyCode || "KES"}
          clockText={clockText}
          orientation={manifest?.screen?.orientation ?? "landscape"}
          sidebarConfig={manifest?.playlist?.sidebarConfig ?? null}
          sidebarProfile={manifest?.sidebarProfile ?? null}
          showcaseProducts={manifest?.showcaseProducts}
          qrSignatures={manifest?.qrSignatures}
          screenId={!demoMode ? manifest?.screen?.id : undefined}
          branchId={!demoMode ? manifest?.branch?.id : undefined}
          tickerMessages={
            manifest?.tickerMessages ??
            DEMO_QUICK_POSTS.map((p) => `${p.departmentName}: ${p.title}`)
          }
        >
          {mainStageContent}
        </MultiZoneFrame>
      ) : manifest?.playlist?.tickerText &&
        manifest.playlist.tickerText.trim().length > 0 ? (
        <div className="flex h-screen w-screen flex-col overflow-hidden bg-black">
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {mainStageContent}
          </div>
          <TickerBar messages={manifest.tickerMessages ?? []} />
        </div>
      ) : (
        mainStageContent
      )}

      {/* Remote Identify Overlay */}
      {identifyBanner && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-blue-950/90 backdrop-blur-md">
          <p className="text-sm font-bold uppercase tracking-widest text-blue-300">
            Screen Identification
          </p>
          <h2 className="mt-2 text-5xl font-black">{manifest?.screen.name}</h2>
          <p className="mt-2 text-xl text-blue-200">
            {manifest?.branch?.name} ({manifest?.country?.code})
          </p>
        </div>
      )}

      {/* Hover-Only Broadcast Telemetry & Controls (invisible until hovering the bottom-right corner) */}
      <div
        className={`group/hud pointer-events-auto absolute right-0 z-30 flex items-end justify-end p-4 ${hasMultiZoneLayout ||
          Boolean(
            manifest?.playlist?.tickerText &&
            manifest.playlist.tickerText.trim().length > 0
          )
          ? "bottom-16"
          : "bottom-0"
          }`}
      >
        <div className="pointer-events-none flex translate-y-1 items-center gap-2 rounded-full border border-white/15 bg-black/80 px-3.5 py-1.5 text-[11px] font-medium text-white/95 opacity-0 shadow-2xl backdrop-blur-md transition-all duration-200 group-hover/hud:pointer-events-auto group-hover/hud:translate-y-0 group-hover/hud:opacity-100 focus-within:pointer-events-auto focus-within:translate-y-0 focus-within:opacity-100">
          {isOnline ? (
            <Wifi className="size-3 text-emerald-400" />
          ) : (
            <WifiOff className="size-3 text-amber-400" />
          )}
          {!hasMultiZoneLayout && (
            <>
              <span className="font-mono text-white/80">{clockText} EAT</span>
              <span className="text-white/30">•</span>
            </>
          )}
          <span
            className="flex items-center gap-1"
            title={
              demoMode
                ? "Built-in 6-slide Demo Showcase — click Exit to pair this screen to your live CMS playlist"
                : "Live paired playlist & local Cache Storage status"
            }
          >
            <HardDrive className="size-3 text-sky-400" />
            {demoMode
              ? `Showcase ${safeIndex + 1}/${activeItems.length} (Demo)`
              : `${manifest?.playlist?.name ? `${manifest.playlist.name} v${manifest.playlist.version} • ` : ""}${activeItems.length > 0 ? `${safeIndex + 1}/${activeItems.length} • ` : ""}${syncProgress.status === "synced"
                ? `Cached (${syncProgress.cachedCount})`
                : `Syncing ${syncProgress.cachedCount}/${syncProgress.totalCount}`
              }`}
          </span>
          <button
            type="button"
            onClick={toggleMuted}
            title={isMuted || audioBlocked ? "Enable Video Audio (M)" : "Mute Video Audio (M)"}
            className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium transition hover:bg-white/25"
          >
            {isMuted || audioBlocked ? (
              <>
                <VolumeX className="size-3 text-amber-300" />
                <span>Muted</span>
              </>
            ) : (
              <>
                <Volume2 className="size-3 text-emerald-400" />
                <span>Sound</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit Fullscreen (F)" : "Fullscreen Player (Keeps Split Sidebar) (F)"}
            className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium transition hover:bg-white/25"
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="size-3 text-sky-300" />
                <span>Exit FS</span>
              </>
            ) : (
              <>
                <Maximize2 className="size-3 text-white/90" />
                <span>Fullscreen</span>
              </>
            )}
          </button>
          {!demoMode && deviceToken && (
            <button
              type="button"
              onClick={resetLocalPairing}
              title="Reset Screen Pairing"
              className="rounded-full bg-white/10 p-1 transition hover:bg-red-500/40"
            >
              <RotateCcw className="size-3 text-slate-300" />
            </button>
          )}
          {demoMode && activeItems.length > 1 && (
            <div className="ml-1 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setDemoSplitView((prev) => !prev)}
                className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold transition hover:bg-white/25"
                title="Toggle Multi-Zone Split Canvas"
              >
                <LayoutPanelLeft className="size-3 text-amber-400" />
                {demoSplitView ? "Split" : "Full"}
              </button>
              <button
                type="button"
                aria-label="Previous slide"
                onClick={() =>
                  setCurrentIndex(
                    (prev) =>
                      (prev - 1 + activeItems.length) % activeItems.length
                  )
                }
                className="rounded-full bg-white/10 p-1 transition hover:bg-white/25"
              >
                <ChevronLeft className="size-3" />
              </button>
              <button
                type="button"
                aria-label="Next slide"
                onClick={() =>
                  setCurrentIndex((prev) => (prev + 1) % activeItems.length)
                }
                className="rounded-full bg-white/10 p-1 transition hover:bg-white/25"
              >
                <ChevronRight className="size-3" />
              </button>
              <button
                type="button"
                onClick={() => setDemoMode(false)}
                className="ml-0.5 rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-semibold transition hover:bg-white/25"
              >
                Exit
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Subtle Bottom Edge Slide Progress Indicator (only in fullscreen mode) */}
      {currentItem && !isVideoSlide && !hasMultiZoneLayout && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-1 bg-white/10">
          <div
            key={`progress-${currentItem.id}-${safeIndex}`}
            className="animate-crown-progress h-full w-full bg-gradient-to-r from-amber-400 via-sky-400 to-emerald-400"
            style={{ animationDuration: `${slideDurationSec}s` }}
          />
        </div>
      )}
    </div>
  );
}
