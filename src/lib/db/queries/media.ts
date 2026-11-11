import "server-only";
import type { FolioneClient } from "@/lib/db/schema";
import {
  PRIVATE_MEDIA_BUCKET,
  PUBLIC_MEDIA_BUCKET,
  type PublishSurface,
} from "@/domains/media/media-paths";

/**
 * Supabase Storage operations (M10). Same rules as the table queries: always the caller's own
 * session client, so the owner-only Storage policies in
 * docs/sql/milestone-10/001-profile-media-storage.sql decide every read and write.
 */
type QueryClient = FolioneClient;

export class MediaStorageError extends Error {
  /** Storage error status / message, kept for logs only (never shown to users). */
  readonly code?: string;
  constructor(code?: string) {
    super("We could not save or load your image. Please try again.");
    this.name = "MediaStorageError";
    this.code = code;
  }
}

function codeOf(error: unknown): string | undefined {
  const e = error as {
    statusCode?: string | number;
    status?: number;
    message?: string;
  };
  return String(e?.statusCode ?? e?.status ?? e?.message ?? "storage");
}

export async function uploadPrivateImage(
  client: QueryClient,
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  const { error } = await client.storage
    .from(PRIVATE_MEDIA_BUCKET)
    .upload(path, bytes, {
      contentType,
      upsert: false,
      cacheControl: "3600",
    });
  if (error) throw new MediaStorageError(codeOf(error));
}

export async function removePrivateImages(
  client: QueryClient,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await client.storage
    .from(PRIVATE_MEDIA_BUCKET)
    .remove(paths);
  if (error) throw new MediaStorageError(codeOf(error));
}

/** A short-lived URL so the owner can see their private photo in the workspace. */
export async function signPrivateImage(
  client: QueryClient,
  path: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const { data, error } = await client.storage
    .from(PRIVATE_MEDIA_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Copies the private photo into the public bucket. An existing copy (same image) is fine. */
export async function copyToPublicMedia(
  client: QueryClient,
  fromPath: string,
  toPath: string,
): Promise<void> {
  const { error } = await client.storage
    .from(PRIVATE_MEDIA_BUCKET)
    .copy(fromPath, toPath, { destinationBucket: PUBLIC_MEDIA_BUCKET });
  if (!error) return;
  const e = error as { statusCode?: string | number; message?: string };
  const exists =
    String(e.statusCode) === "409" ||
    /already exists|duplicate/i.test(e.message ?? "");
  if (!exists) throw new MediaStorageError(codeOf(error));
}

/** Object paths in one of the owner's public folders. */
export async function listPublicMedia(
  client: QueryClient,
  accountId: string,
  surface: PublishSurface,
): Promise<string[]> {
  const folder = `${accountId}/${surface}`;
  const { data, error } = await client.storage
    .from(PUBLIC_MEDIA_BUCKET)
    .list(folder, { limit: 100 });
  if (error) throw new MediaStorageError(codeOf(error));
  return (data ?? [])
    .filter((item) => item.name && item.id)
    .map((item) => `${folder}/${item.name}`);
}

export async function removePublicMedia(
  client: QueryClient,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await client.storage
    .from(PUBLIC_MEDIA_BUCKET)
    .remove(paths);
  if (error) throw new MediaStorageError(codeOf(error));
}
