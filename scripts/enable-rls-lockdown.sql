-- =============================================================================
-- Crown Canvas — Supabase Postgres Row-Level Security (RLS) Lockdown Script
-- =============================================================================
-- Run once in Supabase Dashboard -> SQL Editor.
--
-- Why this matters:
-- All Crown Canvas database queries run server-side through Next.js API routes
-- using the privileged Postgres connection (`DATABASE_URL`). Because Supabase
-- exposes the `public` schema via its REST Data API using the public anon key,
-- enabling RLS with zero permissive policies for `anon` and `authenticated`
-- prevents anyone holding `NEXT_PUBLIC_SUPABASE_ANON_KEY` from reading or
-- modifying database tables directly via PostgREST.
-- =============================================================================

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    -- Revoke direct PostgREST table grants from public client roles
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated;', tbl);
  END LOOP;
END
$$;
