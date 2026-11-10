-- ============================================================================
-- Folioone M4  |  001-identity-profile-expansion.sql  |  schema: folioone
-- Master Identity foundation: extra profile columns, onboarding state, and one
-- generic, owner-only list table (identity_entries) for employment, education,
-- skills, projects, social links and the "Additional" items.
--
-- STATUS:        PREPARED - NOT EXECUTED on any hosted project. Reviewed and run
--                manually by the developer in the Supabase SQL Editor (as postgres).
--                `pnpm validate` applies it to the LOCAL stack only.
-- Prerequisites: docs/sql/folioone-schema 001-006 executed (folioone.accounts and
--                folioone.identity_profiles exist with RLS from 003).
-- Repeatable?:   ONE-TIME. The preflight must show every column `true`; a second run
--                fails inside the transaction (ADD COLUMN / CREATE TABLE) and rolls back.
-- Safety:        Touches only schema folioone. Does not read or modify schema public or
--                auth.users data. No roles, no SECURITY DEFINER, no functions, no
--                weakening of existing RLS. Existing rows keep their values; new profile
--                columns are NULL (onboarding_step defaults to 1).
-- Design:        * Biography = existing identity_profiles.summary (no duplicate field).
--                * Personal website = existing website_url. linkedin_url / github_url stay
--                  (Persona selections reference them); the app mirrors the first LinkedIn
--                  and GitHub social link into them.
--                * identity_entries.data is a JSON object validated by the application
--                  (Zod, per kind); the database enforces kind, ownership, shape and size.
--                  A new list-type section needs only a new kind value in the CHECK below.
-- ============================================================================

-- Read-only preflight; every result must be true before continuing.
SELECT current_database() = 'postgres' AS expected_database,
       session_user = 'postgres' AS expected_session_role,
       to_regclass('folioone.identity_profiles') IS NOT NULL AS profiles_present,
       to_regclass('folioone.accounts') IS NOT NULL AS accounts_present,
       to_regclass('folioone.identity_entries') IS NULL AS entries_absent,
       NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'folioone' AND table_name = 'identity_profiles'
                     AND column_name IN ('full_name', 'onboarding_step')) AS new_columns_absent;

BEGIN;

ALTER TABLE folioone.identity_profiles
  ADD COLUMN full_name text,
  ADD COLUMN profile_image_url text,
  ADD COLUMN cover_image_url text,
  ADD COLUMN contact_email text,
  ADD COLUMN phone text,
  ADD COLUMN current_designation text,
  ADD COLUMN current_organization text,
  ADD COLUMN industry text,
  ADD COLUMN professional_summary text,
  ADD COLUMN primary_purpose text,
  ADD COLUMN onboarding_step smallint NOT NULL DEFAULT 1,
  ADD COLUMN onboarding_completed_at timestamptz;

ALTER TABLE folioone.identity_profiles
  ADD CONSTRAINT identity_profiles_full_name_length_check
    CHECK (full_name IS NULL OR char_length(full_name) <= 120),
  ADD CONSTRAINT identity_profiles_profile_image_url_check
    CHECK (profile_image_url IS NULL OR (profile_image_url ~ '^https?://' AND char_length(profile_image_url) <= 2000)),
  ADD CONSTRAINT identity_profiles_cover_image_url_check
    CHECK (cover_image_url IS NULL OR (cover_image_url ~ '^https?://' AND char_length(cover_image_url) <= 2000)),
  ADD CONSTRAINT identity_profiles_contact_email_check
    CHECK (contact_email IS NULL OR (char_length(contact_email) <= 254 AND position('@' IN contact_email) > 1)),
  ADD CONSTRAINT identity_profiles_phone_length_check
    CHECK (phone IS NULL OR char_length(phone) <= 40),
  ADD CONSTRAINT identity_profiles_current_designation_length_check
    CHECK (current_designation IS NULL OR char_length(current_designation) <= 160),
  ADD CONSTRAINT identity_profiles_current_organization_length_check
    CHECK (current_organization IS NULL OR char_length(current_organization) <= 160),
  ADD CONSTRAINT identity_profiles_industry_length_check
    CHECK (industry IS NULL OR char_length(industry) <= 120),
  ADD CONSTRAINT identity_profiles_professional_summary_length_check
    CHECK (professional_summary IS NULL OR char_length(professional_summary) <= 2000),
  ADD CONSTRAINT identity_profiles_primary_purpose_check
    CHECK (primary_purpose IS NULL OR primary_purpose IN
      ('job_search', 'freelance', 'networking', 'portfolio', 'personal_brand', 'other')),
  ADD CONSTRAINT identity_profiles_onboarding_step_check
    CHECK (onboarding_step BETWEEN 1 AND 7);

