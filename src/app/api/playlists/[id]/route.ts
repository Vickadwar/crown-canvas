import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, isDatabaseConfigured, playlists } from "@/db";
import { broadcastFleetSignal } from "@/lib/realtime";
import { requireAdminAccess } from "@/lib/auth-guard";

const patchPlaylistSchema = z.object({
  layoutId: z.string().uuid().nullable().optional(),
  sidebarProfileId: z.string().uuid().nullable().optional(),
  audioTrackId: z.string().uuid().nullable().optional(),
  promoInjectEveryN: z.number().int().min(0).max(50).optional(),
  showPartnerLogos: z.boolean().optional(),
  partnerTickerMode: z.enum(["pinned_right", "inline_scroll", "hidden"]).optional(),
  mediaFitMode: z.enum(["ambient_fit", "edge_cover"]).optional(),
  stageBackdrop: z.enum(["ambient_blur", "crown_navy", "showroom_light"]).optional(),
  name: z.string().min(2).max(150).optional(),
  tickerText: z.string().max(1000).nullable().optional(),
  sidebarConfig: z
    .object({
      displayName: z.string().max(100).optional(),
      showWeather: z.boolean().optional(),
      showClock: z.boolean().optional(),
      showQr: z.boolean().optional(),
      qrTargetUrl: z.string().max(300).optional(),
      shadeTitle: z.string().max(80).optional(),
      shadeName: z.string().max(80).optional(),
      shadeHex: z.string().max(16).optional(),
      promoLabel: z.string().max(100).optional(),
    })
    .nullable()
    .optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { errorResponse } = await requireAdminAccess({ disallowAuditor: true });
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  const { id } = await context.params;
  const body = await request.json();
  const parsed = patchPlaylistSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid playlist update", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const [updated] = await db
    .update(playlists)
    .set({
      ...parsed.data,
      version: sql`${playlists.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(playlists.id, id))
    .returning();

  if (!updated) {
    return Response.json({ error: "Playlist not found" }, { status: 404 });
  }

  await broadcastFleetSignal("manifest_refresh", {
    reason: "playlist_updated",
    playlistId: id,
  });

  return Response.json({ playlist: updated });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { errorResponse } = await requireAdminAccess({ disallowAuditor: true });
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  const { id } = await context.params;
  await db.delete(playlists).where(eq(playlists.id, id));
  await broadcastFleetSignal("manifest_refresh", {
    reason: "playlist_deleted",
    playlistId: id,
  });
  return Response.json({ ok: true });
}
