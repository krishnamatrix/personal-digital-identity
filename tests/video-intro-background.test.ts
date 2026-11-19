import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  findIntroVideo,
  IntroVideoPersistenceError,
  saveIntroVideo,
} from "@/lib/db/queries/intro-videos";
import {
  fxSize,
  MAX_FX_SIDE,
  MEDIAPIPE_VERSION,
  MEDIAPIPE_WASM,
  SELFIE_MODEL,
} from "@/app/website/intro/background-fx";
import { cueAt } from "@/components/website/intro-video-player";
import {
  cleanTrim,
  cuesWithin,
  playLength,
  speechBounds,
} from "@/domains/intro/intro-video";
import { formatPrecise } from "@/app/website/intro/trim-editor";
import { STUDIO_LOOKS } from "@/app/website/intro/background-fx";

const me = "0f00b3c8-7ea4-42ad-a544-4d62d1a42f54";
const dbRow = {
  script: "Hi",
  video_id: "1b2c3d4e-5f60-4a7b-8c9d-aeb0c1d2e3f4",
  content_type: "video/webm",
  byte_size: 1000,
  duration_seconds: "12.50",
  has_poster: true,
  captions: [],
  show_on_website: true,
  recorded_at: "2026-11-18T10:00:00Z",
  updated_at: "2026-11-18T10:00:00Z",
};

/** A PostgREST client stand-in: each call answers with the next queued result. */
function fakeClient(results: { data?: unknown; error?: { code: string } }[]) {
  const calls: { op: string; columns?: string; values?: unknown }[] = [];
  const next = () => Promise.resolve(results.shift() ?? { data: null });
  const chain = (op: string, values?: unknown) => {
    const entry: { op: string; columns?: string; values?: unknown } = {
      op,
      values,
    };
    calls.push(entry);
    const q = {
      select: (columns: string) => {
        entry.columns = columns;
        return q;
      },
      eq: () => q,
      maybeSingle: next,
      single: next,
    };
    return q;
  };
  const client = {
    from: () => ({
      select: (columns: string) => chain("select").select(columns),
      upsert: (values: unknown) => chain("upsert", values),
    }),
  };
  return { client: client as never, calls };
}

describe("intro background column (003) rollout", () => {
  it("reads the background when the column exists", async () => {
    const { client } = fakeClient([
      { data: { ...dbRow, background: "cutout" } },
    ]);
    const row = await findIntroVideo(client, me);
    expect(row?.take?.background).toBe("cutout");
    expect(row?.take?.duration).toBe(12.5);
  });

  it("still reads intros before 003 / 004 have run", async () => {
    const before004 = fakeClient([
      { error: { code: "42703" } },
      { data: { ...dbRow, background: "blur" } },
    ]);
    const row = await findIntroVideo(before004.client, me);
    expect(before004.calls[1]!.columns).toContain("background");
    expect(before004.calls[1]!.columns).not.toContain("trim_start");
    expect(row?.take).toMatchObject({ background: "blur", trim: null });

    const before003 = fakeClient([
      { error: { code: "42703" } },
      { error: { code: "42703" } },
      { data: dbRow },
    ]);
    const old = await findIntroVideo(before003.client, me);
    expect(before003.calls[2]!.columns).not.toContain("background");
    expect(old?.take?.background).toBe("none");
  });

  it("reads a stored trim, and ignores one that no longer fits the take", async () => {
    const ok = fakeClient([
      { data: { ...dbRow, trim_start: "1.20", trim_end: "11.80" } },
    ]);
    expect((await findIntroVideo(ok.client, me))?.take?.trim).toEqual({
      start: 1.2,
      end: 11.8,
    });
    const bad = fakeClient([
      { data: { ...dbRow, trim_start: "11.9", trim_end: "12.2" } },
    ]);
    expect((await findIntroVideo(bad.client, me))?.take?.trim).toBeNull();
  });

  it("treats an unknown stored value as no effect", async () => {
    const { client } = fakeClient([{ data: { ...dbRow, background: "x" } }]);
    expect((await findIntroVideo(client, me))?.take?.background).toBe("none");
  });

  it("saves a plain take before 003, but not a cut-out one", async () => {
    const take = {
      videoId: dbRow.video_id,
      contentType: "video/webm" as const,
      byteSize: 1000,
      duration: 12.5,
      hasPoster: true,
    };
    const plain = fakeClient([
      { error: { code: "PGRST204" } },
      { error: { code: "PGRST204" } },
      { data: dbRow },
    ]);
    await saveIntroVideo(plain.client, me, {
      take,
      trim: { start: 1, end: 10 },
    });
    expect(plain.calls[0]!.values).toMatchObject({
      background: "none",
      trim_start: 1,
      trim_end: 10,
    });
    // Before 004 the trim is dropped (the whole take plays), before 003 the background.
    expect(plain.calls[1]!.values).not.toHaveProperty("trim_start");
    expect(plain.calls[1]!.values).toHaveProperty("background");
    expect(plain.calls[2]!.values).not.toHaveProperty("background");

    const cut = fakeClient([
      { error: { code: "PGRST204" } },
      { error: { code: "PGRST204" } },
    ]);
    await expect(
      saveIntroVideo(cut.client, me, {
        take: { ...take, background: "cutout" },
      }),
    ).rejects.toBeInstanceOf(IntroVideoPersistenceError);
    expect(cut.calls).toHaveLength(2);
  });

  it("leaves the background and trim alone when only the script changes", async () => {
    const { client, calls } = fakeClient([{ data: dbRow }]);
    await saveIntroVideo(client, me, { script: "New" });
    expect(calls[0]!.values).not.toHaveProperty("background");
    expect(calls[0]!.values).not.toHaveProperty("trim_start");
  });

  it("resets the trim when a new take is saved", async () => {
    const { client, calls } = fakeClient([{ data: dbRow }]);
    await saveIntroVideo(client, me, {
      take: {
        videoId: dbRow.video_id,
        contentType: "video/webm",
        byteSize: 1,
        duration: 5,
        hasPoster: false,
      },
    });
    expect(calls[0]!.values).toMatchObject({
      trim_start: null,
      trim_end: null,
    });
  });
});

