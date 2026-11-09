
-- ===========================================================================
-- FOLIOONE-SCHEMA ADDENDUM (sections 9-11). Added by the schema package; these
-- are not in the original milestone-3c verification file. Read-only.
-- ===========================================================================

-- 9. The schema itself.
--    Expected: owner postgres; authenticated has USAGE; anon, service_role and
--    PUBLIC do not; no CREATE for anyone but the owner; zero default ACLs.
SELECT n.nspname, pg_get_userbyid(n.nspowner) AS owner,
       has_schema_privilege('authenticated', n.oid, 'USAGE')  AS authenticated_usage,
       has_schema_privilege('authenticated', n.oid, 'CREATE') AS authenticated_create,
       has_schema_privilege('anon', n.oid, 'USAGE')           AS anon_usage,
       has_schema_privilege('service_role', n.oid, 'USAGE')   AS service_role_usage,
       EXISTS (SELECT 1 FROM aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) AS a
               WHERE a.grantee = 0)                           AS public_acl,
       (SELECT count(*) FROM pg_default_acl AS d WHERE d.defaclnamespace = n.oid) AS default_acls
FROM pg_namespace AS n WHERE n.nspname = 'folioone';

-- 10. Inventory of the schema. Expected: tables = 7 (accounts, identity_profiles,
--     personas, persona_sections, persona_profile_field_selections,
--     persona_profile_overrides, persona_revisions); functions = 11; no views,
--     sequences or other relation kinds.
SELECT 'tables' AS kind, count(*) FROM pg_class AS c
  WHERE c.relnamespace = 'folioone'::regnamespace AND c.relkind = 'r'
UNION ALL SELECT 'functions', count(*) FROM pg_proc AS p WHERE p.pronamespace = 'folioone'::regnamespace
UNION ALL SELECT 'views/sequences/other', count(*) FROM pg_class AS c
  WHERE c.relnamespace = 'folioone'::regnamespace AND c.relkind NOT IN ('r', 'i');

-- 11. No dependency of folioone on `public` and no unsafe function configuration.
--     11a. Foreign keys leaving the schema. Expected: exactly ONE row,
--          accounts -> auth.users. Any reference into public is a defect.
SELECT con.conname, con.conrelid::regclass AS from_table, rn.nspname AS target_schema, rc.relname AS target_table
FROM pg_constraint AS con
JOIN pg_class AS rc ON rc.oid = con.confrelid
JOIN pg_namespace AS rn ON rn.oid = rc.relnamespace
WHERE con.contype = 'f' AND con.connamespace = 'folioone'::regnamespace AND rn.nspname <> 'folioone';
--     11b. Function bodies or policy expressions that mention `public.`. Expected: ZERO rows.
SELECT 'function' AS kind, p.proname::text AS name FROM pg_proc AS p
WHERE p.pronamespace = 'folioone'::regnamespace AND p.prosrc ~* '\mpublic\.'
UNION ALL
SELECT 'policy', p.tablename || '.' || p.policyname FROM pg_policies AS p
WHERE p.schemaname = 'folioone' AND (p.qual ~* '\mpublic\.' OR p.with_check ~* '\mpublic\.');
--     11c. Every function: SECURITY INVOKER and an EMPTY search_path.
--          Expected: all 11 rows show security_definer = false and search_path_empty = true.
SELECT p.proname::text AS name, p.prosecdef AS security_definer,
       COALESCE(p.proconfig @> ARRAY['search_path=""'], false) AS search_path_empty
FROM pg_proc AS p WHERE p.pronamespace = 'folioone'::regnamespace ORDER BY p.proname;
