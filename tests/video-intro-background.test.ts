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
import { cueAt } from "@/components/website/cutout-player";

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

  it("still reads intros before 003 has run", async () => {
    const { client, calls } = fakeClient([
      { error: { code: "42703" } },
      { data: dbRow },
    ]);
    const row = await findIntroVideo(client, me);
    expect(calls[1]!.columns).not.toContain("background");
    expect(row?.take?.background).toBe("none");
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
      { data: dbRow },
    ]);
    await saveIntroVideo(plain.client, me, { take });
    expect(plain.calls[0]!.values).toMatchObject({ background: "none" });
    expect(plain.calls[1]!.values).not.toHaveProperty("background");

    const cut = fakeClient([{ error: { code: "PGRST204" } }]);
    await expect(
      saveIntroVideo(cut.client, me, {
        take: { ...take, background: "cutout" },
      }),
    ).rejects.toBeInstanceOf(IntroVideoPersistenceError);
    expect(cut.calls).toHaveLength(1);
  });

  it("leaves the background alone when only the script changes", async () => {
    const { client, calls } = fakeClient([{ data: dbRow }]);
    await saveIntroVideo(client, me, { script: "New" });
    expect(calls[0]!.values).not.toHaveProperty("background");
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

vi.mock("server-only", () => ({}));
