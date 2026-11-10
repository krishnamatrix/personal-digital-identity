-- ============================================================================
-- Folioone M5  |  001-website.sql  |  schema: folioone
-- Public identity website: private website configuration, the PUBLISHED snapshot that
-- the public site renders from, and three atomic SECURITY INVOKER functions.
--
-- STATUS:        PREPARED - NOT EXECUTED on any hosted project. Reviewed and run manually by
--                the developer in the Supabase SQL Editor (as postgres). `pnpm validate`
--                applies it to the LOCAL stack only.
-- Prerequisites: docs/sql/folioone-schema 001-006 and docs/sql/milestone-4/001 executed.
-- Repeatable?:   ONE-TIME. The preflight must show every column `true`; a second run fails
--                inside the transaction and rolls back.
-- Safety:        Touches only schema folioone. No access to schema public or auth.users data.
--                No roles, no SECURITY DEFINER, no service_role privileges. Existing RLS untouched.
--
-- !!! DELIBERATE EXPOSURE CHANGE - REVIEW BEFORE RUNNING !!!
-- Until now `anon` had NO access to schema folioone. A public website must be readable by
-- signed-out visitors, so this file:
--   1. GRANTs USAGE on schema folioone to anon, and
--   2. GRANTs column-limited SELECT on folioone.website_published to anon, with an RLS
--      policy that returns ONLY rows where is_live is true.
-- website_published holds only the snapshot the owner explicitly published (the owner's
-- account_id column is NOT readable by anon). Unpublishing sets is_live = false and clears
-- content in the same statement, so it takes effect immediately and leaves nothing stale.
-- Every other folioone table stays unreadable by anon. The PostgREST/GraphQL catalog of
-- folioone will now list website_published to anon (see the open GraphQL evidence item).
--
-- Design:
--   website_sites      private, one row per account: slug (globally unique), status, theme,
--                      draft config (section order/visibility/headings, entry exclusions, SEO).
--   website_published  one row per account: the approved snapshot (content jsonb), resolved SEO
--                      text, is_live. The public site renders ONLY from this table.
--   website_publish / website_unpublish / website_change_slug: SECURITY INVOKER (RLS applies),
--                      empty search_path, atomic across the two tables.
-- ============================================================================

-- Read-only preflight; every result must be true before continuing.
SELECT current_database() = 'postgres' AS expected_database,
       session_user = 'postgres' AS expected_session_role,
       to_regclass('folioone.accounts') IS NOT NULL AS accounts_present,
       to_regclass('folioone.identity_entries') IS NOT NULL AS m4_applied,
       to_regclass('folioone.website_sites') IS NULL AS sites_absent,
       to_regclass('folioone.website_published') IS NULL AS published_absent;

BEGIN;

CREATE TABLE folioone.website_sites (
  account_id uuid PRIMARY KEY,
  slug text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  theme text NOT NULL DEFAULT 'professional',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz,
  unpublished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_sites_account_id_accounts_id_fk
    FOREIGN KEY (account_id) REFERENCES folioone.accounts(id) ON DELETE CASCADE,
  CONSTRAINT website_sites_slug_key UNIQUE (slug),
  CONSTRAINT website_sites_slug_check CHECK (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 3 AND 40
    AND slug <> ALL (ARRAY['about', 'account', 'accounts', 'admin', 'api', 'app', 'assets', 'auth', 'blog', 'contact', 'dashboard', 'docs', 'edit', 'explore', 'favicon', 'folioone', 'forgot-password', 'health', 'help', 'home', 'index', 'legal', 'login', 'logout', 'new', 'null', 'onboarding', 'persona', 'personas', 'preview', 'pricing', 'privacy', 'profile', 'public', 'register', 'reset-password', 'robots', 'root', 'search', 'security', 'settings', 'signin', 'signup', 'sitemap', 'static', 'status', 'support', 'system', 'terms', 'undefined', 'user', 'users', 'website', 'websites', 'www'])),
  CONSTRAINT website_sites_status_check CHECK (status IN ('draft', 'published', 'unpublished')),
  CONSTRAINT website_sites_theme_check CHECK (theme IN ('professional', 'creative', 'minimal')),
  CONSTRAINT website_sites_config_check CHECK (
    jsonb_typeof(config) = 'object' AND octet_length(config::text) <= 60000)
);

