import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db, isDatabaseConfigured, pairingCodes } from "@/db";
import { generatePairingPin } from "@/lib/security";
import {
  checkRateLimit,
  getClientIp,
  rateLimitExceededResponse,
} from "@/lib/rate-limit";

const pairRequestSchema = z.object({
  hardwareType: z.enum(["android_tv", "mini_pc", "other"]).default("android_tv"),
  resolution: z.string().max(32).optional(),
});

export async function POST(request: Request) {
  const rl = checkRateLimit(`pair_req:${getClientIp(request)}`, 20, 60_000);
  if (!rl.allowed) return rateLimitExceededResponse(rl.retryAfterSeconds);

  if (!isDatabaseConfigured()) {
    return Response.json(
      {
        configured: false,
        code: "DEMO01",
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        message: "Database not configured yet; running in pairing preview mode.",
      },
      { status: 200 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = pairRequestSchema.safeParse(body);
    const data = parsed.success
      ? parsed.data
      : { hardwareType: "android_tv" as const, resolution: undefined };

    // Clean up expired unclaimed codes
    await db
      .delete(pairingCodes)
      .where(sql`${pairingCodes.expiresAt} < NOW() AND ${pairingCodes.claimedAt} IS NULL`);

    // Generate unique 6-digit PIN
    let code = generatePairingPin();
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await db
        .select({ id: pairingCodes.id })
        .from(pairingCodes)
        .where(eq(pairingCodes.code, code));
      if (existing.length === 0) break;
      code = generatePairingPin();
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const userAgent = request.headers.get("user-agent") ?? undefined;

    const [created] = await db
      .insert(pairingCodes)
      .values({
        code,
        hardwareType: data.hardwareType,
        resolution: data.resolution,
        userAgent,
        expiresAt,
      })
      .returning();

    return Response.json({
      configured: true,
      code: created.code,
      expiresAt: created.expiresAt.toISOString(),
    });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to create pairing PIN",
      },
      { status: 500 }
    );
  }
}
