-- ============================================================================
-- Folioone M14 Folio Designer  |  001-design-templates.sql  |  schema: folioone
-- Website and digital-card designs move from hard-coded lists into the database, so platform
-- admins ("Folio designers") can create, version (optionally with AI), publish and retire
-- designs without a deploy. Decision record: AD-018. Docs: docs/architecture/m14-folio-designer.md.
--
-- STATUS:        PREPARED - NOT EXECUTED on any hosted project. Reviewed and run manually by
--                the developer in the Supabase SQL Editor (as postgres). `pnpm validate`
--                applies it to the LOCAL stack only.
-- Prerequisites: milestone-7 (website templates), milestone-8 (digital cards) and
--                milestone-9 (has_pro, enforce_pro_design) executed.
-- Execution:     this single file, after its preflight is all true.
-- Repeatable?:   ONE-TIME (the preflight requires the new tables to be absent).
-- Safety:        Touches only schema folioone. No data in existing tables changes. No SECURITY
--                DEFINER, no service_role privileges, no custom roles. RLS enabled AND forced on
--                the three new tables.
--
--   platform_admins            who may design. Each person can read only their own row; there is
--                              NO API write: the developer adds an admin in the SQL Editor
--                              (statement at the end of this file).
--   design_templates           one row per design and surface ('website' | 'card'): label,
--                              category, tier (free | pro), status (draft | published | retired),
--                              current_version. The 55 existing code designs are seeded as
--                              source = 'builtin' (still drawn by the app's code; read-only here).
--   design_template_versions   immutable, numbered versions of a designer design: the JSON spec
--                              (validated by the app before it is written; re-validated on every
--                              render) plus the prompt that produced it. No UPDATE or DELETE grant.
--   is_platform_admin()        SECURITY INVOKER: is the caller in platform_admins?
--   enforce_pro_design()       REPLACED: instead of two hard-coded PRO lists it now looks the
--                              design up in design_templates: it must exist and not be a draft,
--                              must be 'published' when newly chosen in a draft (a retired design
--                              stays on, and can be republished by, sites that already use it), PRO-tier designs need has_pro(), and a published snapshot that
--                              pins a designer spec (content.design) must match that design's
--                              current published version exactly (no hand-made specs via the API).
--
-- !!! DELIBERATE CHANGES - REVIEW BEFORE RUNNING !!!
--   1. The four theme/design CHECK lists (M7, M8) are replaced by a format check; validity is now
--      "a row in design_templates" (enforced by the trigger above).
--   2. Signed-in users can read published and retired designs, and the spec of each one's current
--      version (that is what the design pickers show). Drafts are visible to admins only.
--   3. Version rows include the designer's prompt; it is readable by signed-in users for the
--      current version of a published design. Do not put private notes in prompts.
-- ============================================================================

-- Read-only preflight; every result must be true before continuing.
SELECT current_database() = 'postgres' AS expected_database,
       session_user = 'postgres' AS expected_session_role,
       to_regprocedure('folioone.has_pro()') IS NOT NULL AS m9_applied,
       to_regprocedure('folioone.enforce_pro_design()') IS NOT NULL AS m9_trigger_present,
       to_regclass('folioone.digital_card_published') IS NOT NULL AS m8_applied,
       to_regclass('folioone.design_templates') IS NULL AS design_templates_absent,
       to_regclass('folioone.platform_admins') IS NULL AS platform_admins_absent;

BEGIN;

-- --------------------------------------------------------------------------
-- 1. Tables
-- --------------------------------------------------------------------------
CREATE TABLE folioone.platform_admins (
  account_id uuid PRIMARY KEY,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_admins_account_id_accounts_id_fk
    FOREIGN KEY (account_id) REFERENCES folioone.accounts(id) ON DELETE CASCADE,
  CONSTRAINT platform_admins_note_length_check CHECK (note IS NULL OR char_length(note) <= 200)
);

CREATE TABLE folioone.design_templates (
  surface text NOT NULL,
  id text NOT NULL,
  source text NOT NULL DEFAULT 'designer',
  label text NOT NULL,
  category text NOT NULL,
  blurb text NOT NULL DEFAULT '',
  tier text NOT NULL DEFAULT 'pro',
  status text NOT NULL DEFAULT 'draft',
  current_version integer,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  CONSTRAINT design_templates_pkey PRIMARY KEY (surface, id),
  CONSTRAINT design_templates_created_by_accounts_id_fk
    FOREIGN KEY (created_by) REFERENCES folioone.accounts(id) ON DELETE SET NULL,
  CONSTRAINT design_templates_surface_check CHECK (surface IN ('website', 'card')),
  CONSTRAINT design_templates_id_check CHECK (
    id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(id) BETWEEN 2 AND 48),
  CONSTRAINT design_templates_source_check CHECK (source IN ('builtin', 'designer')),
  CONSTRAINT design_templates_label_check CHECK (char_length(label) BETWEEN 1 AND 60),
  CONSTRAINT design_templates_category_check CHECK (category IN (
    'Editorial', 'Classic', 'Minimal', 'Bold', 'Creative', 'Technical',
    'Professional', 'Personal', 'Social')),
  CONSTRAINT design_templates_blurb_check CHECK (char_length(blurb) <= 300),
  CONSTRAINT design_templates_tier_check CHECK (tier IN ('free', 'pro')),
  CONSTRAINT design_templates_status_check CHECK (status IN ('draft', 'published', 'retired')),
  CONSTRAINT design_templates_current_version_check CHECK (current_version IS NULL OR current_version >= 1),
  -- A designer design can only be live with a version to draw; built-ins are drawn by code.
  CONSTRAINT design_templates_live_needs_version_check CHECK (
    source = 'builtin' OR status = 'draft' OR current_version IS NOT NULL)
);

CREATE TABLE folioone.design_template_versions (
  surface text NOT NULL,
  template_id text NOT NULL,
  version integer NOT NULL,
  spec jsonb NOT NULL,
  prompt text,
  origin text NOT NULL DEFAULT 'manual',
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT design_template_versions_pkey PRIMARY KEY (surface, template_id, version),
  CONSTRAINT design_template_versions_template_fk
    FOREIGN KEY (surface, template_id) REFERENCES folioone.design_templates(surface, id) ON DELETE CASCADE,
  CONSTRAINT design_template_versions_created_by_accounts_id_fk
    FOREIGN KEY (created_by) REFERENCES folioone.accounts(id) ON DELETE SET NULL,
  CONSTRAINT design_template_versions_version_check CHECK (version BETWEEN 1 AND 10000),
  CONSTRAINT design_template_versions_spec_check CHECK (
    jsonb_typeof(spec) = 'object' AND octet_length(spec::text) <= 20000),
  CONSTRAINT design_template_versions_prompt_check CHECK (prompt IS NULL OR char_length(prompt) <= 4000),
  CONSTRAINT design_template_versions_origin_check CHECK (origin IN ('manual', 'ai'))
);

-- --------------------------------------------------------------------------
-- 2. RLS on, forced, and a clean slate of privileges
-- --------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['platform_admins', 'design_templates', 'design_template_versions']
  LOOP
    EXECUTE format('ALTER TABLE folioone.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE folioone.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE folioone.%I FROM PUBLIC, anon, authenticated, service_role', t);
  END LOOP;
END;
$$;

-- --------------------------------------------------------------------------
-- 3. Functions and triggers (all SECURITY INVOKER, empty search_path)
-- --------------------------------------------------------------------------

-- Is the caller a platform admin? (Reads their own row through RLS.)
CREATE FUNCTION folioone.is_platform_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM folioone.platform_admins WHERE account_id = (SELECT auth.uid()));
$fn$;

