import { z } from "zod";
import { db, isDatabaseConfigured, playlists, playlistItems } from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";

const createPlaylistSchema = z.object({
  name: z.string().min(2).max(150),
  description: z.string().optional(),
  departmentId: z.string().uuid(),
  countryId: z.string().uuid().nullable().optional(),
  layoutId: z.string().uuid().nullable().optional(),
  defaultDurationSeconds: z.number().int().min(5).max(300).default(15),
  items: z
    .array(
      z.object({
        itemKind: z.enum(["media_asset", "quick_post"]),
        mediaAssetId: z.string().uuid().optional(),
        quickPostId: z.string().uuid().optional(),
        durationSeconds: z.number().int().min(3).max(3600).optional(),
      })
    )
    .default([]),
});

export async function POST(request: Request) {
  const { errorResponse } = await requireAdminAccess({ disallowAuditor: true });
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "DATABASE_URL is not configured in .env.local yet." },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const parsed = createPlaylistSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid playlist payload", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const [created] = await db
      .insert(playlists)
      .values({
        name: parsed.data.name,
        description: parsed.data.description,
        departmentId: parsed.data.departmentId,
        countryId: parsed.data.countryId ?? null,
        layoutId: parsed.data.layoutId ?? null,
        defaultDurationSeconds: parsed.data.defaultDurationSeconds,
      })
      .returning();

    if (created && parsed.data.items.length > 0) {
      await db.insert(playlistItems).values(
        parsed.data.items.map((item, idx) => ({
          playlistId: created.id,
          itemKind: item.itemKind,
          mediaAssetId:
            item.itemKind === "media_asset" ? item.mediaAssetId : null,
          quickPostId:
            item.itemKind === "quick_post" ? item.quickPostId : null,
          sortOrder: idx,
          durationSeconds: item.durationSeconds ?? null,
        }))
      );
    }

    return Response.json({ playlist: created }, { status: 201 });
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : "Failed to create playlist",
      },
      { status: 500 }
    );
  }
}
