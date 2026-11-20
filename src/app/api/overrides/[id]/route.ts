import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, isDatabaseConfigured, emergencyOverrides } from "@/db";
import { broadcastFleetSignal } from "@/lib/realtime";
import { requireAdminAccess } from "@/lib/auth-guard";

const patchOverrideSchema = z.object({
  isActive: z.boolean(),
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

  const { id } = await context.params;
  const body = await request.json();
  const parsed = patchOverrideSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  const [updated] = await db
    .update(emergencyOverrides)
    .set({ isActive: parsed.data.isActive })
    .where(eq(emergencyOverrides.id, id))
    .returning();

  if (!updated) {
    return Response.json({ error: "Override not found" }, { status: 404 });
  }

  await broadcastFleetSignal("emergency_override", {
    overrideId: id,
    active: updated.isActive,
  });

  return Response.json({ override: updated });
}
