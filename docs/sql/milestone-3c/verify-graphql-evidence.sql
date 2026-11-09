-- Folioone M3E: GraphQL CATALOG evidence (read-only). NOT EXECUTED by the assistant.
-- Run manually in the development Supabase SQL Editor and send back every result.
--
-- Sections G1 and G2 are the existing verify-catalog.sql sections 6b and 6c,
-- copied VERBATIM. What they verify:
--   6b  whether pg_graphql (and pg_net) are installed. It does NOT test any
--       privilege, and by design is not a pass/fail on its own.
--   6c  default privileges that would apply to FUTURE objects created in public
--       (and globally). It says nothing about existing objects.
-- Sections G3 and G4 are SUPPLEMENTARY (drafted for M3E, read-only catalog
-- lookups only; no function is called and nothing is changed): they show whether
-- the GraphQL entry-point function and schemas exist, and whether the API roles
-- could execute it. Review before running.
--
-- EXPECTED (current runtime evidence: the endpoint answers "pg_graphql extension
-- is not enabled." for anon and authenticated):
--   G1  zero rows for pg_graphql. (pg_net may or may not appear; it is not GraphQL.)
--   G2  review each row; any default ACL granting anon/authenticated on tables or
--       functions in public is exposure for future objects: report it, do not
--       change it here.
--   G3  graphql / graphql_public schemas may exist (Supabase creates them) even when
--       the extension is off.
--   G4  if graphql_public.graphql exists, record whether anon/authenticated can
--       execute it. With the extension off it cannot serve a schema, but record the
--       result: it is the exposure that would apply if the extension is enabled.

-- G1. (= verify-catalog.sql 6b, verbatim)
SELECT extname, extversion FROM pg_extension WHERE extname IN ('pg_graphql', 'pg_net');

-- G2. (= verify-catalog.sql 6c, verbatim)
SELECT pg_get_userbyid(d.defaclrole) AS role, d.defaclobjtype AS objtype, d.defaclacl
FROM pg_default_acl AS d
WHERE d.defaclnamespace = 'public'::regnamespace OR d.defaclnamespace = 0;

-- G3. SUPPLEMENTARY: GraphQL-related schemas present.
SELECT nspname FROM pg_namespace WHERE nspname IN ('graphql', 'graphql_public');

-- G4. SUPPLEMENTARY: who could execute the GraphQL entry point.
SELECT p.oid::regprocedure AS function,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute
FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'graphql_public' AND p.proname = 'graphql';
