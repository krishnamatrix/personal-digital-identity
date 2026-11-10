-- ============================================================================
-- Folioone M6  |  001-articles.sql  |  schema: folioone
-- Articles & Thoughts: the canonical, private `articles` table (Master Identity content), the
-- PUBLISHED article snapshot the public website renders from, and the changes to the three M5
-- website functions that make a website (re)publish write the article snapshot atomically.
--
-- STATUS:        PREPARED - NOT EXECUTED on any hosted project. Reviewed and run manually by
--                the developer in the Supabase SQL Editor (as postgres). `pnpm validate`
--                applies it to the LOCAL stack only.
-- Prerequisites: docs/sql/folioone-schema 001-006, docs/sql/milestone-4/001 and
--                docs/sql/milestone-5/001 executed.
-- Execution order: this is the only M6 file; run it once, after M5.
-- Repeatable?:   ONE-TIME. The preflight must show every column `true`; a second run fails
--                inside the transaction and rolls back.
-- Safety:        Touches only schema folioone. No access to schema public or auth.users data.
--                No roles, NO SECURITY DEFINER (all functions are SECURITY INVOKER), no
--                service_role privileges. Existing RLS policies are not changed.
--
-- !!! REVIEW BEFORE RUNNING !!!
--  * REPLACES folioone.website_publish(text,text,text,jsonb) with a 5-argument version
--    (adds p_article_ids uuid[]) and REPLACES website_unpublish() / website_change_slug(text)
--    with versions that also maintain the article snapshot. The 4-argument publish function is
--    dropped; the application in this milestone calls the 5-argument one.
--  * Extends the M5 anonymous read: anon may SELECT (column-limited, never account_id /
--    article_id) from folioone.website_published_articles, only while the owning website is live.
--
-- Design:
--   articles                    private, owner-only. Canonical article (rich text as validated
--                               JSON), lifecycle status, optimistic-concurrency `version`.
--   website_published_articles  the approved snapshot of each article the owner selected at
--                               publish time. Rows are COPIED from `articles` inside
--                               website_publish (never supplied by the client).
--   Article becomes non-published (draft/archived) -> trigger deletes its snapshot row at once.
--   Article deleted                                 -> ON DELETE CASCADE removes the snapshot.
--   Website unpublished                             -> website_unpublish deletes every snapshot row.
--   Website slug changed                            -> website_change_slug re-addresses the rows.
--   Snapshot WRITES ARE REQUEST-GATED: INSERT only inside POST /rpc/website_publish, DELETE only inside
--   /rpc/website_publish, /rpc/website_unpublish or the invalidation trigger, UPDATE(site_slug) only inside
--   /rpc/website_change_slug (helpers website_snapshot_{insert,delete,update}_context, same pattern as the
--   Persona gate). Direct PostgREST writes to the snapshot table are rejected even for the owner.
-- ============================================================================

-- Read-only preflight; every result must be true before continuing.
SELECT current_database() = 'postgres' AS expected_database,
       session_user = 'postgres' AS expected_session_role,
       to_regclass('folioone.website_published') IS NOT NULL AS m5_applied,
       to_regprocedure('folioone.website_publish(text,text,text,jsonb)') IS NOT NULL AS old_publish_present,
       to_regclass('folioone.articles') IS NULL AS articles_absent,
       to_regclass('folioone.website_published_articles') IS NULL AS snapshot_absent,
       to_regprocedure('folioone.website_snapshot_insert_context()') IS NULL AS insert_gate_absent,
       to_regprocedure('folioone.website_snapshot_delete_context()') IS NULL AS delete_gate_absent,
       to_regprocedure('folioone.website_snapshot_update_context()') IS NULL AS update_gate_absent,
       has_function_privilege('authenticated', 'auth.uid()', 'EXECUTE') AS auth_uid_executable;

BEGIN;

