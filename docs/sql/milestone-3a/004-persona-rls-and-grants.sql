-- Purpose: enable and FORCE RLS on all proposed Persona tables, install the
-- request-path/request-method write gate, install command-specific auth.uid()
-- owner policies, and grant only the column-level privileges that the
-- SECURITY INVOKER mutation RPCs in file 005 need. Direct PostgREST table
-- writes are rejected by RLS; configuration and revision writes succeed only
-- inside an approved POST /rpc/persona_* request, so version checks and
-- revision/audit inserts cannot be bypassed.
--
-- Revision R1 (remediation): previous draft had plain owner write policies (no
-- gate), no INSERT grant on persona_revisions, and table-wide DML grants. This
-- revision adds public.persona_write_rpc_context(), gates every write policy,
-- and replaces table-wide DML with column-level INSERT/UPDATE grants.
--
-- *** EXECUTION GATE ***
-- Do NOT execute until (a) the hosted request-path diagnostic in
-- diagnostics/README.md has passed and its report is reviewed, and (b) the path
-- allowlist inside persona_write_rpc_context() below has been compared with the
-- observed request.path values. The allowlist is PROVISIONAL: it assumes
-- PostgREST reports request.path as '/rpc/<function_name>' (no '/rest/v1'
-- prefix) and request.method as 'POST'. If the diagnostic observes anything
-- else, stop and return for design review; never loosen the match to make it
-- pass (no LIKE, no prefix match, no regex).
--
-- Prerequisites: files 001-003 executed and verified; current session_user and
-- current_user are postgres; Supabase anon/authenticated/service_role exist;
-- authenticated has USAGE on public and EXECUTE on auth.uid(); no Persona
-- policies and no persona_write_rpc_context() exist. Review live ACL/default
-- grants before continuing. File 005 is executed immediately after this file
-- (Persona tables are not usable for writes until it exists).
-- Execution order: 4 of 5 Milestone 3A SQL files.
-- Repeatability: one-time; preflight fails closed if any policy or the helper
-- exists. No IF NOT EXISTS / CREATE OR REPLACE is used to mask partial state.
-- Expected outcome: authenticated can SELECT own rows; can write only through
-- approved RPC requests; no anon/PUBLIC/service_role access of any kind.

-- Read-only preflight: every boolean must be true before execution.
SELECT session_user = 'postgres' AS expected_session_role,
       current_user = 'postgres' AS expected_execution_role,
       (SELECT count(*) = 5 FROM pg_class AS c
        JOIN pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname IN ('personas','persona_sections',
            'persona_profile_field_selections','persona_profile_overrides',
            'persona_revisions') AND c.relkind = 'r') AS all_tables_present,
       (SELECT count(*) = 3 FROM pg_roles
        WHERE rolname IN ('anon','authenticated','service_role'))
          AS supabase_roles_present,
       has_schema_privilege('authenticated','public','USAGE')
          AS authenticated_public_usage,
       has_function_privilege('authenticated','auth.uid()','EXECUTE')
          AS authenticated_auth_uid_execute,
       NOT EXISTS (SELECT 1 FROM pg_policies
        WHERE schemaname='public' AND tablename IN ('personas','persona_sections',
          'persona_profile_field_selections','persona_profile_overrides',
          'persona_revisions')) AS no_existing_persona_policies,
       NOT EXISTS (SELECT 1 FROM pg_proc AS p
        JOIN pg_namespace AS n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'persona_write_rpc_context')
          AS helper_absent,
       (SELECT count(*) = 0 FROM pg_proc AS p
        JOIN pg_namespace AS n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname LIKE 'zz\_diag\_m3a\_%')
          AS diagnostic_objects_cleaned_up;

BEGIN;

