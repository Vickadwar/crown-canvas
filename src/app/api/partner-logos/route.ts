/**
 * @file src/app/api/partner-logos/route.ts
 * @description Official Partner Logos CRUD (`GET`, `POST`) for bottom tagline bar display.
 */

import { asc } from "drizzle-orm";
import { connection } from "next/server";
import { z } from "zod";
import { db, isDatabaseConfigured, withDbRetry, partnerLogos } from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";
import { broadcastFleetSignal } from "@/lib/realtime";

const createPartnerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  logoUrl: z.string().url(),
  storagePath: z.string().max(500).nullable().optional(),
  tagline: z.string().trim().max(160).nullable().optional(),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});

export async function GET() {
  await connection();
  const { errorResponse } = await requireAdminAccess();
  if (errorResponse) return errorResponse;
  if (!isDatabaseConfigured()) return Response.json({ partnerLogos: [] });

  try {
    const rows = await withDbRetry(() =>
      db
        .select()
        .from(partnerLogos)
        .orderBy(asc(partnerLogos.sortOrder), asc(partnerLogos.createdAt))
    );
    return Response.json({ partnerLogos: rows });
  } catch {
    return Response.json({ partnerLogos: [] });
  }
}

export async function POST(request: Request) {
  const { errorResponse } = await requireAdminAccess({ disallowAuditor: true });
  if (errorResponse) return errorResponse;
  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const parsed = createPartnerSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message || "Invalid partner logo payload" },
        { status: 400 }
      );
    }

    const [created] = await withDbRetry(() =>
      db
        .insert(partnerLogos)
        .values({
          name: parsed.data.name,
          logoUrl: parsed.data.logoUrl,
          storagePath: parsed.data.storagePath ?? null,
          tagline: parsed.data.tagline?.trim() || null,
          sortOrder: parsed.data.sortOrder,
        })
        .returning()
    );

    await broadcastFleetSignal("manifest_refresh", {
      reason: "partner_logo_created",
      partnerLogoId: created.id,
    });
    return Response.json({ partnerLogo: created }, { status: 201 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to save partner logo" },
      { status: 500 }
    );
  }
}
