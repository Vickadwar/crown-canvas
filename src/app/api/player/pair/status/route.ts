import { eq } from "drizzle-orm";
import { db, isDatabaseConfigured, pairingCodes } from "@/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code")?.trim();

  if (!code) {
    return Response.json({ error: "Missing code parameter" }, { status: 400 });
  }

  if (!isDatabaseConfigured()) {
    return Response.json({ configured: false, paired: false });
  }

  try {
    const [row] = await db
      .select()
      .from(pairingCodes)
      .where(eq(pairingCodes.code, code));

    if (!row) {
      return Response.json({ paired: false, expired: true });
    }

    if (row.claimedScreenId && row.handoffToken) {
      const deviceToken = row.handoffToken;
      const screenId = row.claimedScreenId;

      // Clear one-time handoffToken immediately after TV retrieves it
      await db
        .update(pairingCodes)
        .set({ handoffToken: null })
        .where(eq(pairingCodes.id, row.id));

      return Response.json({
        paired: true,
        screenId,
        deviceToken,
      });
    }

    return Response.json({
      paired: Boolean(row.claimedScreenId),
      expired: row.expiresAt < new Date(),
    });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to check pairing status",
      },
      { status: 500 }
    );
  }
}
