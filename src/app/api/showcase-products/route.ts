/**
 * @file src/app/api/showcase-products/route.ts
 * @description CRUD collection endpoint for CMS-managed Sidebar Showcase Products
 * (auto-seeds the 17 built-in Crown products if the table is empty).
 */

import { asc } from "drizzle-orm";
import { connection } from "next/server";
import { z } from "zod";
import {
  db,
  isDatabaseConfigured,
  withDbRetry,
  showcaseProducts,
} from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";
import { CROWN_PRODUCT_SHOWCASE } from "@/lib/crown-products";
import { broadcastFleetSignal } from "@/lib/realtime";
import { recordAuditLog } from "@/lib/audit";

const createProductSchema = z.object({
  name: z.string().trim().min(2).max(140),
  badgeHeader: z.string().trim().min(2).max(80).default("FEATURED PRODUCT"),
  description: z.string().trim().max(260).default(""),
  imageUrl: z.string().trim().min(1),
  storagePath: z.string().trim().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().default(true),
});

export async function ensureShowcaseProducts() {
  if (!isDatabaseConfigured()) {
    return CROWN_PRODUCT_SHOWCASE.map((p, idx) => ({
      id: p.id,
      name: p.name,
      badgeHeader: p.category,
      description: p.tagline,
      imageUrl: p.imageUrl,
      storagePath: null,
      sortOrder: idx,
      isActive: true,
    }));
  }

  // Read-only query: never auto-reseed on concurrent requests (prevents duplicate
  // inserts and respects intentional admin deletions of showcase products).
  try {
    return await withDbRetry(() =>
      db
        .select()
        .from(showcaseProducts)
        .orderBy(asc(showcaseProducts.sortOrder), asc(showcaseProducts.createdAt))
    );
  } catch {
    return [];
  }
}

export async function GET() {
  await connection();
  const { errorResponse } = await requireAdminAccess();
  if (errorResponse) return errorResponse;

  const products = await ensureShowcaseProducts();
  return Response.json({ products });
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
    const parsed = createProductSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        {
          error:
            parsed.error.issues[0]?.message || "Invalid showcase product payload",
        },
        { status: 400 }
      );
    }

    const existing = await ensureShowcaseProducts();
    const nextOrder = parsed.data.sortOrder ?? existing.length;

    const [created] = await withDbRetry(() =>
      db
        .insert(showcaseProducts)
        .values({
          name: parsed.data.name,
          badgeHeader: parsed.data.badgeHeader,
          description: parsed.data.description,
          imageUrl: parsed.data.imageUrl,
          storagePath: parsed.data.storagePath ?? null,
          sortOrder: nextOrder,
          isActive: parsed.data.isActive,
        })
        .returning()
    );

    await Promise.all([
      broadcastFleetSignal("manifest_refresh", {
        reason: "showcase_product_added",
        productId: created.id,
      }),
      recordAuditLog({
        action: "sidebar.product_created",
        entityType: "showcase_product",
        entityId: created.id,
        userId: session.userId,
        metadata: { name: created.name, badgeHeader: created.badgeHeader },
      }),
    ]);

    return Response.json({ product: created }, { status: 201 });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to add showcase product",
      },
      { status: 500 }
    );
  }
}
