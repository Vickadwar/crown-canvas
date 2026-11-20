/**
 * @file src/app/api/templates/route.ts
 * @description Lists and saves custom reusable Crown Studio visual templates stored
 * in `studio_templates` (~5 KB JSONB documents, 0 MB cloud storage).
 */

import { desc } from "drizzle-orm";
import { db, isDatabaseConfigured, studioTemplates } from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";
import { studioTemplatePayloadSchema } from "@/lib/quick-post-schema";
import { recordAuditLog } from "@/lib/audit";

export async function GET() {
  const { errorResponse } = await requireAdminAccess();
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json({ templates: [] });
  }

  try {
    const rows = await db
      .select()
      .from(studioTemplates)
      .orderBy(desc(studioTemplates.updatedAt));
    return Response.json({ templates: rows });
  } catch {
    // Gracefully return empty if `db:push` hasn't created studio_templates yet
    return Response.json({ templates: [] });
  }
}

export async function POST(request: Request) {
  const { session, errorResponse } = await requireAdminAccess({
    disallowAuditor: true,
  });
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "DATABASE_URL is not configured in .env.local yet." },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const parsed = studioTemplatePayloadSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid template payload", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const [created] = await db
      .insert(studioTemplates)
      .values({
        name: parsed.data.name,
        description: parsed.data.description,
        category: parsed.data.category,
        departmentCode: parsed.data.departmentCode ?? null,
        orientation: parsed.data.orientation,
        canvasDoc: parsed.data.canvasDoc,
        createdBy: session.userId,
      })
      .returning();

    await recordAuditLog({
      action: "studio_template.created",
      entityType: "studio_template",
      entityId: created.id,
      userId: session.userId,
      metadata: {
        name: created.name,
        category: created.category,
        orientation: created.orientation,
      },
    });

    return Response.json({ template: created }, { status: 201 });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to save template (run `npm run db:push` if studio_templates table is new).",
      },
      { status: 500 }
    );
  }
}