CREATE TABLE folioone.identity_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  kind text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  is_visible boolean NOT NULL DEFAULT true,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT identity_entries_account_id_accounts_id_fk
    FOREIGN KEY (account_id) REFERENCES folioone.accounts(id) ON DELETE CASCADE,
  CONSTRAINT identity_entries_kind_check
    CHECK (kind IN ('employment', 'education', 'skill', 'project', 'social_link',
                    'achievement', 'certification', 'language', 'interest')),
  CONSTRAINT identity_entries_position_check CHECK (position BETWEEN 0 AND 999),
  CONSTRAINT identity_entries_data_object_check CHECK (jsonb_typeof(data) = 'object'),
  CONSTRAINT identity_entries_data_size_check CHECK (octet_length(data::text) <= 12000)
);

CREATE INDEX identity_entries_account_kind_position_idx
  ON folioone.identity_entries (account_id, kind, position);

ALTER TABLE folioone.identity_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE folioone.identity_entries FORCE ROW LEVEL SECURITY;

-- Same ACL hygiene as 003-identity-rls.sql: remove default-ACL grants, then grant the
-- application role exactly what it needs.
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
    WHERE n.nspname = 'folioone'
      AND c.relname = 'identity_entries'
      AND acl.grantee <> 0
      AND acl.grantee <> c.relowner
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %s FROM %I',
                   grant_entry.relation_name, grant_entry.grantee_name);
  END LOOP;
END;
$$;

REVOKE ALL PRIVILEGES ON TABLE folioone.identity_entries FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE folioone.identity_entries FROM anon, service_role;

CREATE POLICY identity_entries_select_own
  ON folioone.identity_entries FOR SELECT TO authenticated
  USING (account_id = (SELECT auth.uid()));
CREATE POLICY identity_entries_insert_own
  ON folioone.identity_entries FOR INSERT TO authenticated
  WITH CHECK (account_id = (SELECT auth.uid()));
CREATE POLICY identity_entries_update_own
  ON folioone.identity_entries FOR UPDATE TO authenticated
  USING (account_id = (SELECT auth.uid()))
  WITH CHECK (account_id = (SELECT auth.uid()));
CREATE POLICY identity_entries_delete_own
  ON folioone.identity_entries FOR DELETE TO authenticated
  USING (account_id = (SELECT auth.uid()));

-- Table-level UPDATE is required because the app saves lists with an upsert
-- (INSERT ... ON CONFLICT DO UPDATE), which updates every supplied column.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE folioone.identity_entries TO authenticated;

COMMIT;

-- Post-execution verification (read-only). Expected:
--  1. identity_entries: owner postgres, rls_enabled and rls_forced true, anon/service_role/PUBLIC
--     privileges false; authenticated SELECT/INSERT/UPDATE/DELETE true.
--  2. Exactly 4 policies on identity_entries, all TO authenticated.
--  3. 12 new columns on identity_profiles; onboarding_step NOT NULL default 1.
SELECT c.relname AS table_name, pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_select,
       has_table_privilege('authenticated', c.oid, 'INSERT') AS auth_insert,
       has_table_privilege('authenticated', c.oid, 'UPDATE') AS auth_update,
       has_table_privilege('authenticated', c.oid, 'DELETE') AS auth_delete,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
       has_table_privilege('service_role', c.oid, 'SELECT') AS service_role_select,
       EXISTS (SELECT 1 FROM aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) AS a
               WHERE a.grantee = 0) AS public_acl
FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'folioone' AND c.relname = 'identity_entries';

SELECT policyname, cmd, roles, qual, with_check FROM pg_policies
WHERE schemaname = 'folioone' AND tablename = 'identity_entries' ORDER BY cmd, policyname;

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'folioone' AND table_name = 'identity_profiles'
ORDER BY ordinal_position;

-- Rollback (DESTRUCTIVE: deletes all list entries and the new profile columns' data).
-- Only before real data exists, with developer approval.
-- BEGIN;
-- DROP TABLE folioone.identity_entries;
-- ALTER TABLE folioone.identity_profiles
--   DROP COLUMN full_name, DROP COLUMN profile_image_url, DROP COLUMN cover_image_url,
--   DROP COLUMN contact_email, DROP COLUMN phone, DROP COLUMN current_designation,
--   DROP COLUMN current_organization, DROP COLUMN industry, DROP COLUMN professional_summary,
--   DROP COLUMN primary_purpose, DROP COLUMN onboarding_step, DROP COLUMN onboarding_completed_at;
-- COMMIT;