describe("recording with a background effect", () => {
  it("sizes each half to at most 960 px, in even numbers, stacked for cut-outs", () => {
    expect(fxSize(1280, 720, "blur")).toEqual({
      width: 960,
      height: 540,
      half: 540,
    });
    expect(fxSize(1280, 720, "cutout")).toEqual({
      width: 960,
      height: 1080,
      half: 540,
    });
    // Phones record portrait.
    expect(fxSize(720, 1280, "cutout")).toEqual({
      width: 540,
      height: 1920,
      half: 960,
    });
    // Small cameras are not upscaled; odd sizes are rounded to even.
    const small = fxSize(641, 479, "blur");
    expect((small.width % 2) + (small.height % 2)).toBe(0);
    expect(Math.max(small.width, small.height)).toBeLessThanOrEqual(
      MAX_FX_SIDE,
    );
  });

  it("loads the runtime matching the installed package, over https only", () => {
    const pkg = JSON.parse(
      readFileSync("node_modules/@mediapipe/tasks-vision/package.json", "utf8"),
    ) as { version: string };
    expect(MEDIAPIPE_VERSION).toBe(pkg.version);
    const app = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(app.dependencies["@mediapipe/tasks-vision"]).toBe(MEDIAPIPE_VERSION);
    expect(MEDIAPIPE_WASM).toMatch(/^https:\/\//);
    expect(SELFIE_MODEL).toMatch(
      /^https:\/\/.*\/float16\/1\/selfie_segmenter\.tflite$/,
    );
  });

  it("never sends camera frames anywhere (no fetch / upload in the effect code)", () => {
    const code = readFileSync("src/app/website/intro/background-fx.ts", "utf8");
    expect(code).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon/);
  });
});

describe("cut-out player captions", () => {
  it("finds the cue on screen at a given time", () => {
    const cues = [
      { start: 0, end: 2, text: "Hi" },
      { start: 2, end: 4.5, text: "I'm Alex" },
    ];
    expect(cueAt(cues, 0)?.text).toBe("Hi");
    expect(cueAt(cues, 2)?.text).toBe("I'm Alex");
    expect(cueAt(cues, 4.5)).toBeNull();
    expect(cueAt([], 1)).toBeNull();
  });
});

describe("trimming", () => {
  it("keeps a sensible trim and drops a meaningless one", () => {
    expect(cleanTrim({ start: 1.234, end: 9.876 }, 12)).toEqual({
      start: 1.23,
      end: 9.88,
    });
    // Clamped to the file.
    expect(cleanTrim({ start: -2, end: 40 }, 12)).toBeNull(); // = the whole take
    expect(cleanTrim({ start: 2, end: 40 }, 12)).toEqual({ start: 2, end: 12 });
    // At least a second must remain.
    expect(cleanTrim({ start: 5, end: 5.5 }, 12)).toBeNull();
    expect(cleanTrim({ start: "1", end: 4 }, 12)).toBeNull();
    expect(cleanTrim(null, 12)).toBeNull();
  });

  it("finds where speech starts and ends, with a little air kept", () => {
    const rate = 16_000;
    // 1.0 s of room noise, 2.0 s of "speech", 1.5 s of room noise.
    const samples = new Float32Array(rate * 4.5);
    let seed = 7;
    const noise = () =>
      ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.004;
    for (let i = 0; i < samples.length; i++) {
      const t = i / rate;
      samples[i] =
        noise() + (t >= 1 && t < 3 ? 0.3 * Math.sin(2 * Math.PI * 220 * t) : 0);
    }
    const bounds = speechBounds(samples, rate)!;
    expect(bounds.start).toBeCloseTo(1 - 0.35, 1);
    expect(bounds.end).toBeCloseTo(3 + 0.6, 1);
    // A click is not speech; silence has no bounds.
    const click = new Float32Array(rate * 3);
    click[rate] = 0.9;
    expect(speechBounds(click, rate)).toBeNull();
    expect(speechBounds(new Float32Array(rate * 3), rate)).toBeNull();
  });

  it("plays and captions only the trimmed part", () => {
    const trim = { start: 2, end: 10 };
    expect(playLength({ duration: 12, trim })).toBe(8);
    expect(playLength({ duration: 12 })).toBe(12);
    const cues = [
      { start: 0, end: 1.5, text: "Um" },
      { start: 1.5, end: 3, text: "Hi" },
      { start: 9.5, end: 11, text: "Bye" },
      { start: 11, end: 12, text: "Off" },
    ];
    expect(cuesWithin(cues, trim).map((c) => c.text)).toEqual(["Hi", "Bye"]);
    expect(cuesWithin(cues, null)).toHaveLength(4);
    expect(formatPrecise(3.44)).toBe("0:03.4");
    expect(formatPrecise(71.25)).toBe("1:11.3");
  });
});

describe("studio backdrops", () => {
  it("are valid colours (the shader reads them as #rrggbb)", () => {
    for (const look of Object.values(STUDIO_LOOKS))
      for (const c of [look.top, look.floor, look.light])
        expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });
});

vi.mock("server-only", () => ({}));
