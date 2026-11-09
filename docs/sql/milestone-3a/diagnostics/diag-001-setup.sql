-- Purpose: TEMPORARY diagnostic objects for the Milestone 3A request-path gate.
-- They let the hosted development Supabase project reveal, through real
-- Auth + PostgREST requests, what request.method / request.path actually are,
-- whether the gate pattern from file 004 (policy + SECURITY INVOKER RPC +
-- column grants) allows RPC writes and rejects direct writes, and whether
-- client-controllable inputs can change those values.
--
-- Status: PROPOSAL. Not executed. Codex never runs this. The developer reviews
-- it, runs it manually in the Supabase SQL Editor as postgres, runs the hosted
-- test described in README.md, runs diag-002 to inspect evidence, then runs
-- diag-003-cleanup.sql. Do not leave these objects in place.
--
-- Scope and safety:
--  * Every object is named zz_diag_m3a_* in schema public; nothing is created
--    that the real Persona SQL (001-005) uses, and no existing object is touched.
--  * No Persona, identity, accounts or auth object is read or modified.
--  * No SECURITY DEFINER, no service_role use, no custom role.
--  * Only `authenticated` receives access. anon, service_role and PUBLIC get none.
--  * The tables hold only diagnostic metadata (method, path, pid, xid, labels);
--    function results never include header values, tokens or claims.
--  * zz_diag_m3a_direct can never contain rows (statement trigger always raises).
--
-- Prerequisites: session_user = postgres; Supabase roles exist; no zz_diag_m3a_*
-- object exists (preflight below). Repeatability: one-time; run cleanup first
-- if a previous attempt left objects.
-- Expected outcome: 2 tables, 1 trigger and 14 functions (gate, capture trigger
-- function, probe, scope_probe, and 10 RPC wrappers).

-- Read-only preflight: every boolean must be true.
SELECT session_user = 'postgres' AS expected_session_role,
       (SELECT count(*) = 3 FROM pg_roles
        WHERE rolname IN ('anon','authenticated','service_role')) AS roles_present,
       has_function_privilege('authenticated','auth.uid()','EXECUTE') AS auth_uid_ok,
       NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname LIKE 'zz\_diag\_m3a\_%') AS no_tables,
       NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname LIKE 'zz\_diag\_m3a\_%') AS no_functions;

BEGIN;

-- 1. Gate under test: same logic and shape as persona_write_rpc_context() in 004,
--    with diagnostic function names. Exact string equality, no patterns.
CREATE FUNCTION public.zz_diag_m3a_gate()
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT COALESCE(
    current_setting('request.method', true) = 'POST'
    AND current_setting('request.path', true) = ANY (ARRAY[
      '/rpc/zz_diag_m3a_persona_create',
      '/rpc/zz_diag_m3a_persona_update_metadata',
      '/rpc/zz_diag_m3a_persona_update_profile_field',
      '/rpc/zz_diag_m3a_persona_upsert_section',
      '/rpc/zz_diag_m3a_persona_delete_section',
      '/rpc/zz_diag_m3a_persona_reorder_sections',
      '/rpc/zz_diag_m3a_persona_set_default',
      '/rpc/zz_diag_m3a_persona_set_lifecycle',
      '/rpc/zz_diag_m3a_persona_duplicate',
      '/rpc/zz_diag_m3a_persona_delete'
    ]),
    false
  );
$$;

-- 2. Gated evidence table: mirrors a Persona configuration table (owner column,
--    gated INSERT/UPDATE/DELETE policies, column-level grants, RLS forced).
CREATE TABLE public.zz_diag_m3a_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  label text NOT NULL,
  observed_method text,
  observed_path text,
  observed_gate boolean,
  backend_pid integer,
  observed_xid text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.zz_diag_m3a_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zz_diag_m3a_events FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.zz_diag_m3a_events
  FROM PUBLIC, anon, authenticated, service_role;

CREATE POLICY zz_diag_events_select_own ON public.zz_diag_m3a_events
  FOR SELECT TO authenticated USING (account_id = (SELECT auth.uid()));