-- 1. Request-context gate -----------------------------------------------------
-- Purpose: return true only for a POST whose PostgREST request path is exactly
-- one of the approved Persona mutation RPC endpoints.
-- Inputs: none (reads transaction-local settings PostgREST sets per request).
-- Fail-closed: missing/empty settings -> NULL -> COALESCE -> false.
-- SECURITY INVOKER, empty search_path, STABLE (constant within a transaction).
-- Privileges: EXECUTE for authenticated only (RLS evaluates policy functions
-- with the caller's privileges). It is exposed by PostgREST as an RPC like any
-- public function; calling it is read-only and reveals nothing sensitive, and
-- its own path is deliberately NOT in the allowlist.
CREATE FUNCTION public.persona_write_rpc_context()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT COALESCE(
    current_setting('request.method', true) = 'POST'
    AND current_setting('request.path', true) = ANY (ARRAY[
      '/rpc/persona_create',
      '/rpc/persona_update_metadata',
      '/rpc/persona_update_profile_field',
      '/rpc/persona_upsert_section',
      '/rpc/persona_delete_section',
      '/rpc/persona_reorder_sections',
      '/rpc/persona_set_default',
      '/rpc/persona_set_lifecycle',
      '/rpc/persona_duplicate',
      '/rpc/persona_delete'
    ]),
    false
  );
$$;
REVOKE ALL ON FUNCTION public.persona_write_rpc_context() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.persona_write_rpc_context() TO authenticated;

-- 2. RLS enabled and forced ---------------------------------------------------
ALTER TABLE public.personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personas FORCE ROW LEVEL SECURITY;
ALTER TABLE public.persona_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.persona_sections FORCE ROW LEVEL SECURITY;
ALTER TABLE public.persona_profile_field_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.persona_profile_field_selections FORCE ROW LEVEL SECURITY;
ALTER TABLE public.persona_profile_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.persona_profile_overrides FORCE ROW LEVEL SECURITY;
ALTER TABLE public.persona_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.persona_revisions FORCE ROW LEVEL SECURITY;

-- 3. Remove default/inherited direct ACLs from these five tables only ---------
-- Keep the owner ACL; narrow authenticated grants are added in step 5.
DO $$
DECLARE
  grant_entry record;
BEGIN
  FOR grant_entry IN
    SELECT c.oid::regclass AS relation_name,
           CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
                ELSE pg_get_userbyid(acl.grantee) END AS grantee_name
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) AS acl
    WHERE n.nspname = 'public'
      AND c.relname IN ('personas','persona_sections',
        'persona_profile_field_selections','persona_profile_overrides',
        'persona_revisions')
      AND acl.grantee <> 0
      AND acl.grantee <> c.relowner
      AND pg_get_userbyid(acl.grantee) IS DISTINCT FROM 'authenticated'
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %s FROM %I',
      grant_entry.relation_name, grant_entry.grantee_name);
  END LOOP;
END;
$$;
REVOKE ALL PRIVILEGES ON TABLE public.personas,
  public.persona_sections, public.persona_profile_field_selections,
  public.persona_profile_overrides, public.persona_revisions FROM PUBLIC;
-- Revoking table privileges also revokes any column privileges (PostgreSQL).
REVOKE ALL PRIVILEGES ON TABLE public.personas,
  public.persona_sections, public.persona_profile_field_selections,
  public.persona_profile_overrides, public.persona_revisions
  FROM anon, service_role, authenticated;

-- 4. Policies -----------------------------------------------------------------
-- SELECT: owner only, no gate (reads are always allowed for the owner).
-- INSERT/UPDATE/DELETE: owner AND approved POST RPC request context. UPDATE and
-- DELETE have the gate in USING (so SELECT ... FOR UPDATE row locks, which
-- evaluate UPDATE USING, also require it); UPDATE repeats it in WITH CHECK.
-- Policies use (SELECT ...) wrappers so planner evaluates them once per
-- statement.

-- personas
CREATE POLICY personas_select_own ON public.personas
  FOR SELECT TO authenticated USING (account_id = (SELECT auth.uid()));
CREATE POLICY personas_insert_rpc_own ON public.personas
  FOR INSERT TO authenticated
  WITH CHECK (account_id = (SELECT auth.uid())
              AND (SELECT public.persona_write_rpc_context()));
CREATE POLICY personas_update_rpc_own ON public.personas
  FOR UPDATE TO authenticated
  USING (account_id = (SELECT auth.uid())
         AND (SELECT public.persona_write_rpc_context()))
  WITH CHECK (account_id = (SELECT auth.uid())
              AND (SELECT public.persona_write_rpc_context()));
CREATE POLICY personas_delete_rpc_own ON public.personas
  FOR DELETE TO authenticated
  USING (account_id = (SELECT auth.uid())
         AND (SELECT public.persona_write_rpc_context()));

-- persona_sections
CREATE POLICY persona_sections_select_own ON public.persona_sections
  FOR SELECT TO authenticated USING (account_id = (SELECT auth.uid()));
CREATE POLICY persona_sections_insert_rpc_own ON public.persona_sections
  FOR INSERT TO authenticated
  WITH CHECK (account_id = (SELECT auth.uid())
              AND (SELECT public.persona_write_rpc_context()));
