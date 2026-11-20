/**
 * @file src/app/player/page.tsx
 * @description Dedicated fullscreen `/player` route opened on Android TVs and Mini PCs.
 */

import { PlayerClient } from "@/components/player/player-client";

export const metadata = {
  title: "Crown Canvas Player",
  description: "Offline-first digital signage player for Android TV & Mini PC",
};

export default function PlayerPage() {
  return <PlayerClient />;
}