CREATE TABLE folioone.website_published (
  account_id uuid PRIMARY KEY,
  slug text NOT NULL,
  theme text NOT NULL,
  title text NOT NULL,
  description text,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_live boolean NOT NULL DEFAULT false,
  published_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_published_account_id_sites_fk
    FOREIGN KEY (account_id) REFERENCES folioone.website_sites(account_id) ON DELETE CASCADE,
  CONSTRAINT website_published_slug_key UNIQUE (slug),
  CONSTRAINT website_published_slug_check CHECK (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 3 AND 40
    AND slug <> ALL (ARRAY['about', 'account', 'accounts', 'admin', 'api', 'app', 'assets', 'auth', 'blog', 'contact', 'dashboard', 'docs', 'edit', 'explore', 'favicon', 'folioone', 'forgot-password', 'health', 'help', 'home', 'index', 'legal', 'login', 'logout', 'new', 'null', 'onboarding', 'persona', 'personas', 'preview', 'pricing', 'privacy', 'profile', 'public', 'register', 'reset-password', 'robots', 'root', 'search', 'security', 'settings', 'signin', 'signup', 'sitemap', 'static', 'status', 'support', 'system', 'terms', 'undefined', 'user', 'users', 'website', 'websites', 'www'])),
  CONSTRAINT website_published_theme_check CHECK (theme IN ('professional', 'creative', 'minimal')),
  CONSTRAINT website_published_title_length_check CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT website_published_description_length_check CHECK (description IS NULL OR char_length(description) <= 400),
  CONSTRAINT website_published_content_check CHECK (
    jsonb_typeof(content) = 'object' AND octet_length(content::text) <= 400000)
);

ALTER TABLE folioone.website_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE folioone.website_sites FORCE ROW LEVEL SECURITY;
ALTER TABLE folioone.website_published ENABLE ROW LEVEL SECURITY;
ALTER TABLE folioone.website_published FORCE ROW LEVEL SECURITY;

-- Same ACL hygiene as the earlier files: strip default-ACL grants, then grant exactly what is needed.
DO $$
DECLARE
  grant_entry record;
BEGIN
  FOR grant_entry IN
    SELECT c.oid::regclass AS relation_name, pg_get_userbyid(acl.grantee) AS grantee_name
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) AS acl
    WHERE n.nspname = 'folioone'
      AND c.relname IN ('website_sites', 'website_published')
      AND acl.grantee <> 0 AND acl.grantee <> c.relowner
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %s FROM %I',
                   grant_entry.relation_name, grant_entry.grantee_name);
  END LOOP;
END;
$$;
REVOKE ALL PRIVILEGES ON TABLE folioone.website_sites FROM PUBLIC, anon, service_role;
REVOKE ALL PRIVILEGES ON TABLE folioone.website_published FROM PUBLIC, anon, service_role;

-- Owner-only management of the private site row.
CREATE POLICY website_sites_select_own ON folioone.website_sites FOR SELECT TO authenticated
  USING (account_id = (SELECT auth.uid()));
CREATE POLICY website_sites_insert_own ON folioone.website_sites FOR INSERT TO authenticated
  WITH CHECK (account_id = (SELECT auth.uid()));
CREATE POLICY website_sites_update_own ON folioone.website_sites FOR UPDATE TO authenticated
  USING (account_id = (SELECT auth.uid())) WITH CHECK (account_id = (SELECT auth.uid()));
GRANT SELECT, INSERT, UPDATE ON TABLE folioone.website_sites TO authenticated;

