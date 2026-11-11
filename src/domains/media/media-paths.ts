/**
 * Storage layout for Folioone media (see docs/sql/milestone-10/001-profile-media-storage.sql).
 * The first folder is always the owner's auth user id; Storage policies check it.
 *
 *   identity-media (private)  <account_id>/profile/<image_id>.<ext>
 *   public-media   (public)   <account_id>/website/<image_id>.<ext>
 *                             <account_id>/card/<image_id>.<ext>
 *
 * The private photo is referenced from identity_profiles.profile_image_url by its
 * authenticated object URL (an https URL, so the existing column constraint holds, and the
 * column keeps working for photos hosted elsewhere). A public copy is made only on publish.
 * Pure: no I/O, safe to unit-test.
 */
export const PRIVATE_MEDIA_BUCKET = "identity-media";
export const PUBLIC_MEDIA_BUCKET = "public-media";

export type PublishSurface = "website" | "card";
export type ImageExtension = "jpg" | "png" | "webp";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PRIVATE_PATH = new RegExp(
  `^(${UUID})/profile/(${UUID})\\.(jpg|png|webp)$`,
);

export type StoredImage = {
  accountId: string;
  imageId: string;
  ext: ImageExtension;
  /** Object path inside identity-media. */
  path: string;
};

function base(supabaseUrl: string) {
  return supabaseUrl.replace(/\/+$/, "");
}

export function profileImagePath(
  accountId: string,
  imageId: string,
  ext: ImageExtension,
): string {
  return `${accountId}/profile/${imageId}.${ext}`;
}

export function publishedImagePath(
  image: Pick<StoredImage, "accountId" | "imageId" | "ext">,
  surface: PublishSurface,
): string {
  return `${image.accountId}/${surface}/${image.imageId}.${image.ext}`;
}

/** What profile_image_url holds for an uploaded photo. */
export function storedImageRef(supabaseUrl: string, path: string): string {
  return `${base(supabaseUrl)}/storage/v1/object/authenticated/${PRIVATE_MEDIA_BUCKET}/${path}`;
}

/** Public URL of a published copy (deterministic, so drafts compare equal to snapshots). */
export function publicImageUrl(supabaseUrl: string, path: string): string {
  return `${base(supabaseUrl)}/storage/v1/object/public/${PUBLIC_MEDIA_BUCKET}/${path}`;
}

/** The uploaded photo behind a profile_image_url, or null for an external / foreign URL. */
export function parseStoredImageRef(
  url: string | null | undefined,
  supabaseUrl: string,
): StoredImage | null {
  if (!url) return null;
  const prefix = `${base(supabaseUrl)}/storage/v1/object/authenticated/${PRIVATE_MEDIA_BUCKET}/`;
  if (!url.startsWith(prefix)) return null;
  const path = url.slice(prefix.length);
  const match = PRIVATE_PATH.exec(path);
  if (!match) return null;
  return {
    accountId: match[1]!,
    imageId: match[2]!,
    ext: match[3] as ImageExtension,
    path,
  };
}

/** Like parseStoredImageRef, but only for the given owner's own photo. */
export function parseOwnStoredImage(
  url: string | null | undefined,
  supabaseUrl: string,
  accountId: string,
): StoredImage | null {
  const image = parseStoredImageRef(url, supabaseUrl);
  return image && image.accountId === accountId ? image : null;
}
