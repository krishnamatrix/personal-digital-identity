-- Purpose: enable and FORCE RLS on all proposed Persona tables, install
-- command-specific auth.uid() owner policies, and grant only the operations
-- needed by SECURITY INVOKER mutation RPCs. Direct REST writes are path-gated;
-- revisions are append-only through those RPC paths.
-- Prerequisites: files 001-003 executed and verified; current session_user and
-- current_user are postgres; Supabase anon/authenticated/service_role exist;
-- authenticated has USAGE on public and EXECUTE on auth.uid(); no Persona
-- policies exist. Review live ACL/default grants before continuing.
-- Execution order: 4 of 4 Milestone 3A SQL files; final prerequisite to later
-- implementation, not proof that runtime RLS works.
-- Repeatability: one-time; preflight fails closed if any policy exists.
-- Expected outcome: authenticated can manage own configuration only; can read
-- own revisions; no anon/PUBLIC/service_role/other role access is granted.

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
          'persona_revisions')) AS no_existing_persona_policies;

BEGIN;

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

-- Remove default/inherited direct ACLs only from these five newly proposed
-- tables. Keep the owner ACL; then add the narrow authenticated grants below.
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
REVOKE ALL PRIVILEGES ON TABLE public.personas,
  public.persona_sections, public.persona_profile_field_selections,
  public.persona_profile_overrides, public.persona_revisions
  FROM anon, service_role, authenticated;

CREATE POLICY personas_select_own ON public.personas
  FOR SELECT TO authenticated USING (account_id = (SELECT auth.uid()));
CREATE POLICY personas_insert_own ON public.personas
  FOR INSERT TO authenticated WITH CHECK (account_id = (SELECT auth.uid()));
CREATE POLICY personas_update_own ON public.personas
  FOR UPDATE TO authenticated USING (account_id = (SELECT auth.uid()))
  WITH CHECK (account_id = (SELECT auth.uid()));
CREATE POLICY personas_delete_own ON public.personas
  FOR DELETE TO authenticated USING (account_id = (SELECT auth.uid()));

CREATE POLICY persona_sections_select_own ON public.persona_sections
  FOR SELECT TO authenticated USING (account_id = (SELECT auth.uid()));
CREATE POLICY persona_sections_insert_own ON public.persona_sections
  FOR INSERT TO authenticated WITH CHECK (account_id = (SELECT auth.uid()));
CREATE POLICY persona_sections_update_own ON public.persona_sections
  FOR UPDATE TO authenticated USING (account_id = (SELECT auth.uid()))
  WITH CHECK (account_id = (SELECT auth.uid()));
CREATE POLICY persona_sections_delete_own ON public.persona_sections
  FOR DELETE TO authenticated USING (account_id = (SELECT auth.uid()));

CREATE POLICY persona_profile_field_selections_select_own
  ON public.persona_profile_field_selections FOR SELECT TO authenticated
  USING (account_id = (SELECT auth.uid()));
CREATE POLICY persona_profile_field_selections_insert_own
  ON public.persona_profile_field_selections FOR INSERT TO authenticated
  WITH CHECK (account_id = (SELECT auth.uid()));
CREATE POLICY persona_profile_field_selections_update_own
  ON public.persona_profile_field_selections FOR UPDATE TO authenticated
  USING (account_id = (SELECT auth.uid()))
  WITH CHECK (account_id = (SELECT auth.uid()));
CREATE POLICY persona_profile_field_selections_delete_own
  ON public.persona_profile_field_selections FOR DELETE TO authenticated
  USING (account_id = (SELECT auth.uid()));

CREATE POLICY persona_profile_overrides_select_own
  ON public.persona_profile_overrides FOR SELECT TO authenticated
  USING (account_id = (SELECT auth.uid()));
CREATE POLICY persona_profile_overrides_insert_own
  ON public.persona_profile_overrides FOR INSERT TO authenticated
  WITH CHECK (account_id = (SELECT auth.uid()));
CREATE POLICY persona_profile_overrides_update_own
  ON public.persona_profile_overrides FOR UPDATE TO authenticated
  USING (account_id = (SELECT auth.uid()))
  WITH CHECK (account_id = (SELECT auth.uid()));
CREATE POLICY persona_profile_overrides_delete_own
  ON public.persona_profile_overrides FOR DELETE TO authenticated
  USING (account_id = (SELECT auth.uid()));

CREATE POLICY persona_revisions_select_own ON public.persona_revisions
  FOR SELECT TO authenticated USING (account_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.personas,
  public.persona_sections, public.persona_profile_field_selections,
  public.persona_profile_overrides TO authenticated;
GRANT SELECT ON TABLE public.persona_revisions TO authenticated;

COMMIT;

-- Post-execution verification SQL (read-only):
SELECT c.relname AS table_name, pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
       has_table_privilege('authenticated',c.oid,'SELECT') AS auth_select,
       has_table_privilege('authenticated',c.oid,'INSERT') AS auth_insert,
       has_table_privilege('authenticated',c.oid,'UPDATE') AS auth_update,
       has_table_privilege('authenticated',c.oid,'DELETE') AS auth_delete,
       has_table_privilege('anon',c.oid,'SELECT') AS anon_select,
       has_table_privilege('service_role',c.oid,'SELECT') AS service_select,
       EXISTS (SELECT 1 FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
               WHERE a.grantee=0) AS has_public_acl
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('personas','persona_sections',
 'persona_profile_field_selections','persona_profile_overrides','persona_revisions')
ORDER BY c.relname;
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname='public' AND tablename IN ('personas',
 'persona_sections','persona_profile_field_selections','persona_profile_overrides',
 'persona_revisions') ORDER BY tablename,policyname;

-- Expected: all five tables have RLS enabled/forced; authenticated has CRUD on
-- first four and SELECT-only on revisions; anon/service_role/PUBLIC have no
-- direct ACL; exact owner-only policies exist. postgres bypasses RLS, so this
-- catalog result does not establish runtime isolation. Do not mark verified
-- until separately approved JWT/PostgREST tests pass.
--
-- Rollback limitation: removing policies/grants leaves private tables present
-- and inaccessible to authenticated. It does not restore prior default ACLs.
-- Use only after review; do not disable RLS:
-- BEGIN;
-- DROP POLICY personas_select_own ON public.personas;
-- DROP POLICY personas_insert_own ON public.personas;
-- DROP POLICY personas_update_own ON public.personas;
-- DROP POLICY personas_delete_own ON public.personas;
-- (Drop each named policy on the other tables in the same manner.)
-- REVOKE ALL PRIVILEGES ON TABLE public.personas, public.persona_sections,
--   public.persona_profile_field_selections, public.persona_profile_overrides,
--   public.persona_revisions FROM authenticated;
-- COMMIT;
