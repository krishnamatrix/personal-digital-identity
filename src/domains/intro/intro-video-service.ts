import "server-only";
import { randomUUID } from "node:crypto";
import { requireSupabaseConfig } from "@/lib/env";
import { logLoadError } from "@/lib/server-log";
import {
  copyToPublicVideo,
  createEmptyProfile,
  deleteIntroVideoRow,
  ensureAccount,
  findIntroVideo,
  findProfile,
  getAuthenticatedDb,
  listEntries,
  listPrivateIntroFiles,
  listPublicVideos,
  privateVideoSize,
  readPrivateVideoHead,
  removePrivateVideos,
  removePublicVideos,
  saveIntroVideo,
  signPrivateVideo,
  signVideoUpload,
  type DbClient,
  type IntroVideoRow,
} from "@/lib/db/query";
import {
  draftScriptWithAi,
  isIntroAiAvailable,
  transcribeWithAi,
} from "@/lib/ai/intro-ai";
import {
  baseVideoType,
  cleanCaptions,
  isIntroBackground,
  isJpeg,
  isUuid,
  MAX_CAPTION_AUDIO_BYTES,
  MAX_POSTER_BYTES,
  MAX_RECORDING_SECONDS,
  MAX_SCRIPT_CHARS,
  MAX_VIDEO_BYTES,
  privatePosterPath,
  privateVideoPath,
  publicPosterPath,
  publicVideoPath,
  publicVideoUrl,
  sniffVideo,
  templateScript,
  type CaptionCue,
  type IntroBackground,
  type IntroTake,
  type PublishedIntro,
  type ScriptFacts,
  type ScriptLength,
  type ScriptTone,
  type StudioState,
  type StudioTake,
} from "@/domains/intro/intro-video";

/**
 * Video intro (M13). The browser records the take and uploads it straight to the private
 * identity-video bucket through a signed upload URL created with the owner's own session
 * (Storage INSERT policy still applies). The server then checks what actually arrived
 * (size + magic bytes) before pointing the intro_videos row at it. Publishing the website
 * copies the take into public-video (AD-005); nothing is public before that.
 */

export class IntroVideoInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntroVideoInputError";
  }
}

const supabaseUrl = () => requireSupabaseConfig().url;
const takeOf = (accountId: string, row: IntroVideoRow): IntroTake | null =>
  row.take
    ? {
        accountId,
        videoId: row.take.videoId,
        contentType: row.take.contentType,
      }
    : null;

export type { StudioState, StudioTake };

async function studioTake(
  client: DbClient,
  accountId: string,
  row: IntroVideoRow,
): Promise<StudioTake | null> {
  const take = takeOf(accountId, row);
  if (!take || !row.take) return null;
  const [videoUrl, posterUrl] = await Promise.all([
    signPrivateVideo(client, privateVideoPath(take)),
    row.take.hasPoster
      ? signPrivateVideo(client, privatePosterPath(take))
      : Promise.resolve(null),
  ]);
  return {
    videoId: take.videoId,
    contentType: take.contentType,
    duration: row.take.duration,
    byteSize: row.take.byteSize,
    recordedAt: row.take.recordedAt.toISOString(),
    videoUrl,
    posterUrl,
    captions: row.captions,
    background: row.take.background,
  };
}

async function loadFacts(
  client: DbClient,
  userId: string,
): Promise<ScriptFacts> {
  const profile =
    (await findProfile(client, userId)) ??
    (await createEmptyProfile(client, userId));
  const entries = (await listEntries(client, userId)).filter(
    (e) => e.isVisible,
  );
  const text = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim() : undefined;
  const of = (kind: string) => entries.filter((e) => e.kind === kind);
  const roles = of("employment")
    .map((e) =>
      [text(e.data.title), text(e.data.organization)]
        .filter(Boolean)
        .join(" at "),
    )
    .filter(Boolean);
  return {
    name: text(profile.displayName) ?? text(profile.fullName) ?? "there",
    headline: text(profile.headline),
    role: text(profile.currentDesignation),
    organization: text(profile.currentOrganization),
    location: text(profile.location),
    summary: (
      text(profile.professionalSummary) ?? text(profile.summary)
    )?.slice(0, 1500),
    skills: of("skill")
      .map((e) => text(e.data.name))
      .filter((s): s is string => Boolean(s))
      .slice(0, 8),
    recentRoles: roles.slice(0, 4),
    projects: of("project")
      .map((e) => text(e.data.name))
      .filter((s): s is string => Boolean(s))
      .slice(0, 4),
  };
}

