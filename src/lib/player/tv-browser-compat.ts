/**
 * @file src/lib/player/tv-browser-compat.ts
 * @description Universal Smart TV browser detection, vendor-prefixed Fullscreen API helpers,
 * private-mode-safe storage wrappers, legacy AbortController timeout signals, CORS-safe video
 * heuristics, and cross-brand TV remote key mapping (Samsung Tizen, LG webOS, Hisense VIDAA,
 * Sony Bravia, TCL/Android TV, Amazon Fire TV, Philips/Panasonic HbbTV, and Mini PCs).
 */

export type TvPlatform =
  | "tizen"
  | "webos"
  | "vidaa"
  | "android_tv"
  | "fire_tv"
  | "smart_tv_other"
  | "mini_pc";

export interface TvDeviceProfile {
  platform: TvPlatform;
  label: string;
  /** Compatible with existing `screen_hardware` DB enum (`android_tv | mini_pc | other`). */
  apiHardwareType: "android_tv" | "mini_pc" | "other";
  isTvBrowser: boolean;
  /**
   * Smart TV hardware pipelines often support only 1 active H.264 decoder at a time.
   * When true, the player avoids mounting a second hidden `<video preload="auto">` preloader.
   */
  singleVideoDecoder: boolean;
  /** Conservative local Cache Storage ceiling in bytes suited for the device class. */
  maxCacheBytes: number;
}

const MB = 1024 * 1024;

export function detectTvDeviceProfile(userAgent?: string): TvDeviceProfile {
  const ua = (
    userAgent ??
    (typeof navigator !== "undefined" ? navigator.userAgent : "")
  ).toLowerCase();

  // Samsung Tizen Smart TV
  if (
    ua.includes("tizen") ||
    ua.includes("smart-tv") ||
    (ua.includes("samsungbrowser") && ua.includes("tv"))
  ) {
    return {
      platform: "tizen",
      label: "Samsung Smart TV",
      apiHardwareType: "other",
      isTvBrowser: true,
      singleVideoDecoder: true,
      maxCacheBytes: 192 * MB,
    };
  }

  // LG webOS / NetCast Smart TV
  if (ua.includes("web0s") || ua.includes("webos") || ua.includes("netcast")) {
    return {
      platform: "webos",
      label: "LG webOS TV",
      apiHardwareType: "other",
      isTvBrowser: true,
      singleVideoDecoder: true,
      maxCacheBytes: 192 * MB,
    };
  }

  // Hisense VIDAA Smart TV
  if (ua.includes("vidaa")) {
    return {
      platform: "vidaa",
      label: "Hisense VIDAA TV",
      apiHardwareType: "other",
      isTvBrowser: true,
      singleVideoDecoder: true,
      maxCacheBytes: 192 * MB,
    };
  }

  // Amazon Fire TV / Silk on TV
  if (ua.includes("aft") || (ua.includes("silk") && ua.includes("android"))) {
    return {
      platform: "fire_tv",
      label: "Fire TV",
      apiHardwareType: "android_tv",
      isTvBrowser: true,
      singleVideoDecoder: true,
      maxCacheBytes: 512 * MB,
    };
  }

  // Android TV / Google TV / Sony Bravia / Mi Box / Nvidia Shield / Chromecast
  if (
    ua.includes("bravia") ||
    ua.includes("mibox") ||
    ua.includes("shield") ||
    ua.includes("crkey") ||
    ua.includes("adt-") ||
    ua.includes("googletv") ||
    ua.includes("android tv") ||
    (ua.includes("android") && !ua.includes("mobile"))
  ) {
    return {
      platform: "android_tv",
      label: "Android TV",
      apiHardwareType: "android_tv",
      isTvBrowser: true,
      singleVideoDecoder: true,
      maxCacheBytes: 512 * MB,
    };
  }

  // Generic Smart TVs (Philips, Panasonic Viera, Opera TV, HbbTV, CE-HTML, DTV)
  if (
    ua.includes("smarttv") ||
    ua.includes("hbbtv") ||
    ua.includes("viera") ||
    ua.includes("opera tv") ||
    ua.includes("ce-html") ||
    ua.includes("dtv") ||
    ua.includes("philipstv") ||
    ua.includes("hisense") ||
    ua.includes("tcl")
  ) {
    return {
      platform: "smart_tv_other",
      label: "Smart TV Browser",
      apiHardwareType: "other",
      isTvBrowser: true,
      singleVideoDecoder: true,
      maxCacheBytes: 192 * MB,
    };
  }

  // Fallback for standard Android phones/tablets used as signage displays
  if (ua.includes("android")) {
    return {
      platform: "android_tv",
      label: "Android Display",
      apiHardwareType: "android_tv",
      isTvBrowser: true,
      singleVideoDecoder: true,
      maxCacheBytes: 512 * MB,
    };
  }

  return {
    platform: "mini_pc",
    label: "Display Kiosk",
    apiHardwareType: "mini_pc",
    isTvBrowser: false,
    singleVideoDecoder: false,
    maxCacheBytes: 2048 * MB,
  };
}