-- design_templates: identity columns are fixed; a version must exist before it is current;
-- a design never goes back to draft once it has been live.
CREATE FUNCTION folioone.design_templates_before_write()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.surface IS DISTINCT FROM OLD.surface OR NEW.id IS DISTINCT FROM OLD.id
       OR NEW.source IS DISTINCT FROM OLD.source OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'Design identity cannot change' USING ERRCODE = 'PT409';
    END IF;
    IF NEW.status = 'draft' AND OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'A published design cannot return to draft' USING ERRCODE = 'PT409';
    END IF;
    IF NEW.status = 'published' AND (OLD.status <> 'published'
         OR NEW.current_version IS DISTINCT FROM OLD.current_version) THEN
      NEW.published_at := now();
    ELSE
      NEW.published_at := OLD.published_at;
    END IF;
  ELSE
    NEW.created_at := now();
    NEW.published_at := CASE WHEN NEW.status = 'published' THEN now() END;
  END IF;
  IF NEW.current_version IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM folioone.design_template_versions v
        WHERE v.surface = NEW.surface AND v.template_id = NEW.id AND v.version = NEW.current_version) THEN
    RAISE EXCEPTION 'That version does not exist' USING ERRCODE = 'PT409';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER design_templates_before_write_trg
  BEFORE INSERT OR UPDATE ON folioone.design_templates
  FOR EACH ROW EXECUTE FUNCTION folioone.design_templates_before_write();

