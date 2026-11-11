-- ============================================================================
-- Folioone M10  |  001-profile-media-storage.sql  |  schema: storage (Supabase Storage)
-- Profile image upload: two Storage buckets and owner-only policies on storage.objects.
--
-- STATUS:        PREPARED - NOT EXECUTED on any hosted project. Reviewed and run manually by
--                the developer in the Supabase SQL Editor (as postgres). Not part of
--                `pnpm validate` (Storage is disabled in the local stack).
-- Prerequisites: Storage enabled on the project (it is by default on hosted Supabase).
--                No dependency on the folioone tables: the image reference is kept in the
--                existing folioone.identity_profiles.profile_image_url column.
-- Repeatable?:   YES. Buckets are upserted; policies are dropped and re-created.
-- Safety:        Touches only storage.buckets (two rows) and policies on storage.objects for
--                these two buckets. No folioone changes, no roles, no SECURITY DEFINER, no
--                service_role. Other buckets and their policies are untouched.
--
-- Folder structure (the first folder is ALWAYS the owner's auth user id):
--
--   identity-media  PRIVATE   <account_id>/profile/<image_id>.<jpg|png|webp>
--                             The owner's uploaded profile photo. Only the owner can read
--                             (signed URLs for previews), upload or delete it.
--   public-media    PUBLIC    <account_id>/website/<image_id>.<ext>
--                             <account_id>/card/<image_id>.<ext>
--                             A copy made ONLY when the owner publishes their website or card
--                             (AD-005: public output comes from publishing, never from editing).
--                             Removed when they unpublish or publish a different photo.
--
-- !!! DELIBERATE EXPOSURE CHANGE - REVIEW BEFORE RUNNING !!!
-- public-media is a PUBLIC bucket: anyone with an object's URL can fetch it, which is what a
-- published website / card needs. Nobody but the owner can list, write or delete there, and
-- the app only copies a photo into it when that person publishes. identity-media stays private.
-- Both buckets accept only JPEG / PNG / WebP up to 2 MB (also enforced by the app).
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
  ('identity-media', 'identity-media', false, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('public-media',   'public-media',   true,  2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------- identity-media (private)
DROP POLICY IF EXISTS folioone_identity_media_owner_select ON storage.objects;
DROP POLICY IF EXISTS folioone_identity_media_owner_insert ON storage.objects;
DROP POLICY IF EXISTS folioone_identity_media_owner_delete ON storage.objects;

CREATE POLICY folioone_identity_media_owner_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'identity-media'
         AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE POLICY folioone_identity_media_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'identity-media'
              AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
              AND name ~ '^[0-9a-f-]{36}/profile/[0-9a-f-]{36}\.(jpg|png|webp)$');

CREATE POLICY folioone_identity_media_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'identity-media'
         AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

-- No UPDATE policy: objects are never overwritten (a new photo gets a new image_id).

-- ------------------------------------------------------------------ public-media (public)
-- Public reads go through the public object endpoint and need no policy. These policies only
-- let the owner list / copy into / clean up their own folders.
DROP POLICY IF EXISTS folioone_public_media_owner_select ON storage.objects;
DROP POLICY IF EXISTS folioone_public_media_owner_insert ON storage.objects;
DROP POLICY IF EXISTS folioone_public_media_owner_delete ON storage.objects;

CREATE POLICY folioone_public_media_owner_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'public-media'
         AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE POLICY folioone_public_media_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'public-media'
              AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
              AND name ~ '^[0-9a-f-]{36}/(website|card)/[0-9a-f-]{36}\.(jpg|png|webp)$');

CREATE POLICY folioone_public_media_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'public-media'
         AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

COMMIT;

-- Read-only verification.
SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets
WHERE id IN ('identity-media', 'public-media') ORDER BY id;

SELECT policyname, cmd, roles, qual, with_check FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'folioone_%'
ORDER BY policyname;
-- Expect 6 rows: select / insert / delete for each bucket, all TO {authenticated}.

-- Rollback (DESTRUCTIVE: removes every uploaded profile photo and published copy). Hosted
-- Supabase blocks direct SQL deletes from storage tables, so empty and delete the two buckets
-- in the Storage dashboard, then drop the policies here.
-- BEGIN;
-- DROP POLICY folioone_identity_media_owner_select ON storage.objects;
-- DROP POLICY folioone_identity_media_owner_insert ON storage.objects;
-- DROP POLICY folioone_identity_media_owner_delete ON storage.objects;
-- DROP POLICY folioone_public_media_owner_select ON storage.objects;
-- DROP POLICY folioone_public_media_owner_insert ON storage.objects;
-- DROP POLICY folioone_public_media_owner_delete ON storage.objects;
-- COMMIT;