export async function getStudioState(): Promise<StudioState> {
  const { client, user } = await getAuthenticatedDb();
  await ensureAccount(client, user.id);
  const [row, facts] = await Promise.all([
    findIntroVideo(client, user.id),
    loadFacts(client, user.id),
  ]);
  return {
    script: row?.script || templateScript(facts),
    take: row ? await studioTake(client, user.id, row) : null,
    showOnWebsite: row?.showOnWebsite ?? true,
    aiAvailable: isIntroAiAvailable(),
    firstName: facts.name.split(/\s+/)[0] ?? "",
  };
}

const cleanScript = (script: string) =>
  script.replace(/\r\n/g, "\n").trim().slice(0, MAX_SCRIPT_CHARS);

/** A draft script from the profile: AI when configured, otherwise the template. */
export async function draftIntroScript(
  length: ScriptLength,
  tone: ScriptTone,
): Promise<{ script: string; source: "ai" | "template" }> {
  const { client, user } = await getAuthenticatedDb();
  const facts = await loadFacts(client, user.id);
  if (isIntroAiAvailable()) {
    try {
      return {
        script: cleanScript(await draftScriptWithAi(facts, length, tone)),
        source: "ai",
      };
    } catch (error) {
      logLoadError("intro:script", error);
    }
  }
  return { script: templateScript(facts, length), source: "template" };
}

export async function saveIntroScript(script: string): Promise<void> {
  const { client, user } = await getAuthenticatedDb();
  await ensureAccount(client, user.id);
  await saveIntroVideo(client, user.id, { script: cleanScript(script) });
}

export async function setIntroOnWebsite(show: boolean): Promise<void> {
  const { client, user } = await getAuthenticatedDb();
  await ensureAccount(client, user.id);
  await saveIntroVideo(client, user.id, { showOnWebsite: show });
}

export type UploadTicket = {
  videoId: string;
  videoUploadUrl: string;
  posterUploadUrl: string | null;
};

/** Step 1 of saving a take: where the browser may upload it. Nothing is recorded yet. */
export async function beginIntroUpload(input: {
  mimeType: string;
  byteSize: number;
  duration: number;
  withPoster: boolean;
}): Promise<UploadTicket> {
  const contentType = baseVideoType(input.mimeType);
  if (!contentType)
    throw new IntroVideoInputError(
      "This browser recorded an unsupported video format.",
    );
  checkTake(input.byteSize, input.duration);
  const { client, user } = await getAuthenticatedDb();
  await ensureAccount(client, user.id);
  const take = { accountId: user.id, videoId: randomUUID(), contentType };
  const [videoUploadUrl, posterUploadUrl] = await Promise.all([
    signVideoUpload(client, privateVideoPath(take)),
    input.withPoster
      ? signVideoUpload(client, privatePosterPath(take))
      : Promise.resolve(null),
  ]);
  return { videoId: take.videoId, videoUploadUrl, posterUploadUrl };
}

function checkTake(byteSize: number, duration: number) {
  if (!Number.isFinite(byteSize) || byteSize <= 0)
    throw new IntroVideoInputError(
      "The recording is empty. Please record again.",
    );
  if (byteSize > MAX_VIDEO_BYTES)
    throw new IntroVideoInputError(
      "The recording is larger than 50 MB. Please record a shorter take.",
    );
  if (!Number.isFinite(duration) || duration < 1)
    throw new IntroVideoInputError(
      "The recording is too short. Please record again.",
    );
  if (duration > MAX_RECORDING_SECONDS + 5)
    throw new IntroVideoInputError("Keep your intro under two minutes.");
}

