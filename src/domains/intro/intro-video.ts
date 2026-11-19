import { z } from "zod";

/**
 * Video intro (M13): the owner records a short self-introduction in the browser, reading a
 * script from a teleprompter. Storage layout (docs/sql/milestone-13/001-intro-video-storage.sql):
 *
 *   identity-video (private)  <account_id>/intro/<video_id>.<webm|mp4>   + <video_id>.jpg poster
 *   public-video   (public)   <account_id>/website/<video_id>.<webm|mp4> + <video_id>.jpg
 *
 * The public copy exists only while a published website uses it (AD-005). Pure: no I/O.
 */
export const PRIVATE_VIDEO_BUCKET = "identity-video";
export const PUBLIC_VIDEO_BUCKET = "public-video";

/** Same as the bucket limit. The recorder aims far lower (about 2 Mbit/s). */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_POSTER_BYTES = 1024 * 1024;
/** The recorder stops itself here; the column allows a little slack. */
export const MAX_RECORDING_SECONDS = 120;
export const MAX_SCRIPT_CHARS = 3000;
/** Uploaded caption audio (16 kHz mono WAV: about 32 KB per second). */
export const MAX_CAPTION_AUDIO_BYTES = 5 * 1024 * 1024;

export const VIDEO_TYPES = ["video/webm", "video/mp4"] as const;
export type VideoType = (typeof VIDEO_TYPES)[number];
export const extOf = (type: VideoType) =>
  type === "video/mp4" ? "mp4" : "webm";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isUuid = (v: string) => UUID.test(v);

/**
 * The background treatment chosen at recording time (done in the owner's browser).
 * - none:   the camera picture as is.
 * - blur:   background blurred into the picture (an ordinary video).
 * - studio: background replaced by a lit studio backdrop, with a light grade on the person
 *           (an ordinary video; the backdrop is baked in).
 * - cutout: a "stacked" video: each frame is twice as tall, the picture on top and a
 *           black-and-white mask of the person below. The website player uses the mask to
 *           draw just the person over the page (works in every browser, Safari included).
 */
export const INTRO_BACKGROUNDS = ["none", "blur", "studio", "cutout"] as const;
export type IntroBackground = (typeof INTRO_BACKGROUNDS)[number];
export const isIntroBackground = (v: unknown): v is IntroBackground =>
  (INTRO_BACKGROUNDS as readonly unknown[]).includes(v);

export type IntroTake = {
  accountId: string;
  videoId: string;
  contentType: VideoType;
};

export function privateVideoPath(t: IntroTake): string {
  return `${t.accountId}/intro/${t.videoId}.${extOf(t.contentType)}`;
}
export function privatePosterPath(t: Omit<IntroTake, "contentType">): string {
  return `${t.accountId}/intro/${t.videoId}.jpg`;
}
export function publicVideoPath(t: IntroTake): string {
  return `${t.accountId}/website/${t.videoId}.${extOf(t.contentType)}`;
}
export function publicPosterPath(t: Omit<IntroTake, "contentType">): string {
  return `${t.accountId}/website/${t.videoId}.jpg`;
}
export function publicVideoUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${PUBLIC_VIDEO_BUCKET}/${path}`;
}

/** The base type a browser recorder reports ("video/webm;codecs=vp9,opus" → "video/webm"). */
export function baseVideoType(mime: string): VideoType | null {
  const base = mime.split(";")[0]!.trim().toLowerCase();
  return (VIDEO_TYPES as readonly string[]).includes(base)
    ? (base as VideoType)
    : null;
}

/** Container from the file's first bytes (never from its name or the browser's claim). */
export function sniffVideo(bytes: Uint8Array): VideoType | null {
  if (
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  )
    return "video/webm"; // EBML header (WebM / Matroska)
  if (String.fromCharCode(...bytes.subarray(4, 8)) === "ftyp")
    return "video/mp4"; // ISO base media file
  return null;
}

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

// ------------------------------------------------------------------------------ captions

export const captionCueSchema = z
  .object({
    start: z.number().min(0).max(600),
    end: z.number().min(0).max(600),
    text: z.string().trim().min(1).max(240),
  })
  .refine((c) => c.end > c.start, "end after start");
export const captionsSchema = z.array(captionCueSchema).max(150);
export type CaptionCue = z.infer<typeof captionCueSchema>;

/** Drops broken cues, sorts them and removes overlaps (a cue ends where the next begins). */
export function cleanCaptions(input: unknown, duration?: number): CaptionCue[] {
  if (!Array.isArray(input)) return [];
  const cues = input
    .map((c) => captionCueSchema.safeParse(c))
    .flatMap((r) => (r.success ? [r.data] : []))
    .map((c) => ({
      start: round(c.start),
      end: round(duration ? Math.min(c.end, duration) : c.end),
      text: c.text.replace(/\s+/g, " "),
    }))
    .filter((c) => c.end > c.start)
    .sort((a, b) => a.start - b.start);
  for (let i = 0; i < cues.length - 1; i++)
    if (cues[i]!.end > cues[i + 1]!.start) cues[i]!.end = cues[i + 1]!.start;
  return cues.filter((c) => c.end > c.start).slice(0, 150);
}

const round = (n: number) => Math.round(n * 100) / 100;

function stamp(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms % 1000, 3)}`;
}

