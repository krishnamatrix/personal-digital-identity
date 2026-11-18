-- ============================================================================
-- Folioone M13  |  002-intro-videos.sql  |  schema: folioone
-- Video intro: one private row per account describing the owner's recorded self-introduction
-- (the files live in Storage, see 001), and the 'video_complete' insight event.
--
-- STATUS:        PREPARED - NOT EXECUTED on any hosted project. Reviewed and run manually by
--                the developer in the Supabase SQL Editor (as postgres). `pnpm validate`
--                applies it to the LOCAL stack only.
-- Prerequisites: docs/sql/milestone-11/002-insights.sql and milestone-12/001 executed.
-- Repeatable?:   ONE-TIME. The preflight must show every column `true`.
-- Safety:        Touches only schema folioone. No anon access, no SECURITY DEFINER, no
--                service_role privileges. Existing tables untouched except one CHECK.
--
-- Design:
--   intro_videos   private, owner-only (no public read: the published website carries its own
--                  copy of what it needs inside the website snapshot).
--     script         the teleprompter text (kept even before a take is saved).
--     video_id ...   the saved take; Storage paths are derived from account_id + video_id +
--                    content_type, so no path is stored. All four take columns are set
--                    together or are all null.
--     captions       timed caption cues [{"start": s, "end": s, "text": "..."}] transcribed
--                    from the take (optional; empty when no AI provider is configured).
--     show_on_website  whether publishing the website includes the video.
-- ============================================================================

-- Read-only preflight; every result must be true before continuing.
SELECT current_database() = 'postgres' AS expected_database,
       session_user = 'postgres' AS expected_session_role,
       to_regclass('folioone.accounts') IS NOT NULL AS accounts_present,
       to_regclass('folioone.insight_events') IS NOT NULL AS m11_applied,
       to_regclass('folioone.intro_videos') IS NULL AS intro_videos_absent,
       pg_get_constraintdef((SELECT oid FROM pg_constraint
         WHERE conrelid = 'folioone.insight_events'::regclass
           AND conname = 'insight_events_event_check')) LIKE '%booking_open%' AS m12_applied;

BEGIN;

CREATE TABLE folioone.intro_videos (
  account_id uuid PRIMARY KEY,
  script text NOT NULL DEFAULT '',
  video_id uuid,
  content_type text,
  byte_size bigint,
  duration_seconds numeric(6, 2),
  has_poster boolean NOT NULL DEFAULT false,
  captions jsonb NOT NULL DEFAULT '[]'::jsonb,
  show_on_website boolean NOT NULL DEFAULT true,
  recorded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intro_videos_account_id_accounts_id_fk
    FOREIGN KEY (account_id) REFERENCES folioone.accounts(id) ON DELETE CASCADE,
  CONSTRAINT intro_videos_take_check CHECK (
    num_nonnulls(video_id, content_type, byte_size, duration_seconds, recorded_at) IN (0, 5)),
  CONSTRAINT intro_videos_script_check CHECK (char_length(script) <= 3000),
  CONSTRAINT intro_videos_content_type_check CHECK (
    content_type IS NULL OR content_type IN ('video/webm', 'video/mp4')),
  CONSTRAINT intro_videos_byte_size_check CHECK (
    byte_size IS NULL OR byte_size BETWEEN 1 AND 52428800),
  CONSTRAINT intro_videos_duration_check CHECK (
    duration_seconds IS NULL OR (duration_seconds > 0 AND duration_seconds <= 180)),
  CONSTRAINT intro_videos_poster_check CHECK (NOT has_poster OR video_id IS NOT NULL),
  CONSTRAINT intro_videos_captions_check CHECK (
    jsonb_typeof(captions) = 'array' AND octet_length(captions::text) <= 40000)
);

ALTER TABLE folioone.intro_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE folioone.intro_videos FORCE ROW LEVEL SECURITY;

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
      AND c.relname = 'intro_videos'
      AND acl.grantee <> 0 AND acl.grantee <> c.relowner
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %s FROM %I',
                   grant_entry.relation_name, grant_entry.grantee_name);
  END LOOP;
END;
$$;
REVOKE ALL PRIVILEGES ON TABLE folioone.intro_videos FROM PUBLIC, anon, service_role;

CREATE POLICY intro_videos_select_own ON folioone.intro_videos FOR SELECT TO authenticated
  USING (account_id = (SELECT auth.uid()));
CREATE POLICY intro_videos_insert_own ON folioone.intro_videos FOR INSERT TO authenticated
  WITH CHECK (account_id = (SELECT auth.uid()));
CREATE POLICY intro_videos_update_own ON folioone.intro_videos FOR UPDATE TO authenticated
  USING (account_id = (SELECT auth.uid())) WITH CHECK (account_id = (SELECT auth.uid()));
CREATE POLICY intro_videos_delete_own ON folioone.intro_videos FOR DELETE TO authenticated
  USING (account_id = (SELECT auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE folioone.intro_videos TO authenticated;

-- Insights: a visitor watched the intro to the end.
ALTER TABLE folioone.insight_events DROP CONSTRAINT insight_events_event_check;
ALTER TABLE folioone.insight_events ADD CONSTRAINT insight_events_event_check CHECK (event IN
  ('view', 'link_click', 'contact_click', 'video_play', 'qr_open', 'vcard_save', 'share',
   'booking_open', 'video_complete'));

COMMIT;

-- Read-only verification.
SELECT c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_select,
       has_table_privilege('service_role', c.oid, 'SELECT') AS service_select
FROM pg_class c WHERE c.oid = 'folioone.intro_videos'::regclass;
-- Expect: rls true/true, anon_select false, auth_select true, service_select false.

SELECT policyname, cmd, roles FROM pg_policies
WHERE schemaname = 'folioone' AND tablename = 'intro_videos' ORDER BY policyname;
-- Expect 4 rows (delete / insert / select / update own), all TO {authenticated}.

SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
WHERE conrelid = 'folioone.insight_events'::regclass AND conname = 'insight_events_event_check';
-- Expect the list to end with 'booking_open', 'video_complete'.

-- Rollback (DESTRUCTIVE: forgets every intro; empty the Storage buckets from 001 separately).
-- BEGIN;
-- DROP TABLE folioone.intro_videos;
-- DELETE FROM folioone.insight_events WHERE event = 'video_complete';
-- ALTER TABLE folioone.insight_events DROP CONSTRAINT insight_events_event_check;
-- ALTER TABLE folioone.insight_events ADD CONSTRAINT insight_events_event_check CHECK (event IN
--   ('view', 'link_click', 'contact_click', 'video_play', 'qr_open', 'vcard_save', 'share', 'booking_open'));
-- COMMIT;