/**
 * Step 2: the browser has uploaded the files. Verify them, point the row at the new take and
 * remove older private takes. Live websites keep their published copy until republished.
 */
export async function completeIntroUpload(input: {
  videoId: string;
  mimeType: string;
  duration: number;
  hasPoster: boolean;
  script: string;
  background?: IntroBackground;
}): Promise<StudioTake> {
  const contentType = baseVideoType(input.mimeType);
  const background = input.background ?? "none";
  if (!isIntroBackground(background))
    throw new IntroVideoInputError("Unknown background setting.");
  if (!contentType || !isUuid(input.videoId))
    throw new IntroVideoInputError(
      "We could not find your upload. Please try again.",
    );
  const { client, user } = await getAuthenticatedDb();
  const take = { accountId: user.id, videoId: input.videoId, contentType };
  const videoPath = privateVideoPath(take);
  const posterPath = privatePosterPath(take);

  const size = await privateVideoSize(client, videoPath);
  if (size === null)
    throw new IntroVideoInputError(
      "Your upload did not arrive. Please try again.",
    );
  const head = await readPrivateVideoHead(client, videoPath, 16);
  const actual = head ? sniffVideo(head) : null;
  try {
    checkTake(size || 1, input.duration);
    if (actual !== contentType)
      throw new IntroVideoInputError("That file is not a WebM or MP4 video.");
  } catch (error) {
    await removePrivateVideos(client, [videoPath, posterPath]).catch(
      () => undefined,
    );
    throw error;
  }

  let hasPoster = false;
  if (input.hasPoster) {
    const posterSize = await privateVideoSize(client, posterPath).catch(
      () => null,
    );
    const posterHead =
      posterSize && posterSize <= MAX_POSTER_BYTES
        ? await readPrivateVideoHead(client, posterPath, 4)
        : null;
    hasPoster = Boolean(posterHead && isJpeg(posterHead));
    if (!hasPoster)
      await removePrivateVideos(client, [posterPath]).catch(() => undefined);
  }

  const row = await saveIntroVideo(client, user.id, {
    script: cleanScript(input.script),
    take: {
      videoId: take.videoId,
      contentType,
      byteSize: size,
      duration: Math.min(input.duration, MAX_RECORDING_SECONDS + 5),
      hasPoster,
      background,
    },
  });
  await removeOtherPrivateFiles(client, user.id, take.videoId);
  return (await studioTake(client, user.id, row))!;
}

async function removeOtherPrivateFiles(
  client: DbClient,
  accountId: string,
  keepVideoId: string | null,
) {
  try {
    const files = await listPrivateIntroFiles(client, accountId);
    const stale = files.filter(
      (path) => !keepVideoId || !path.includes(`/${keepVideoId}.`),
    );
    await removePrivateVideos(client, stale);
  } catch (error) {
    logLoadError("intro:cleanup", error);
  }
}

/** Captions from the take's audio (a 16 kHz mono WAV the browser extracted). */
export async function captionIntro(audio: File): Promise<CaptionCue[]> {
  if (!isIntroAiAvailable())
    throw new IntroVideoInputError("Captions are not available right now.");
  if (audio.size === 0 || audio.size > MAX_CAPTION_AUDIO_BYTES)
    throw new IntroVideoInputError("We could not read the audio of this take.");
  const { client, user } = await getAuthenticatedDb();
  const row = await findIntroVideo(client, user.id);
  if (!row?.take)
    throw new IntroVideoInputError("Save a take before adding captions.");
  const bytes = new Uint8Array(await audio.arrayBuffer());
  const riff = String.fromCharCode(...bytes.subarray(0, 4));
  const wave = String.fromCharCode(...bytes.subarray(8, 12));
  if (riff !== "RIFF" || wave !== "WAVE")
    throw new IntroVideoInputError("We could not read the audio of this take.");
  const raw = await transcribeWithAi(bytes, row.script);
  const captions = cleanCaptions(raw, row.take.duration);
  await saveIntroVideo(client, user.id, { captions });
  return captions;
}

