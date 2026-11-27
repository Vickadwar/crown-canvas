/**
 * @file src/app/api/newsletters/[id]/route.ts
 * @description Edit or delete a multi-page Newsletter issue (automatically purges
 * every rendered page WebP slide from Cloudflare R2 on delete or page replacement).
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, isDatabaseConfigured, withDbRetry, newsletters } from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";
import { purgeMediaObject } from "@/lib/storage-provider";
import { broadcastFleetSignal } from "@/lib/realtime";

const pageSlideSchema = z.object({
  pageNumber: z.number().int().min(1).max(100),
  publicUrl: z.string().url(),
  storagePath: z.string().min(2).max(500),
  sha256Checksum: z.string().max(64).default(""),
  fileSizeBytes: z.number().int().nonnegative().default(0),
  durationSeconds: z.number().int().min(5).max(300).default(15),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

const patchNewsletterSchema = z.object({
  title: z.string().trim().min(2).max(180).optional(),
  issueLabel: z.string().trim().max(80).optional(),
  departmentName: z.string().trim().max(120).optional(),
  pages: z.array(pageSlideSchema).min(1).max(40).optional(),
  displayFitMode: z
    .enum([
      "magazine_spread",
      "widescreen_pan",
      "auto",
      "ambient_blur",
      "edge_cover",
      "showroom_light",
    ])
    .optional(),
  injectEveryNSlides: z.number().int().min(1).max(50).optional(),
  audioTrackId: z.string().uuid().nullable().optional(),
  targetType: z
    .enum(["screen", "screen_group", "branch", "country", "screen_role", "global"])
    .optional(),
  targetId: z.string().uuid().nullable().optional(),
  targetScreenIds: z.array(z.string().uuid()).max(200).nullable().optional(),
  targetPlaylistIds: z.array(z.string().uuid()).max(200).nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
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

  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = patchNewsletterSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message || "Invalid newsletter update" },
        { status: 400 }
      );
    }

    const [existing] = await withDbRetry(() =>
      db.select().from(newsletters).where(eq(newsletters.id, id))
    );
    if (!existing) {
      return Response.json({ error: "Newsletter not found" }, { status: 404 });
    }

    const patchData: Record<string, unknown> = {
      ...parsed.data,
      updatedAt: new Date(),
    };
    if (parsed.data.startDate !== undefined) {
      patchData.startDate = parsed.data.startDate
        ? new Date(parsed.data.startDate)
        : null;
    }
    if (parsed.data.endDate !== undefined) {
      patchData.endDate = parsed.data.endDate ? new Date(parsed.data.endDate) : null;
    }
    if (parsed.data.targetScreenIds !== undefined) {
      patchData.targetScreenIds =
        parsed.data.targetScreenIds && parsed.data.targetScreenIds.length > 0
          ? parsed.data.targetScreenIds
          : null;
    }
    if (parsed.data.targetPlaylistIds !== undefined) {
      patchData.targetPlaylistIds =
        parsed.data.targetPlaylistIds && parsed.data.targetPlaylistIds.length > 0
          ? parsed.data.targetPlaylistIds
          : null;
    }

    const [updated] = await withDbRetry(() =>
      db
        .update(newsletters)
        .set(patchData)
        .where(eq(newsletters.id, id))
        .returning()
    );

    // Purge any removed page files from R2 if pages were replaced/trimmed
    if (parsed.data.pages) {
      const keptPaths = new Set(parsed.data.pages.map((p) => p.storagePath));
      for (const oldPage of existing.pages ?? []) {
        if (!keptPaths.has(oldPage.storagePath)) {
          await purgeMediaObject(oldPage.storagePath, oldPage.publicUrl).catch(
            () => {}
          );
        }
      }
    }

    await broadcastFleetSignal("manifest_refresh", {
      reason: "newsletter_updated",
      newsletterId: id,
    });
    return Response.json({ newsletter: updated });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to update newsletter" },
      { status: 500 }
    );
  }
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

  try {
    const { id } = await context.params;
    const [deleted] = await withDbRetry(() =>
      db.delete(newsletters).where(eq(newsletters.id, id)).returning()
    );
    if (!deleted) {
      return Response.json({ error: "Newsletter not found" }, { status: 404 });
    }

    await Promise.all([
      ...(deleted.pages ?? []).map((p) =>
        purgeMediaObject(p.storagePath, p.publicUrl).catch(() => {})
      ),
      broadcastFleetSignal("manifest_refresh", {
        reason: "newsletter_deleted",
        newsletterId: id,
      }),
    ]);

    return Response.json({ ok: true, purgedPages: deleted.pages?.length ?? 0 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to delete newsletter" },
      { status: 500 }
    );
  }
}