-- design_template_versions: numbered 1, 2, 3, ... per design, with server-set author and time.
CREATE FUNCTION folioone.design_template_versions_before_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE
  v_next integer;
BEGIN
  SELECT coalesce(max(v.version), 0) + 1 INTO v_next
    FROM folioone.design_template_versions v
   WHERE v.surface = NEW.surface AND v.template_id = NEW.template_id;
  IF NEW.version IS DISTINCT FROM v_next THEN
    RAISE EXCEPTION 'Version % expected', v_next USING ERRCODE = 'PT409';
  END IF;
  NEW.created_at := now();
  NEW.created_by := (SELECT auth.uid());
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER design_template_versions_before_insert_trg
  BEFORE INSERT ON folioone.design_template_versions
  FOR EACH ROW EXECUTE FUNCTION folioone.design_template_versions_before_insert();

-- Replaces the M9 function (same name and arguments, so the four existing triggers keep working).
-- TG_ARGV[0] = design column ('theme' | 'design'), TG_ARGV[1] = surface ('website' | 'card').
-- Statements without a signed-in user (the developer in the SQL Editor) are not restricted.
CREATE OR REPLACE FUNCTION folioone.enforce_pro_design()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE
  v_new jsonb := to_jsonb(NEW);
  v_old jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END;
  v_design text := v_new ->> TG_ARGV[0];
  v_changed boolean := v_old IS NULL OR v_new -> TG_ARGV[0] IS DISTINCT FROM v_old -> TG_ARGV[0];
  v_relevant boolean;
  v_tier text;
  v_status text;
  v_source text;
  v_current integer;
  v_pin jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT t.tier, t.status, t.source, t.current_version INTO v_tier, v_status, v_source, v_current
    FROM folioone.design_templates t WHERE t.surface = TG_ARGV[1] AND t.id = v_design;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This design is not available' USING ERRCODE = 'PT422';
  END IF;
  -- Choosing a design (private draft tables) needs a published one. Published snapshots may also
  -- carry a retired design, so a site that already uses it can be republished (the publish RPCs
  -- upsert, so their BEFORE INSERT trigger always sees a "new" row).
  IF v_status = 'draft' OR (v_changed AND v_status = 'retired' AND NOT v_new ? 'is_live') THEN
    RAISE EXCEPTION 'This design is not available' USING ERRCODE = 'PT422';
  END IF;

  IF v_new ? 'is_live' THEN
    v_relevant := (v_new ->> 'is_live')::boolean AND (
      v_old IS NULL
      OR NOT (v_old ->> 'is_live')::boolean
      OR v_new -> 'published_at' IS DISTINCT FROM v_old -> 'published_at'
      OR v_changed);
    -- A live snapshot may pin a designer spec only as an exact copy of the current version.
    v_pin := v_new -> 'content' -> 'design';
    IF v_relevant AND (v_old IS NULL OR v_new -> 'content' IS DISTINCT FROM v_old -> 'content') THEN
      IF v_source = 'designer' AND (v_pin IS NULL OR jsonb_typeof(v_pin) <> 'object') THEN
        RAISE EXCEPTION 'This design is not available' USING ERRCODE = 'PT422';
      END IF;
      IF v_pin IS NOT NULL AND jsonb_typeof(v_pin) <> 'null' AND (
           v_source <> 'designer'
           OR v_pin ->> 'id' IS DISTINCT FROM v_design
           OR (v_pin ->> 'version') IS DISTINCT FROM v_current::text
           OR NOT EXISTS (
             SELECT 1 FROM folioone.design_template_versions v
              WHERE v.surface = TG_ARGV[1] AND v.template_id = v_design
                AND v.version = v_current AND v.spec = v_pin -> 'spec')) THEN
        RAISE EXCEPTION 'This design is not available' USING ERRCODE = 'PT422';
      END IF;
    END IF;
  ELSE
    v_relevant := v_changed;
  END IF;

  IF v_tier = 'pro' AND v_relevant AND NOT folioone.has_pro() THEN
    RAISE EXCEPTION 'This design is part of Folioone PRO' USING ERRCODE = 'PT402';
  END IF;
  RETURN NEW;