CREATE POLICY zz_diag_events_insert_rpc_own ON public.zz_diag_m3a_events
  FOR INSERT TO authenticated
  WITH CHECK (account_id = (SELECT auth.uid()) AND (SELECT public.zz_diag_m3a_gate()));
CREATE POLICY zz_diag_events_update_rpc_own ON public.zz_diag_m3a_events
  FOR UPDATE TO authenticated
  USING (account_id = (SELECT auth.uid()) AND (SELECT public.zz_diag_m3a_gate()))
  WITH CHECK (account_id = (SELECT auth.uid()) AND (SELECT public.zz_diag_m3a_gate()));
CREATE POLICY zz_diag_events_delete_rpc_own ON public.zz_diag_m3a_events
  FOR DELETE TO authenticated
  USING (account_id = (SELECT auth.uid()) AND (SELECT public.zz_diag_m3a_gate()));

GRANT SELECT ON public.zz_diag_m3a_events TO authenticated;
GRANT INSERT (account_id, label, observed_method, observed_path, observed_gate,
              backend_pid, observed_xid) ON public.zz_diag_m3a_events TO authenticated;
GRANT UPDATE (label) ON public.zz_diag_m3a_events TO authenticated;
GRANT DELETE ON public.zz_diag_m3a_events TO authenticated;
GRANT EXECUTE ON FUNCTION public.zz_diag_m3a_gate() TO authenticated;
REVOKE ALL ON FUNCTION public.zz_diag_m3a_gate() FROM PUBLIC, anon, service_role;

-- 3. Direct-write capture table. A STATEMENT-level BEFORE trigger raises an
--    exception that contains the observed request.method/request.path. It fires
--    even when no row matches (so PATCH/DELETE work on an empty table), always
--    aborts the statement, and therefore no row can ever exist. The error body
--    returned by PostgREST carries the observed values for a "normal direct
--    table write" (POST insert, PATCH update, DELETE).
CREATE TABLE public.zz_diag_m3a_direct (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note text
);
ALTER TABLE public.zz_diag_m3a_direct ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zz_diag_m3a_direct FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.zz_diag_m3a_direct
  FROM PUBLIC, anon, authenticated, service_role;
CREATE POLICY zz_diag_direct_never ON public.zz_diag_m3a_direct
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
GRANT SELECT, INSERT (note), UPDATE (note), DELETE
  ON public.zz_diag_m3a_direct TO authenticated;

CREATE FUNCTION public.zz_diag_m3a_capture()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'zz_diag_observed method=% path=% op=% gate=%',
    COALESCE(current_setting('request.method', true), '<unset>'),
    COALESCE(current_setting('request.path', true), '<unset>'),
    TG_OP,
    (SELECT public.zz_diag_m3a_gate())
    USING ERRCODE = 'P0001';
END;
$$;
CREATE TRIGGER zz_diag_direct_capture
  BEFORE INSERT OR UPDATE OR DELETE ON public.zz_diag_m3a_direct
  FOR EACH STATEMENT EXECUTE FUNCTION public.zz_diag_m3a_capture();
REVOKE ALL ON FUNCTION public.zz_diag_m3a_capture() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.zz_diag_m3a_capture() TO authenticated;

-- 4. Read-only probe, callable with GET or POST (STABLE). Returns the values the
--    request context exposes. Header NAMES only: no header values, no JWT claims.
CREATE FUNCTION public.zz_diag_m3a_probe()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'method', current_setting('request.method', true),
    'path', current_setting('request.path', true),
    'gate', (SELECT public.zz_diag_m3a_gate()),
    'current_user', current_user,
    'uid_present', (SELECT auth.uid()) IS NOT NULL,
    'backend_pid', pg_backend_pid(),
    'xid', pg_current_xact_id_if_assigned()::text,
    'header_names', COALESCE((
      SELECT jsonb_agg(k ORDER BY k)
      FROM jsonb_object_keys(
        COALESCE(NULLIF(current_setting('request.headers', true), '')::jsonb,
                 '{}'::jsonb)) AS k), '[]'::jsonb),
    'local_marker_seen', current_setting('zz_diag.local_marker', true)
  );
