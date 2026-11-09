-- Create the canonical application schema `folioone`.
--
-- Single transaction. Preflight (enforced) -> CREATE SCHEMA -> grants -> asserted outcome.
-- The only privilege granted on the schema is USAGE to `authenticated`: anonymous
-- requests cannot even resolve objects in it. No default privileges are defined,
-- so nothing created later in this schema is granted to any API role implicitly.
--
-- Touches only: the new schema `folioone`. Existing `public` objects, `auth`
-- data and every existing Auth user are not read or changed.

BEGIN;

DO $$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Run this file as postgres (Supabase SQL Editor); current_user is %', current_user;
  END IF;
  IF to_regnamespace('folioone') IS NOT NULL THEN
    RAISE EXCEPTION 'Schema folioone already exists. This one-time script refuses to continue; nothing was changed.';
  END IF;
  IF to_regnamespace('auth') IS NULL THEN
    RAISE EXCEPTION 'Supabase auth schema is missing; this is not a Supabase project';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r(name)
             WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r.name)) THEN
    RAISE EXCEPTION 'Supabase roles anon, authenticated and service_role must exist';
  END IF;
  IF NOT has_function_privilege('authenticated', 'auth.uid()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must be able to execute auth.uid()';
  END IF;
END
$$;

CREATE SCHEMA folioone AUTHORIZATION postgres;
COMMENT ON SCHEMA folioone IS
  'Folioone application data. Canonical schema name for every environment; the Supabase project selects the environment.';

REVOKE ALL ON SCHEMA folioone FROM PUBLIC;
GRANT USAGE ON SCHEMA folioone TO authenticated;

DO $$
DECLARE
  v_owner text;
BEGIN
  SELECT pg_get_userbyid(n.nspowner) INTO v_owner FROM pg_namespace AS n WHERE n.nspname = 'folioone';
  IF v_owner IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'folioone must be owned by postgres, found %', v_owner;
  END IF;
  IF NOT has_schema_privilege('authenticated', 'folioone', 'USAGE') THEN
    RAISE EXCEPTION 'authenticated must have USAGE on folioone';
  END IF;
  IF has_schema_privilege('authenticated', 'folioone', 'CREATE')
     OR has_schema_privilege('anon', 'folioone', 'USAGE')
     OR has_schema_privilege('anon', 'folioone', 'CREATE')
     OR has_schema_privilege('service_role', 'folioone', 'USAGE')
     OR EXISTS (SELECT 1 FROM pg_namespace AS n, aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) AS a
                WHERE n.nspname = 'folioone' AND a.grantee = 0) THEN
    RAISE EXCEPTION 'folioone must grant USAGE to authenticated only';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_default_acl AS d WHERE d.defaclnamespace = 'folioone'::regnamespace) THEN
    RAISE EXCEPTION 'No default privileges may exist in folioone';
  END IF;
END
$$;

COMMIT;
