-- ============================================================================
-- Folioone M8  |  001-digital-cards.sql  |  schema: folioone
-- Digital business cards: private card configuration, the PUBLISHED card snapshot that
-- /social/<slug> renders from, and three atomic SECURITY INVOKER functions. Also reserves the
-- new route names `cards` and `social` as website addresses.
--
-- STATUS:        PREPARED - NOT EXECUTED on any hosted project. Reviewed and run manually by
--                the developer in the Supabase SQL Editor (as postgres). `pnpm validate`
--                applies it to the LOCAL stack only.
-- Prerequisites: docs/sql/milestone-5/001 (and 6, 7) executed. Schema folioone exposed in the
--                Data API settings.
-- Repeatable?:   ONE-TIME. The preflight must show every column `true`; a second run fails
--                inside the transaction and rolls back.
-- Safety:        Touches only schema folioone. No access to schema public or auth.users data.
--                No roles, no SECURITY DEFINER, no service_role privileges. Existing RLS untouched.
--
-- !!! DELIBERATE EXPOSURE CHANGE - REVIEW BEFORE RUNNING !!!
-- Like website_published (M5), signed-out visitors must be able to open a shared card, so this
-- file GRANTs column-limited SELECT on folioone.digital_card_published to anon, with an RLS
-- policy that returns ONLY rows where is_live is true. The row holds only the fields the owner
-- switched on and published; account_id is NOT readable by anon. Unpublishing sets
-- is_live = false and clears content in the same statement. digital_cards stays private.
--
-- Design:
--   digital_cards          private, one row per account: slug (nullable until claimed, globally
--                          unique), status, card_type, design, config (field selection, display
--                          name/initials overrides, one custom link).
--   digital_card_published one row per account: the approved snapshot (content jsonb), is_live.
--   digital_card_publish / digital_card_unpublish / digital_card_change_slug.
-- ============================================================================

-- Read-only preflight; every result must be true before continuing.
SELECT current_database() = 'postgres' AS expected_database,
       session_user = 'postgres' AS expected_session_role,
       to_regclass('folioone.website_sites') IS NOT NULL AS m5_applied,
       to_regclass('folioone.digital_cards') IS NULL AS cards_absent,
       to_regclass('folioone.digital_card_published') IS NULL AS card_published_absent,
       NOT EXISTS (SELECT 1 FROM folioone.website_sites WHERE slug IN ('cards', 'social'))
         AS no_website_uses_new_reserved_words;

BEGIN;

-- Website addresses: same rule as M5 plus the two new route names.
ALTER TABLE folioone.website_sites DROP CONSTRAINT website_sites_slug_check;
ALTER TABLE folioone.website_sites ADD CONSTRAINT website_sites_slug_check CHECK (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 3 AND 40
    AND slug <> ALL (ARRAY['about', 'account', 'accounts', 'admin', 'api', 'app', 'assets', 'auth', 'blog', 'cards', 'contact', 'dashboard', 'docs', 'edit', 'explore', 'favicon', 'folioone', 'forgot-password', 'health', 'help', 'home', 'index', 'legal', 'login', 'logout', 'new', 'null', 'onboarding', 'persona', 'personas', 'preview', 'pricing', 'privacy', 'profile', 'public', 'register', 'reset-password', 'robots', 'root', 'search', 'security', 'settings', 'signin', 'signup', 'sitemap', 'social', 'static', 'status', 'support', 'system', 'terms', 'undefined', 'user', 'users', 'website', 'websites', 'www']));
ALTER TABLE folioone.website_published DROP CONSTRAINT website_published_slug_check;
ALTER TABLE folioone.website_published ADD CONSTRAINT website_published_slug_check CHECK (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 3 AND 40
    AND slug <> ALL (ARRAY['about', 'account', 'accounts', 'admin', 'api', 'app', 'assets', 'auth', 'blog', 'cards', 'contact', 'dashboard', 'docs', 'edit', 'explore', 'favicon', 'folioone', 'forgot-password', 'health', 'help', 'home', 'index', 'legal', 'login', 'logout', 'new', 'null', 'onboarding', 'persona', 'personas', 'preview', 'pricing', 'privacy', 'profile', 'public', 'register', 'reset-password', 'robots', 'root', 'search', 'security', 'settings', 'signin', 'signup', 'sitemap', 'social', 'static', 'status', 'support', 'system', 'terms', 'undefined', 'user', 'users', 'website', 'websites', 'www']));

