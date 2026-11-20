import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db, isDatabaseConfigured, playlists, playlistItems } from "@/db";
import { broadcastFleetSignal } from "@/lib/realtime";
import { requireAdminAccess } from "@/lib/auth-guard";

const updateItemsSchema = z.object({
  items: z.array(
    z.object({
      itemKind: z.enum(["media_asset", "quick_post"]),
      mediaAssetId: z.string().uuid().optional().nullable(),
      quickPostId: z.string().uuid().optional().nullable(),
      durationSeconds: z.number().int().min(3).max(3600).optional().nullable(),
    })
  ),
});

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { errorResponse } = await requireAdminAccess({ disallowAuditor: true });
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "DATABASE_URL is not configured in .env.local yet." },
      { status: 503 }
    );
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = updateItemsSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid playlist items", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await db.delete(playlistItems).where(eq(playlistItems.playlistId, id));

    if (parsed.data.items.length > 0) {
      await db.insert(playlistItems).values(
        parsed.data.items.map((item, idx) => ({
          playlistId: id,
          itemKind: item.itemKind,
          mediaAssetId:
            item.itemKind === "media_asset" ? (item.mediaAssetId ?? null) : null,
          quickPostId:
            item.itemKind === "quick_post" ? (item.quickPostId ?? null) : null,
          sortOrder: idx,
          durationSeconds: item.durationSeconds ?? null,
        }))
      );
    }

    const [updated] = await db
      .update(playlists)
      .set({
        version: sql`${playlists.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(playlists.id, id))
      .returning();

    await broadcastFleetSignal("manifest_refresh", {
      playlistId: id,
      reason: "playlist_items_updated",
    });

    return Response.json({ playlist: updated });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to update playlist items",
      },
      { status: 500 }
    );
  }
}
