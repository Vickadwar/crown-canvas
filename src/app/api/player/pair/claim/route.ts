import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, isDatabaseConfigured, pairingCodes, screens } from "@/db";
import { generateDeviceToken, hashDeviceToken } from "@/lib/security";
import { recordAuditLog } from "@/lib/audit";
import { requireAdminAccess } from "@/lib/auth-guard";

const claimSchema = z.object({
  code: z.string().trim().length(6),
  name: z.string().min(2).max(150),
  branchId: z.string().uuid(),
  departmentId: z.string().uuid().nullable().optional(),
  screenRole: z
    .enum(["showroom_customer", "back_office", "factory_floor", "reception"])
    .default("showroom_customer"),
  orientation: z.enum(["landscape", "portrait"]).default("landscape"),
  activePlaylistId: z.string().uuid().nullable().optional(),
});

export async function POST(request: Request) {
  const { errorResponse } = await requireAdminAccess({ disallowAuditor: true });
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json(
      { error: "DATABASE_URL is not configured in .env.local yet." },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const parsed = claimSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid pairing claim payload", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const [pinRow] = await db
      .select()
      .from(pairingCodes)
      .where(eq(pairingCodes.code, parsed.data.code));

    if (!pinRow) {
      return Response.json(
        { error: "Pairing PIN not found. Check the 6-digit code on the TV." },
        { status: 404 }
      );
    }

    if (pinRow.claimedAt) {
      return Response.json(
        { error: "This pairing PIN has already been claimed." },
        { status: 409 }
      );
    }

    if (pinRow.expiresAt < new Date()) {
      return Response.json(
        { error: "This pairing PIN has expired. Refresh the TV screen for a new PIN." },
        { status: 410 }
      );
    }

    const rawDeviceToken = generateDeviceToken();
    const tokenHash = hashDeviceToken(rawDeviceToken);

    const [screen] = await db
      .insert(screens)
      .values({
        name: parsed.data.name,
        branchId: parsed.data.branchId,
        departmentId: parsed.data.departmentId ?? null,
        screenRole: parsed.data.screenRole,
        hardwareType: pinRow.hardwareType,
        orientation: parsed.data.orientation,
        resolution: pinRow.resolution ?? "1920x1080",
        deviceTokenHash: tokenHash,
        isPaired: true,
        isOnline: true,
        lastHeartbeatAt: new Date(),
        activePlaylistId: parsed.data.activePlaylistId ?? null,
      })
      .returning();

    await db
      .update(pairingCodes)
      .set({
        claimedScreenId: screen.id,
        handoffToken: rawDeviceToken,
        claimedAt: new Date(),
      })
      .where(eq(pairingCodes.id, pinRow.id));

    await recordAuditLog({
      action: "screen.paired",
      entityType: "screen",
      entityId: screen.id,
      metadata: {
        name: screen.name,
        branchId: screen.branchId,
        hardwareType: screen.hardwareType,
      },
    });

    return Response.json({ screen }, { status: 201 });
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : "Failed to pair screen",
      },
      { status: 500 }
    );
  }
}