CREATE TABLE folioone.digital_cards (
  account_id uuid PRIMARY KEY,
  slug text,
  status text NOT NULL DEFAULT 'draft',
  card_type text NOT NULL DEFAULT 'professional',
  design text NOT NULL DEFAULT 'ivory',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz,
  unpublished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT digital_cards_account_id_accounts_id_fk
    FOREIGN KEY (account_id) REFERENCES folioone.accounts(id) ON DELETE CASCADE,
  CONSTRAINT digital_cards_slug_key UNIQUE (slug),
  CONSTRAINT digital_cards_slug_check CHECK (slug IS NULL OR (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 3 AND 40
    AND slug <> ALL (ARRAY['about', 'account', 'accounts', 'admin', 'api', 'app', 'assets', 'auth', 'blog', 'cards', 'contact', 'dashboard', 'docs', 'edit', 'explore', 'favicon', 'folioone', 'forgot-password', 'health', 'help', 'home', 'index', 'legal', 'login', 'logout', 'new', 'null', 'onboarding', 'persona', 'personas', 'preview', 'pricing', 'privacy', 'profile', 'public', 'register', 'reset-password', 'robots', 'root', 'search', 'security', 'settings', 'signin', 'signup', 'sitemap', 'social', 'static', 'status', 'support', 'system', 'terms', 'undefined', 'user', 'users', 'website', 'websites', 'www']))),
  CONSTRAINT digital_cards_status_check CHECK (status IN ('draft', 'published', 'unpublished')),
  CONSTRAINT digital_cards_type_check CHECK (card_type IN ('professional', 'personal', 'social', 'creative')),
  CONSTRAINT digital_cards_design_check CHECK (design IN ('ivory', 'slate', 'pinstripe', 'graphite', 'monogram', 'ledger', 'meridian', 'counsel', 'linen', 'sage', 'blush', 'dune', 'coastal', 'vellum', 'lavender', 'aurora', 'neon', 'pop', 'bubble', 'grid', 'bauhaus', 'sunset', 'noir', 'gallery', 'studio', 'atelier', 'obsidian', 'terracotta', 'console', 'typewriter', 'blueprint', 'mint')),
  CONSTRAINT digital_cards_config_check CHECK (
    jsonb_typeof(config) = 'object' AND octet_length(config::text) <= 8000)
);

CREATE TABLE folioone.digital_card_published (
  account_id uuid PRIMARY KEY,
  slug text NOT NULL,
  card_type text NOT NULL,
  design text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_live boolean NOT NULL DEFAULT false,
  published_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT digital_card_published_account_id_cards_fk
    FOREIGN KEY (account_id) REFERENCES folioone.digital_cards(account_id) ON DELETE CASCADE,
  CONSTRAINT digital_card_published_slug_key UNIQUE (slug),
  CONSTRAINT digital_card_published_slug_check CHECK (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 3 AND 40
    AND slug <> ALL (ARRAY['about', 'account', 'accounts', 'admin', 'api', 'app', 'assets', 'auth', 'blog', 'cards', 'contact', 'dashboard', 'docs', 'edit', 'explore', 'favicon', 'folioone', 'forgot-password', 'health', 'help', 'home', 'index', 'legal', 'login', 'logout', 'new', 'null', 'onboarding', 'persona', 'personas', 'preview', 'pricing', 'privacy', 'profile', 'public', 'register', 'reset-password', 'robots', 'root', 'search', 'security', 'settings', 'signin', 'signup', 'sitemap', 'social', 'static', 'status', 'support', 'system', 'terms', 'undefined', 'user', 'users', 'website', 'websites', 'www'])),
  CONSTRAINT digital_card_published_type_check CHECK (card_type IN ('professional', 'personal', 'social', 'creative')),
  CONSTRAINT digital_card_published_design_check CHECK (design IN ('ivory', 'slate', 'pinstripe', 'graphite', 'monogram', 'ledger', 'meridian', 'counsel', 'linen', 'sage', 'blush', 'dune', 'coastal', 'vellum', 'lavender', 'aurora', 'neon', 'pop', 'bubble', 'grid', 'bauhaus', 'sunset', 'noir', 'gallery', 'studio', 'atelier', 'obsidian', 'terracotta', 'console', 'typewriter', 'blueprint', 'mint')),
  CONSTRAINT digital_card_published_content_check CHECK (
    jsonb_typeof(content) = 'object' AND octet_length(content::text) <= 8000)
);