CREATE TABLE folioone.articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  slug text,
  title text NOT NULL DEFAULT '',
  subtitle text,
  excerpt text,
  content jsonb NOT NULL DEFAULT '{"type":"doc","content":[]}'::jsonb,
  body_text text NOT NULL DEFAULT '',
  cover_image_url text,
  category text,
  tags text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft',
  seo_title text,
  seo_description text,
  word_count integer NOT NULL DEFAULT 0,
  reading_minutes integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT articles_account_id_accounts_id_fk
    FOREIGN KEY (account_id) REFERENCES folioone.accounts(id) ON DELETE CASCADE,
  CONSTRAINT articles_account_slug_key UNIQUE (account_id, slug),
  CONSTRAINT articles_slug_check CHECK (
    slug IS NULL OR (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 3 AND 80)),
  CONSTRAINT articles_status_check CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT articles_published_needs_slug_check CHECK (
    status <> 'published' OR (slug IS NOT NULL AND published_at IS NOT NULL)),
  CONSTRAINT articles_title_length_check CHECK (char_length(title) <= 200),
  CONSTRAINT articles_subtitle_length_check CHECK (subtitle IS NULL OR char_length(subtitle) <= 300),
  CONSTRAINT articles_excerpt_length_check CHECK (excerpt IS NULL OR char_length(excerpt) <= 400),
  CONSTRAINT articles_cover_url_check CHECK (
    cover_image_url IS NULL OR (cover_image_url ~ '^https?://[^[:space:]]+$' AND char_length(cover_image_url) <= 2000)),
  CONSTRAINT articles_category_length_check CHECK (category IS NULL OR char_length(category) <= 60),
  CONSTRAINT articles_tags_check CHECK (cardinality(tags) <= 10),
  CONSTRAINT articles_seo_title_length_check CHECK (seo_title IS NULL OR char_length(seo_title) <= 120),
  CONSTRAINT articles_seo_description_length_check CHECK (seo_description IS NULL OR char_length(seo_description) <= 300),
  CONSTRAINT articles_content_check CHECK (
    jsonb_typeof(content) = 'object' AND octet_length(content::text) <= 300000),
  CONSTRAINT articles_body_text_length_check CHECK (char_length(body_text) <= 200000),
  CONSTRAINT articles_counts_check CHECK (word_count >= 0 AND reading_minutes >= 0),
  CONSTRAINT articles_version_check CHECK (version >= 1)
);
CREATE INDEX articles_account_status_updated_idx
  ON folioone.articles (account_id, status, updated_at DESC);
CREATE INDEX articles_account_published_idx
  ON folioone.articles (account_id, published_at DESC) WHERE status = 'published';

CREATE TABLE folioone.website_published_articles (
  article_id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  site_slug text NOT NULL,
  slug text NOT NULL,
  title text NOT NULL,
  subtitle text,
  excerpt text,
  cover_image_url text,
  category text,
  tags text[] NOT NULL DEFAULT '{}',
  content jsonb NOT NULL,
  seo_title text,
  seo_description text,
  word_count integer NOT NULL DEFAULT 0,
  reading_minutes integer NOT NULL DEFAULT 0,
  position integer NOT NULL,
  published_at timestamptz NOT NULL,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wpa_article_id_articles_fk
    FOREIGN KEY (article_id) REFERENCES folioone.articles(id) ON DELETE CASCADE,
  CONSTRAINT wpa_account_id_website_published_fk
    FOREIGN KEY (account_id) REFERENCES folioone.website_published(account_id) ON DELETE CASCADE,
  CONSTRAINT wpa_site_article_slug_key UNIQUE (site_slug, slug),
  CONSTRAINT wpa_content_check CHECK (
    jsonb_typeof(content) = 'object' AND octet_length(content::text) <= 300000),
  CONSTRAINT wpa_position_check CHECK (position >= 0)
);
CREATE INDEX wpa_site_position_idx ON folioone.website_published_articles (site_slug, position);

ALTER TABLE folioone.articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE folioone.articles FORCE ROW LEVEL SECURITY;
ALTER TABLE folioone.website_published_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE folioone.website_published_articles FORCE ROW LEVEL SECURITY;

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
      AND c.relname IN ('articles', 'website_published_articles')
      AND acl.grantee <> 0 AND acl.grantee <> c.relowner
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %s FROM %I',
                   grant_entry.relation_name, grant_entry.grantee_name);
  END LOOP;
END;
$$;
REVOKE ALL PRIVILEGES ON TABLE folioone.articles FROM PUBLIC, anon, service_role;
REVOKE ALL PRIVILEGES ON TABLE folioone.website_published_articles FROM PUBLIC, anon, service_role;

-- Articles: owner-only, full lifecycle (including delete, which the app confirms first).
CREATE POLICY articles_select_own ON folioone.articles FOR SELECT TO authenticated
  USING (account_id = (SELECT auth.uid()));
CREATE POLICY articles_insert_own ON folioone.articles FOR INSERT TO authenticated
  WITH CHECK (account_id = (SELECT auth.uid()));
CREATE POLICY articles_update_own ON folioone.articles FOR UPDATE TO authenticated
  USING (account_id = (SELECT auth.uid())) WITH CHECK (account_id = (SELECT auth.uid()));
