-- ============================================================================
-- Folioone M12  |  001-booking-insights.sql  |  schema: folioone
-- Booking block: lets Insights record 'booking_open' (a visitor opened the owner's scheduler
-- on their website). The links page and booking block themselves need no schema change: they
-- live in website_sites.config and the published snapshot.
--
-- STATUS:        PREPARED - NOT EXECUTED on any hosted project. Reviewed and run manually by
--                the developer in the Supabase SQL Editor (as postgres). `pnpm validate`
--                applies it to the LOCAL stack only.
-- Prerequisites: docs/sql/milestone-11/002-insights.sql executed.
-- Repeatable?:   YES (drops and re-adds one CHECK constraint).
-- Safety:        One constraint on one table. No grants, policies or functions change.
-- ============================================================================

-- Read-only preflight; every result must be true before continuing.
SELECT current_database() = 'postgres' AS expected_database,
       session_user = 'postgres' AS expected_session_role,
       to_regclass('folioone.insight_events') IS NOT NULL AS m11_applied;

BEGIN;

ALTER TABLE folioone.insight_events DROP CONSTRAINT insight_events_event_check;
ALTER TABLE folioone.insight_events ADD CONSTRAINT insight_events_event_check CHECK (event IN
  ('view', 'link_click', 'contact_click', 'video_play', 'qr_open', 'vcard_save', 'share', 'booking_open'));

COMMIT;

-- Read-only verification: the constraint lists booking_open.
SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
WHERE conrelid = 'folioone.insight_events'::regclass AND conname = 'insight_events_event_check';

-- Rollback (only after deleting booking_open rows):
-- BEGIN;
-- DELETE FROM folioone.insight_events WHERE event = 'booking_open';
-- ALTER TABLE folioone.insight_events DROP CONSTRAINT insight_events_event_check;
-- ALTER TABLE folioone.insight_events ADD CONSTRAINT insight_events_event_check CHECK (event IN
--   ('view', 'link_click', 'contact_click', 'video_play', 'qr_open', 'vcard_save', 'share'));
-- COMMIT;
