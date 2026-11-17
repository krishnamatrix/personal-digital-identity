-- ============================================================================
-- Folioone M11  |  002-insights.sql  |  schema: folioone
-- Insights: anonymous visit and click events on PUBLISHED websites and digital cards, readable
-- only by their owner (the /insights dashboard).
--
-- STATUS:        PREPARED - NOT EXECUTED on any hosted project. Reviewed and run manually by
--                the developer in the Supabase SQL Editor (as postgres). `pnpm validate`
--                applies it to the LOCAL stack only.
-- Prerequisites: docs/sql/milestone-5/001 and milestone-8/001 executed.
-- Repeatable?:   ONE-TIME. The preflight must show every column `true`.
-- Safety:        Touches only schema folioone. No SECURITY DEFINER, no service_role privileges.
--
-- !!! DELIBERATE EXPOSURE CHANGES - REVIEW BEFORE RUNNING !!!
--   1. website_published and digital_card_published get a random, stable `public_id` (uuid),
--      readable by anon on LIVE rows only (like the rest of the snapshot). It identifies the
--      page for event recording without ever exposing account_id. It survives republishing,
--      unpublishing and address changes, so the owner keeps their history.
--   2. anon may INSERT into insight_events, and only:
--        - for a page that is live right now (policy subquery on the live snapshot), and
--        - into the listed columns: id and occurred_at are server-set, so events cannot be
--          backdated or overwritten. anon can never read, update or delete events.
--      Anyone holding the public anon key could still insert fake events for a live page
--      (inflated counts). Accepted: the CHECKs bound every value, and the app filters bots.
--
-- Privacy (by design, see docs/architecture/m11-featured-and-insights.md): no IP address, no
-- cookie id, no full user agent and no free-text referrer URL is stored. `visitor_hash` is a
-- 16-hex digest of (daily random salt, IP, user agent) computed in server memory; the salt is
-- never stored, so the digest cannot be reversed or linked across days.
-- ============================================================================

-- Read-only preflight; every result must be true before continuing.
SELECT current_database() = 'postgres' AS expected_database,
       session_user = 'postgres' AS expected_session_role,
       to_regclass('folioone.website_published') IS NOT NULL AS m5_applied,
       to_regclass('folioone.digital_card_published') IS NOT NULL AS m8_applied,
       to_regclass('folioone.insight_events') IS NULL AS events_absent,
       NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'folioone' AND column_name = 'public_id') AS public_id_absent;

BEGIN;

-- 1. Stable public ids (existing rows each get their own random value).
ALTER TABLE folioone.website_published
  ADD COLUMN public_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE folioone.website_published
  ADD CONSTRAINT website_published_public_id_key UNIQUE (public_id);
GRANT SELECT (public_id) ON TABLE folioone.website_published TO anon;

ALTER TABLE folioone.digital_card_published
  ADD COLUMN public_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE folioone.digital_card_published
  ADD CONSTRAINT digital_card_published_public_id_key UNIQUE (public_id);
GRANT SELECT (public_id) ON TABLE folioone.digital_card_published TO anon;