END;
$fn$;

-- --------------------------------------------------------------------------
-- 4. Policies and grants
-- --------------------------------------------------------------------------

-- platform_admins: each person sees only their own row; no API writes at all.
CREATE POLICY platform_admins_select_own ON folioone.platform_admins FOR SELECT TO authenticated
  USING (account_id = (SELECT auth.uid()));
GRANT SELECT (account_id) ON TABLE folioone.platform_admins TO authenticated;

-- design_templates: everyone signed in reads live (published / retired) designs; admins read all
-- and manage designer designs. Built-in rows are read-only through the API.
CREATE POLICY design_templates_select ON folioone.design_templates FOR SELECT TO authenticated
  USING (status IN ('published', 'retired') OR (SELECT folioone.is_platform_admin()));
CREATE POLICY design_templates_insert_admin ON folioone.design_templates FOR INSERT TO authenticated
  WITH CHECK ((SELECT folioone.is_platform_admin()) AND source = 'designer' AND status = 'draft'
              AND current_version IS NULL);
CREATE POLICY design_templates_update_admin ON folioone.design_templates FOR UPDATE TO authenticated
  USING ((SELECT folioone.is_platform_admin()) AND source = 'designer')
  WITH CHECK ((SELECT folioone.is_platform_admin()) AND source = 'designer');
CREATE POLICY design_templates_delete_admin ON folioone.design_templates FOR DELETE TO authenticated
  USING ((SELECT folioone.is_platform_admin()) AND source = 'designer' AND published_at IS NULL
         AND status = 'draft');
GRANT SELECT (surface, id, source, label, category, blurb, tier, status, current_version,
              created_at, updated_at, published_at)
  ON TABLE folioone.design_templates TO authenticated;
GRANT INSERT (surface, id, label, category, blurb, tier) ON TABLE folioone.design_templates TO authenticated;
GRANT UPDATE (label, category, blurb, tier, status, current_version)
  ON TABLE folioone.design_templates TO authenticated;
GRANT DELETE ON TABLE folioone.design_templates TO authenticated;

-- design_template_versions: admins read every version and add new ones; everyone signed in reads
-- the current version of a live design. Versions are never changed or deleted through the API.
CREATE POLICY design_template_versions_select ON folioone.design_template_versions FOR SELECT TO authenticated
  USING ((SELECT folioone.is_platform_admin()) OR EXISTS (
    SELECT 1 FROM folioone.design_templates t
     WHERE t.surface = design_template_versions.surface AND t.id = design_template_versions.template_id
       AND t.status IN ('published', 'retired') AND t.current_version = design_template_versions.version));
CREATE POLICY design_template_versions_insert_admin ON folioone.design_template_versions FOR INSERT TO authenticated
  WITH CHECK ((SELECT folioone.is_platform_admin()) AND EXISTS (
    SELECT 1 FROM folioone.design_templates t
     WHERE t.surface = design_template_versions.surface AND t.id = design_template_versions.template_id
       AND t.source = 'designer'));
GRANT SELECT (surface, template_id, version, spec, prompt, origin, created_at)
  ON TABLE folioone.design_template_versions TO authenticated;
GRANT INSERT (surface, template_id, version, spec, prompt, origin)
  ON TABLE folioone.design_template_versions TO authenticated;

REVOKE ALL ON FUNCTION folioone.is_platform_admin() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION folioone.is_platform_admin() TO authenticated;
REVOKE ALL ON FUNCTION folioone.design_templates_before_write() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION folioone.design_template_versions_before_insert() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION folioone.enforce_pro_design() FROM PUBLIC, anon, service_role;