// ---------------------------------------------------------------------------
// Private-Mode / Quota-Safe Storage Helpers (with in-memory fallback)
// ---------------------------------------------------------------------------

const memoryLocalStore = new Map<string, string>();
const memorySessionStore = new Map<string, string>();

export function safeLocalGet(key: string): string | null {
  try {
    if (typeof localStorage !== "undefined") {
      const val = localStorage.getItem(key);
      if (val !== null) return val;
    }
  } catch {
    // Restricted Smart TV browser storage
  }
  return memoryLocalStore.get(key) ?? null;
}

export function safeLocalSet(key: string, value: string): void {
  memoryLocalStore.set(key, value);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, value);
    }
  } catch {
    // QuotaExceededError or private-mode SecurityError — kept in memory fallback
  }
}

export function safeLocalRemove(key: string): void {
  memoryLocalStore.delete(key);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage removal errors
  }
}

export function safeSessionGet(key: string): string | null {
  try {
    if (typeof sessionStorage !== "undefined") {
      const val = sessionStorage.getItem(key);
      if (val !== null) return val;
    }
  } catch {
    // Restricted Smart TV browser storage
  }
  return memorySessionStore.get(key) ?? null;
}

export function safeSessionSet(key: string, value: string): void {
  memorySessionStore.set(key, value);
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(key, value);
    }
  } catch {
    // Ignore storage quota/security errors
  }
}

// ---------------------------------------------------------------------------
// Legacy-Safe Fetch Timeout Signal (works on Chrome 66+, Tizen 5+, webOS 5+)
// ---------------------------------------------------------------------------

export function createTimeoutSignal(ms: number): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    try {
      controller.abort();
    } catch {
      // Ignore abort errors on older engines
    }
  }, ms);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
  };
}

// ---------------------------------------------------------------------------
// Vendor-Prefixed Fullscreen API Helpers (Tizen / webOS / Safari / Chrome)
// ---------------------------------------------------------------------------

type VendorDocument = Document & {
  webkitFullscreenElement?: Element | null;
  mozFullScreenElement?: Element | null;
  msFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  mozCancelFullScreen?: () => Promise<void> | void;
  msExitFullscreen?: () => Promise<void> | void;
};

type VendorElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  mozRequestFullScreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
};

export function getFullscreenElement(): Element | null {
  if (typeof document === "undefined") return null;
  const doc = document as VendorDocument;
  return (
    doc.fullscreenElement ??
    doc.webkitFullscreenElement ??
    doc.mozFullScreenElement ??
    doc.msFullscreenElement ??
    null
  );
}

export async function requestElementFullscreen(
  el: HTMLElement | null
): Promise<boolean> {
  if (!el) return false;
  const target = el as VendorElement;
  try {
    if (typeof target.requestFullscreen === "function") {
      await target.requestFullscreen();
      return true;
    }
    if (typeof target.webkitRequestFullscreen === "function") {
      await target.webkitRequestFullscreen();
      return true;
    }
    if (typeof target.mozRequestFullScreen === "function") {
      await target.mozRequestFullScreen();
      return true;
    }
    if (typeof target.msRequestFullscreen === "function") {
      await target.msRequestFullscreen();
      return true;
    }
  } catch {
    // TV browser may require user to click built-in toolbar fullscreen button
  }
  return false;
}

export async function exitElementFullscreen(): Promise<void> {
  if (typeof document === "undefined") return;
  const doc = document as VendorDocument;
  try {
    if (typeof doc.exitFullscreen === "function") {
      await doc.exitFullscreen();
    } else if (typeof doc.webkitExitFullscreen === "function") {
      await doc.webkitExitFullscreen();
    } else if (typeof doc.mozCancelFullScreen === "function") {
      await doc.mozCancelFullScreen();
    } else if (typeof doc.msExitFullscreen === "function") {
      await doc.msExitFullscreen();
    }
  } catch {
    // Ignore exit errors
  }
}

