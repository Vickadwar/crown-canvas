/**
 * @file src/app/api/newsletters/route.ts
 * @description Multi-page PDF Newsletter CRUD (`GET`, `POST`) storing each rendered
 * page as an ordered WebP slide on Cloudflare R2 with start/expiry dates, multi-screen
 * and multi-playlist targeting, optional background audio, and optional replace-previous mode.
 */

import { desc } from "drizzle-orm";
import { connection } from "next/server";
import { z } from "zod";
import { db, isDatabaseConfigured, withDbRetry, newsletters } from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";
import { broadcastFleetSignal } from "@/lib/realtime";
import { recordAuditLog } from "@/lib/audit";
import { purgeMediaObject } from "@/lib/storage-provider";

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

const createNewsletterSchema = z.object({
  title: z.string().trim().min(2).max(180),
  issueLabel: z.string().trim().max(80).default("Issue 1"),
  departmentName: z.string().trim().max(120).default("Corporate Comms"),
  pages: z.array(pageSlideSchema).min(1).max(40),
  displayFitMode: z
    .enum(["auto", "ambient_blur", "edge_cover", "showroom_light"])
    .default("auto"),
  injectEveryNSlides: z.number().int().min(1).max(50).default(4),
  audioTrackId: z.string().uuid().nullable().optional(),
  targetType: z
    .enum(["screen", "screen_group", "branch", "country", "screen_role", "global"])
    .default("global"),
  targetId: z.string().uuid().nullable().optional(),
  targetScreenIds: z.array(z.string().uuid()).max(200).nullable().optional(),
  targetPlaylistIds: z.array(z.string().uuid()).max(200).nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
  replaceExisting: z.boolean().optional(),
});

export async function GET() {
  await connection();
  const { errorResponse } = await requireAdminAccess();
  if (errorResponse) return errorResponse;
  if (!isDatabaseConfigured()) return Response.json({ newsletters: [] });

  try {
    const rows = await withDbRetry(() =>
      db.select().from(newsletters).orderBy(desc(newsletters.createdAt))
    );
    return Response.json({ newsletters: rows });
  } catch {
    return Response.json({ newsletters: [] });
  }
}

export async function POST(request: Request) {
  const { session, errorResponse } = await requireAdminAccess({
    disallowAuditor: true,
  });
  if (errorResponse) return errorResponse;
  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const parsed = createNewsletterSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message || "Invalid newsletter payload" },
        { status: 400 }
      );
    }

    if (parsed.data.replaceExisting) {
      const existing = await withDbRetry(() => db.select().from(newsletters));
      if (existing.length > 0) {
        await withDbRetry(() => db.delete(newsletters));
        for (const old of existing) {
          for (const page of old.pages ?? []) {
            await purgeMediaObject(page.storagePath, page.publicUrl).catch(() => {});
          }
        }
      }
    }

    const screenIds =
      parsed.data.targetScreenIds && parsed.data.targetScreenIds.length > 0
        ? parsed.data.targetScreenIds
        : null;
    const playlistIds =
      parsed.data.targetPlaylistIds && parsed.data.targetPlaylistIds.length > 0
        ? parsed.data.targetPlaylistIds
        : null;

    const [created] = await withDbRetry(() =>
      db
        .insert(newsletters)
        .values({
          title: parsed.data.title,
          issueLabel: parsed.data.issueLabel || "Issue 1",
          departmentName: parsed.data.departmentName || "Corporate Comms",
          pages: parsed.data.pages,
          displayFitMode: parsed.data.displayFitMode,
          injectEveryNSlides: parsed.data.injectEveryNSlides,
          audioTrackId: parsed.data.audioTrackId ?? null,
          targetType: screenIds ? "screen" : parsed.data.targetType,
          targetId: screenIds ? screenIds[0] : parsed.data.targetId ?? null,
          targetScreenIds: screenIds,
          targetPlaylistIds: playlistIds,
          startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
          endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
          isActive: parsed.data.isActive,
          createdBy: session.userId ?? null,
        })
        .returning()
    );

    await Promise.all([
      broadcastFleetSignal("manifest_refresh", {
        reason: "newsletter_created",
        newsletterId: created.id,
      }),
      recordAuditLog({
        action: "newsletter.created",
        entityType: "newsletter",
        entityId: created.id,
        userId: session.userId,
        metadata: {
          title: created.title,
          issueLabel: created.issueLabel,
          pageCount: created.pages.length,
        },
      }),
    ]);

    return Response.json({ newsletter: created }, { status: 201 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to save newsletter" },
      { status: 500 }
    );
  }
}