CREATE POLICY persona_sections_update_rpc_own ON public.persona_sections
  FOR UPDATE TO authenticated
  USING (account_id = (SELECT auth.uid())
         AND (SELECT public.persona_write_rpc_context()))
  WITH CHECK (account_id = (SELECT auth.uid())
              AND (SELECT public.persona_write_rpc_context()));
CREATE POLICY persona_sections_delete_rpc_own ON public.persona_sections
  FOR DELETE TO authenticated
  USING (account_id = (SELECT auth.uid())
         AND (SELECT public.persona_write_rpc_context()));

-- persona_profile_field_selections (no DELETE policy: rows are never deleted by
-- an RPC; removal happens only through Persona-deletion cascade)
CREATE POLICY persona_profile_field_selections_select_own
  ON public.persona_profile_field_selections
  FOR SELECT TO authenticated USING (account_id = (SELECT auth.uid()));
CREATE POLICY persona_profile_field_selections_insert_rpc_own
  ON public.persona_profile_field_selections
  FOR INSERT TO authenticated
  WITH CHECK (account_id = (SELECT auth.uid())
              AND (SELECT public.persona_write_rpc_context()));
CREATE POLICY persona_profile_field_selections_update_rpc_own
  ON public.persona_profile_field_selections
  FOR UPDATE TO authenticated
  USING (account_id = (SELECT auth.uid())
         AND (SELECT public.persona_write_rpc_context()))
  WITH CHECK (account_id = (SELECT auth.uid())
              AND (SELECT public.persona_write_rpc_context()));

-- persona_profile_overrides
CREATE POLICY persona_profile_overrides_select_own
  ON public.persona_profile_overrides
  FOR SELECT TO authenticated USING (account_id = (SELECT auth.uid()));
CREATE POLICY persona_profile_overrides_insert_rpc_own
  ON public.persona_profile_overrides
  FOR INSERT TO authenticated
  WITH CHECK (account_id = (SELECT auth.uid())
              AND (SELECT public.persona_write_rpc_context()));
CREATE POLICY persona_profile_overrides_update_rpc_own
  ON public.persona_profile_overrides
  FOR UPDATE TO authenticated
  USING (account_id = (SELECT auth.uid())
         AND (SELECT public.persona_write_rpc_context()))
  WITH CHECK (account_id = (SELECT auth.uid())
              AND (SELECT public.persona_write_rpc_context()));
CREATE POLICY persona_profile_overrides_delete_rpc_own
  ON public.persona_profile_overrides
  FOR DELETE TO authenticated
  USING (account_id = (SELECT auth.uid())
         AND (SELECT public.persona_write_rpc_context()));

-- persona_revisions (append-only: SELECT and gated INSERT only; actor must be
-- the caller; no UPDATE/DELETE policy or privilege exists)
CREATE POLICY persona_revisions_select_own ON public.persona_revisions
  FOR SELECT TO authenticated USING (account_id = (SELECT auth.uid()));
CREATE POLICY persona_revisions_insert_rpc_own ON public.persona_revisions
  FOR INSERT TO authenticated
  WITH CHECK (account_id = (SELECT auth.uid())
              AND actor_id = (SELECT auth.uid())
              AND (SELECT public.persona_write_rpc_context()));

-- 5. Grants: SELECT table-wide (RLS limits rows); writes column-level ---------
-- Column lists exclude identity/ownership/audit columns that no RPC changes
-- after insert (id, account_id on UPDATE, created_at). INSERT lists omit
-- columns whose defaults must apply (status, is_default, visibility, version,
-- archived_at on personas; id and created_at everywhere).
GRANT SELECT ON TABLE public.personas, public.persona_sections,
  public.persona_profile_field_selections, public.persona_profile_overrides,
  public.persona_revisions TO authenticated;

GRANT INSERT (account_id, name, slug, description, audience, purpose, position)
  ON public.personas TO authenticated;
GRANT UPDATE (name, slug, description, audience, purpose, status, is_default,
              position, version, updated_at, archived_at)
  ON public.personas TO authenticated;
GRANT DELETE ON public.personas TO authenticated;

GRANT INSERT (persona_id, account_id, section_key, label_override, is_visible, position)
  ON public.persona_sections TO authenticated;
GRANT UPDATE (label_override, is_visible, position, updated_at)
  ON public.persona_sections TO authenticated;
GRANT DELETE ON public.persona_sections TO authenticated;

