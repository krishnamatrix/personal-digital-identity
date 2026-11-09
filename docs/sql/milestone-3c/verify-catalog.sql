-- M3C — read-only catalog verification for 001-003.
--
-- STATUS: PROPOSAL. Read-only: every statement is a SELECT. Run in the Supabase
-- SQL Editor after executing 001-003 (the editor shows only the LAST result set,
-- so run one numbered section at a time). The `postgres` role bypasses RLS, so
-- NOTHING in this file shows runtime isolation, the request-path gate, version
-- conflicts, atomicity or unauthorized-write rejection. Those require the hosted
-- two-user tests (tests/hosted/persona-persistence.hosted.ts), which need an
-- explicit stage approval. Catalog evidence and runtime evidence are different.

-- 1. Tables: owner, RLS enabled AND forced, and privileges per API role.
--    Expected: owner postgres; rls_enabled and rls_forced true; anon_any,
--    service_any, public_acl all false; auth_table_insert/update false
--    (privileges are column-level); auth_delete true only for personas and
--    persona_profile_overrides.
SELECT c.relname AS table_name, pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_select,
       has_table_privilege('authenticated', c.oid, 'INSERT') AS auth_table_insert,
       has_table_privilege('authenticated', c.oid, 'UPDATE') AS auth_table_update,
       has_table_privilege('authenticated', c.oid, 'DELETE') AS auth_delete,
       has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES') AS anon_any,
       has_table_privilege('anon', c.oid, 'DELETE') AS anon_delete,
       has_any_column_privilege('service_role', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES') AS service_any,
       has_table_privilege('service_role', c.oid, 'DELETE') AS service_delete,
       EXISTS (SELECT 1 FROM aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) AS a
               WHERE a.grantee = 0) AS public_acl
FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('personas', 'persona_sections',
  'persona_profile_field_selections', 'persona_profile_overrides', 'persona_revisions')
ORDER BY c.relname;

-- 2. Policies. Expected exactly 16, all TO authenticated: personas 4,
--    persona_sections 3, persona_profile_field_selections 3,
--    persona_profile_overrides 4, persona_revisions 2. Every INSERT/UPDATE/DELETE
--    predicate contains persona_write_rpc_context(); SELECT predicates do not.
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename LIKE 'persona%'
ORDER BY tablename, cmd, policyname;

-- 3. Column-level privileges held by authenticated (and none for anon/service_role).
--    Expected: INSERT columns listed in 002 only; no id/created_at on UPDATE;
--    personas.position not updatable; persona_revisions has no UPDATE column.
SELECT c.relname AS table_name, a.attname AS column_name,
       string_agg(acl.privilege_type, ',' ORDER BY acl.privilege_type) AS privileges
FROM pg_attribute AS a
JOIN pg_class AS c ON c.oid = a.attrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(a.attacl) AS acl
WHERE n.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped
  AND c.relname LIKE 'persona%'
  AND acl.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')
GROUP BY c.relname, a.attname, a.attnum ORDER BY c.relname, a.attnum;

-- 4. Functions. Expected ELEVEN rows: nine mutations, persona_write_rpc_context
--    and the read-only persona_detail_json. security_definer false everywhere;
--    proconfig {search_path=""}; owner postgres; every function VOLATILE ('v')
--    except the gate helper STABLE ('s'); return_type jsonb for the eight
--    state-returning mutations and persona_detail_json, uuid for persona_delete,
--    boolean for the helper; authenticated_exec true; anon_exec,
--    service_role_exec and public_exec false.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prorettype::regtype AS return_type,
       p.prosecdef AS security_definer, p.provolatile, p.proconfig,
       pg_get_userbyid(p.proowner) AS owner,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_exec,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_exec,
       EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS a
               WHERE a.grantee = 0) AS public_exec
FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'persona\_%'
ORDER BY p.proname;

-- 4b. Stale-version SQLSTATE (after 004). A request that fails with SQLSTATE 40001
--     never returns through PostgREST/Supabase, so no Persona function may raise it.
--     Expected: ZERO rows from the first query; exactly SEVEN rows from the second
--     (the functions that check an expected version).
SELECT p.proname FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'persona\\_%' AND p.prosrc LIKE '%40001%';
SELECT p.proname FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'persona\\_%' AND p.prosrc LIKE '%PT409%'
ORDER BY p.proname;

-- 5. Gate allowlist equals the nine deployed mutation functions (the gate helper
--    and the read-only persona_detail_json are deliberately not on it). Expected:
--    one row, `matches` true, both arrays identical.
WITH gate AS (
  SELECT array_agg(m[1] ORDER BY m[1]) AS paths
  FROM regexp_matches(
         pg_get_functiondef('public.persona_write_rpc_context()'::regprocedure),
         '/rpc/(persona_[a-z_]+)', 'g') AS m),
