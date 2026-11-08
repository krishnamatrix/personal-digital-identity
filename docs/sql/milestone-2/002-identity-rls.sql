-- Purpose: permit only authenticated Supabase users to read their own account
-- and create/read/update their own private identity profile. All ownership
-- checks use auth.uid() from the JWT Supabase forwards to PostgreSQL.
-- Prerequisites: 001-identity-tables.sql was manually executed and verified;
-- this SQL Editor session is postgres (the owner); Supabase anon,
-- authenticated, and service_role roles exist; authenticated has USAGE on
-- public and auth and EXECUTE on auth.uid(); no policies already exist on the
-- two tables. The preflight checks these conditions.
-- Execution order: second Identity and Access DDL file, after 001.
-- Repeatability: one-time. Stop if policies exist; review actual catalog state
-- before any repair. Do not use CREATE OR REPLACE or weaken a predicate.
-- Expected outcome: RLS remains enabled/forced; authenticated receives only
-- account SELECT/INSERT and profile SELECT/INSERT/UPDATE; anon, service_role,
-- and PUBLIC receive no table privileges. postgres retains owner/BYPASSRLS
-- capabilities; those are never used by application runtime.

-- Read-only preflight; every result must be true before continuing.
SELECT session_user = 'postgres' AS expected_session_role,
       current_user = 'postgres' AS expected_execution_role,
       to_regclass('public.accounts') IS NOT NULL AS accounts_present,
       to_regclass('public.identity_profiles') IS NOT NULL AS profiles_present,
       has_schema_privilege('authenticated', 'public', 'USAGE')
         AS authenticated_public_usage,
       has_schema_privilege('authenticated', 'auth', 'USAGE')
         AS authenticated_auth_usage,
       has_function_privilege('authenticated', 'auth.uid()', 'EXECUTE')
         AS authenticated_can_execute_auth_uid,
       (SELECT bool_and(c.relrowsecurity AND c.relforcerowsecurity)
        FROM pg_class AS c
        WHERE c.oid IN ('public.accounts'::regclass,
                        'public.identity_profiles'::regclass))
         AS both_tables_rls_forced,
       NOT EXISTS (
         SELECT 1 FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename IN ('accounts', 'identity_profiles')
       ) AS no_existing_policies,
       (SELECT count(*) = 3
        FROM pg_roles
        WHERE rolname IN ('anon', 'authenticated', 'service_role'))
         AS expected_supabase_roles_present;

BEGIN;

-- postgres default ACLs in the inspected project grant several Supabase roles
-- access to new public tables. Remove every non-owner ACL entry except the
-- intended authenticated role, then explicitly revoke PUBLIC.
DO $$
DECLARE
  grant_entry record;
BEGIN
  FOR grant_entry IN
    SELECT c.oid::regclass AS relation_name,
           pg_get_userbyid(acl.grantee) AS grantee_name
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) AS acl
    WHERE n.nspname = 'public'
      AND c.relname IN ('accounts', 'identity_profiles')
      AND acl.grantee <> 0
      AND acl.grantee <> c.relowner
      AND pg_get_userbyid(acl.grantee) <> 'authenticated'
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE %s FROM %I',
      grant_entry.relation_name,
      grant_entry.grantee_name
    );
  END LOOP;
END;
$$;

REVOKE ALL PRIVILEGES ON TABLE public.accounts FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.identity_profiles FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.accounts FROM anon, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.identity_profiles FROM anon, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.accounts FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.identity_profiles FROM authenticated;

CREATE POLICY accounts_select_own
  ON public.accounts FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));
CREATE POLICY accounts_insert_own
  ON public.accounts FOR INSERT TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY identity_profiles_select_own
  ON public.identity_profiles FOR SELECT TO authenticated
  USING (account_id = (SELECT auth.uid()));
CREATE POLICY identity_profiles_insert_own
  ON public.identity_profiles FOR INSERT TO authenticated
  WITH CHECK (account_id = (SELECT auth.uid()));
CREATE POLICY identity_profiles_update_own
  ON public.identity_profiles FOR UPDATE TO authenticated
  USING (account_id = (SELECT auth.uid()))
  WITH CHECK (account_id = (SELECT auth.uid()));

GRANT SELECT, INSERT ON TABLE public.accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.identity_profiles TO authenticated;

COMMIT;

-- Post-execution verification SQL (read-only):
SELECT c.relname AS table_name,
       pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_select,
       has_table_privilege('authenticated', c.oid, 'INSERT') AS auth_insert,
       has_table_privilege('authenticated', c.oid, 'UPDATE') AS auth_update,
       has_table_privilege('authenticated', c.oid, 'DELETE') AS auth_delete,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
       has_table_privilege('service_role', c.oid, 'SELECT') AS service_role_select,
       EXISTS (
         SELECT 1
         FROM aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) AS acl
         WHERE acl.grantee = 0
           AND acl.privilege_type = 'SELECT'
       ) AS public_select
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('accounts', 'identity_profiles')
ORDER BY c.relname;

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('accounts', 'identity_profiles')
ORDER BY tablename, policyname;

-- Enumerate every effective table ACL entry (including owner and unexpected
-- Supabase roles) for developer review:
SELECT c.relname AS table_name,
       CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
            ELSE pg_get_userbyid(acl.grantee)
       END AS grantee,
       acl.privilege_type,
       acl.is_grantable
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) AS acl
WHERE n.nspname = 'public'
  AND c.relname IN ('accounts', 'identity_profiles')
ORDER BY table_name, grantee, privilege_type;

-- Expected: owner postgres, RLS enabled/forced, no anon/service_role/PUBLIC
-- table privileges; authenticated gets accounts SELECT+INSERT only and profile
-- SELECT+INSERT+UPDATE only. Policies target authenticated and use auth.uid().
-- postgres has BYPASSRLS, so none of these checks demonstrate row isolation.

-- Rollback limitation: this keeps RLS enabled/forced and removes the app grants,
-- leaving the tables inaccessible to authenticated users. It does not delete
-- account/profile data. Dropping policies never disables RLS.
-- BEGIN;
-- DROP POLICY accounts_select_own ON public.accounts;
-- DROP POLICY accounts_insert_own ON public.accounts;
-- DROP POLICY identity_profiles_select_own ON public.identity_profiles;
-- DROP POLICY identity_profiles_insert_own ON public.identity_profiles;
-- DROP POLICY identity_profiles_update_own ON public.identity_profiles;
-- REVOKE ALL PRIVILEGES ON TABLE public.accounts FROM authenticated;
-- REVOKE ALL PRIVILEGES ON TABLE public.identity_profiles FROM authenticated;
-- COMMIT;
