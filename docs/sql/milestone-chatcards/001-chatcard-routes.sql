-- ============================================================================
-- Folioone ChatCards  |  001-chatcard-routes.sql  |  schema: folioone
-- Reserves the new top-level routes /chat, /chatcards and /messages so that no website or
-- digital-card address can shadow them (Next.js serves the static route first, which would
-- silently hide a website that used one of these words).
--
-- STATUS:        PREPARED - NOT EXECUTED on any hosted project. Reviewed and run manually by
--                the developer in the Supabase SQL Editor (as postgres). `pnpm validate`
--                applies it to the LOCAL stack only.
-- Prerequisites: docs/sql/milestone-8/001-digital-cards.sql executed.
-- Execution:     run 001, then 002, then 003 (this folder), each after its preflight is all true.
-- Repeatable?:   Yes (drops and re-adds the same four CHECK constraints).
-- Safety:        Only CHECK constraints change. No data is modified. If the preflight finds an
--                existing address that uses a new reserved word, STOP: that owner must change
--                their address first (the constraint would fail).
-- Expected:      The four slug CHECKs list 'chat', 'chatcards' and 'messages'.
-- ============================================================================

-- Read-only preflight; every result must be true before continuing.
SELECT current_database() = 'postgres' AS expected_database,
       session_user = 'postgres' AS expected_session_role,
       to_regclass('folioone.digital_card_published') IS NOT NULL AS m8_applied,
       NOT EXISTS (SELECT 1 FROM folioone.website_sites WHERE slug IN ('chat', 'chatcards', 'messages'))
         AND NOT EXISTS (SELECT 1 FROM folioone.website_published WHERE slug IN ('chat', 'chatcards', 'messages'))
         AND NOT EXISTS (SELECT 1 FROM folioone.digital_cards WHERE slug IN ('chat', 'chatcards', 'messages'))
         AND NOT EXISTS (SELECT 1 FROM folioone.digital_card_published WHERE slug IN ('chat', 'chatcards', 'messages'))
         AS no_address_uses_new_reserved_words;

BEGIN;

ALTER TABLE folioone.website_sites DROP CONSTRAINT website_sites_slug_check;
ALTER TABLE folioone.website_sites ADD CONSTRAINT website_sites_slug_check CHECK (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 3 AND 40
    AND slug <> ALL (ARRAY['about', 'account', 'accounts', 'admin', 'api', 'app', 'assets', 'auth', 'blog', 'cards', 'chat', 'chatcards', 'contact', 'dashboard', 'docs', 'edit', 'explore', 'favicon', 'folioone', 'forgot-password', 'health', 'help', 'home', 'index', 'legal', 'login', 'logout', 'messages', 'new', 'null', 'onboarding', 'persona', 'personas', 'preview', 'pricing', 'privacy', 'profile', 'public', 'register', 'reset-password', 'robots', 'root', 'search', 'security', 'settings', 'signin', 'signup', 'sitemap', 'social', 'static', 'status', 'support', 'system', 'terms', 'undefined', 'user', 'users', 'website', 'websites', 'www']));
ALTER TABLE folioone.website_published DROP CONSTRAINT website_published_slug_check;
ALTER TABLE folioone.website_published ADD CONSTRAINT website_published_slug_check CHECK (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 3 AND 40
    AND slug <> ALL (ARRAY['about', 'account', 'accounts', 'admin', 'api', 'app', 'assets', 'auth', 'blog', 'cards', 'chat', 'chatcards', 'contact', 'dashboard', 'docs', 'edit', 'explore', 'favicon', 'folioone', 'forgot-password', 'health', 'help', 'home', 'index', 'legal', 'login', 'logout', 'messages', 'new', 'null', 'onboarding', 'persona', 'personas', 'preview', 'pricing', 'privacy', 'profile', 'public', 'register', 'reset-password', 'robots', 'root', 'search', 'security', 'settings', 'signin', 'signup', 'sitemap', 'social', 'static', 'status', 'support', 'system', 'terms', 'undefined', 'user', 'users', 'website', 'websites', 'www']));
ALTER TABLE folioone.digital_cards DROP CONSTRAINT digital_cards_slug_check;
ALTER TABLE folioone.digital_cards ADD CONSTRAINT digital_cards_slug_check CHECK (slug IS NULL OR (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 3 AND 40
    AND slug <> ALL (ARRAY['about', 'account', 'accounts', 'admin', 'api', 'app', 'assets', 'auth', 'blog', 'cards', 'chat', 'chatcards', 'contact', 'dashboard', 'docs', 'edit', 'explore', 'favicon', 'folioone', 'forgot-password', 'health', 'help', 'home', 'index', 'legal', 'login', 'logout', 'messages', 'new', 'null', 'onboarding', 'persona', 'personas', 'preview', 'pricing', 'privacy', 'profile', 'public', 'register', 'reset-password', 'robots', 'root', 'search', 'security', 'settings', 'signin', 'signup', 'sitemap', 'social', 'static', 'status', 'support', 'system', 'terms', 'undefined', 'user', 'users', 'website', 'websites', 'www'])));
ALTER TABLE folioone.digital_card_published DROP CONSTRAINT digital_card_published_slug_check;
ALTER TABLE folioone.digital_card_published ADD CONSTRAINT digital_card_published_slug_check CHECK (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 3 AND 40
    AND slug <> ALL (ARRAY['about', 'account', 'accounts', 'admin', 'api', 'app', 'assets', 'auth', 'blog', 'cards', 'chat', 'chatcards', 'contact', 'dashboard', 'docs', 'edit', 'explore', 'favicon', 'folioone', 'forgot-password', 'health', 'help', 'home', 'index', 'legal', 'login', 'logout', 'messages', 'new', 'null', 'onboarding', 'persona', 'personas', 'preview', 'pricing', 'privacy', 'profile', 'public', 'register', 'reset-password', 'robots', 'root', 'search', 'security', 'settings', 'signin', 'signup', 'sitemap', 'social', 'static', 'status', 'support', 'system', 'terms', 'undefined', 'user', 'users', 'website', 'websites', 'www']));

COMMIT;

-- Read-only verification: expect 4 rows, all true.
SELECT conrelid::regclass AS table_name, conname,
       pg_get_constraintdef(oid) LIKE '%''chatcards''%' AS reserves_chatcards
FROM pg_constraint
WHERE conname IN ('website_sites_slug_check', 'website_published_slug_check',
                  'digital_cards_slug_check', 'digital_card_published_slug_check')
ORDER BY 1;

-- Rollback: re-run the four ALTER pairs from docs/sql/milestone-8/001-digital-cards.sql
-- (the same constraints without the three new words). Safe at any time.
