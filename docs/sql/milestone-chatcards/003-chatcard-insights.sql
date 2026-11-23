-- ============================================================================
-- Folioone ChatCards  |  003-chatcard-insights.sql  |  schema: folioone
-- ChatCard events in the EXISTING Insights table (M11): no separate analytics store.
--
-- STATUS:        PREPARED - NOT EXECUTED on any hosted project. Reviewed and run manually by
--                the developer in the Supabase SQL Editor (as postgres). `pnpm validate`
--                applies it to the LOCAL stack only.
-- Prerequisites: milestone-13/002-intro-videos.sql (latest event list) and
--                milestone-chatcards/002-chatcards.sql executed.
-- Execution:     001 -> 002 -> 003 (this file).
-- Repeatable?:   ONE-TIME. The preflight must show every column `true`.
-- Safety:        Touches only folioone.insight_events. No SECURITY DEFINER.
--
-- What changes:
--   - insight_events.chat_card_id (internal card id; never rendered in a page). A row targets
--     exactly one of website / digital card / ChatCard.
--   - Eleven ChatCard events. They carry NO message text, NO activation code and NO account id:
--     only the event name, time and the same coarse, non-identifying context as other events.
--   - anon may INSERT ChatCard events (the server records them with the anonymous client, so
--     events are never linked to a signed-in person). Owners read their own cards' events.
--     As with M11, anyone holding the anon key and a card's internal id could add fake events;
--     the internal id is never sent to browsers.
--   - 'chat_card_qr_scanned' means "opened through the QR code's link" (?src=qr). A browser
--     cannot prove a physical scan, and the dashboard labels it accordingly.
-- ============================================================================

-- Read-only preflight; every result must be true before continuing.
SELECT current_database() = 'postgres' AS expected_database,
       session_user = 'postgres' AS expected_session_role,
       to_regclass('folioone.chat_card_public') IS NOT NULL AS chatcards_002_applied,
       (SELECT pg_get_constraintdef(oid) FROM pg_constraint
         WHERE conrelid = 'folioone.insight_events'::regclass
           AND conname = 'insight_events_event_check') LIKE '%video_complete%' AS m13_applied,
       NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'folioone' AND table_name = 'insight_events'
                     AND column_name = 'chat_card_id') AS column_absent;

BEGIN;

ALTER TABLE folioone.insight_events
  ADD COLUMN chat_card_id uuid REFERENCES folioone.chat_card_public(card_id) ON DELETE CASCADE;

ALTER TABLE folioone.insight_events DROP CONSTRAINT insight_events_one_target_check;
ALTER TABLE folioone.insight_events ADD CONSTRAINT insight_events_one_target_check
  CHECK (num_nonnulls(website_id, card_id, chat_card_id) = 1);

ALTER TABLE folioone.insight_events DROP CONSTRAINT insight_events_event_check;
ALTER TABLE folioone.insight_events ADD CONSTRAINT insight_events_event_check CHECK (event IN
  ('view', 'link_click', 'contact_click', 'video_play', 'qr_open', 'vcard_save', 'share',
   'booking_open', 'video_complete',
   'chat_card_viewed', 'chat_card_qr_scanned', 'activation_code_attempted', 'activation_code_redeemed',
   'conversation_requested', 'conversation_accepted', 'conversation_declined', 'message_sent',
   'conversation_closed', 'chat_card_paused', 'chat_card_published'));

-- ChatCard events only on ChatCard rows, and only on them.
ALTER TABLE folioone.insight_events ADD CONSTRAINT insight_events_chat_card_events_check CHECK (
  (chat_card_id IS NOT NULL) = (event IN
    ('chat_card_viewed', 'chat_card_qr_scanned', 'activation_code_attempted', 'activation_code_redeemed',
     'conversation_requested', 'conversation_accepted', 'conversation_declined', 'message_sent',
     'conversation_closed', 'chat_card_paused', 'chat_card_published')));

CREATE INDEX insight_events_chat_card_time_idx ON folioone.insight_events (chat_card_id, occurred_at DESC)
  WHERE chat_card_id IS NOT NULL;

CREATE POLICY insight_events_insert_chat_card ON folioone.insight_events FOR INSERT TO anon
  WITH CHECK (chat_card_id IS NOT NULL);
GRANT INSERT (chat_card_id) ON TABLE folioone.insight_events TO anon;

CREATE POLICY insight_events_select_own_chat_card ON folioone.insight_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM folioone.chat_cards c
                 WHERE c.id = chat_card_id AND c.account_id = (SELECT auth.uid())));

COMMIT;

-- Read-only verification.
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'folioone.insight_events'::regclass
  AND conname IN ('insight_events_one_target_check', 'insight_events_event_check',
                  'insight_events_chat_card_events_check')
ORDER BY 1;
-- Expect 3 rows; one_target counts chat_card_id; the event list ends with 'chat_card_published'.

SELECT policyname, cmd, roles FROM pg_policies
WHERE schemaname = 'folioone' AND tablename = 'insight_events' ORDER BY policyname;
-- Expect 4 rows: the two M11 policies plus insight_events_insert_chat_card (INSERT, {anon}) and
-- insight_events_select_own_chat_card (SELECT, {authenticated}).

SELECT has_column_privilege('anon', 'folioone.insight_events', 'chat_card_id', 'INSERT') AS anon_inserts_chat_card,
       has_column_privilege('anon', 'folioone.insight_events', 'chat_card_id', 'SELECT') AS anon_reads;
-- Expect true, false.

-- Retention follows M11 (13 months), e.g.:
-- DELETE FROM folioone.insight_events WHERE occurred_at < now() - interval '13 months';

-- Rollback (deletes ChatCard events only):
-- BEGIN;
-- DELETE FROM folioone.insight_events WHERE chat_card_id IS NOT NULL;
-- DROP POLICY insight_events_select_own_chat_card ON folioone.insight_events;
-- DROP POLICY insight_events_insert_chat_card ON folioone.insight_events;
-- ALTER TABLE folioone.insight_events DROP CONSTRAINT insight_events_chat_card_events_check;
-- ALTER TABLE folioone.insight_events DROP CONSTRAINT insight_events_event_check;
-- ALTER TABLE folioone.insight_events ADD CONSTRAINT insight_events_event_check CHECK (event IN
--   ('view', 'link_click', 'contact_click', 'video_play', 'qr_open', 'vcard_save', 'share',
--    'booking_open', 'video_complete'));
-- ALTER TABLE folioone.insight_events DROP CONSTRAINT insight_events_one_target_check;
-- ALTER TABLE folioone.insight_events ADD CONSTRAINT insight_events_one_target_check
--   CHECK (num_nonnulls(website_id, card_id) = 1);
-- ALTER TABLE folioone.insight_events DROP COLUMN chat_card_id;
-- COMMIT;
