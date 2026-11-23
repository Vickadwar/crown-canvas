# Crown Canvas — Smart TV Inbuilt Browser Setup Guide

This guide covers running `/player` directly on **any Smart TV inbuilt browser** (Samsung Tizen, LG webOS, Hisense VIDAA, Sony Bravia, TCL, and Android / Google TV) with zero extra hardware.

---

## 1. Quick Launch & Pairing (All Smart TVs)

1. Connect the TV to Wi-Fi or Ethernet.
2. Open the TV's inbuilt **Internet / Web Browser** app.
3. Navigate to your live player URL:
   ```text
   https://<your-domain>/player
   ```
4. **Bookmark** the page immediately (and set it as the browser **Homepage** if your TV browser supports it).
5. Enter the **6-digit pairing code** shown on the TV inside **Crown Canvas CMS → Fleet & Pairing**.
6. Once playback starts, press **OK / Enter** on the TV remote (or click your browser's toolbar Fullscreen icon) to enter edge-to-edge fullscreen and unlock audio.

---

## 2. Remote Control Shortcuts on `/player`

| TV Remote Button | Action |
| :--- | :--- |
| **OK / Enter** | Toggle Fullscreen & unlock unmuted video sound |
| **→ (Right) / CH+** | Skip to next slide or video |
| **← (Left) / CH-** | Go back to previous slide or video |
| **↑ (Up) / Info** | Reveal the bottom-right status HUD for 8 seconds |
| **Mute** | Mute / Unmute video audio |
| **Play / Pause** | Pause or resume active video |

> The TV pointer automatically hides after **4 seconds** of inactivity so the display stays completely clean.

---

## 3. Mandatory TV Firmware Settings (Do Once Per TV)

Smart TV firmware power-saving timers override web browsers unless disabled once in TV Settings:

### Samsung Smart TV (Tizen)
- **Fullscreen:** Open Samsung Internet → click the top-right **Menu (≡) → Full Screen** (or press **OK** on `/player`).
- **Disable Auto-Sleep:** `Settings → General & Privacy → Power and Energy Saving`:
  - **Auto Power Off** → `Off`
  - **Power Saving Solution / Eco Sensor** → `Off`
  - **Screen Saver** → `Off` (if available)

### LG Smart TV (webOS)
- **Fullscreen:** Open LG Web Browser → click the **Fullscreen expand icon** on the top address bar (or press **OK** on `/player`).
- **Disable Auto-Sleep:** `Settings → General → System → Time & Timer → Timers`:
  - **Auto Power Off (4 Hours)** → `Off`
  - `Settings → Support → OLED Care / Energy Saving` → `Off`

### Hisense Smart TV (VIDAA)
- **Fullscreen:** Open VIDAA Browser → open browser menu → **Hide Toolbar / Fullscreen** (or press **OK** on `/player`).
- **Disable Auto-Sleep:** `Settings → System → Timer Settings`:
  - **Sleep Timer** → `Off`
  - **Auto Sleep / No Signal Standby** → `Off`
  - **Screensaver** → `Off`

### Android TV / Google TV / Sony Bravia / TCL
- **Browser tip:** Stock browsers (BrowseHere, TV Bro, Chrome) all work cleanly. For **automatic launch after power outages**, install a kiosk browser app (such as *Fully Kiosk Browser* or *TV Bro* with Start on Boot enabled) pointed to `/player`.
- **Disable Auto-Sleep:** `Settings → Device Preferences → Screen Saver` → **Turn Screen Off: Never** and **When to start: Never**. Also disable `Power & Energy → Idle TV Standby`.

---

## 4. Built-In Protections Active Automatically on Smart TVs

- **Single Hardware Decoder Guard:** Automatically disables dual-video preloading on all Smart TV browsers so budget/mid-range TVs never stutter or drop frames.
- **Quota-Safe Local Caching:** Automatically detects Samsung Tizen, LG webOS, Hisense VIDAA, and generic Smart TVs, inspects browser storage quota via `navigator.storage.estimate()`, caps disk cache safely (`≤192 MB` on inbuilt TVs, `≤512 MB` on Android TV), and seamlessly falls back to HTTPS streaming if storage is tight.
- **15-Second Video Stall Watchdog:** Automatically nudges or advances stalled videos on flaky Wi-Fi so a showroom screen never freezes on one frame.
- **10-Second Auto-Recovery Boundary:** If an older TV browser ever hits an unexpected runtime error, `/player` recovers and reloads automatically.
