# M10: Profile photo upload (Supabase Storage)

## What users see

- **My Identity → Personal** and **onboarding step 4**: "Upload photo" / "Change photo" / "Remove". The browser crops the
  image to a square, scales it to 800 px and re-encodes it (WebP, else JPEG), which also strips EXIF data such as GPS
  location. The old "Profile image URL" text field is gone; an existing external link keeps working until replaced.
- **Website**: the intro shows the photo when "Show image" is on. The owner's preview uses a short-lived signed URL.
- **Digital card**: designs with a photo emboss show it when "Profile photo emboss" is on. The photo is put into the
  published card only for those designs (monogram designs never publish it).

## Folder structure

| Bucket           | Visibility | Path                                    | Written when                    |
| ---------------- | ---------- | --------------------------------------- | ------------------------------- |
| `identity-media` | private    | `<account_id>/profile/<image_id>.<ext>` | the owner uploads a photo       |
| `public-media`   | public     | `<account_id>/website/<image_id>.<ext>` | the owner publishes the website |
| `public-media`   | public     | `<account_id>/card/<image_id>.<ext>`    | the owner publishes the card    |

`<account_id>` is the auth user id (Storage policies check it); `<image_id>` is a fresh UUID per upload, so a new photo
never overwrites an old one and public URLs never serve a stale cached image. `<ext>` is `jpg`, `png` or `webp`, decided
from the file's bytes. Both buckets accept only those types, up to 2 MB. Code: `src/domains/media/media-paths.ts`.

## How it works

- **Upload** (`uploadProfileImageAction` → `uploadMyProfileImage`): verifies the session first, checks size and
  signature, uploads to `identity-media`, then sets `profile_image_url` to
  `<SUPABASE_URL>/storage/v1/object/authenticated/identity-media/<path>`. If the profile update fails the object is
  removed again; the previous uploaded photo is deleted afterwards.
- **Owner display**: `ownerImageUrl` turns that reference into a 1-hour signed URL. A reference to someone else's folder
  is never shown or published.
- **Drafts** are built with the photo's future public URL (`publishedImageUrl`), so "unpublished changes" compares equal
  to the live snapshot.
- **Publish** (`publishWebsite` / `publishMyCard`): copies the private object to `public-media/<account_id>/<surface>/`
  before writing the snapshot, then removes other files in that folder. **Unpublish** empties the folder. Cleanup is
  best effort and logged; it never undoes a publish.
- **Remove photo**: clears the reference and deletes the private object. Live pages keep their public copy until the
  owner republishes or unpublishes.

## Setup (developer)

1. Run `docs/sql/milestone-10/001-profile-media-storage.sql` in the Supabase SQL Editor (repeatable; no folioone changes).
2. Nothing else: no new environment variables. Storage must be enabled on the project (default on hosted Supabase).

Not covered by `pnpm validate`: Storage is disabled in the local stack (`supabase/config.toml`).