ALTER TABLE folioone.digital_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE folioone.digital_cards FORCE ROW LEVEL SECURITY;
ALTER TABLE folioone.digital_card_published ENABLE ROW LEVEL SECURITY;
ALTER TABLE folioone.digital_card_published FORCE ROW LEVEL SECURITY;

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
      AND c.relname IN ('digital_cards', 'digital_card_published')
      AND acl.grantee <> 0 AND acl.grantee <> c.relowner
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %s FROM %I',
                   grant_entry.relation_name, grant_entry.grantee_name);
  END LOOP;
END;
$$;
REVOKE ALL PRIVILEGES ON TABLE folioone.digital_cards FROM PUBLIC, anon, service_role;
REVOKE ALL PRIVILEGES ON TABLE folioone.digital_card_published FROM PUBLIC, anon, service_role;

-- Owner-only management of the private card row.
CREATE POLICY digital_cards_select_own ON folioone.digital_cards FOR SELECT TO authenticated
  USING (account_id = (SELECT auth.uid()));
CREATE POLICY digital_cards_insert_own ON folioone.digital_cards FOR INSERT TO authenticated
  WITH CHECK (account_id = (SELECT auth.uid()));
CREATE POLICY digital_cards_update_own ON folioone.digital_cards FOR UPDATE TO authenticated
  USING (account_id = (SELECT auth.uid())) WITH CHECK (account_id = (SELECT auth.uid()));
GRANT SELECT, INSERT, UPDATE ON TABLE folioone.digital_cards TO authenticated;

-- Owner access to the snapshot row (written only by the three functions below).
CREATE POLICY digital_card_published_select_own ON folioone.digital_card_published FOR SELECT TO authenticated
  USING (account_id = (SELECT auth.uid()));
CREATE POLICY digital_card_published_insert_own ON folioone.digital_card_published FOR INSERT TO authenticated
  WITH CHECK (account_id = (SELECT auth.uid()));
CREATE POLICY digital_card_published_update_own ON folioone.digital_card_published FOR UPDATE TO authenticated
  USING (account_id = (SELECT auth.uid())) WITH CHECK (account_id = (SELECT auth.uid()));
GRANT SELECT, INSERT, UPDATE ON TABLE folioone.digital_card_published TO authenticated;

-- PUBLIC READ: signed-out visitors may read LIVE cards only, and never the account_id.
-- (USAGE on schema folioone was granted to anon by M5.)
CREATE POLICY digital_card_published_select_live ON folioone.digital_card_published FOR SELECT TO anon
  USING (is_live);
GRANT SELECT (slug, card_type, design, content, is_live, published_at, updated_at)
  ON TABLE folioone.digital_card_published TO anon;

-- Atomic operations. SECURITY INVOKER, empty search_path, every object schema-qualified.
CREATE FUNCTION folioone.digital_card_publish(p_card_type text, p_design text, p_content jsonb)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_slug text;
  v_now timestamptz := now();
BEGIN
  SELECT slug INTO v_slug FROM folioone.digital_cards WHERE account_id = v_uid;
  IF v_slug IS NULL THEN
    RAISE EXCEPTION 'digital_card_publish: choose an address first' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO folioone.digital_card_published
    (account_id, slug, card_type, design, content, is_live, published_at, updated_at)
  VALUES (v_uid, v_slug, p_card_type, p_design, p_content, true, v_now, v_now)
  ON CONFLICT (account_id) DO UPDATE SET
    slug = EXCLUDED.slug, card_type = EXCLUDED.card_type, design = EXCLUDED.design,
    content = EXCLUDED.content, is_live = true,
    published_at = EXCLUDED.published_at, updated_at = EXCLUDED.updated_at;
  UPDATE folioone.digital_cards
     SET status = 'published', card_type = p_card_type, design = p_design,
         published_at = v_now, updated_at = v_now
   WHERE account_id = v_uid;
  RETURN v_now;
