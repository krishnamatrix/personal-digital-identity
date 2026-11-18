-- ============================================================================
-- Folioone M13  |  003-intro-video-background.sql  |  schema: folioone
-- Video intro backgrounds: records how the take's background was treated in the owner's
-- browser while recording ('none', 'blur' or 'cutout').
--
-- STATUS:        PREPARED - NOT EXECUTED on any hosted project. Reviewed and run manually by
--                the developer in the Supabase SQL Editor (as postgres). `pnpm validate`
--                applies it to the LOCAL stack only.
-- Prerequisites: docs/sql/milestone-13/002-intro-videos.sql executed.
-- Repeatable?:   ONE-TIME. The preflight must show every column `true`.
-- Safety:        Touches only folioone.intro_videos (one column + one CHECK). Existing rows
--                get 'none', which is what they are. RLS, policies and grants are unchanged
--                (the existing owner-only policies cover the new column).
--
-- Until this runs the app still works: plain takes save and play; the studio reports an
-- error only when someone saves a blurred or cut-out take.
--
-- Design:
--   background   'cutout' takes are "stacked" videos: every frame is twice as tall, the
--                camera picture on top and a black-and-white mask of the person below.
--                Their poster JPEG is stacked the same way. The website player uses the
--                mask to draw just the person over the page. Storage is unchanged (same
--                buckets, types and paths as 001).
-- ============================================================================

-- Read-only preflight; every result must be true before continuing.
SELECT current_database() = 'postgres' AS expected_database,
       session_user = 'postgres' AS expected_session_role,
       to_regclass('folioone.intro_videos') IS NOT NULL AS m13_002_applied,
       NOT EXISTS (SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'folioone' AND table_name = 'intro_videos'
           AND column_name = 'background') AS background_absent;

BEGIN;

ALTER TABLE folioone.intro_videos
  ADD COLUMN background text NOT NULL DEFAULT 'none';

ALTER TABLE folioone.intro_videos
  ADD CONSTRAINT intro_videos_background_check
  CHECK (background IN ('none', 'blur', 'cutout'));

COMMENT ON COLUMN folioone.intro_videos.background IS
  'How the take''s background was treated while recording: none, blur, or cutout (stacked picture + mask video).';

COMMIT;

-- Read-only verification; expect one row: background | text | NO | 'none'::text.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'folioone' AND table_name = 'intro_videos'
  AND column_name = 'background';
