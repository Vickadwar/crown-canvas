/**
 * @file src/app/api/sidebar-profiles/route.ts
 * @description Reusable Per-Playlist Sidebar Profiles CRUD endpoint. Supports optional
 * atomic `attachToPlaylistId` so admins can auto-create and attach a custom sidebar
 * to any playlist in one click.
 */

import { desc, eq, sql } from "drizzle-orm";
import { connection } from "next/server";
import { z } from "zod";
import {
  db,
  isDatabaseConfigured,
  withDbRetry,
  playlists,
  sidebarProfiles,
} from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";
import { CROWN_DECORATIVE_QR_URL } from "@/lib/crown-products";
import { broadcastFleetSignal } from "@/lib/realtime";
import { recordAuditLog } from "@/lib/audit";

const createProfileSchema = z.object({
  name: z.string().trim().min(2).max(140),
  description: z.string().trim().max(300).nullable().optional(),
  theme: z
    .enum(["white_minimal", "warm_editorial", "navy_dark", "slate_industrial"])
    .default("white_minimal"),
  displayName: z.string().trim().max(140).nullable().optional(),
  showClock: z.boolean().default(true),
  showWeather: z.boolean().default(true),
  showQr: z.boolean().default(true),
  qrTitle: z.string().trim().max(100).nullable().optional(),
  promoLabel: z.string().trim().max(200).nullable().optional(),
  qrTargetUrl: z.string().trim().url().nullable().optional().or(z.literal("")),
  qrTrackingMode: z.enum(["direct", "tracked"]).default("direct"),
  qrShowLogo: z.boolean().default(true),
  slideIntervalSeconds: z.number().int().min(3).max(60).default(6),
  productIds: z.array(z.string().uuid()).default([]),
  isDefault: z.boolean().default(false),
  attachToPlaylistId: z.string().uuid().optional(),
});

export async function GET() {
  await connection();
  const { errorResponse } = await requireAdminAccess();
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json({ profiles: [] });
  }

  try {
    const profiles = await withDbRetry(() =>
      db
        .select()
        .from(sidebarProfiles)
        .orderBy(desc(sidebarProfiles.isDefault), desc(sidebarProfiles.updatedAt))
    );
    return Response.json({ profiles });
  } catch {
    return Response.json({ profiles: [] });
  }
}

export async function POST(request: Request) {
  const { session, errorResponse } = await requireAdminAccess({
    disallowAuditor: true,
    permission: "playlists:manage",
  });
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const parsed = createProfileSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        {
          error:
            parsed.error.issues[0]?.message || "Invalid sidebar profile payload",
        },
        { status: 400 }
      );
    }

    const qrTarget =
      parsed.data.qrTargetUrl && parsed.data.qrTargetUrl.trim()
        ? parsed.data.qrTargetUrl.trim()
        : CROWN_DECORATIVE_QR_URL;

    if (parsed.data.isDefault) {
      await withDbRetry(() =>
        db.update(sidebarProfiles).set({ isDefault: false })
      );
    }

    const [created] = await withDbRetry(() =>
      db
        .insert(sidebarProfiles)
        .values({
          name: parsed.data.name,
          description: parsed.data.description?.trim() || null,
          theme: parsed.data.theme,
          displayName: parsed.data.displayName?.trim() || null,
          showClock: parsed.data.showClock,
          showWeather: parsed.data.showWeather,
          showQr: parsed.data.showQr,
          qrTitle: parsed.data.qrTitle?.trim() || "Explore Decorative Range",
          promoLabel:
            parsed.data.promoLabel?.trim() ||
            "Scan to browse Crown Decorative paints & shades.",
          qrTargetUrl: qrTarget,
          qrTrackingMode: parsed.data.qrTrackingMode,
          qrShowLogo: parsed.data.qrShowLogo,
          slideIntervalSeconds: parsed.data.slideIntervalSeconds,
          productIds: parsed.data.productIds,
          isDefault: parsed.data.isDefault,
        })
        .returning()
    );

    if (parsed.data.attachToPlaylistId) {
      await withDbRetry(() =>
        db
          .update(playlists)
          .set({
            sidebarProfileId: created.id,
            version: sql`${playlists.version} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(playlists.id, parsed.data.attachToPlaylistId!))
      );
    }

    await Promise.all([
      broadcastFleetSignal("manifest_refresh", {
        reason: "sidebar_profile_created",
        sidebarProfileId: created.id,
      }),
      recordAuditLog({
        action: "sidebar.profile_created",
        entityType: "sidebar_profile",
        entityId: created.id,
        userId: session.userId,
        metadata: {
          name: created.name,
          attachToPlaylistId: parsed.data.attachToPlaylistId ?? null,
        },
      }),
    ]);

    return Response.json({ profile: created }, { status: 201 });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to create sidebar profile",
      },
      { status: 500 }
    );
  }
}