-- 2. Events. Exactly one of website_id / card_id. Deleting the snapshot row (account
--    deletion cascades) deletes its events.
CREATE TABLE folioone.insight_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  website_id uuid REFERENCES folioone.website_published(public_id) ON DELETE CASCADE,
  card_id uuid REFERENCES folioone.digital_card_published(public_id) ON DELETE CASCADE,
  event text NOT NULL,
  path text,
  target_kind text,
  target_label text,
  target_url text,
  referrer_host text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  country text,
  time_zone text,
  language text,
  device text,
  browser text,
  os text,
  visitor_hash text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT insight_events_one_target_check CHECK (num_nonnulls(website_id, card_id) = 1),
  CONSTRAINT insight_events_event_check CHECK (event IN
    ('view', 'link_click', 'contact_click', 'video_play', 'qr_open', 'vcard_save', 'share')),
  CONSTRAINT insight_events_path_check CHECK (path IS NULL OR (path ~ '^/' AND char_length(path) <= 300)),
  CONSTRAINT insight_events_target_kind_check CHECK (target_kind IS NULL OR target_kind ~ '^[a-z_]{1,24}$'),
  CONSTRAINT insight_events_target_label_check CHECK (target_label IS NULL OR char_length(target_label) <= 160),
  CONSTRAINT insight_events_target_url_check CHECK (target_url IS NULL OR (target_url ~ '^https?://' AND char_length(target_url) <= 2000)),
  CONSTRAINT insight_events_referrer_check CHECK (referrer_host IS NULL OR referrer_host ~ '^[a-z0-9.-]{1,253}$'),
  CONSTRAINT insight_events_utm_check CHECK (
    (utm_source IS NULL OR char_length(utm_source) <= 100) AND
    (utm_medium IS NULL OR char_length(utm_medium) <= 100) AND
    (utm_campaign IS NULL OR char_length(utm_campaign) <= 100)),
  CONSTRAINT insight_events_country_check CHECK (country IS NULL OR country ~ '^[A-Z]{2}$'),
  CONSTRAINT insight_events_time_zone_check CHECK (time_zone IS NULL OR time_zone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$'),
  CONSTRAINT insight_events_language_check CHECK (language IS NULL OR language ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  CONSTRAINT insight_events_device_check CHECK (device IS NULL OR device IN ('mobile', 'tablet', 'desktop')),
  CONSTRAINT insight_events_browser_check CHECK (browser IS NULL OR char_length(browser) <= 40),
  CONSTRAINT insight_events_os_check CHECK (os IS NULL OR char_length(os) <= 40),
  CONSTRAINT insight_events_visitor_hash_check CHECK (visitor_hash IS NULL OR visitor_hash ~ '^[0-9a-f]{16}$')
);

CREATE INDEX insight_events_website_time_idx ON folioone.insight_events (website_id, occurred_at DESC)
  WHERE website_id IS NOT NULL;
CREATE INDEX insight_events_card_time_idx ON folioone.insight_events (card_id, occurred_at DESC)
  WHERE card_id IS NOT NULL;

ALTER TABLE folioone.insight_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE folioone.insight_events FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE folioone.insight_events FROM PUBLIC, anon, authenticated, service_role;

-- Visitors (anon): record an event for a page that is live right now. Column-limited.
CREATE POLICY insight_events_insert_live ON folioone.insight_events FOR INSERT TO anon
  WITH CHECK (
    (website_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM folioone.website_published p WHERE p.public_id = website_id AND p.is_live))
    OR
    (card_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM folioone.digital_card_published c WHERE c.public_id = card_id AND c.is_live)));
GRANT INSERT (website_id, card_id, event, path, target_kind, target_label, target_url,
              referrer_host, utm_source, utm_medium, utm_campaign, country, time_zone,
              language, device, browser, os, visitor_hash)
  ON TABLE folioone.insight_events TO anon;

-- Owners (authenticated): read the events of their own website / card only.
CREATE POLICY insight_events_select_own ON folioone.insight_events FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM folioone.website_published p
            WHERE p.public_id = website_id AND p.account_id = (SELECT auth.uid()))
    OR
    EXISTS (SELECT 1 FROM folioone.digital_card_published c
            WHERE c.public_id = card_id AND c.account_id = (SELECT auth.uid())));
GRANT SELECT ON TABLE folioone.insight_events TO authenticated;

COMMIT;

-- Read-only verification.
SELECT c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
       has_table_privilege('anon', c.oid, 'INSERT') AS anon_insert_any_column,
       has_column_privilege('anon', c.oid, 'occurred_at', 'INSERT') AS anon_sets_time,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_select,
       has_table_privilege('authenticated', c.oid, 'INSERT') AS auth_insert,
       has_table_privilege('service_role', c.oid, 'SELECT') AS service_select
FROM pg_class c WHERE c.oid = 'folioone.insight_events'::regclass;
-- Expect: rls true/true, anon_select false, anon_insert_any_column false (column grants only),
-- anon_sets_time false, auth_select true, auth_insert false, service_select false.

SELECT policyname, cmd, roles FROM pg_policies
WHERE schemaname = 'folioone' AND tablename = 'insight_events' ORDER BY policyname;
-- Expect 2 rows: insight_events_insert_live (INSERT, {anon}), insight_events_select_own (SELECT, {authenticated}).

SELECT table_name, column_name FROM information_schema.column_privileges
WHERE table_schema = 'folioone' AND grantee = 'anon' AND column_name = 'public_id' ORDER BY 1;
-- Expect 2 rows: digital_card_published, website_published.

-- Retention (developer, as needed): events older than 13 months.
-- DELETE FROM folioone.insight_events WHERE occurred_at < now() - interval '13 months';

-- Rollback (DESTRUCTIVE: deletes all recorded events).
-- BEGIN;
-- DROP TABLE folioone.insight_events;
-- ALTER TABLE folioone.website_published DROP COLUMN public_id;
-- ALTER TABLE folioone.digital_card_published DROP COLUMN public_id;
-- COMMIT;
