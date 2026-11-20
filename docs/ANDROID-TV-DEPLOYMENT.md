# Crown Canvas — Standalone Android TV Zero-Buffer Deployment Guide

This guide covers deploying **Crown Canvas** directly on standalone **Android TV / Google TV / Fire TV** displays (TCL, Hisense, Sony Bravia, Xiaomi, Skyworth) **without needing a Windows Mini PC**.

---

## How Zero-Buffer Playback Works on Standalone Android TVs

Crown Canvas `/player` is engineered specifically for low-RAM (`1.5–2 GB`) and limited-flash (`4–8 GB`) Android TVs:

1. **Download Once to Internal Flash (`Cache Storage` + `navigator.storage.persist()`):**
   - Videos are downloaded **once** by SHA-256 checksum into local storage (`512 MB` TV cap with automatic eviction of removed assets). Looping a promo 500 times uses **0 bytes of Wi-Fi**.
2. **Low-RAM 2-Slot `blob:` Window:**
   - Only the **currently playing** item and **next** item are materialized in RAM (`<= 2` active `blob:` URLs), preventing Android's Low Memory Killer (LMK) from crashing the TV browser.
3. **Dual-Buffer Preloader:**
   - Whenever the next playlist item is a video, `/player` preloads it in a hidden `<video preload="auto" muted>` element while the current slide plays so Android's hardware decoder transitions without black-frame flicker.
4. **Offline Power-On Boot (`public/sw.js`):**
   - The PWA Service Worker caches the `/player` app shell so if a showroom loses power and Wi-Fi simultaneously, the TV boots straight back into its cached playlist.
5. **TV Remote D-Pad Controls (Zero Mouse Needed):**
   - `Right Arrow`: Next slide
   - `Left Arrow`: Previous slide
   - `M` / On-screen icon: Mute / Unmute audio
   - `Back / Escape`: Exit Showcase Demo Mode

---

## Option 1: Instant Zero-Cost POC Setup (Fully Kiosk Browser — Recommended Today)

1. On the Android TV, install **Fully Kiosk Browser** (from Google Play Store or official APK via USB / Downloader app).
2. Open Fully Kiosk settings and configure:
   - **Start URL:** `https://<your-vercel-domain>/player`
   - **Web Content Settings:**
     - Enable JavaScript: **ON**
     - Enable Autoplay Videos: **ON**
     - Enable Local Storage / Web Storage: **ON**
     - Hardware Acceleration: **ON**
     - Clear Cache on Exit: **OFF** *(critical so pairing token and cached videos persist!)*
   - **Device Management:**
     - Keep Screen On: **ON**
     - Launch on Boot: **ON**
     - Auto Reload on Idle / Error: **ON** (optional: reload only on network recovery)
3. Launch Fully Kiosk Browser → note the **6-digit Pairing PIN** displayed on the TV.
4. In Crown Canvas CMS → **Fleet & Pairing**, claim the PIN, assign the showroom branch + playlist, and set **16:9 Landscape** or **9:16 Portrait**.

---

## Recommended Video Encoding Preset for Budget Android TVs

To guarantee smooth hardware decoding on older Android TVs (Android TV 9–12) and stay within Supabase Free Tier's `50 MB` file limit:

- **Container:** `.mp4` (with `faststart` / moov atom at beginning)
- **Video Codec:** **H.264 (`avc1`, Main/High Profile, Level 4.1)**
- **Resolution:** `1920×1080` @ `30 fps` (or `1280×720` for older budget TVs)
- **Bitrate:** `2.5 – 3.5 Mbps` (~10–12 MB for a 30-second promo)
- **Audio:** AAC-LC, `128 kbps`, `48 kHz`

*(Crown Canvas Media Library automatically inspects every uploaded video and flags WebM or oversized files with an Android TV Compatibility badge.)*

---

## Option 2: Commercial Rollout — Branded `CrownCanvasTV.apk` Wrapper

For fleet-wide company rollout (15–100+ Android TVs), wrap `https://<your-vercel-domain>/player` inside a thin signed Android TV Leanback APK (Capacitor / Android WebView):

- **Manifest Requirements:**
  - `android.software.leanback` (`required="false"`) + `LEANBACK_LAUNCHER` category so the Crown Canvas logo appears natively on the Android TV home row.
  - `RECEIVE_BOOT_COMPLETED` BroadcastReceiver to auto-launch the player after power outages.
  - `WebSettings`: `setDomStorageEnabled(true)`, `setDatabaseEnabled(true)`, `setMediaPlaybackRequiresUserGesture(false)`, `setCacheMode(WebSettings.LOAD_DEFAULT)`, `setMixedContentMode(MIXED_CONTENT_NEVER_ALLOW)`.
  - `WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON` to prevent TV screensaver interruption.
- **Distribution:** Deploy via USB stick, Google Play Private Channel (Managed Google Play), or Android MDM (Headwind MDM / Esper / Hexnode).
