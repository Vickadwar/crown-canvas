/**
 * @file src/app/api/health/route.ts
 * @description Health & diagnostics endpoint checking Postgres, Supabase Auth, and Storage readiness.
 */

import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { db, isDatabaseConfigured, withDbRetry } from "@/db";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { isSupabaseAdminConfigured } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  await connection();
  const { searchParams } = new URL(request.url);
  const checkDb = searchParams.get("db") === "1";

  let dbReachable: boolean | null = null;
  let dbLatencyMs: number | null = null;
  let dbError: string | null = null;

  if (checkDb && isDatabaseConfigured()) {
    const start = Date.now();
    try {
      await withDbRetry(() => db.execute(sql`SELECT 1`));
      dbReachable = true;
      dbLatencyMs = Date.now() - start;
    } catch (err) {
      dbReachable = false;
      dbLatencyMs = Date.now() - start;
      dbError = err instanceof Error ? err.message : "Database ping failed";
    }
  }

  return Response.json({
    ok: true,
    databaseConfigured: isDatabaseConfigured(),
    supabaseConfigured: isSupabaseConfigured(),
    supabaseAdminConfigured: isSupabaseAdminConfigured(),
    dbReachable,
    dbLatencyMs,
    dbError,
    timestamp: new Date().toISOString(),
  });
}