/** WebVTT for a <track>. Cue text is escaped, so captions can never inject markup. */
export function toWebVtt(cues: CaptionCue[]): string {
  const esc = (t: string) =>
    t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = cues
    .map(
      (c, i) =>
        `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${esc(c.text.replace(/-->/g, "→"))}`,
    )
    .join("\n\n");
  return `WEBVTT\n\n${body}\n`;
}

export function transcriptOf(cues: CaptionCue[]): string {
  return cues.map((c) => c.text).join(" ");
}

// -------------------------------------------------------------------------------- script

export const SCRIPT_LENGTHS = {
  short: { label: "30 seconds", seconds: 30 },
  standard: { label: "60 seconds", seconds: 60 },
  long: { label: "90 seconds", seconds: 90 },
} as const;
export type ScriptLength = keyof typeof SCRIPT_LENGTHS;
export const SCRIPT_TONES = {
  professional: "Professional",
  friendly: "Warm and friendly",
  confident: "Bold and confident",
} as const;
export type ScriptTone = keyof typeof SCRIPT_TONES;

/** A comfortable on-camera reading pace. */
export const SPEAKING_WPM = 140;

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
/** Seconds it takes to read `text` aloud at `wpm`. */
export function readingSeconds(text: string, wpm = SPEAKING_WPM): number {
  return Math.round((wordCount(text) / wpm) * 60);
}
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export type ScriptFacts = {
  name: string;
  headline?: string;
  role?: string;
  organization?: string;
  location?: string;
  summary?: string;
  skills: string[];
  recentRoles: string[];
  projects: string[];
};

/**
 * A script built from the profile alone, used when no AI provider is configured (or as a
 * starting point). Plain sentences, no claims the profile does not make.
 */
export function templateScript(
  facts: ScriptFacts,
  length: ScriptLength = "standard",
): string {
  const first = facts.name.split(/\s+/)[0] || facts.name;
  const lines: string[] = [`Hi, I'm ${first}.`];
  const what = facts.role
    ? `I'm ${article(facts.role)} ${facts.role}${facts.organization ? ` at ${facts.organization}` : ""}`
    : facts.headline
      ? `I'm ${lowerFirst(facts.headline)}`
      : "";
  if (what)
    lines.push(
      `${what}${facts.location ? `, based in ${facts.location}` : ""}.`,
    );
  if (facts.summary && length !== "short")
    lines.push(firstSentences(facts.summary, length === "long" ? 3 : 2));
  if (facts.skills.length)
    lines.push(
      `Most of my work comes down to ${listOf(facts.skills.slice(0, length === "short" ? 2 : 3))}.`,
    );
  if (length !== "short" && facts.recentRoles.length > 1)
    lines.push(
      `Before this, I worked as ${listOf(facts.recentRoles.slice(1, 3))}.`,
    );
  if (length === "long" && facts.projects.length)
    lines.push(
      `Recently I've been working on ${listOf(facts.projects.slice(0, 2))}.`,
    );
  lines.push(
    "Have a look around, and if you'd like to work together or just say hello, get in touch. Thanks for stopping by.",
  );
  return lines.join(" ").slice(0, MAX_SCRIPT_CHARS);
}

const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");
const lowerFirst = (s: string) =>
  /^[A-Z][a-z]/.test(s) ? s[0]!.toLowerCase() + s.slice(1) : s;
function listOf(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}
function firstSentences(text: string, n: number): string {
  const sentences = text.replace(/\s+/g, " ").match(/[^.!?]+[.!?]+/g) ?? [text];
  return sentences.slice(0, n).join(" ").trim();
}

// ------------------------------------------------------------------------- published form

