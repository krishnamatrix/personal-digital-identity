-- ============================================================================
-- Folioone M13  |  001-intro-video-storage.sql  |  schema: storage (Supabase Storage)
-- Video intro: two Storage buckets for the owner's recorded self-introduction and its
-- published copy, with owner-only policies on storage.objects.
--
-- STATUS:        PREPARED - NOT EXECUTED on any hosted project. Reviewed and run manually by
--                the developer in the Supabase SQL Editor (as postgres). Not part of
--                `pnpm validate` (Storage is disabled in the local stack), like M10.
-- Prerequisites: Storage enabled on the project. Independent of 002 (either order works; the
--                feature needs both).
-- Repeatable?:   YES. Buckets are upserted; policies are dropped and re-created.
-- Safety:        Touches only storage.buckets (two rows) and policies on storage.objects for
--                these two buckets. No folioone changes, no roles, no SECURITY DEFINER, no
--                service_role. Other buckets (including M10's) and their policies are untouched.
--
-- Folder structure (the first folder is ALWAYS the owner's auth user id):
--
--   identity-video  PRIVATE   <account_id>/intro/<video_id>.<webm|mp4>   the recording
--                             <account_id>/intro/<video_id>.jpg          its poster frame
--                             Only the owner can read (signed URLs), upload or delete.
--                             The browser uploads straight to Storage with a signed upload
--                             URL that the server creates with the OWNER'S session, so the
--                             INSERT policy below still decides.
--   public-video    PUBLIC    <account_id>/website/<video_id>.<webm|mp4|jpg>
--                             A copy made ONLY when the owner publishes their website
--                             (AD-005). Removed when they unpublish, delete the video or
--                             publish a newer one.
--
-- !!! DELIBERATE EXPOSURE CHANGE - REVIEW BEFORE RUNNING !!!
-- public-video is a PUBLIC bucket: anyone with an object's URL can fetch it, which is what a
-- published website needs. Nobody but the owner can list, write or delete there, and the app
-- only copies a video into it when that person publishes with "Show on my website" on.
--
-- Limits: 50 MB per object (the Free-plan global upload ceiling; the recorder targets about
-- 2 Mbit/s, so a 2-minute take is about 30 MB). Only WebM / MP4 video and the JPEG poster.
-- Storage egress is metered: every published play downloads the file from public-video.
-- ============================================================================

-- Read-only preflight; every result must be true before continuing.
SELECT current_database() = 'postgres' AS expected_database,
       session_user = 'postgres' AS expected_session_role,
       to_regclass('storage.buckets') IS NOT NULL AS storage_available,
       to_regclass('storage.objects') IS NOT NULL AS storage_objects_available,
       to_regprocedure('storage.foldername(text)') IS NOT NULL AS foldername_available;

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('identity-video', 'identity-video', false, 52428800, ARRAY['video/webm', 'video/mp4', 'image/jpeg']),
  ('public-video',   'public-video',   true,  52428800, ARRAY['video/webm', 'video/mp4', 'image/jpeg'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------- identity-video (private)
DROP POLICY IF EXISTS folioone_identity_video_owner_select ON storage.objects;
DROP POLICY IF EXISTS folioone_identity_video_owner_insert ON storage.objects;
DROP POLICY IF EXISTS folioone_identity_video_owner_delete ON storage.objects;

CREATE POLICY folioone_identity_video_owner_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'identity-video'
         AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE POLICY folioone_identity_video_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'identity-video'
              AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
              AND name ~ '^[0-9a-f-]{36}/intro/[0-9a-f-]{36}\.(webm|mp4|jpg)$');

CREATE POLICY folioone_identity_video_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'identity-video'
         AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

-- No UPDATE policy: objects are never overwritten (a new take gets a new video_id).

-- ------------------------------------------------------------------ public-video (public)
DROP POLICY IF EXISTS folioone_public_video_owner_select ON storage.objects;
DROP POLICY IF EXISTS folioone_public_video_owner_insert ON storage.objects;
DROP POLICY IF EXISTS folioone_public_video_owner_delete ON storage.objects;

CREATE POLICY folioone_public_video_owner_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'public-video'
         AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE POLICY folioone_public_video_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'public-video'
              AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
              AND name ~ '^[0-9a-f-]{36}/website/[0-9a-f-]{36}\.(webm|mp4|jpg)$');

CREATE POLICY folioone_public_video_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'public-video'
         AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

COMMIT;

-- Read-only verification.
SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets
WHERE id IN ('identity-video', 'public-video') ORDER BY id;

SELECT policyname, cmd, roles FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'folioone_%video%'
ORDER BY policyname;
-- Expect 6 rows: select / insert / delete for each bucket, all TO {authenticated}.

-- Rollback (DESTRUCTIVE: removes every recorded intro and published copy). Empty and delete
-- the two buckets in the Storage dashboard, then drop the policies here.
-- BEGIN;
-- DROP POLICY folioone_identity_video_owner_select ON storage.objects;
-- DROP POLICY folioone_identity_video_owner_insert ON storage.objects;
-- DROP POLICY folioone_identity_video_owner_delete ON storage.objects;
-- DROP POLICY folioone_public_video_owner_select ON storage.objects;
-- DROP POLICY folioone_public_video_owner_insert ON storage.objects;
-- DROP POLICY folioone_public_video_owner_delete ON storage.objects;
-- COMMIT;
