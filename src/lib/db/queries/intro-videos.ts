import "server-only";
import type { FolioneClient } from "@/lib/db/schema";
import { AuthorizationError } from "@/lib/supabase/server";
import {
  cleanCaptions,
  cleanTrim,
  isIntroBackground,
  PRIVATE_VIDEO_BUCKET,
  PUBLIC_VIDEO_BUCKET,
  type CaptionCue,
  type IntroBackground,
  type IntroTrim,
  type VideoType,
} from "@/domains/intro/intro-video";

/**
 * Video intro (M13): the private intro_videos row and the identity-video / public-video
 * Storage buckets. Always the caller's own session client, so the owner-only RLS and Storage
 * policies in docs/sql/milestone-13 decide every read and write.
 */
type QueryClient = FolioneClient;

export class IntroVideoPersistenceError extends Error {
  /** PostgREST / Storage error code, kept for logs only (never shown to users). */
  readonly code?: string;
  constructor(code?: string) {
    super("We could not save your video. Please try again.");
    this.name = "IntroVideoPersistenceError";
    this.code = code;
  }
}

function mapError(error: { code?: string }): Error {
  if (error.code === "42501" || error.code === "PGRST301")
    return new AuthorizationError();
  return new IntroVideoPersistenceError(error.code);
}
function storageCode(error: unknown): string {
  const e = error as { statusCode?: string | number; message?: string };
  return String(e?.statusCode ?? e?.message ?? "storage");
}

export type IntroVideoRow = {
  script: string;
  take: {
    videoId: string;
    contentType: VideoType;
    byteSize: number;
    duration: number;
    hasPoster: boolean;
    background: IntroBackground;
    trim: IntroTrim | null;
    recordedAt: Date;
  } | null;
  captions: CaptionCue[];
  showOnWebsite: boolean;
  updatedAt: Date;
};

const BASE_COLUMNS =
  "script,video_id,content_type,byte_size,duration_seconds,has_poster,captions,show_on_website,recorded_at,updated_at";
/**
 * Later columns: `background` (docs/sql/milestone-13/003) and `trim_start, trim_end` (004).
 * Reads fall back step by step while those files have not run yet.
 */
const COLUMN_SETS = [
  `${BASE_COLUMNS},background,trim_start,trim_end`,
  `${BASE_COLUMNS},background`,
  BASE_COLUMNS,
];
const isMissingColumn = (error: { code?: string }) =>
  error.code === "42703" || error.code === "PGRST204";

function parse(row: Record<string, unknown>): IntroVideoRow {
  const duration = Number(row.duration_seconds);
  return {
    script: String(row.script ?? ""),
    take: row.video_id
      ? {
          videoId: String(row.video_id),
          contentType: row.content_type as VideoType,
          byteSize: Number(row.byte_size),
          duration,
          hasPoster: Boolean(row.has_poster),
          background: isIntroBackground(row.background)
            ? row.background
            : "none",
          trim:
            row.trim_start == null || row.trim_end == null
              ? null
              : cleanTrim(
                  {
                    start: Number(row.trim_start),
                    end: Number(row.trim_end),
                  },
                  duration,
                ),
          recordedAt: new Date(String(row.recorded_at)),
        }
      : null,
    captions: row.video_id ? cleanCaptions(row.captions, duration) : [],
    showOnWebsite: row.show_on_website !== false,
    updatedAt: new Date(String(row.updated_at)),
  };
}

export async function findIntroVideo(
  client: QueryClient,
  userId: string,
): Promise<IntroVideoRow | null> {
  const read = (columns: string) =>
    client
      .from("intro_videos")
      .select(columns)
      .eq("account_id", userId)
      .maybeSingle();
  let { data, error } = await read(COLUMN_SETS[0]!);
  for (
    let i = 1;
    error && isMissingColumn(error) && i < COLUMN_SETS.length;
    i++
  )
    ({ data, error } = await read(COLUMN_SETS[i]!));
  if (error) throw mapError(error);
  return data ? parse(data as unknown as Record<string, unknown>) : null;
}

export type IntroVideoWrite = {
  script?: string;
  take?: {
    videoId: string;
    contentType: VideoType;
    byteSize: number;
    duration: number;
    hasPoster: boolean;
    background?: IntroBackground;
  } | null;
  captions?: CaptionCue[];
  showOnWebsite?: boolean;
  /** null = play the whole take. A new take resets it unless given. */
  trim?: IntroTrim | null;
};

/** Insert-or-update of the caller's own row; only the given fields change. */
export async function saveIntroVideo(
  client: QueryClient,
  userId: string,
  input: IntroVideoWrite,
): Promise<IntroVideoRow> {
  const now = new Date().toISOString();
  const values: Record<string, unknown> = {
    account_id: userId,
    updated_at: now,
  };
  if (input.script !== undefined) values.script = input.script;
  if (input.showOnWebsite !== undefined)
    values.show_on_website = input.showOnWebsite;
  if (input.captions !== undefined) values.captions = input.captions;
  if (input.take !== undefined) {
    const t = input.take;
    values.video_id = t?.videoId ?? null;
    values.content_type = t?.contentType ?? null;
    values.byte_size = t?.byteSize ?? null;
    values.duration_seconds = t ? Math.round(t.duration * 100) / 100 : null;
    values.has_poster = t?.hasPoster ?? false;
    values.recorded_at = t ? now : null;
    // A plain take still saves before 003 has added the column (see the retry below).
    values.background = t?.background ?? "none";
    if (input.captions === undefined) values.captions = [];
    if (input.trim === undefined) input = { ...input, trim: null };
  }
  if (input.trim !== undefined) {
    values.trim_start = input.trim?.start ?? null;
    values.trim_end = input.trim?.end ?? null;
  }
  const write = (row: Record<string, unknown>, columns: string) =>
    client
      .from("intro_videos")
      .upsert(row, { onConflict: "account_id" })
      .select(columns)
      .single();
  // Before 003 / 004 have run: drop the newer columns so takes keep saving.
  let row = values;
  let { data, error } = await write(row, COLUMN_SETS[0]!);
  for (
    let i = 1;
    error && isMissingColumn(error) && i < COLUMN_SETS.length;
    i++
  ) {
    const keep = COLUMN_SETS[i]!.split(",");
    const dropped = Object.keys(row).filter(
      (k) => !keep.includes(k) && k !== "account_id",
    );
    // A trim may be lost (the whole take plays); a background may not (a cut-out saved as
    // plain would show its mask on the website).
    const lost = dropped.some((k) =>
      k === "background" ? row[k] !== "none" : false,
    );
    if (lost) throw new IntroVideoPersistenceError("column_missing");
    row = Object.fromEntries(
      Object.entries(row).filter(([k]) => !dropped.includes(k)),
    );
    ({ data, error } = await write(row, COLUMN_SETS[i]!));
  }
  if (error) throw mapError(error);
  return parse(data as unknown as Record<string, unknown>);
}

