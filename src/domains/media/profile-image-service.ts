import "server-only";
import { randomUUID } from "node:crypto";
import { requireSupabaseConfig } from "@/lib/env";
import { logLoadError } from "@/lib/server-log";
import {
  copyToPublicMedia,
  createEmptyProfile,
  ensureAccount,
  findProfile,
  getAuthenticatedDb,
  listPublicMedia,
  removePrivateImages,
  removePublicMedia,
  signPrivateImage,
  updateProfile,
  uploadPrivateImage,
  type DbClient,
} from "@/lib/db/query";
import { readProfileImageFile } from "@/domains/media/image-file";
import {
  parseOwnStoredImage,
  parseStoredImageRef,
  profileImagePath,
  publicImageUrl,
  publishedImagePath,
  storedImageRef,
  type PublishSurface,
} from "@/domains/media/media-paths";

/**
 * Profile photo: uploaded to the private identity-media bucket, referenced from
 * identity_profiles.profile_image_url, and copied to public-media only when the owner
 * publishes their website or card (AD-005). Every Storage call uses the owner's own session.
 */

function supabaseUrl(): string {
  return requireSupabaseConfig().url;
}

export type ProfileImageResult = {
  /** Value now stored in profile_image_url. */
  ref: string;
  /** Short-lived URL the owner's browser can display. */
  displayUrl: string | null;
};

/** Session first, then the file: anonymous requests never get their file read or stored. */
export async function uploadMyProfileImage(
  file: File,
): Promise<ProfileImageResult> {
  const { client, user } = await getAuthenticatedDb();
  const upload = await readProfileImageFile(file);
  await ensureAccount(client, user.id);
  const current =
    (await findProfile(client, user.id)) ??
    (await createEmptyProfile(client, user.id));

  const path = profileImagePath(user.id, randomUUID(), upload.ext);
  await uploadPrivateImage(client, path, upload.bytes, upload.contentType);
  const ref = storedImageRef(supabaseUrl(), path);
  try {
    await updateProfile(client, user.id, { profileImageUrl: ref });
  } catch (error) {
    await removePrivateImages(client, [path]).catch(() => undefined);
    throw error;
  }

  const previous = parseOwnStoredImage(
    current.profileImageUrl,
    supabaseUrl(),
    user.id,
  );
  if (previous && previous.path !== path) {
    // Published copies are separate objects, so live pages keep working until republished.
    await removePrivateImages(client, [previous.path]).catch((error) =>
      logLoadError("profile-image:cleanup", error),
    );
  }
  return { ref, displayUrl: await signPrivateImage(client, path) };
}

/** Clears the photo (uploaded or linked). Live pages keep their copy until republished. */
export async function removeMyProfileImage(): Promise<void> {
  const { client, user } = await getAuthenticatedDb();
  const current = await findProfile(client, user.id);
  if (!current?.profileImageUrl) return;
  await updateProfile(client, user.id, { profileImageUrl: null });
  const own = parseOwnStoredImage(
    current.profileImageUrl,
    supabaseUrl(),
    user.id,
  );
  if (own)
    await removePrivateImages(client, [own.path]).catch((error) =>
      logLoadError("profile-image:cleanup", error),
    );
}

/** For pages: the signed-in owner's displayable photo URL (or null). */
export async function myProfileImageDisplayUrl(
  url: string | null,
): Promise<string | null> {
  if (!url) return null;
  const { client, user } = await getAuthenticatedDb();
  return ownerImageUrl(client, user.id, url);
}

/** What the owner's browser can show for profile_image_url (signed URL for an upload). */
export async function ownerImageUrl(
  client: DbClient,
  accountId: string,
  url: string | null,
): Promise<string | null> {
  if (!url) return null;
  const own = parseOwnStoredImage(url, supabaseUrl(), accountId);
  if (own) return signPrivateImage(client, own.path);
  // Someone else's private object can never be shown or published.
  if (parseStoredImageRef(url, supabaseUrl())) return null;
  return url;
}

/**
 * The URL a published website / card will use for this photo: the deterministic public copy
 * for an upload, the link itself for an external image. Building drafts with this keeps the
 * "unpublished changes" comparison stable.
 */
export function publishedImageUrl(
  accountId: string,
  url: string | null,
  surface: PublishSurface,
): string | null {
  if (!url) return null;
  const own = parseOwnStoredImage(url, supabaseUrl(), accountId);
  if (own)
    return publicImageUrl(supabaseUrl(), publishedImagePath(own, surface));
  if (parseStoredImageRef(url, supabaseUrl())) return null;
  return url;
}

/** Before publishing: make sure the public copy the snapshot points at exists. */
export async function preparePublishedImage(
  client: DbClient,
  accountId: string,
  url: string | null,
  surface: PublishSurface,
): Promise<void> {
  const own = parseOwnStoredImage(url, supabaseUrl(), accountId);
  if (!own) return;
  await copyToPublicMedia(client, own.path, publishedImagePath(own, surface));
}

/**
 * After publishing / unpublishing: remove public copies the live page no longer uses.
 * `keepUrl` is the published image URL (null removes everything). Best effort: a failure is
 * logged and never undoes the publish.
 */
export async function cleanupPublishedImages(
  client: DbClient,
  accountId: string,
  surface: PublishSurface,
  keepUrl: string | null | undefined,
): Promise<void> {
  try {
    const paths = await listPublicMedia(client, accountId, surface);
    const stale = paths.filter(
      (path) => !keepUrl || publicImageUrl(supabaseUrl(), path) !== keepUrl,
    );
    await removePublicMedia(client, stale);
  } catch (error) {
    logLoadError(`profile-image:${surface}-cleanup`, error);
  }
}