CREATE POLICY articles_delete_own ON folioone.articles FOR DELETE TO authenticated
  USING (account_id = (SELECT auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE folioone.articles TO authenticated;

-- Snapshot writes are request-gated (same pattern as the Persona gate in folioone-schema/005):
-- the table privileges below exist only so the SECURITY INVOKER functions can run with the
-- caller's rights; the POLICIES decide who may actually write, and they require BOTH ownership
-- (auth.uid()) AND an approved request. A direct PostgREST INSERT/DELETE/UPDATE against
-- website_published_articles therefore fails RLS even for the row's owner.
--
-- Observed request settings (see tests/hosted/persona-persistence.hosted.ts, which passes locally
-- with the same exact-match gate, and the hosted diagnostic behind folioone-schema/005):
-- request.method = 'POST' and request.path = '/rpc/<function>' with no schema prefix. Direct table
-- writes arrive as POST/PATCH/DELETE on '/website_published_articles'. Matching is exact equality
-- (no LIKE, prefix or regex); missing settings fail closed. The gate is an INTEGRITY control (it
-- forces writes through the publish workflow); tenant isolation is the auth.uid() predicate.
CREATE FUNCTION folioone.website_snapshot_insert_context()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT COALESCE(
    current_setting('request.method', true) = 'POST'
    AND current_setting('request.path', true) = '/rpc/website_publish',
    false);
$$;
CREATE FUNCTION folioone.website_snapshot_delete_context()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT COALESCE(
    current_setting('request.method', true) = 'POST'
    AND current_setting('request.path', true) = ANY (ARRAY[
      '/rpc/website_publish',
      '/rpc/website_unpublish'
    ]),
    false);
$$;
CREATE FUNCTION folioone.website_snapshot_update_context()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT COALESCE(
    current_setting('request.method', true) = 'POST'
    AND current_setting('request.path', true) = '/rpc/website_change_slug',
    false);
$$;
REVOKE ALL ON FUNCTION folioone.website_snapshot_insert_context() FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION folioone.website_snapshot_delete_context() FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION folioone.website_snapshot_update_context() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION folioone.website_snapshot_insert_context() TO authenticated;
GRANT EXECUTE ON FUNCTION folioone.website_snapshot_delete_context() TO authenticated;
GRANT EXECUTE ON FUNCTION folioone.website_snapshot_update_context() TO authenticated;

CREATE POLICY wpa_select_own ON folioone.website_published_articles FOR SELECT TO authenticated
  USING (account_id = (SELECT auth.uid()));
-- INSERT: only inside POST /rpc/website_publish, for the caller's own website address and the
-- caller's own currently-published article (so nobody can place content under another site slug).
CREATE POLICY wpa_insert_rpc_own ON folioone.website_published_articles FOR INSERT TO authenticated
  WITH CHECK (
    account_id = (SELECT auth.uid())
    AND (SELECT folioone.website_snapshot_insert_context())
    AND site_slug = (SELECT s.slug FROM folioone.website_sites AS s WHERE s.account_id = (SELECT auth.uid()))
    AND EXISTS (SELECT 1 FROM folioone.articles AS a
                WHERE a.id = article_id AND a.account_id = (SELECT auth.uid()) AND a.status = 'published'));
-- DELETE: only inside POST /rpc/website_publish or /rpc/website_unpublish, OR inside a trigger
-- (pg_trigger_depth() > 0, never true for a direct request) while the article is no longer
-- published - i.e. the invalidation trigger after published -> draft/archived. Cascades from a
-- deleted article/account run as the table owner and bypass RLS.
CREATE POLICY wpa_delete_gated_own ON folioone.website_published_articles FOR DELETE TO authenticated
  USING (
    account_id = (SELECT auth.uid())
    AND (
      (SELECT folioone.website_snapshot_delete_context())
      OR (pg_trigger_depth() > 0
          AND NOT EXISTS (SELECT 1 FROM folioone.articles AS a
                          WHERE a.id = website_published_articles.article_id AND a.status = 'published'))));
GRANT SELECT, INSERT, DELETE ON TABLE folioone.website_published_articles TO authenticated;
GRANT UPDATE (site_slug) ON TABLE folioone.website_published_articles TO authenticated;
-- UPDATE (site_slug only): only inside POST /rpc/website_change_slug, and only to the caller's own
-- current website address.
CREATE POLICY wpa_update_rpc_own ON folioone.website_published_articles FOR UPDATE TO authenticated
  USING (account_id = (SELECT auth.uid()) AND (SELECT folioone.website_snapshot_update_context()))
  WITH CHECK (
    account_id = (SELECT auth.uid())
    AND (SELECT folioone.website_snapshot_update_context())
    AND site_slug = (SELECT s.slug FROM folioone.website_sites AS s WHERE s.account_id = (SELECT auth.uid())));

-- PUBLIC READ: only while the owning website is live (website_published is itself readable by
-- anon only when is_live), and never account_id / article_id.
CREATE POLICY wpa_select_live ON folioone.website_published_articles FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM folioone.website_published AS p
    WHERE p.slug = website_published_articles.site_slug AND p.is_live));
