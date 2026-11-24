/**
 * @file src/app/api/showcase-products/[id]/route.ts
 * @description Single Sidebar Showcase Product update (edit, toggle active, reorder) and delete.
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  isDatabaseConfigured,
  withDbRetry,
  showcaseProducts,
} from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";
import { purgeMediaObject } from "@/lib/storage-provider";
import { broadcastFleetSignal } from "@/lib/realtime";
import { recordAuditLog } from "@/lib/audit";

const patchProductSchema = z.object({
  name: z.string().trim().min(2).max(140).optional(),
  badgeHeader: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(260).optional(),
  imageUrl: z.string().trim().min(1).optional(),
  storagePath: z.string().trim().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { session, errorResponse } = await requireAdminAccess({
    disallowAuditor: true,
    permission: "playlists:manage",
  });
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = patchProductSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message || "Invalid update payload" },
        { status: 400 }
      );
    }

    const [updated] = await withDbRetry(() =>
      db
        .update(showcaseProducts)
        .set({
          ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
          ...(parsed.data.badgeHeader !== undefined
            ? { badgeHeader: parsed.data.badgeHeader }
            : {}),
          ...(parsed.data.description !== undefined
            ? { description: parsed.data.description }
            : {}),
          ...(parsed.data.imageUrl !== undefined
            ? { imageUrl: parsed.data.imageUrl }
            : {}),
          ...(parsed.data.storagePath !== undefined
            ? { storagePath: parsed.data.storagePath }
            : {}),
          ...(parsed.data.sortOrder !== undefined
            ? { sortOrder: parsed.data.sortOrder }
            : {}),
          ...(parsed.data.isActive !== undefined
            ? { isActive: parsed.data.isActive }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(showcaseProducts.id, id))
        .returning()
    );

    if (!updated) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }

    await Promise.all([
      broadcastFleetSignal("manifest_refresh", {
        reason: "showcase_product_updated",
        productId: id,
      }),
      recordAuditLog({
        action: "sidebar.product_updated",
        entityType: "showcase_product",
        entityId: id,
        userId: session.userId,
        metadata: { name: updated.name, isActive: updated.isActive },
      }),
    ]);

    return Response.json({ product: updated });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to update product",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { session, errorResponse } = await requireAdminAccess({
    disallowAuditor: true,
    permission: "playlists:manage",
  });
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const { id } = await context.params;
    const [deleted] = await withDbRetry(() =>
      db
        .delete(showcaseProducts)
        .where(eq(showcaseProducts.id, id))
        .returning()
    );

    if (!deleted) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }

    await Promise.all([
      deleted.storagePath
        ? purgeMediaObject(deleted.storagePath, deleted.imageUrl).catch(
            () => undefined
          )
        : Promise.resolve(),
      broadcastFleetSignal("manifest_refresh", {
        reason: "showcase_product_deleted",
        productId: id,
      }),
      recordAuditLog({
        action: "sidebar.product_deleted",
        entityType: "showcase_product",
        entityId: id,
        userId: session.userId,
        metadata: { name: deleted.name },
      }),
    ]);

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to delete product",
      },
      { status: 500 }
    );
  }
}