/** What the published website carries (inside person.intro). */
export const publishedIntroSchema = z.object({
  videoUrl: z
    .string()
    .max(2000)
    .regex(/^https?:\/\/\S+$/),
  posterUrl: z
    .string()
    .max(2000)
    .regex(/^https?:\/\/\S+$/)
    .optional(),
  type: z.enum(VIDEO_TYPES),
  duration: z.number().positive().max(180),
  captions: captionsSchema.optional(),
  /** Absent = "none". "cutout" means the video and poster are stacked (picture over mask). */
  background: z.enum(["blur", "studio", "cutout"]).optional(),
  /** The part of the file to play (seconds into the file); absent = all of it. */
  trim: z
    .object({ start: z.number().min(0), end: z.number().positive() })
    .refine((t) => t.end > t.start)
    .optional(),
});
export type PublishedIntro = z.infer<typeof publishedIntroSchema>;

// ---------------------------------------------------------------------------------- trim

/** Start / end in seconds into the file. Nothing is re-encoded; players honour it. */
export type IntroTrim = { start: number; end: number };
/** A trimmed intro is still at least this long. */
export const MIN_TRIMMED_SECONDS = 1;

/** A valid trim for a file of `duration` seconds, or null for "play it all". */
export function cleanTrim(input: unknown, duration: number): IntroTrim | null {
  if (!input || typeof input !== "object") return null;
  const { start, end } = input as { start?: unknown; end?: unknown };
  if (typeof start !== "number" || typeof end !== "number") return null;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const s = Math.round(Math.max(0, start) * 100) / 100;
  const e = Math.round(Math.min(duration, end) * 100) / 100;
  if (e - s < MIN_TRIMMED_SECONDS) return null;
  // Trimming nothing is the same as no trim.
  if (s < 0.05 && e > duration - 0.05) return null;
  return { start: s, end: e };
}

/** What a visitor actually watches. */
export function playLength(intro: { duration: number; trim?: IntroTrim }) {
  return intro.trim ? intro.trim.end - intro.trim.start : intro.duration;
}

/** Captions inside the trimmed part (times stay in the file's timeline). */
export function cuesWithin(cues: CaptionCue[], trim?: IntroTrim | null) {
  if (!trim) return cues;
  return cues.filter((c) => c.end > trim.start && c.start < trim.end);
}

/**
 * Where speech starts and ends in a soundtrack (mono samples), with a little air kept on
 * both sides: the automatic trim of "reaching for the button" and "reaching to stop".
 * The threshold adapts to the room's noise floor. Null when no speech stands out.
 */
export function speechBounds(
  samples: Float32Array,
  sampleRate: number,
  { padBefore = 0.35, padAfter = 0.6 } = {},
): IntroTrim | null {
  const win = Math.max(1, Math.round(sampleRate * 0.02)); // 20 ms windows
  const count = Math.floor(samples.length / win);
  if (count < 10) return null;
  const rms = new Float32Array(count);
  for (let w = 0; w < count; w++) {
    let sum = 0;
    for (let i = w * win; i < (w + 1) * win; i++) sum += samples[i]! ** 2;
    rms[w] = Math.sqrt(sum / win);
  }
  const sorted = Float32Array.from(rms).sort();
  const noise = sorted[Math.floor(count * 0.1)]!;
  const loud = sorted[Math.floor(count * 0.95)]!;
  if (loud < 0.01 || loud < noise * 3) return null;
  const threshold = noise + (loud - noise) * 0.15;
  // Speech = at least 150 ms of windows above the threshold.
  const run = Math.round(0.15 / 0.02);
  const sustained = (from: number, step: 1 | -1) => {
    for (let w = from, n = 0; w >= 0 && w < count; w += step) {
      n = rms[w]! > threshold ? n + 1 : 0;
      if (n >= run) return step === 1 ? w - run + 1 : w + run - 1;
    }
    return -1;
  };
  const first = sustained(0, 1);
  const last = sustained(count - 1, -1);
  if (first < 0 || last < first) return null;
  const total = samples.length / sampleRate;
  return {
    start: Math.max(0, (first * win) / sampleRate - padBefore),
    end: Math.min(total, ((last + 1) * win) / sampleRate + padAfter),
  };
}

// --------------------------------------------------------------------- the studio screen

export type StudioTake = {
  videoId: string;
  contentType: VideoType;
  duration: number;
  byteSize: number;
  recordedAt: string;
  /** Short-lived URLs for the owner's browser. */
  videoUrl: string | null;
  posterUrl: string | null;
  captions: CaptionCue[];
  background: IntroBackground;
  trim: IntroTrim | null;
};

export type StudioState = {
  script: string;
  take: StudioTake | null;
  showOnWebsite: boolean;
  aiAvailable: boolean;
  firstName: string;
};