-- --------------------------------------------------------------------------
-- 5. Seed the 55 code designs (lists must match the app; tests/designs-sql.test.ts checks)
-- --------------------------------------------------------------------------
INSERT INTO folioone.design_templates (surface, id, label, category, tier, source, status)
SELECT surface, id, label, category, tier, 'builtin', 'published'
FROM (VALUES
  ('website', 'professional', 'Professional', 'Classic', 'free'),
  ('website', 'creative', 'Creative', 'Creative', 'free'),
  ('website', 'minimal', 'Minimal', 'Minimal', 'free'),
  ('website', 'atelier', 'Atelier', 'Editorial', 'pro'),
  ('website', 'monograph', 'Monograph', 'Classic', 'pro'),
  ('website', 'gazette', 'Gazette', 'Editorial', 'pro'),
  ('website', 'noir', 'Noir', 'Bold', 'pro'),
  ('website', 'meridian', 'Meridian', 'Classic', 'pro'),
  ('website', 'linen', 'Linen', 'Minimal', 'free'),
  ('website', 'console', 'Console', 'Technical', 'pro'),
  ('website', 'gallery', 'Gallery', 'Creative', 'pro'),
  ('website', 'bauhaus', 'Bauhaus', 'Bold', 'pro'),
  ('website', 'sage', 'Sage', 'Editorial', 'pro'),
  ('website', 'obsidian', 'Obsidian', 'Classic', 'pro'),
  ('website', 'grid', 'Grid', 'Minimal', 'pro'),
  ('website', 'dune', 'Dune', 'Creative', 'pro'),
  ('website', 'folio-ink', 'Ink', 'Editorial', 'pro'),
  ('website', 'coastal', 'Coastal', 'Minimal', 'pro'),
  ('website', 'studio', 'Studio', 'Creative', 'pro'),
  ('website', 'ledger', 'Ledger', 'Classic', 'pro'),
  ('website', 'aurora', 'Aurora', 'Bold', 'pro'),
  ('website', 'typewriter', 'Typewriter', 'Minimal', 'pro'),
  ('website', 'vellum', 'Vellum', 'Classic', 'pro'),
  ('card', 'ivory', 'Ivory', 'Professional', 'free'),
  ('card', 'slate', 'Slate', 'Professional', 'free'),
  ('card', 'pinstripe', 'Pinstripe', 'Professional', 'pro'),
  ('card', 'graphite', 'Graphite', 'Professional', 'free'),
  ('card', 'monogram', 'Monogram', 'Professional', 'pro'),
  ('card', 'ledger', 'Ledger', 'Professional', 'pro'),
  ('card', 'meridian', 'Meridian', 'Professional', 'pro'),
  ('card', 'counsel', 'Counsel', 'Professional', 'pro'),
  ('card', 'linen', 'Linen', 'Personal', 'free'),
  ('card', 'sage', 'Sage', 'Personal', 'pro'),
  ('card', 'blush', 'Blush', 'Personal', 'pro'),
  ('card', 'dune', 'Dune', 'Personal', 'pro'),
  ('card', 'coastal', 'Coastal', 'Personal', 'free'),
  ('card', 'vellum', 'Vellum', 'Personal', 'pro'),
  ('card', 'lavender', 'Lavender', 'Personal', 'pro'),
  ('card', 'aurora', 'Aurora', 'Social', 'pro'),
  ('card', 'neon', 'Neon', 'Social', 'pro'),
  ('card', 'pop', 'Pop', 'Social', 'pro'),
  ('card', 'bubble', 'Bubble', 'Social', 'pro'),
  ('card', 'grid', 'Grid', 'Social', 'pro'),
  ('card', 'bauhaus', 'Bauhaus', 'Social', 'pro'),
  ('card', 'sunset', 'Sunset', 'Social', 'pro'),
  ('card', 'noir', 'Noir', 'Creative', 'pro'),
  ('card', 'gallery', 'Gallery', 'Creative', 'pro'),
  ('card', 'studio', 'Studio', 'Creative', 'pro'),
  ('card', 'atelier', 'Atelier', 'Creative', 'pro'),
  ('card', 'obsidian', 'Obsidian', 'Creative', 'pro'),
  ('card', 'terracotta', 'Terracotta', 'Creative', 'pro'),
  ('card', 'console', 'Console', 'Technical', 'pro'),
  ('card', 'typewriter', 'Typewriter', 'Technical', 'pro'),
  ('card', 'blueprint', 'Blueprint', 'Technical', 'pro'),
  ('card', 'mint', 'Mint', 'Technical', 'free')
) AS s(surface, id, label, category, tier);