fns AS (
  SELECT array_agg(p.proname::text ORDER BY p.proname) AS names
  FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname LIKE 'persona\_%'
    AND p.proname NOT IN ('persona_write_rpc_context', 'persona_detail_json'))
SELECT gate.paths, fns.names, gate.paths = fns.names AS matches FROM gate, fns;

-- 5b. No Persona function references Master Identity profile data, and the only
--     writer of public.accounts is the create RPC (its own-anchor insert).
--     Expected: ZERO rows from the first query; exactly ONE row from the second
--     (persona_create_with_configuration).
SELECT p.proname FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'persona\_%'
  AND p.prosrc ILIKE '%identity_profiles%';
SELECT p.proname FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'persona\_%'
  AND p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+public\.accounts';

-- 6. Other exposure paths (informational; review each result).
--    6a. Realtime: expected ZERO rows (no Persona table is published).
SELECT pubname, schemaname, tablename FROM pg_publication_tables
WHERE schemaname = 'public' AND tablename LIKE 'persona%';
--    6b. GraphQL: is pg_graphql installed? If it is, the Persona tables are
--        reflected for authenticated (SELECT privilege) and GraphQL mutation
--        fields exist; writes through /graphql/v1 arrive with request.path
--        '/rpc/graphql', which is not allowlisted, so the gate must reject them.
--        That is a RUNTIME property: the hosted tests verify it. Do not report it
--        as passed from this query.
SELECT extname, extversion FROM pg_extension WHERE extname IN ('pg_graphql', 'pg_net');
--    6c. Default privileges that would apply to FUTURE objects in public.
SELECT pg_get_userbyid(d.defaclrole) AS role, d.defaclobjtype AS objtype, d.defaclacl
FROM pg_default_acl AS d
WHERE d.defaclnamespace = 'public'::regnamespace OR d.defaclnamespace = 0;

-- 7. Diagnostic cleanup: expected zero rows from both.
SELECT p.proname FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'zz\_diag\_m3a\_%';
SELECT relname FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname LIKE 'zz\_diag\_m3a\_%';

-- 8. DATA INTEGRITY (run after hosted tests have created data). Each query must
--    return ZERO rows.
--    8a. Revision/version consistency: every Persona has exactly `version`
--        revisions, numbered 1..version with no gaps.
SELECT p.id, p.version, count(r.*) AS revisions, max(r.revision_number) AS max_revision
FROM public.personas AS p LEFT JOIN public.persona_revisions AS r ON r.persona_id = p.id
GROUP BY p.id, p.version
HAVING count(r.*) <> p.version OR max(r.revision_number) IS DISTINCT FROM p.version::bigint
    OR count(DISTINCT r.revision_number) <> count(r.*);
--    8b. At most one active default per account.
SELECT account_id, count(*) FROM public.personas
WHERE is_default AND status = 'active' GROUP BY account_id HAVING count(*) > 1;
--    8c. Archived Personas are never default.
SELECT id FROM public.personas WHERE status = 'archived' AND is_default;
--    8d. Every Persona has exactly seven selection rows (create and duplicate
--        always write all seven).
SELECT p.id, count(s.*) AS selections FROM public.personas AS p
LEFT JOIN public.persona_profile_field_selections AS s ON s.persona_id = p.id
GROUP BY p.id HAVING count(s.*) <> 7;
--    8e. Child rows never carry a different owner than their Persona (the
--        composite foreign keys already guarantee this; this is a cross-check).
SELECT 'section' AS kind, s.id::text FROM public.persona_sections AS s
JOIN public.personas AS p ON p.id = s.persona_id WHERE p.account_id <> s.account_id
UNION ALL
SELECT 'revision', r.id::text FROM public.persona_revisions AS r
JOIN public.personas AS p ON p.id = r.persona_id WHERE p.account_id <> r.account_id;
--    8f. No orphaned child rows (the composite foreign keys with ON DELETE CASCADE
--        make this impossible; permanent deletion purges only the deleted
--        Persona's own configuration and revisions).
SELECT 'section' AS kind, count(*) FROM public.persona_sections s
  WHERE NOT EXISTS (SELECT 1 FROM public.personas p WHERE p.id = s.persona_id)
UNION ALL
SELECT 'selection', count(*) FROM public.persona_profile_field_selections s
  WHERE NOT EXISTS (SELECT 1 FROM public.personas p WHERE p.id = s.persona_id)
UNION ALL
SELECT 'override', count(*) FROM public.persona_profile_overrides s
  WHERE NOT EXISTS (SELECT 1 FROM public.personas p WHERE p.id = s.persona_id)
UNION ALL
SELECT 'revision', count(*) FROM public.persona_revisions s
  WHERE NOT EXISTS (SELECT 1 FROM public.personas p WHERE p.id = s.persona_id);
--    (each count must be 0)