$$;
REVOKE ALL ON FUNCTION public.zz_diag_m3a_probe() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.zz_diag_m3a_probe() TO authenticated;

-- 5. Scoping probe (POST). Reports the transaction-local marker it FINDS (should
--    be NULL/empty on every call if is_local settings are discarded at the end
--    of each request's transaction), then sets the marker with is_local = true.
--    Only a transaction-local setting is used; no session-level setting is ever
--    written, so pooled-connection state is not polluted.
CREATE FUNCTION public.zz_diag_m3a_scope_probe()
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_seen text := current_setting('zz_diag.local_marker', true);
  v_result jsonb;
BEGIN
  PERFORM set_config('zz_diag.local_marker', 'set-in-' || pg_current_xact_id()::text, true);
  v_result := jsonb_build_object(
    'marker_found_at_start', v_seen,
    'marker_now', current_setting('zz_diag.local_marker', true),
    'method', current_setting('request.method', true),
    'path', current_setting('request.path', true),
    'backend_pid', pg_backend_pid(),
    'xid', pg_current_xact_id()::text);
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.zz_diag_m3a_scope_probe() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.zz_diag_m3a_scope_probe() TO authenticated;

-- 6. Ten RPC wrappers named like the real mutation RPCs (prefix zz_diag_m3a_).
--    Each is SECURITY INVOKER, inserts one evidence row for the CALLER through
--    the gated policy (so the write only succeeds when the gate is true), and
--    returns the observed values. The DO block only generates the ten identical
--    CREATE FUNCTION statements; review the template once.
DO $do$
DECLARE
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['persona_create','persona_update_metadata',
    'persona_update_profile_field','persona_upsert_section','persona_delete_section',
    'persona_reorder_sections','persona_set_default','persona_set_lifecycle',
    'persona_duplicate','persona_delete']
  LOOP
    EXECUTE format($f$
      CREATE FUNCTION public.%1$I()
      RETURNS jsonb
      LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
      AS $body$
      DECLARE
        v_uid uuid := (SELECT auth.uid());
        v_row public.zz_diag_m3a_events;
      BEGIN
        IF v_uid IS NULL THEN
          RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
        END IF;
        INSERT INTO public.zz_diag_m3a_events
          (account_id, label, observed_method, observed_path, observed_gate,
           backend_pid, observed_xid)
        VALUES
          (v_uid, %2$L, current_setting('request.method', true),
           current_setting('request.path', true), (SELECT public.zz_diag_m3a_gate()),
           pg_backend_pid(), pg_current_xact_id()::text)
        RETURNING * INTO v_row;
        RETURN jsonb_build_object('event_id', v_row.id, 'label', v_row.label,
          'method', v_row.observed_method, 'path', v_row.observed_path,
          'gate', v_row.observed_gate, 'backend_pid', v_row.backend_pid,
          'xid', v_row.observed_xid);
      END;
      $body$;$f$, 'zz_diag_m3a_' || v_name, v_name);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I() FROM PUBLIC, anon, service_role',
      'zz_diag_m3a_' || v_name);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I() TO authenticated',
      'zz_diag_m3a_' || v_name);
  END LOOP;
END;
$do$;

COMMIT;

-- Post-execution verification (read-only):
SELECT c.relname, c.relrowsecurity AS rls, c.relforcerowsecurity AS rls_forced,
       pg_get_userbyid(c.relowner) AS owner,
       has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE') AS anon_any,
       has_any_column_privilege('service_role', c.oid, 'SELECT,INSERT,UPDATE') AS service_any
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname LIKE 'zz\_diag\_m3a\_%' AND c.relkind = 'r'
ORDER BY c.relname;
SELECT p.proname, p.prosecdef AS security_definer, p.proconfig,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'zz\_diag\_m3a\_%' ORDER BY p.proname;
-- Expected: 2 tables (RLS enabled and forced, owner postgres, anon_any and
-- service_any false); 14 functions, all security_definer false, proconfig
-- {search_path=""} for the SQL/PLpgSQL functions, auth_exec true, anon_exec false,
-- service_exec false.
--
-- Rollback: run diag-003-cleanup.sql.
