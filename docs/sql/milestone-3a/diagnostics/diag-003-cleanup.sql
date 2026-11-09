-- Purpose: remove EVERY temporary Milestone 3A diagnostic object. Manual
-- execution by the developer as postgres in Supabase SQL Editor after the
-- diagnostic evidence has been recorded. Codex never runs this.
-- Prerequisite: evidence from diag-002-results.sql and the test output saved.
-- Repeatability: safe to re-run; uses IF EXISTS because cleanup must tolerate
-- a partially applied setup.
-- Destroys only zz_diag_m3a_* objects (diagnostic metadata). Touches no
-- Persona, identity, accounts or auth object.

BEGIN;

DROP TRIGGER IF EXISTS zz_diag_direct_capture ON public.zz_diag_m3a_direct;
DROP TABLE IF EXISTS public.zz_diag_m3a_direct;
DROP TABLE IF EXISTS public.zz_diag_m3a_events;

DROP FUNCTION IF EXISTS public.zz_diag_m3a_persona_create();
DROP FUNCTION IF EXISTS public.zz_diag_m3a_persona_update_metadata();
DROP FUNCTION IF EXISTS public.zz_diag_m3a_persona_update_profile_field();
DROP FUNCTION IF EXISTS public.zz_diag_m3a_persona_upsert_section();
DROP FUNCTION IF EXISTS public.zz_diag_m3a_persona_delete_section();
DROP FUNCTION IF EXISTS public.zz_diag_m3a_persona_reorder_sections();
DROP FUNCTION IF EXISTS public.zz_diag_m3a_persona_set_default();
DROP FUNCTION IF EXISTS public.zz_diag_m3a_persona_set_lifecycle();
DROP FUNCTION IF EXISTS public.zz_diag_m3a_persona_duplicate();
DROP FUNCTION IF EXISTS public.zz_diag_m3a_persona_delete();
DROP FUNCTION IF EXISTS public.zz_diag_m3a_scope_probe();
DROP FUNCTION IF EXISTS public.zz_diag_m3a_probe();
DROP FUNCTION IF EXISTS public.zz_diag_m3a_capture();
DROP FUNCTION IF EXISTS public.zz_diag_m3a_gate();

COMMIT;

-- Verification (read-only): both queries must return zero rows / true.
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname LIKE 'zz\_diag\_m3a\_%';
SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'zz\_diag\_m3a\_%';
-- Policies and the trigger are dropped with their tables. The only session
-- state ever written was the transaction-local custom setting zz_diag.local_marker,
-- which does not persist.
