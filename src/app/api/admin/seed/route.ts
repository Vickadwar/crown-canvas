/**
 * @file src/app/api/admin/seed/route.ts
 * @description One-click API endpoint to populate starter East Africa countries,
 * showrooms, Crown Paints departments, layouts, data feed, and default playlist.
 */

import { isDatabaseConfigured } from "@/db";
import { runDatabaseSeed } from "@/db/seed-runner";
import { requireAdminAccess } from "@/lib/auth-guard";
import { recordAuditLog } from "@/lib/audit";

export async function POST() {
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
    const summary = await runDatabaseSeed();
    await recordAuditLog({
      action: "database.seeded",
      entityType: "system",
      userId: session.userId,
      metadata: summary,
    });
    return Response.json({ ok: true, ...summary });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Seed failed. Ensure `npm run db:push` has been applied first.",
      },
      { status: 500 }
    );
  }
}
