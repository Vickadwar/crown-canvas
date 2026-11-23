/**
 * @file src/app/player/page.tsx
 * @description Dedicated fullscreen `/player` route opened on Android TVs and Mini PCs.
 */

import { PlayerClient } from "@/components/player/player-client";
import { PlayerErrorBoundary } from "@/components/player/player-error-boundary";

export const metadata = {
  title: "Crown Canvas Player",
  description: "Offline-first digital signage player for Smart TVs & Display Kiosks",
};

export default function PlayerPage() {
  return (
    <PlayerErrorBoundary>
      <PlayerClient />
    </PlayerErrorBoundary>
  );
}