END;
$fn$;

CREATE FUNCTION folioone.digital_card_unpublish()
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Clear the snapshot too: nothing stale remains readable, and republishing rebuilds it.
  UPDATE folioone.digital_card_published
     SET is_live = false, content = '{}'::jsonb, updated_at = now()
   WHERE account_id = v_uid;
  UPDATE folioone.digital_cards
     SET status = CASE WHEN published_at IS NULL THEN status ELSE 'unpublished' END,
         unpublished_at = now(), updated_at = now()
   WHERE account_id = v_uid;
END;
$fn$;

CREATE FUNCTION folioone.digital_card_change_slug(p_slug text)
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  UPDATE folioone.digital_cards SET slug = p_slug, updated_at = now() WHERE account_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'digital_card_change_slug: no card for this account' USING ERRCODE = 'P0002';
  END IF;
  -- The old address stops resolving in the same transaction.
  UPDATE folioone.digital_card_published SET slug = p_slug, updated_at = now() WHERE account_id = v_uid;
END;
$fn$;

REVOKE ALL ON FUNCTION folioone.digital_card_publish(text, text, jsonb) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION folioone.digital_card_unpublish() FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION folioone.digital_card_change_slug(text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION folioone.digital_card_publish(text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION folioone.digital_card_unpublish() TO authenticated;
GRANT EXECUTE ON FUNCTION folioone.digital_card_change_slug(text) TO authenticated;

COMMIT;

-- Post-execution verification (read-only). Expected:
--  1. Both tables: owner postgres, RLS enabled AND forced; anon has NO privilege on digital_cards;
--     authenticated SELECT/INSERT/UPDATE, no DELETE; service_role none.
--  2. 7 policies: digital_cards 3, digital_card_published 4 (one TO anon, USING is_live).
--  3. anon column privileges on digital_card_published: exactly slug, card_type, design, content,
--     is_live, published_at, updated_at (NOT account_id).
--  4. 3 functions, security_definer false, search_path empty, EXECUTE only for authenticated.
--  5. website slug checks now reject 'cards' and 'social'.
SELECT c.relname, pg_get_userbyid(c.relowner) AS owner, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_select,
       has_table_privilege('authenticated', c.oid, 'DELETE') AS auth_delete,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_table_select,
       has_any_column_privilege('anon', c.oid, 'SELECT') AS anon_any_column,
       has_table_privilege('service_role', c.oid, 'SELECT') AS service_select
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'folioone' AND c.relname IN ('digital_cards', 'digital_card_published') ORDER BY 1;

SELECT tablename, policyname, cmd, roles, qual, with_check FROM pg_policies
WHERE schemaname = 'folioone' AND tablename IN ('digital_cards', 'digital_card_published') ORDER BY 1, 3, 2;

SELECT attname, has_column_privilege('anon', 'folioone.digital_card_published', attname, 'SELECT') AS anon_can_select
FROM pg_attribute WHERE attrelid = 'folioone.digital_card_published'::regclass AND attnum > 0 AND NOT attisdropped ORDER BY attnum;

SELECT p.proname, p.prosecdef AS security_definer, p.proconfig,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec
FROM pg_proc p WHERE p.pronamespace = 'folioone'::regnamespace AND p.proname LIKE 'digital\_card\_%' ORDER BY 1;

SELECT conrelid::regclass, conname, pg_get_constraintdef(oid) LIKE '%''social''%' AS reserves_social
FROM pg_constraint WHERE conname IN ('website_sites_slug_check', 'website_published_slug_check');

-- Rollback (DESTRUCTIVE: removes every card and published card). Only with approval.
-- BEGIN;
-- DROP FUNCTION folioone.digital_card_publish(text, text, jsonb);
-- DROP FUNCTION folioone.digital_card_unpublish();
-- DROP FUNCTION folioone.digital_card_change_slug(text);
-- DROP TABLE folioone.digital_card_published;
-- DROP TABLE folioone.digital_cards;
-- (the website slug checks may stay widened; restore the M5 definitions only if required)
-- COMMIT;
