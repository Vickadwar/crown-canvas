import { connection } from "next/server";
import { getSessionAccess } from "@/lib/auth-guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";

export async function GET() {
  await connection();
  const session = await getSessionAccess();
  return Response.json(session);
}

export async function DELETE() {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  return Response.json({ ok: true });
}
