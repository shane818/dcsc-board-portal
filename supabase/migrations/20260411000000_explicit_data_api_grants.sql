-- Explicit Data API grants for public schema.
--
-- Background: As of October 30, 2026, Supabase no longer exposes tables in the
-- `public` schema to the Data API (PostgREST, GraphQL, supabase-js) by default.
-- New tables created after that date require explicit GRANT statements.
--
-- This migration:
--   1. Grants access on all CURRENT public tables (idempotent — no-op if already granted)
--   2. Sets DEFAULT PRIVILEGES so all FUTURE public tables automatically inherit
--      the same access without needing per-table grants in each migration.
--
-- Row-Level Security (RLS) still controls actual row access. These grants only
-- determine whether PostgREST can see the table at all.

-- Schema access
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Existing tables, sequences, and functions
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

-- Future objects (created after this migration) — inherit grants automatically
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
