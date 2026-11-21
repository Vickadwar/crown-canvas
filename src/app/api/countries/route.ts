/**
 * @file src/app/api/countries/route.ts
 * @description Universal Regions/Countries collection endpoint (`GET`, `POST`) so admins
 * can operate signage networks in any country or region worldwide.
 */

import { asc } from "drizzle-orm";
import { connection } from "next/server";
import { z } from "zod";
import { db, isDatabaseConfigured, countries, withDbRetry } from "@/db";
import { requireAdminAccess } from "@/lib/auth-guard";

const createCountrySchema = z.object({
  code: z
    .string()
    .min(2)
    .max(3)
    .transform((v) => v.trim().toUpperCase()),
  name: z.string().min(2).max(100),
  currencyCode: z
    .string()
    .min(3)
    .max(3)
    .transform((v) => v.trim().toUpperCase())
    .default("USD"),
  timezone: z.string().min(3).max(64).default("UTC"),
});

export async function GET() {
  await connection();
  if (!isDatabaseConfigured()) {
    return Response.json({ countries: [] });
  }
  const rows = await withDbRetry(() =>
    db.select().from(countries).orderBy(asc(countries.name))
  );
  return Response.json({ countries: rows });
}

export async function POST(request: Request) {
  const { errorResponse } = await requireAdminAccess({ disallowAuditor: true });
  if (errorResponse) return errorResponse;

  if (!isDatabaseConfigured()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const parsed = createCountrySchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid region/country payload", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const [created] = await withDbRetry(() =>
      db.insert(countries).values(parsed.data).returning()
    );
    return Response.json({ country: created }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to add region";
    const isDuplicate = msg.toLowerCase().includes("unique");
    return Response.json(
      { error: isDuplicate ? "That region code already exists." : msg },
      { status: isDuplicate ? 409 : 500 }
    );
  }
}
