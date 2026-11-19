-- ============================================================================
-- Folioone M13  |  004-intro-trim-and-studio.sql  |  schema: folioone
-- Video intro trim (which part of the take plays) and the 'studio' background.
--
-- STATUS:        PREPARED - NOT EXECUTED on any hosted project. Reviewed and run manually by
--                the developer in the Supabase SQL Editor (as postgres). `pnpm validate`
--                applies it to the LOCAL stack only.
-- Prerequisites: docs/sql/milestone-13/003-intro-video-background.sql executed.
-- Repeatable?:   ONE-TIME. The preflight must show every column `true`.
-- Safety:        Touches only folioone.intro_videos: two nullable columns, one new CHECK, and
--                the background CHECK replaced by a wider one (every existing value stays
--                valid). RLS, policies, grants and Storage are unchanged.
--
-- Until this runs the app still works: untrimmed takes save and play; saving a trim or a
-- Studio take reports an error.
--
-- Design:
--   trim_start, trim_end   seconds into the file; both null (play it all) or both set, with
--                          at least one second between them. Nothing is re-encoded: the
--                          players start and stop at these times.
--   background 'studio'    the room replaced by a lit studio backdrop in the owner's browser
--                          while recording (baked into an ordinary video).
-- ============================================================================

-- Read-only preflight; every result must be true before continuing.
SELECT current_database() = 'postgres' AS expected_database,
       session_user = 'postgres' AS expected_session_role,
       EXISTS (SELECT 1 FROM pg_constraint
         WHERE conrelid = 'folioone.intro_videos'::regclass
           AND conname = 'intro_videos_background_check') AS m13_003_applied,
       NOT EXISTS (SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'folioone' AND table_name = 'intro_videos'
           AND column_name = 'trim_start') AS trim_absent;

BEGIN;

ALTER TABLE folioone.intro_videos
  ADD COLUMN trim_start numeric(6,2),
  ADD COLUMN trim_end numeric(6,2);

ALTER TABLE folioone.intro_videos
  ADD CONSTRAINT intro_videos_trim_check
  CHECK (
    (trim_start IS NULL AND trim_end IS NULL)
    OR (trim_start >= 0 AND trim_end >= trim_start + 1 AND trim_end <= 185)
  );

ALTER TABLE folioone.intro_videos
  DROP CONSTRAINT intro_videos_background_check;
ALTER TABLE folioone.intro_videos
  ADD CONSTRAINT intro_videos_background_check
  CHECK (background IN ('none', 'blur', 'studio', 'cutout'));

COMMENT ON COLUMN folioone.intro_videos.trim_start IS
  'Seconds into the take where playback starts (null with trim_end = the whole take).';
COMMENT ON COLUMN folioone.intro_videos.trim_end IS
  'Seconds into the take where playback stops.';

COMMIT;

-- Read-only verification; expect trim_start and trim_end (numeric, nullable) and the two
-- CHECK definitions.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'folioone' AND table_name = 'intro_videos'
  AND column_name IN ('trim_start', 'trim_end');
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'folioone.intro_videos'::regclass
  AND conname IN ('intro_videos_trim_check', 'intro_videos_background_check');