-- --------------------------------------------------------------------------
-- 6. Design columns: the fixed CHECK lists give way to design_templates (see the trigger)
-- --------------------------------------------------------------------------
ALTER TABLE folioone.website_sites DROP CONSTRAINT website_sites_theme_check;
ALTER TABLE folioone.website_sites ADD CONSTRAINT website_sites_theme_check CHECK (
  theme ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(theme) BETWEEN 2 AND 48);
ALTER TABLE folioone.website_published DROP CONSTRAINT website_published_theme_check;
ALTER TABLE folioone.website_published ADD CONSTRAINT website_published_theme_check CHECK (
  theme ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(theme) BETWEEN 2 AND 48);
ALTER TABLE folioone.digital_cards DROP CONSTRAINT digital_cards_design_check;
ALTER TABLE folioone.digital_cards ADD CONSTRAINT digital_cards_design_check CHECK (
  design ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(design) BETWEEN 2 AND 48);
ALTER TABLE folioone.digital_card_published DROP CONSTRAINT digital_card_published_design_check;
ALTER TABLE folioone.digital_card_published ADD CONSTRAINT digital_card_published_design_check CHECK (
  design ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(design) BETWEEN 2 AND 48);

COMMIT;

-- Read-only verification (expected values in comments).
-- 1. 3 tables, RLS enabled and forced: expect 3 rows, all true.
SELECT c.relname, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'folioone'
  AND c.relname IN ('platform_admins', 'design_templates', 'design_template_versions') ORDER BY 1;
-- 2. Seed: expect website | 23 and card | 32, every row builtin + published.
SELECT surface, count(*) FROM folioone.design_templates
WHERE source = 'builtin' AND status = 'published' GROUP BY surface ORDER BY 1;
-- 3. Existing sites and cards all point at a known design: expect 0.
SELECT (SELECT count(*) FROM folioone.website_sites s WHERE NOT EXISTS (
          SELECT 1 FROM folioone.design_templates t WHERE t.surface = 'website' AND t.id = s.theme))
     + (SELECT count(*) FROM folioone.digital_cards c WHERE NOT EXISTS (
          SELECT 1 FROM folioone.design_templates t WHERE t.surface = 'card' AND t.id = c.design))
       AS unknown_designs;
-- 4. 7 policies: expect 7.
SELECT count(*) FROM pg_policies WHERE schemaname = 'folioone'
  AND tablename IN ('platform_admins', 'design_templates', 'design_template_versions');
-- 5. No SECURITY DEFINER among the new or replaced functions: expect 4 rows, all false.
SELECT p.proname, p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'folioone' AND p.proname IN ('is_platform_admin', 'design_templates_before_write',
  'design_template_versions_before_insert', 'enforce_pro_design') ORDER BY 1;

-- Make someone a Folio designer (run separately, as postgres; replace the email):
-- INSERT INTO folioone.platform_admins (account_id, note)
-- SELECT u.id, 'Folio designer' FROM auth.users u
--  JOIN folioone.accounts a ON a.id = u.id
--  WHERE u.email = 'designer@example.com'
-- ON CONFLICT (account_id) DO NOTHING;
-- Remove: DELETE FROM folioone.platform_admins WHERE account_id = '<uuid>';

-- Rollback (only while no site or card uses a designer design; check with query 3 above after
-- deleting the designer rows): re-run docs/sql/milestone-7/001-website-templates.sql, re-add the
-- two M8 design CHECKs from docs/sql/milestone-8/001-digital-cards.sql, re-create
-- enforce_pro_design() from docs/sql/milestone-9/001-pro-plans.sql (CREATE OR REPLACE), then:
-- DROP TABLE folioone.design_template_versions, folioone.design_templates, folioone.platform_admins;
-- DROP FUNCTION folioone.design_templates_before_write(), folioone.design_template_versions_before_insert(),
--   folioone.is_platform_admin();