/** The owner edits caption wording (timing stays as transcribed). */
export async function saveIntroCaptions(input: unknown): Promise<CaptionCue[]> {
  const { client, user } = await getAuthenticatedDb();
  const row = await findIntroVideo(client, user.id);
  if (!row?.take) throw new IntroVideoInputError("Save a take first.");
  const captions = cleanCaptions(input, row.take.duration);
  await saveIntroVideo(client, user.id, { captions });
  return captions;
}

/** Removes the take (the script is kept). A live website keeps its copy until republished. */
export async function deleteMyIntro(): Promise<void> {
  const { client, user } = await getAuthenticatedDb();
  const row = await findIntroVideo(client, user.id);
  if (!row) return;
  if (row.script) await saveIntroVideo(client, user.id, { take: null });
  else await deleteIntroVideoRow(client, user.id);
  await removeOtherPrivateFiles(client, user.id, null);
}

// ------------------------------------------------------------------ website publishing

/** What the website snapshot will carry: deterministic public URLs, so drafts compare equal. */
export function publishedIntroFor(
  accountId: string,
  row: IntroVideoRow | null,
): PublishedIntro | undefined {
  if (!row?.take || !row.showOnWebsite) return undefined;
  const take = takeOf(accountId, row)!;
  const intro: PublishedIntro = {
    videoUrl: publicVideoUrl(supabaseUrl(), publicVideoPath(take)),
    type: take.contentType,
    duration: Math.round(row.take.duration * 10) / 10,
  };
  if (row.take.hasPoster)
    intro.posterUrl = publicVideoUrl(supabaseUrl(), publicPosterPath(take));
  if (row.captions.length) intro.captions = row.captions;
  if (row.take.background !== "none") intro.background = row.take.background;
  return intro;
}

/** The owner's preview uses signed URLs (the public copy exists only after publishing). */
export async function previewIntroFor(
  client: DbClient,
  accountId: string,
  row: IntroVideoRow | null,
): Promise<PublishedIntro | undefined> {
  const published = publishedIntroFor(accountId, row);
  if (!published || !row) return undefined;
  const take = await studioTake(client, accountId, row);
  if (!take?.videoUrl) return undefined;
  const intro: PublishedIntro = { ...published, videoUrl: take.videoUrl };
  if (take.posterUrl) intro.posterUrl = take.posterUrl;
  else delete intro.posterUrl;
  return intro;
}

export async function loadIntroRow(
  client: DbClient,
  accountId: string,
): Promise<IntroVideoRow | null> {
  try {
    return await findIntroVideo(client, accountId);
  } catch (error) {
    // Before docs/sql/milestone-13 runs the table does not exist: websites work without it.
    logLoadError("intro:load", error);
    return null;
  }
}

/** Before publishing: make sure the public copies the snapshot points at exist. */
export async function preparePublishedIntro(
  client: DbClient,
  accountId: string,
  row: IntroVideoRow | null,
): Promise<void> {
  if (!publishedIntroFor(accountId, row) || !row) return;
  const take = takeOf(accountId, row)!;
  await copyToPublicVideo(
    client,
    privateVideoPath(take),
    publicVideoPath(take),
  );
  if (row.take?.hasPoster)
    await copyToPublicVideo(
      client,
      privatePosterPath(take),
      publicPosterPath(take),
    );
}

/** After publishing / unpublishing: remove public copies the live site no longer uses. */
export async function cleanupPublishedIntro(
  client: DbClient,
  accountId: string,
  keep: PublishedIntro | undefined,
): Promise<void> {
  try {
    const keepUrls = new Set([keep?.videoUrl, keep?.posterUrl].filter(Boolean));
    const paths = await listPublicVideos(client, accountId);
    await removePublicVideos(
      client,
      paths.filter((p) => !keepUrls.has(publicVideoUrl(supabaseUrl(), p))),
    );
  } catch (error) {
    logLoadError("intro:website-cleanup", error);
  }
}
