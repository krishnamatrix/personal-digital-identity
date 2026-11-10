-- ============================================================================
-- Folioone M7  |  001-website-templates.sql  |  schema: folioone
-- Portfolio templates: widens the allowed website themes from the original three to the
-- 23 designs the application offers (3 built-in + 20 templates in
-- src/domains/website/templates.ts).
--
-- STATUS:        PREPARED - NOT EXECUTED on any hosted project. Reviewed and run manually by
--                the developer in the Supabase SQL Editor (as postgres). `pnpm validate`
--                applies it to the LOCAL stack only.
-- Prerequisites: docs/sql/milestone-5/001 and docs/sql/milestone-6/001 executed.
-- Execution order: the only M7 file; run it once, after M6.
-- Repeatable?:   YES. Each constraint is dropped IF EXISTS and re-created with the full list.
-- Safety:        Touches only two CHECK constraints in schema folioone. No data is changed,
--                no grants, policies, functions or roles are touched. Every existing row
--                uses one of the original three themes, all of which stay allowed, so the
--                re-created constraints validate immediately.
-- Keep in sync:  tests/website-templates.test.ts fails if this list and the application's
--                THEME_IDS differ.
-- ============================================================================

-- Read-only preflight; every result must be true before continuing.
SELECT current_database() = 'postgres' AS expected_database,
       session_user = 'postgres' AS expected_session_role,
       to_regclass('folioone.website_sites') IS NOT NULL AS sites_present,
       to_regclass('folioone.website_published') IS NOT NULL AS published_present;

BEGIN;

ALTER TABLE folioone.website_sites
  DROP CONSTRAINT IF EXISTS website_sites_theme_check;
ALTER TABLE folioone.website_sites
  ADD CONSTRAINT website_sites_theme_check CHECK (theme IN ('professional', 'creative', 'minimal', 'atelier', 'monograph', 'gazette', 'noir', 'meridian', 'linen', 'console', 'gallery', 'bauhaus', 'sage', 'obsidian', 'grid', 'dune', 'folio-ink', 'coastal', 'studio', 'ledger', 'aurora', 'typewriter', 'vellum'));

ALTER TABLE folioone.website_published
  DROP CONSTRAINT IF EXISTS website_published_theme_check;
ALTER TABLE folioone.website_published
  ADD CONSTRAINT website_published_theme_check CHECK (theme IN ('professional', 'creative', 'minimal', 'atelier', 'monograph', 'gazette', 'noir', 'meridian', 'linen', 'console', 'gallery', 'bauhaus', 'sage', 'obsidian', 'grid', 'dune', 'folio-ink', 'coastal', 'studio', 'ledger', 'aurora', 'typewriter', 'vellum'));

COMMIT;

-- Verification (read-only): both rows must list all 23 themes.
SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conname IN ('website_sites_theme_check', 'website_published_theme_check')
ORDER BY conname;
