import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createTimeoutSignal,
  detectTvDeviceProfile,
  mapRemoteKeyToAction,
  safeLocalGet,
  safeLocalRemove,
  safeLocalSet,
  shouldUseVideoCrossOrigin,
} from "../player/tv-browser-compat";

describe("Smart TV browser compatibility helpers", () => {
  it("identifies Samsung Tizen, LG webOS, Hisense VIDAA, Android TV, Fire TV, and Mini PCs accurately", () => {
    const tizen = detectTvDeviceProfile(
      "Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) 85.0.4183.93/6.5 TV Safari/537.36"
    );
    assert.equal(tizen.platform, "tizen");
    assert.equal(tizen.label, "Samsung Smart TV");
    assert.equal(tizen.apiHardwareType, "other");
    assert.equal(tizen.isTvBrowser, true);
    assert.equal(tizen.singleVideoDecoder, true);
    assert.equal(tizen.maxCacheBytes, 192 * 1024 * 1024);

    const webos = detectTvDeviceProfile(
      "Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36 WebAppManager"
    );
    assert.equal(webos.platform, "webos");
    assert.equal(webos.label, "LG webOS TV");
    assert.equal(webos.singleVideoDecoder, true);
    assert.equal(webos.maxCacheBytes, 192 * 1024 * 1024);

    const vidaa = detectTvDeviceProfile(
      "Mozilla/5.0 (Linux; VIDAA 6.0; Hisense) AppleWebKit/537.36 Chrome/94.0.4606.81 Safari/537.36"
    );
    assert.equal(vidaa.platform, "vidaa");
    assert.equal(vidaa.label, "Hisense VIDAA TV");
    assert.equal(vidaa.singleVideoDecoder, true);

    const androidTv = detectTvDeviceProfile(
      "Mozilla/5.0 (Linux; Android 11; BRAVIA 4K VH2) AppleWebKit/537.36 Chrome/110.0.0.0 Safari/537.36"
    );
    assert.equal(androidTv.platform, "android_tv");
    assert.equal(androidTv.apiHardwareType, "android_tv");
    assert.equal(androidTv.singleVideoDecoder, true);
    assert.equal(androidTv.maxCacheBytes, 512 * 1024 * 1024);

    const fireTv = detectTvDeviceProfile(
      "Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7292) AppleWebKit/537.36 Silk/100.1.0"
    );
    assert.equal(fireTv.platform, "fire_tv");
    assert.equal(fireTv.singleVideoDecoder, true);

    const miniPc = detectTvDeviceProfile(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
    );
    assert.equal(miniPc.platform, "mini_pc");
    assert.equal(miniPc.isTvBrowser, false);
    assert.equal(miniPc.singleVideoDecoder, false);
    assert.equal(miniPc.maxCacheBytes, 2048 * 1024 * 1024);
  });

  it("applies CORS attribute only to blob:, same-origin, and Supabase Storage video URLs", () => {
    assert.equal(shouldUseVideoCrossOrigin("blob:https://app.example/123"), true);
    assert.equal(shouldUseVideoCrossOrigin("/videos/intro.mp4"), true);
    assert.equal(
      shouldUseVideoCrossOrigin(
        "https://abcxyz.supabase.co/storage/v1/object/public/media/clip.mp4",
        "https://digital-screen-three.vercel.app"
      ),
      true
    );
    assert.equal(
      shouldUseVideoCrossOrigin(
        "https://digital-screen-three.vercel.app/clip.mp4",
        "https://digital-screen-three.vercel.app"
      ),
      true
    );
    assert.equal(
      shouldUseVideoCrossOrigin(
        "https://third-party-cdn.example.com/no-cors-video.mp4",
        "https://digital-screen-three.vercel.app"
      ),
      false
    );
  });

  it("falls back to in-memory storage when localStorage is unavailable", () => {
    safeLocalSet("tv_test_token", "tok_12345");
    assert.equal(safeLocalGet("tv_test_token"), "tok_12345");
    safeLocalRemove("tv_test_token");
    assert.equal(safeLocalGet("tv_test_token"), null);
  });

  it("creates legacy-safe AbortController timeout signals without AbortSignal.timeout", async () => {
    const t = createTimeoutSignal(25);
    assert.equal(t.signal.aborted, false);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(t.signal.aborted, true);
    t.cleanup();
  });

  it("maps Samsung Tizen, LG webOS, Android TV, and keyboard remote keys accurately", () => {
    assert.equal(mapRemoteKeyToAction({ key: "Enter" }), "toggle_fullscreen");
    assert.equal(
      mapRemoteKeyToAction({ key: "Enter", targetTagName: "BUTTON" }),
      null
    );
    assert.equal(mapRemoteKeyToAction({ key: "ArrowRight" }), "next");
    assert.equal(mapRemoteKeyToAction({ keyCode: 417 }), "next");
    assert.equal(mapRemoteKeyToAction({ key: "ChannelDown" }), "prev");
    assert.equal(mapRemoteKeyToAction({ key: "ArrowUp" }), "toggle_hud");
    assert.equal(mapRemoteKeyToAction({ keyCode: 457 }), "toggle_hud");
    assert.equal(
      mapRemoteKeyToAction({ key: "AudioVolumeMute" }),
      "toggle_mute"
    );
    assert.equal(
      mapRemoteKeyToAction({ key: "MediaPlayPause" }),
      "toggle_play_pause"
    );
    assert.equal(mapRemoteKeyToAction({ keyCode: 10009 }), "exit");
  });
});
