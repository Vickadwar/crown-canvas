/**
 * @file src/app/api/studio-backgrounds/[id]/route.ts
 * @description Deletes a custom Studio Canvas Background and purges its cloud storage object.
 */

import { eq } from "drizzle-orm";
import {
  db,
  isDatabaseConfigured,
  withDbRetry,
  studioBackgrounds,
} from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";
import { purgeMediaObject } from "@/lib/storage-provider";
import { recordAuditLog } from "@/lib/audit";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { session, errorResponse } = await requireAdminAccess({
    disallowAuditor: true,
    permission: "studio:design",
  });
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const { id } = await context.params;
    const [deleted] = await withDbRetry(() =>
      db
        .delete(studioBackgrounds)
        .where(eq(studioBackgrounds.id, id))
        .returning()
    );

    if (!deleted) {
      return Response.json({ error: "Background not found" }, { status: 404 });
    }

    if (deleted.storagePath) {
      await purgeMediaObject(deleted.storagePath).catch(() => undefined);
    }

    await recordAuditLog({
      action: "studio.background_deleted",
      entityType: "studio_background",
      entityId: id,
      userId: session.userId,
      metadata: { name: deleted.name },
    });

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to delete Studio background",
      },
      { status: 500 }
    );
  }
}