export async function deleteIntroVideoRow(
  client: QueryClient,
  userId: string,
): Promise<void> {
  const { error } = await client
    .from("intro_videos")
    .delete()
    .eq("account_id", userId);
  if (error) throw mapError(error);
}

// ------------------------------------------------------------------------------- Storage

/** A one-time URL the owner's browser PUTs the file to (valid for 2 hours). */
export async function signVideoUpload(
  client: QueryClient,
  path: string,
): Promise<string> {
  const { data, error } = await client.storage
    .from(PRIVATE_VIDEO_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data?.signedUrl)
    throw new IntroVideoPersistenceError(storageCode(error));
  return data.signedUrl;
}

export async function signPrivateVideo(
  client: QueryClient,
  path: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const { data, error } = await client.storage
    .from(PRIVATE_VIDEO_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Size of a private object, or null when it does not exist (yet). */
export async function privateVideoSize(
  client: QueryClient,
  path: string,
): Promise<number | null> {
  const slash = path.lastIndexOf("/");
  const folder = path.slice(0, slash);
  const name = path.slice(slash + 1);
  const { data, error } = await client.storage
    .from(PRIVATE_VIDEO_BUCKET)
    .list(folder, { search: name, limit: 10 });
  if (error) throw new IntroVideoPersistenceError(storageCode(error));
  const item = (data ?? []).find((f) => f.name === name && f.id);
  if (!item) return null;
  const size = Number((item.metadata as { size?: number } | null)?.size);
  return Number.isFinite(size) ? size : 0;
}

/** The first bytes of a private object (to check what was really uploaded). */
export async function readPrivateVideoHead(
  client: QueryClient,
  path: string,
  bytes = 64,
): Promise<Uint8Array | null> {
  const url = await signPrivateVideo(client, path, 60);
  if (!url) return null;
  try {
    const res = await fetch(url, {
      headers: { Range: `bytes=0-${bytes - 1}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok && res.status !== 206) return null;
    const reader = res.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < bytes) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      total += value.length;
    }
    await reader.cancel().catch(() => undefined);
    const out = new Uint8Array(Math.min(total, bytes));
    let offset = 0;
    for (const c of chunks) {
      const part = c.subarray(0, out.length - offset);
      out.set(part, offset);
      offset += part.length;
      if (offset >= out.length) break;
    }
    return out;
  } catch {
    return null;
  }
}

export async function removePrivateVideos(
  client: QueryClient,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await client.storage
    .from(PRIVATE_VIDEO_BUCKET)
    .remove(paths);
  if (error) throw new IntroVideoPersistenceError(storageCode(error));
}

/** Everything in the owner's private intro folder (to clear abandoned uploads). */
export async function listPrivateIntroFiles(
  client: QueryClient,
  accountId: string,
): Promise<string[]> {
  const folder = `${accountId}/intro`;
  const { data, error } = await client.storage
    .from(PRIVATE_VIDEO_BUCKET)
    .list(folder, { limit: 100 });
  if (error) throw new IntroVideoPersistenceError(storageCode(error));
  return (data ?? [])
    .filter((f) => f.name && f.id)
    .map((f) => `${folder}/${f.name}`);
}

/** Copies a private file into public-video. An existing copy (same take) is fine. */
export async function copyToPublicVideo(
  client: QueryClient,
  fromPath: string,
  toPath: string,
): Promise<void> {
  const { error } = await client.storage
    .from(PRIVATE_VIDEO_BUCKET)
    .copy(fromPath, toPath, { destinationBucket: PUBLIC_VIDEO_BUCKET });
  if (!error) return;
  const e = error as { statusCode?: string | number; message?: string };
  const exists =
    String(e.statusCode) === "409" ||
    /already exists|duplicate/i.test(e.message ?? "");
  if (!exists) throw new IntroVideoPersistenceError(storageCode(error));
}

export async function listPublicVideos(
  client: QueryClient,
  accountId: string,
): Promise<string[]> {
  const folder = `${accountId}/website`;
  const { data, error } = await client.storage
    .from(PUBLIC_VIDEO_BUCKET)
    .list(folder, { limit: 100 });
  if (error) throw new IntroVideoPersistenceError(storageCode(error));
  return (data ?? [])
    .filter((f) => f.name && f.id)
    .map((f) => `${folder}/${f.name}`);
}

export async function removePublicVideos(
  client: QueryClient,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await client.storage
    .from(PUBLIC_VIDEO_BUCKET)
    .remove(paths);
  if (error) throw new IntroVideoPersistenceError(storageCode(error));
}