GRANT INSERT (persona_id, account_id, field_key, is_included, position, is_highlighted)
  ON public.persona_profile_field_selections TO authenticated;
GRANT UPDATE (is_included, position, is_highlighted, updated_at)
  ON public.persona_profile_field_selections TO authenticated;

GRANT INSERT (persona_id, account_id, field_key, override_value)
  ON public.persona_profile_overrides TO authenticated;
GRANT UPDATE (override_value, override_version, updated_at)
  ON public.persona_profile_overrides TO authenticated;
GRANT DELETE ON public.persona_profile_overrides TO authenticated;

GRANT INSERT (persona_id, account_id, actor_id, revision_number, event_type,
              configuration_payload)
  ON public.persona_revisions TO authenticated;

COMMIT;

-- Post-execution verification SQL (read-only):
-- (a) RLS flags, table-level ACL flags and PUBLIC/anon/service_role exposure.
SELECT c.relname AS table_name, pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
       has_table_privilege('authenticated',c.oid,'SELECT') AS auth_select,
       has_table_privilege('authenticated',c.oid,'INSERT') AS auth_table_insert,
       has_table_privilege('authenticated',c.oid,'UPDATE') AS auth_table_update,
       has_table_privilege('authenticated',c.oid,'DELETE') AS auth_delete,
       has_any_column_privilege('anon',c.oid,'SELECT,INSERT,UPDATE') AS anon_any,
       has_any_column_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE') AS service_any,
       has_table_privilege('service_role',c.oid,'DELETE') AS service_delete,
       EXISTS (SELECT 1 FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
               WHERE a.grantee=0) AS has_public_acl
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('personas','persona_sections',
 'persona_profile_field_selections','persona_profile_overrides','persona_revisions')
ORDER BY c.relname;
-- (b) Column-level privileges held by authenticated.
SELECT c.relname AS table_name, a.attname AS column_name,
       string_agg(acl.privilege_type, ',' ORDER BY acl.privilege_type) AS privileges
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(a.attacl) acl
WHERE n.nspname='public' AND a.attnum > 0 AND NOT a.attisdropped
  AND c.relname IN ('personas','persona_sections',
    'persona_profile_field_selections','persona_profile_overrides','persona_revisions')
  AND acl.grantee = (SELECT oid FROM pg_roles WHERE rolname='authenticated')
GROUP BY c.relname, a.attname ORDER BY c.relname, a.attnum;
-- (c) Policies (exact set and predicates).
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname='public' AND tablename IN ('personas',
 'persona_sections','persona_profile_field_selections','persona_profile_overrides',
 'persona_revisions') ORDER BY tablename,policyname;
-- (d) Helper definition and ACL.
SELECT p.proname, p.prosecdef AS security_definer, p.provolatile, p.proconfig,
       p.proacl, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='persona_write_rpc_context';

-- Expected: all five tables have RLS enabled/forced; table-level INSERT/UPDATE
-- flags are false (privileges are column-level); authenticated has table-level
-- DELETE on personas, persona_sections and persona_profile_overrides only;
-- anon_any, service_any, service_delete and has_public_acl are false. Exactly 17
-- policies: personas 4, persona_sections 4, persona_profile_field_selections 3
-- (no DELETE), persona_profile_overrides 4, persona_revisions 2 (SELECT, INSERT).
-- The helper is SECURITY INVOKER (prosecdef=false) with search_path='' and EXECUTE
-- only for postgres/authenticated. postgres bypasses RLS, so this catalog result
-- does not establish runtime isolation or the gate; verified only after the
-- separately approved JWT/PostgREST tests in the test plan pass.
--
-- Rollback limitation: removing policies/grants leaves private tables present
-- and inaccessible to authenticated. It does not restore prior default ACLs.
-- Use only after review; do not disable RLS. Drop file-005 functions first.
-- BEGIN;
-- DROP POLICY personas_select_own ON public.personas;
-- DROP POLICY personas_insert_rpc_own ON public.personas;
-- DROP POLICY personas_update_rpc_own ON public.personas;
-- DROP POLICY personas_delete_rpc_own ON public.personas;
-- (Drop each named policy on the other tables in the same manner.)
-- REVOKE ALL PRIVILEGES ON TABLE public.personas, public.persona_sections,
--   public.persona_profile_field_selections, public.persona_profile_overrides,
--   public.persona_revisions FROM authenticated;
-- DROP FUNCTION public.persona_write_rpc_context();
-- COMMIT;
