/**
 * @file src/app/api/studio-backgrounds/route.ts
 * @description CRUD collection endpoint for custom uploaded Crown Studio Canvas Background / Banner images.
 */

import { desc } from "drizzle-orm";
import { connection } from "next/server";
import { z } from "zod";
import {
  db,
  isDatabaseConfigured,
  withDbRetry,
  studioBackgrounds,
} from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";
import { recordAuditLog } from "@/lib/audit";

const createBackgroundSchema = z.object({
  name: z.string().trim().min(2).max(140),
  category: z.string().trim().min(2).max(64).default("Campaign"),
  imageUrl: z.string().trim().min(1),
  storagePath: z.string().trim().nullable().optional(),
});

export async function GET() {
  await connection();
  const { errorResponse } = await requireAdminAccess();
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json({ backgrounds: [] });
  }

  try {
    const backgrounds = await withDbRetry(() =>
      db
        .select()
        .from(studioBackgrounds)
        .orderBy(desc(studioBackgrounds.createdAt))
    );
    return Response.json({ backgrounds });
  } catch {
    return Response.json({ backgrounds: [] });
  }
}

export async function POST(request: Request) {
  const { session, errorResponse } = await requireAdminAccess({
    disallowAuditor: true,
    permission: "studio:design",
  });
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const parsed = createBackgroundSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        {
          error:
            parsed.error.issues[0]?.message || "Invalid background image payload",
        },
        { status: 400 }
      );
    }

    const [created] = await withDbRetry(() =>
      db
        .insert(studioBackgrounds)
        .values({
          name: parsed.data.name,
          category: parsed.data.category,
          imageUrl: parsed.data.imageUrl,
          storagePath: parsed.data.storagePath ?? null,
        })
        .returning()
    );

    await recordAuditLog({
      action: "studio.background_uploaded",
      entityType: "studio_background",
      entityId: created.id,
      userId: session.userId,
      metadata: { name: created.name, category: created.category },
    });

    return Response.json({ background: created }, { status: 201 });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to save Studio background",
      },
      { status: 500 }
    );
  }
}