export function addFullscreenChangeListener(listener: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const events = [
    "fullscreenchange",
    "webkitfullscreenchange",
    "mozfullscreenchange",
    "MSFullscreenChange",
  ];
  for (const evt of events) {
    document.addEventListener(evt, listener);
  }
  return () => {
    for (const evt of events) {
      document.removeEventListener(evt, listener);
    }
  };
}

// ---------------------------------------------------------------------------
// CORS-Safe Video Heuristic
// ---------------------------------------------------------------------------

/**
 * Only attach `crossOrigin="anonymous"` to `<video>` when the source is a local `blob:`,
 * same-origin URL, or Supabase Storage URL (which sends permissive CORS headers).
 * External third-party video hosts often omit CORS headers, causing Smart TV browsers to
 * refuse playback if `crossOrigin="anonymous"` is set.
 */
export function shouldUseVideoCrossOrigin(
  videoUrl: string,
  currentOrigin?: string,
  trustedHost?: string
): boolean {
  if (!videoUrl) return false;
  if (videoUrl.startsWith("blob:") || videoUrl.startsWith("/")) return true;
  try {
    const parsed = new URL(videoUrl);
    if (currentOrigin && parsed.origin === currentOrigin) return true;
    if (
      parsed.hostname.endsWith(".supabase.co") ||
      parsed.hostname.endsWith(".supabase.in") ||
      parsed.hostname.endsWith(".r2.dev") ||
      parsed.hostname.endsWith(".r2.cloudflarestorage.com")
    ) {
      return true;
    }
    if (trustedHost && parsed.hostname === trustedHost) return true;
    return false;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Cross-Brand Smart TV Remote Key Mapping
// ---------------------------------------------------------------------------

export type RemoteAction =
  | "next"
  | "prev"
  | "toggle_mute"
  | "toggle_fullscreen"
  | "toggle_hud"
  | "toggle_play_pause"
  | "exit"
  | null;

export function mapRemoteKeyToAction(input: {
  key?: string;
  keyCode?: number;
  targetTagName?: string;
}): RemoteAction {
  const tag = (input.targetTagName ?? "").toUpperCase();
  const isInteractiveFocused =
    tag === "BUTTON" || tag === "A" || tag === "INPUT" || tag === "TEXTAREA";

  const key = input.key ?? "";
  const lower = key.toLowerCase();
  const code = input.keyCode ?? 0;

  // Next slide: Right arrow, Channel Up, Media Track Next, Samsung FastForward (417)
  if (
    key === "ArrowRight" ||
    key === "ChannelUp" ||
    key === "MediaTrackNext" ||
    key === "MediaFastForward" ||
    code === 417 ||
    code === 427
  ) {
    return "next";
  }

  // Previous slide: Left arrow, Channel Down, Media Track Prev, Samsung Rewind (412)
  if (
    key === "ArrowLeft" ||
    key === "ChannelDown" ||
    key === "MediaTrackPrevious" ||
    key === "MediaRewind" ||
    code === 412 ||
    code === 428
  ) {
    return "prev";
  }

  // Mute toggle: M key, TV Mute button
  if (lower === "m" || key === "AudioVolumeMute" || code === 449) {
    return "toggle_mute";
  }

  // Fullscreen toggle: F key, ColorF0Red (403), or OK/Enter/Select when not activating a button
  if (
    lower === "f" ||
    key === "ColorF0Red" ||
    code === 403 ||
    (!isInteractiveFocused &&
      (key === "Enter" || key === "Select" || key === " " || code === 13))
  ) {
    return "toggle_fullscreen";
  }

  // Reveal HUD pill on TV remote: Up arrow, Info button (457), I key
  if (key === "ArrowUp" || key === "Info" || lower === "i" || code === 457) {
    return "toggle_hud";
  }

  // Play / Pause on TV media remotes (Samsung Play 415, Pause 19, PlayPause 10252)
  if (
    key === "MediaPlayPause" ||
    key === "MediaPlay" ||
    key === "MediaPause" ||
    lower === "p" ||
    code === 415 ||
    code === 19 ||
    code === 10252
  ) {
    return "toggle_play_pause";
  }

  // Exit / Back (Android TV GoBack, Tizen Return 10009, webOS Back 461, Escape)
  if (
    key === "Escape" ||
    key === "GoBack" ||
    key === "BrowserBack" ||
    code === 461 ||
    code === 10009
  ) {
    return "exit";
  }

  return null;
}