-- Owner access to the snapshot row (written only by website_publish / website_unpublish /
-- website_change_slug, which run with the caller's own privileges).
CREATE POLICY website_published_select_own ON folioone.website_published FOR SELECT TO authenticated
  USING (account_id = (SELECT auth.uid()));
CREATE POLICY website_published_insert_own ON folioone.website_published FOR INSERT TO authenticated
  WITH CHECK (account_id = (SELECT auth.uid()));
CREATE POLICY website_published_update_own ON folioone.website_published FOR UPDATE TO authenticated
  USING (account_id = (SELECT auth.uid())) WITH CHECK (account_id = (SELECT auth.uid()));
GRANT SELECT, INSERT, UPDATE ON TABLE folioone.website_published TO authenticated;

-- PUBLIC READ: signed-out visitors may read LIVE snapshots only, and never the account_id.
GRANT USAGE ON SCHEMA folioone TO anon;
CREATE POLICY website_published_select_live ON folioone.website_published FOR SELECT TO anon
  USING (is_live);
GRANT SELECT (slug, theme, title, description, content, is_live, published_at, updated_at)
  ON TABLE folioone.website_published TO anon;

-- Atomic operations. SECURITY INVOKER, empty search_path, every object schema-qualified.
CREATE FUNCTION folioone.website_publish(
  p_theme text, p_title text, p_description text, p_content jsonb)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_slug text;
  v_now timestamptz := now();
BEGIN
  SELECT slug INTO v_slug FROM folioone.website_sites WHERE account_id = v_uid;
  IF v_slug IS NULL THEN
    RAISE EXCEPTION 'website_publish: no website for this account' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO folioone.website_published
    (account_id, slug, theme, title, description, content, is_live, published_at, updated_at)
  VALUES (v_uid, v_slug, p_theme, p_title, p_description, p_content, true, v_now, v_now)
  ON CONFLICT (account_id) DO UPDATE SET
    slug = EXCLUDED.slug, theme = EXCLUDED.theme, title = EXCLUDED.title,
    description = EXCLUDED.description, content = EXCLUDED.content,
    is_live = true, published_at = EXCLUDED.published_at, updated_at = EXCLUDED.updated_at;
  UPDATE folioone.website_sites
     SET status = 'published', theme = p_theme, published_at = v_now, updated_at = v_now
   WHERE account_id = v_uid;
  RETURN v_now;
END;
$fn$;

CREATE FUNCTION folioone.website_unpublish()
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Clear the snapshot too: nothing stale remains readable, and republishing rebuilds it.
  UPDATE folioone.website_published
     SET is_live = false, content = '{}'::jsonb, updated_at = now()
   WHERE account_id = v_uid;
  UPDATE folioone.website_sites
     SET status = CASE WHEN published_at IS NULL THEN status ELSE 'unpublished' END,
         unpublished_at = now(), updated_at = now()
   WHERE account_id = v_uid;
END;
$fn$;

CREATE FUNCTION folioone.website_change_slug(p_slug text)
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  UPDATE folioone.website_sites SET slug = p_slug, updated_at = now() WHERE account_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'website_change_slug: no website for this account' USING ERRCODE = 'P0002';
  END IF;
  -- The old address stops resolving in the same transaction.
  UPDATE folioone.website_published SET slug = p_slug, updated_at = now() WHERE account_id = v_uid;
END;
$fn$;

REVOKE ALL ON FUNCTION folioone.website_publish(text, text, text, jsonb) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION folioone.website_unpublish() FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION folioone.website_change_slug(text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION folioone.website_publish(text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION folioone.website_unpublish() TO authenticated;
GRANT EXECUTE ON FUNCTION folioone.website_change_slug(text) TO authenticated;

COMMIT;

-- Post-execution verification (read-only). Expected:
--  1. Both tables: owner postgres, RLS enabled AND forced; anon has NO table-level privilege on
--     website_sites; PUBLIC none; authenticated SELECT/INSERT/UPDATE, no DELETE.
--  2. 7 policies: website_sites 3, website_published 4 (one TO anon, USING is_live).
--  3. anon column privileges on website_published: exactly slug, theme, title, description,
--     content, is_live, published_at, updated_at (NOT account_id).
--  4. 3 functions, security_definer false, search_path empty, EXECUTE only for authenticated.
SELECT c.relname, pg_get_userbyid(c.relowner) AS owner, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_select,
       has_table_privilege('authenticated', c.oid, 'DELETE') AS auth_delete,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_table_select,
       has_any_column_privilege('anon', c.oid, 'SELECT') AS anon_any_column,
       has_table_privilege('service_role', c.oid, 'SELECT') AS service_select
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'folioone' AND c.relname IN ('website_sites', 'website_published') ORDER BY 1;

SELECT tablename, policyname, cmd, roles, qual, with_check FROM pg_policies
WHERE schemaname = 'folioone' AND tablename IN ('website_sites', 'website_published') ORDER BY 1, 3, 2;

SELECT attname, has_column_privilege('anon', 'folioone.website_published', attname, 'SELECT') AS anon_can_select
FROM pg_attribute WHERE attrelid = 'folioone.website_published'::regclass AND attnum > 0 AND NOT attisdropped ORDER BY attnum;

SELECT p.proname, p.prosecdef AS security_definer, p.proconfig,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec
FROM pg_proc p WHERE p.pronamespace = 'folioone'::regnamespace AND p.proname LIKE 'website\_%' ORDER BY 1;

-- Rollback (DESTRUCTIVE: removes every website configuration and published page). Only with approval.
-- BEGIN;
-- DROP FUNCTION folioone.website_publish(text, text, text, jsonb);
-- DROP FUNCTION folioone.website_unpublish();
-- DROP FUNCTION folioone.website_change_slug(text);
-- DROP TABLE folioone.website_published;
-- DROP TABLE folioone.website_sites;
-- REVOKE USAGE ON SCHEMA folioone FROM anon;
-- COMMIT;
