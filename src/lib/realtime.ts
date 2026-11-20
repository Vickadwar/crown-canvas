/**
 * @file src/lib/realtime.ts
 * @description Server-side Supabase Realtime Broadcast helper (`crown-canvas-fleet`)
 * pushing `<2s` manifest refreshes, emergency overrides, and screen commands to players.
 */

import {
  createSupabaseAdminClient,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/admin";

export const FLEET_CHANNEL = "crown-canvas-fleet";

export type FleetBroadcastEvent =
  | "manifest_refresh"
  | "emergency_override"
  | "screen_command"
  | "screen_removed";

/**
 * Sends a lightweight real-time signal to connected /player screens over Supabase
 * Realtime Broadcast without requiring a custom WebSocket server.
 */
export async function broadcastFleetSignal(
  event: FleetBroadcastEvent,
  payload: Record<string, unknown>
): Promise<void> {
  if (!isSupabaseAdminConfigured()) return;

  try {
    const supabase = createSupabaseAdminClient();
    const channel = supabase.channel(FLEET_CHANNEL);
    await channel.send({
      type: "broadcast",
      event,
      payload: {
        ...payload,
        sentAt: new Date().toISOString(),
      },
    });
    await supabase.removeChannel(channel);
  } catch {
    // Non-fatal: players still sync via 60s manifest polling fallback
  }
}