GRANT SELECT (site_slug, slug, title, subtitle, excerpt, cover_image_url, category, tags,
              content, seo_title, seo_description, word_count, reading_minutes, position,
              published_at, snapshot_at)
  ON TABLE folioone.website_published_articles TO anon;

-- An article that stops being published disappears from the public site in the same statement.
CREATE FUNCTION folioone.articles_drop_snapshot()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
BEGIN
  DELETE FROM folioone.website_published_articles WHERE article_id = OLD.id;
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER articles_drop_snapshot_trg
  AFTER UPDATE OF status ON folioone.articles
  FOR EACH ROW WHEN (OLD.status = 'published' AND NEW.status <> 'published')
  EXECUTE FUNCTION folioone.articles_drop_snapshot();
REVOKE ALL ON FUNCTION folioone.articles_drop_snapshot() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION folioone.articles_drop_snapshot() TO authenticated;

-- website_publish: 5 arguments. The article snapshot is copied from `articles` in this
-- transaction (only the caller's own, currently PUBLISHED articles, in the order given).
DROP FUNCTION folioone.website_publish(text, text, text, jsonb);
CREATE FUNCTION folioone.website_publish(
  p_theme text, p_title text, p_description text, p_content jsonb, p_article_ids uuid[])
RETURNS timestamptz
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_slug text;
  v_now timestamptz := now();
BEGIN
  IF COALESCE(cardinality(p_article_ids), 0) > 50 THEN
    RAISE EXCEPTION 'website_publish: at most 50 articles' USING ERRCODE = '22023';
  END IF;
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

  DELETE FROM folioone.website_published_articles WHERE account_id = v_uid;
  INSERT INTO folioone.website_published_articles
    (article_id, account_id, site_slug, slug, title, subtitle, excerpt, cover_image_url, category,
     tags, content, seo_title, seo_description, word_count, reading_minutes, position,
     published_at, snapshot_at)
  SELECT a.id, v_uid, v_slug, a.slug, a.title, a.subtitle, a.excerpt, a.cover_image_url, a.category,
         a.tags, a.content, a.seo_title, a.seo_description, a.word_count, a.reading_minutes,
         (s.ord - 1)::integer, a.published_at, v_now
    FROM (SELECT DISTINCT ON (u.id) u.id, u.ord
            FROM unnest(COALESCE(p_article_ids, '{}'::uuid[])) WITH ORDINALITY AS u(id, ord)
           ORDER BY u.id, u.ord) AS s
    JOIN folioone.articles AS a ON a.id = s.id AND a.account_id = v_uid AND a.status = 'published';

  UPDATE folioone.website_sites
     SET status = 'published', theme = p_theme, published_at = v_now, updated_at = v_now
   WHERE account_id = v_uid;
  RETURN v_now;
END;
$fn$;

CREATE OR REPLACE FUNCTION folioone.website_unpublish()
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  DELETE FROM folioone.website_published_articles WHERE account_id = v_uid;
  UPDATE folioone.website_published
     SET is_live = false, content = '{}'::jsonb, updated_at = now()
   WHERE account_id = v_uid;
  UPDATE folioone.website_sites
     SET status = CASE WHEN published_at IS NULL THEN status ELSE 'unpublished' END,
         unpublished_at = now(), updated_at = now()
   WHERE account_id = v_uid;
END;
$fn$;

CREATE OR REPLACE FUNCTION folioone.website_change_slug(p_slug text)
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
  UPDATE folioone.website_published SET slug = p_slug, updated_at = now() WHERE account_id = v_uid;
  UPDATE folioone.website_published_articles SET site_slug = p_slug WHERE account_id = v_uid;
END;
$fn$;

REVOKE ALL ON FUNCTION folioone.website_publish(text, text, text, jsonb, uuid[]) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION folioone.website_unpublish() FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION folioone.website_change_slug(text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION folioone.website_publish(text, text, text, jsonb, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION folioone.website_unpublish() TO authenticated;
GRANT EXECUTE ON FUNCTION folioone.website_change_slug(text) TO authenticated;

COMMIT;

-- Post-execution verification (read-only). Expected:
--  1. Both tables: owner postgres, RLS enabled AND forced; anon has NO table-level privilege;
--     PUBLIC none; authenticated: articles SELECT/INSERT/UPDATE/DELETE, snapshot SELECT/INSERT/DELETE
--     (+ UPDATE only on site_slug). These table privileges are only reachable through the gated policies.
--  2. 9 new policies: articles 4, website_published_articles 5 (one TO anon). Total 41 in folioone.
--     The snapshot INSERT/DELETE/UPDATE policies (wpa_insert_rpc_own, wpa_delete_gated_own,
--     wpa_update_rpc_own) each contain the matching website_snapshot_*_context() call; wpa_select_own
--     and wpa_select_live do not.
--  3. anon column privileges on website_published_articles: every column EXCEPT article_id and account_id.
--  4. website_publish exists ONLY as (text,text,text,jsonb,uuid[]); 18 functions in folioone in
--     total (14 + articles_drop_snapshot + 3 website_snapshot_*_context), none SECURITY DEFINER,
--     search_path empty, EXECUTE only for authenticated, all three gate helpers STABLE.
SELECT c.relname, pg_get_userbyid(c.relowner) AS owner, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_select,
       has_table_privilege('authenticated', c.oid, 'DELETE') AS auth_delete,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_table_select,
       has_any_column_privilege('anon', c.oid, 'SELECT') AS anon_any_column,
       has_table_privilege('service_role', c.oid, 'SELECT') AS service_select
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'folioone' AND c.relname IN ('articles', 'website_published_articles') ORDER BY 1;

SELECT tablename, policyname, cmd, roles, qual, with_check FROM pg_policies
WHERE schemaname = 'folioone' AND tablename IN ('articles', 'website_published_articles') ORDER BY 1, 3, 2;

SELECT attname, has_column_privilege('anon', 'folioone.website_published_articles', attname, 'SELECT') AS anon_can_select
FROM pg_attribute WHERE attrelid = 'folioone.website_published_articles'::regclass AND attnum > 0 AND NOT attisdropped ORDER BY attnum;

SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef AS security_definer, p.proconfig,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec
FROM pg_proc p WHERE p.pronamespace = 'folioone'::regnamespace
  AND (p.proname LIKE 'website\_%' OR p.proname = 'articles_drop_snapshot') ORDER BY 1, 2;

-- Gate helpers: expect provolatile = 's' (STABLE), prosecdef = false, proconfig = {search_path=""}.
SELECT p.proname, p.provolatile, p.prosecdef, p.proconfig
FROM pg_proc p WHERE p.pronamespace = 'folioone'::regnamespace AND p.proname LIKE 'website\_snapshot\_%' ORDER BY 1;

-- Gate predicates inside the snapshot policies. Expect: INSERT, DELETE and UPDATE policies have
-- qual_gated and/or check_gated = true; both SELECT policies are false/null.
SELECT policyname, cmd, qual ~ 'website_snapshot_' AS qual_gated, with_check ~ 'website_snapshot_' AS check_gated
FROM pg_policies WHERE schemaname = 'folioone' AND tablename = 'website_published_articles' ORDER BY 2, 1;

SELECT count(*) AS folioone_function_count FROM pg_proc WHERE pronamespace = 'folioone'::regnamespace;  -- expect 18

-- Rollback (DESTRUCTIVE: deletes every article and article snapshot). Only with approval.
-- It restores the M5 4-argument publish, unpublish and change-slug functions (copy their
-- definitions from docs/sql/milestone-5/001-website.sql).
-- BEGIN;
-- DROP TRIGGER articles_drop_snapshot_trg ON folioone.articles;
-- DROP FUNCTION folioone.articles_drop_snapshot();
-- -- (dropping the snapshot table below also drops its policies; then drop the gate helpers)
-- DROP FUNCTION folioone.website_snapshot_insert_context();
-- DROP FUNCTION folioone.website_snapshot_delete_context();
-- DROP FUNCTION folioone.website_snapshot_update_context();
-- DROP FUNCTION folioone.website_publish(text, text, text, jsonb, uuid[]);
-- DROP TABLE folioone.website_published_articles;
-- DROP TABLE folioone.articles;
-- -- then re-create website_publish(text,text,text,jsonb), website_unpublish() and
-- -- website_change_slug(text) exactly as in milestone-5/001-website.sql.
-- COMMIT;
