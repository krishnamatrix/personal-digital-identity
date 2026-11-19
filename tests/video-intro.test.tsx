import { readFileSync } from "node:fs";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SUPABASE = "https://proj.supabase.co";
const me = "0f00b3c8-7ea4-42ad-a544-4d62d1a42f54";
const takeId = "1b2c3d4e-5f60-4a7b-8c9d-aeb0c1d2e3f4";
const oldId = "2c3d4e5f-6071-4b8c-9dae-b0c1d2e3f405";

const db = vi.hoisted(() => ({
  getAuthenticatedDb: vi.fn(),
  ensureAccount: vi.fn(),
  findProfile: vi.fn(),
  createEmptyProfile: vi.fn(),
  listEntries: vi.fn(),
  findIntroVideo: vi.fn(),
  saveIntroVideo: vi.fn(),
  deleteIntroVideoRow: vi.fn(),
  signVideoUpload: vi.fn(),
  signPrivateVideo: vi.fn(),
  privateVideoSize: vi.fn(),
  readPrivateVideoHead: vi.fn(),
  removePrivateVideos: vi.fn(),
  listPrivateIntroFiles: vi.fn(),
  copyToPublicVideo: vi.fn(),
  listPublicVideos: vi.fn(),
  removePublicVideos: vi.fn(),
}));
const ai = vi.hoisted(() => ({
  isIntroAiAvailable: vi.fn(() => false),
  draftScriptWithAi: vi.fn(),
  transcribeWithAi: vi.fn(),
}));

// next/font is compiled by Next; in tests each loader just returns a class/variable name.
vi.mock("next/font/google", () => {
  const names = [
    "Archivo",
    "Bodoni_Moda",
    "Cormorant_Garamond",
    "DM_Serif_Display",
    "EB_Garamond",
    "Fraunces",
    "IBM_Plex_Mono",
    "Instrument_Serif",
    "Inter",
    "JetBrains_Mono",
    "Libre_Baskerville",
    "Manrope",
    "Outfit",
    "Playfair_Display",
    "Sora",
    "Space_Grotesk",
    "Syne",
    "Unbounded",
  ];
  return Object.fromEntries(
    names.map((n) => [
      n,
      () => ({ variable: `font-${n}`, className: `font-${n}` }),
    ]),
  );
});

vi.mock("@/lib/env", () => ({
  requireSupabaseConfig: () => ({ url: SUPABASE, anonKey: "anon" }),
}));
vi.mock("@/lib/server-log", () => ({ logLoadError: vi.fn() }));
vi.mock("@/lib/db/query", () => db);
vi.mock("@/lib/ai/intro-ai", () => ai);

import {
  baseVideoType,
  cleanCaptions,
  INTRO_BACKGROUNDS,
  privatePosterPath,
  privateVideoPath,
  publicVideoPath,
  publicVideoUrl,
  publishedIntroSchema,
  readingSeconds,
  sniffVideo,
  templateScript,
  toWebVtt,
  type PublishedIntro,
} from "@/domains/intro/intro-video";
import {
  beginIntroUpload,
  captionIntro,
  cleanupPublishedIntro,
  completeIntroUpload,
  preparePublishedIntro,
  saveIntroTrim,
  previewIntroFor,
  publishedIntroFor,
} from "@/domains/intro/intro-video-service";
import type { IntroVideoRow } from "@/lib/db/queries/intro-videos";
import {
  buildPublishedContent,
  type IdentitySource,
} from "@/domains/website/build-published";
import { defaultConfig } from "@/domains/website/config";
import { publishedContentSchema } from "@/domains/website/published-content";
import { SiteView } from "@/components/website/site-view";
import { LinksView } from "@/components/links/links-view";
import { PageTracker, trackInsight } from "@/components/insights/page-tracker";
import { aggregateInsights } from "@/domains/insights/aggregate";
import { INSIGHT_EVENTS } from "@/domains/insights/event-input";
import { encodeWav } from "@/app/website/intro/media";

const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81]);
const MP4 = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73]);
const client = { tag: "client" };
const take = {
  accountId: me,
  videoId: takeId,
  contentType: "video/mp4" as const,
};

const row = (over: Partial<IntroVideoRow> = {}): IntroVideoRow => ({
  script: "Hi, I'm Alex.",
  take: {
    videoId: takeId,
    contentType: "video/mp4",
    byteSize: 12_000_000,
    duration: 58.4,
    hasPoster: true,
    background: "none",
    trim: null,
    recordedAt: new Date("2026-11-18T10:00:00Z"),
  },
  captions: [{ start: 0, end: 2.5, text: "Hi, I'm Alex." }],
  showOnWebsite: true,
  updatedAt: new Date("2026-11-18T10:00:00Z"),
  ...over,
});

// jsdom's Blob has no arrayBuffer() / text(); read it the old way.
for (const [name, read] of [
  ["arrayBuffer", "readAsArrayBuffer"],
  ["text", "readAsText"],
] as const)
  if (!(name in Blob.prototype))
    Object.defineProperty(Blob.prototype, name, {
      configurable: true,
      value(this: Blob) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader[read](this);
        });
      },
    });

beforeEach(() => {
  vi.clearAllMocks();
  db.getAuthenticatedDb.mockResolvedValue({ client, user: { id: me } });
  db.removePrivateVideos.mockResolvedValue(undefined);
  db.removePublicVideos.mockResolvedValue(undefined);
  db.listPrivateIntroFiles.mockResolvedValue([]);
  ai.isIntroAiAvailable.mockReturnValue(false);
});

describe("video intro: storage layout and files", () => {
  it("keeps every file in the owner's own folders", () => {
    expect(privateVideoPath(take)).toBe(`${me}/intro/${takeId}.mp4`);
    expect(privatePosterPath(take)).toBe(`${me}/intro/${takeId}.jpg`);
    expect(publicVideoPath({ ...take, contentType: "video/webm" })).toBe(
      `${me}/website/${takeId}.webm`,
    );
    expect(publicVideoUrl(`${SUPABASE}/`, "a/b.mp4")).toBe(
      `${SUPABASE}/storage/v1/object/public/public-video/a/b.mp4`,
    );
  });

  it("reads the real container from the first bytes, not the claimed type", () => {
    expect(baseVideoType("video/webm;codecs=vp9,opus")).toBe("video/webm");
    expect(baseVideoType("video/quicktime")).toBeNull();
    expect(sniffVideo(WEBM)).toBe("video/webm");
    expect(sniffVideo(MP4)).toBe("video/mp4");
    expect(sniffVideo(new TextEncoder().encode("<html><body>"))).toBeNull();
  });
});

describe("video intro: captions", () => {
  it("sorts cues, drops broken ones, removes overlaps and clamps to the video", () => {
    const cues = cleanCaptions(
      [
        { start: 3, end: 7, text: "  second   cue " },
        { start: 0, end: 3.5, text: "first" },
        { start: 5, end: 4, text: "backwards" },
        { start: 8, end: 99, text: "last" },
        { start: 1, end: 2, text: "" },
        "junk",
      ],
      10,
    );
    expect(cues).toEqual([
      { start: 0, end: 3, text: "first" },
      { start: 3, end: 7, text: "second cue" },
      { start: 8, end: 10, text: "last" },
    ]);
  });

  it("writes WebVTT with escaped text, so captions cannot inject markup", () => {
    const vtt = toWebVtt([
      { start: 1.5, end: 62.25, text: "<b>Hi</b> & --> bye" },
    ]);
    expect(vtt).toBe(
      "WEBVTT\n\n1\n00:00:01.500 --> 00:01:02.250\n&lt;b&gt;Hi&lt;/b&gt; &amp; → bye\n",
    );
  });

  it("captions a saved take from its WAV soundtrack", async () => {
    ai.isIntroAiAvailable.mockReturnValue(true);
    db.findIntroVideo.mockResolvedValue(row());
    ai.transcribeWithAi.mockResolvedValue([
      { start: 0, end: 70, text: "Hello there" },
    ]);
    const wav = encodeWav(new Float32Array(160), 16_000);
    const cues = await captionIntro(new File([wav], "a.wav"));
    expect(cues).toEqual([{ start: 0, end: 58.4, text: "Hello there" }]);
    expect(db.saveIntroVideo).toHaveBeenCalledWith(client, me, {
      captions: cues,
    });
  });

  it("refuses audio that is not a WAV", async () => {
    ai.isIntroAiAvailable.mockReturnValue(true);
    db.findIntroVideo.mockResolvedValue(row());
    await expect(
      captionIntro(new File([new Uint8Array(64)], "a.wav")),
    ).rejects.toThrow(/could not read the audio/);
    expect(ai.transcribeWithAi).not.toHaveBeenCalled();
  });

  it("encodes a mono 16-bit WAV header", async () => {
    const wav = encodeWav(new Float32Array([0, 1, -1]), 16_000);
    const bytes = new Uint8Array(await wav.arrayBuffer());
    const view = new DataView(bytes.buffer);
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...bytes.subarray(8, 12))).toBe("WAVE");
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getInt16(46, true)).toBe(0x7fff);
    expect(view.getInt16(48, true)).toBe(-0x8000);
  });
});

describe("video intro: script", () => {
  it("builds a template from profile facts only", () => {
    const script = templateScript({
      name: "Alex Example",
      role: "Engineering Manager",
      organization: "Acme",
      location: "Berlin",
      skills: ["React", "Hiring", "Platform design", "Go"],
      recentRoles: ["Engineering Manager at Acme", "Engineer at Beta"],
      projects: [],
    });
    expect(script).toMatch(
      /^Hi, I'm Alex\. I'm an Engineering Manager at Acme, based in Berlin\./,
    );
    expect(script).toContain("React, Hiring and Platform design");
    expect(script).toContain("Before this, I worked as Engineer at Beta.");
    expect(script).not.toContain("Go.");
  });

  it("estimates reading time at a speaking pace", () => {
    expect(readingSeconds(Array(140).fill("word").join(" "))).toBe(60);
    expect(readingSeconds("")).toBe(0);
  });
});

describe("video intro: saving a take", () => {
  it("hands out upload URLs only for supported, reasonable takes", async () => {
    await expect(
      beginIntroUpload({
        mimeType: "video/x-msvideo",
        byteSize: 10,
        duration: 10,
        withPoster: false,
      }),
    ).rejects.toThrow(/unsupported/);
    await expect(
      beginIntroUpload({
        mimeType: "video/webm",
        byteSize: 60 * 1024 * 1024,
        duration: 10,
        withPoster: false,
      }),
    ).rejects.toThrow(/50 MB/);
    await expect(
      beginIntroUpload({
        mimeType: "video/webm",
        byteSize: 1000,
        duration: 200,
        withPoster: false,
      }),
    ).rejects.toThrow(/two minutes/);
    expect(db.signVideoUpload).not.toHaveBeenCalled();

    db.signVideoUpload.mockImplementation(
      async (_c, path: string) => `https://up/${path}`,
    );
    const ticket = await beginIntroUpload({
      mimeType: "video/mp4;codecs=avc1",
      byteSize: 1000,
      duration: 30,
      withPoster: true,
    });
    expect(ticket.videoUploadUrl).toMatch(
      new RegExp(`^https://up/${me}/intro/[0-9a-f-]{36}\\.mp4$`),
    );
    expect(ticket.posterUploadUrl).toBe(
      `https://up/${me}/intro/${ticket.videoId}.jpg`,
    );
  });

  it("rejects an upload whose bytes are not the claimed video, and deletes it", async () => {
    db.privateVideoSize.mockResolvedValue(5000);
    db.readPrivateVideoHead.mockResolvedValue(
      new TextEncoder().encode("<html>"),
    );
    await expect(
      completeIntroUpload({
        videoId: takeId,
        mimeType: "video/mp4",
        duration: 30,
        hasPoster: false,
        script: "Hi",
      }),
    ).rejects.toThrow(/not a WebM or MP4/);
    expect(db.removePrivateVideos).toHaveBeenCalledWith(client, [
      `${me}/intro/${takeId}.mp4`,
      `${me}/intro/${takeId}.jpg`,
    ]);
    expect(db.saveIntroVideo).not.toHaveBeenCalled();
  });

  it("refuses ids that are not uuids (no path tricks)", async () => {
    await expect(
      completeIntroUpload({
        videoId: "../other",
        mimeType: "video/mp4",
        duration: 30,
        hasPoster: false,
        script: "",
      }),
    ).rejects.toThrow(/could not find your upload/);
    expect(db.privateVideoSize).not.toHaveBeenCalled();
  });

  it("saves a verified take and clears older private files", async () => {
    db.privateVideoSize.mockImplementation(async (_c, path: string) =>
      path.endsWith(".jpg") ? 90_000 : 12_000_000,
    );
    db.readPrivateVideoHead.mockImplementation(async (_c, path: string) =>
      path.endsWith(".jpg") ? new Uint8Array([0xff, 0xd8, 0xff, 0xe0]) : MP4,
    );
    db.saveIntroVideo.mockResolvedValue(row());
    db.signPrivateVideo.mockImplementation(
      async (_c, path: string) => `https://signed/${path}`,
    );
    db.listPrivateIntroFiles.mockResolvedValue([
      `${me}/intro/${takeId}.mp4`,
      `${me}/intro/${takeId}.jpg`,
      `${me}/intro/${oldId}.webm`,
    ]);
    const saved = await completeIntroUpload({
      videoId: takeId,
      mimeType: "video/mp4",
      duration: 58.4,
      hasPoster: true,
      script: "  Hi, I'm Alex.  ",
    });
    expect(db.saveIntroVideo).toHaveBeenCalledWith(client, me, {
      script: "Hi, I'm Alex.",
      take: {
        videoId: takeId,
        contentType: "video/mp4",
        byteSize: 12_000_000,
        duration: 58.4,
        hasPoster: true,
        background: "none",
      },
      trim: null,
    });
    expect(db.removePrivateVideos).toHaveBeenLastCalledWith(client, [
      `${me}/intro/${oldId}.webm`,
    ]);
    expect(saved.videoUrl).toBe(`https://signed/${me}/intro/${takeId}.mp4`);
  });

  it("records the background treatment and refuses unknown ones", async () => {
    db.privateVideoSize.mockResolvedValue(12_000_000);
    db.readPrivateVideoHead.mockResolvedValue(MP4);
    db.saveIntroVideo.mockResolvedValue(
      row({ take: { ...row().take!, background: "cutout" } }),
    );
    db.signPrivateVideo.mockResolvedValue("https://signed/x");
    db.listPrivateIntroFiles.mockResolvedValue([]);
    const saved = await completeIntroUpload({
      videoId: takeId,
      mimeType: "video/mp4",
      duration: 30,
      hasPoster: false,
      script: "Hi",
      background: "cutout",
    });
    expect(db.saveIntroVideo.mock.calls.at(-1)![2].take.background).toBe(
      "cutout",
    );
    expect(saved.background).toBe("cutout");
    await expect(
      completeIntroUpload({
        videoId: takeId,
        mimeType: "video/mp4",
        duration: 30,
        hasPoster: false,
        script: "Hi",
        background: "chroma" as never,
      }),
    ).rejects.toThrow("Unknown background setting.");
  });
});

describe("video intro: website publishing", () => {
  it("is in the snapshot only when there is a take and it is switched on", () => {
    expect(publishedIntroFor(me, null)).toBeUndefined();
    expect(publishedIntroFor(me, row({ take: null }))).toBeUndefined();
    expect(
      publishedIntroFor(me, row({ showOnWebsite: false })),
    ).toBeUndefined();
    expect(publishedIntroFor(me, row())).toEqual({
      videoUrl: `${SUPABASE}/storage/v1/object/public/public-video/${me}/website/${takeId}.mp4`,
      posterUrl: `${SUPABASE}/storage/v1/object/public/public-video/${me}/website/${takeId}.jpg`,
      type: "video/mp4",
      duration: 58.4,
      captions: [{ start: 0, end: 2.5, text: "Hi, I'm Alex." }],
    });
  });

  it("tells the website when the take is a cut-out", () => {
    const cut = row({ take: { ...row().take!, background: "cutout" } });
    expect(publishedIntroFor(me, cut)?.background).toBe("cutout");
    expect(publishedIntroFor(me, row())).not.toHaveProperty("background");
    expect(
      publishedIntroSchema.safeParse({
        ...publishedIntroFor(me, cut),
        background: "green-screen",
      }).success,
    ).toBe(false);
  });

  it("carries the trim, and the badge shows the trimmed length", () => {
    const trimmed = row({
      take: { ...row().take!, trim: { start: 2, end: 42 } },
    });
    expect(publishedIntroFor(me, trimmed)?.trim).toEqual({ start: 2, end: 42 });
    expect(publishedIntroFor(me, row())).not.toHaveProperty("trim");
    expect(
      publishedIntroSchema.safeParse({
        ...publishedIntroFor(me, trimmed),
        trim: { start: 5, end: 3 },
      }).success,
    ).toBe(false);
  });

  it("saves a trim on the saved take, and refuses less than a second", async () => {
    db.findIntroVideo.mockResolvedValue(row());
    db.saveIntroVideo.mockResolvedValue(
      row({ take: { ...row().take!, trim: { start: 1.5, end: 50 } } }),
    );
    db.signPrivateVideo.mockResolvedValue("https://signed/x");
    const take = await saveIntroTrim({ start: 1.5, end: 50 });
    expect(db.saveIntroVideo).toHaveBeenLastCalledWith(client, me, {
      trim: { start: 1.5, end: 50 },
    });
    expect(take.trim).toEqual({ start: 1.5, end: 50 });
    await expect(saveIntroTrim({ start: 10, end: 10.4 })).rejects.toThrow(
      "Keep at least one second of your intro.",
    );
    // Before 004 the database cannot keep it: say so instead of pretending.
    db.saveIntroVideo.mockResolvedValue(row());
    await expect(saveIntroTrim({ start: 1.5, end: 50 })).rejects.toThrow(
      "Trimming is not available yet.",
    );
  });

  it("copies video and poster to the public bucket before publishing", async () => {
    await preparePublishedIntro(client as never, me, row());
    expect(db.copyToPublicVideo).toHaveBeenCalledWith(
      client,
      `${me}/intro/${takeId}.mp4`,
      `${me}/website/${takeId}.mp4`,
    );
    expect(db.copyToPublicVideo).toHaveBeenCalledWith(
      client,
      `${me}/intro/${takeId}.jpg`,
      `${me}/website/${takeId}.jpg`,
    );
    vi.clearAllMocks();
    await preparePublishedIntro(
      client as never,
      me,
      row({ showOnWebsite: false }),
    );
    expect(db.copyToPublicVideo).not.toHaveBeenCalled();
  });

  it("removes public copies the live site no longer uses", async () => {
    db.listPublicVideos.mockResolvedValue([
      `${me}/website/${takeId}.mp4`,
      `${me}/website/${takeId}.jpg`,
      `${me}/website/${oldId}.webm`,
    ]);
    await cleanupPublishedIntro(
      client as never,
      me,
      publishedIntroFor(me, row()),
    );
    expect(db.removePublicVideos).toHaveBeenCalledWith(client, [
      `${me}/website/${oldId}.webm`,
    ]);
    await cleanupPublishedIntro(client as never, me, undefined);
    expect(db.removePublicVideos).toHaveBeenLastCalledWith(client, [
      `${me}/website/${takeId}.mp4`,
      `${me}/website/${takeId}.jpg`,
      `${me}/website/${oldId}.webm`,
    ]);
  });

  it("previews with signed URLs (the public copy does not exist yet)", async () => {
    db.signPrivateVideo.mockImplementation(
      async (_c, path: string) => `https://signed/${path}`,
    );
    const intro = await previewIntroFor(client as never, me, row());
    expect(intro?.videoUrl).toBe(`https://signed/${me}/intro/${takeId}.mp4`);
    expect(intro?.posterUrl).toBe(`https://signed/${me}/intro/${takeId}.jpg`);
  });

  it("validates the published shape (http(s) only)", () => {
    const ok: PublishedIntro = {
      videoUrl: "https://x.example/v.mp4",
      type: "video/mp4",
      duration: 30,
    };
    expect(publishedIntroSchema.safeParse(ok).success).toBe(true);
    expect(
      publishedIntroSchema.safeParse({ ...ok, videoUrl: "javascript:alert(1)" })
        .success,
    ).toBe(false);
    expect(
      publishedIntroSchema.safeParse({ ...ok, type: "text/html" }).success,
    ).toBe(false);
  });
});

const intro: PublishedIntro = {
  videoUrl: "https://proj.supabase.co/v.mp4",
  posterUrl: "https://proj.supabase.co/v.jpg",
  type: "video/mp4",
  duration: 58,
  captions: [{ start: 0, end: 2, text: "Hi, I'm Alex." }],
};

const source = (withIntro: boolean): IdentitySource => ({
  profile: {
    fullName: "Alex Example",
    displayName: null,
    headline: "Product designer",
    summary: "I design calm software.",
    location: null,
    websiteUrl: null,
    profileImageUrl: "https://img.example/alex.jpg",
    coverImageUrl: null,
    contactEmail: null,
    phone: null,
    currentDesignation: null,
    currentOrganization: null,
    professionalSummary: null,
  },
  entries: {},
  intro: withIntro ? intro : undefined,
});

describe("video intro on the public website", () => {
  it("rides in the snapshot and survives re-validation", () => {
    const content = buildPublishedContent(source(true), defaultConfig());
    expect(content.person.intro).toEqual(intro);
    expect(publishedContentSchema.parse(content).person.intro).toEqual(intro);
    expect(
      buildPublishedContent(source(false), defaultConfig()).person.intro,
    ).toBeUndefined();
  });

  for (const theme of [
    "professional",
    "creative",
    "minimal",
    "atelier",
  ] as const)
    it(`turns the ${theme} portrait into a "Watch intro" button`, async () => {
      const content = buildPublishedContent(source(true), defaultConfig());
      const { unmount } = render(<SiteView theme={theme} content={content} />);
      const button = screen.getByRole("button", {
        name: "Play Alex Example's video intro (0:58)",
      });
      expect(button).toHaveAttribute("data-track-event", "video_play");
      expect(button).toHaveAttribute("data-track-kind", "intro");
      // Nothing downloads before the visitor asks for it.
      expect(document.querySelector("video")).toBeNull();
      await userEvent.click(button);
      const video = await screen.findByLabelText("Alex Example's video intro");
      expect(video).toHaveAttribute("src", intro.videoUrl);
      expect(screen.getByRole("dialog")).toHaveTextContent("Meet Alex Example");
      unmount();
    });

  it("plays only the trimmed part on the website", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const content = buildPublishedContent(
      { ...source(true), intro: { ...intro, trim: { start: 3, end: 43 } } },
      defaultConfig(),
    );
    render(<SiteView theme="professional" content={content} />);
    await userEvent.click(
      screen.getByRole("button", {
        name: "Play Alex Example's video intro (0:40)",
      }),
    );
    const seek = await screen.findByRole("slider", { name: "Seek" });
    expect(seek).toHaveAttribute("max", "40");
    expect(screen.getByText("0:00 / 0:40")).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("shows no button without an intro", () => {
    const content = buildPublishedContent(source(false), defaultConfig());
    render(<SiteView theme="professional" content={content} />);
    expect(
      screen.queryByRole("button", { name: /video intro/ }),
    ).not.toBeInTheDocument();
  });

  // jsdom has no WebGL: the player falls back to the plain picture (also tested here).
  const noWebGl = () =>
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

  const cutoutSource = (): IdentitySource => ({
    ...source(true),
    intro: { ...intro, background: "cutout" },
  });

  for (const theme of ["professional", "creative", "atelier"] as const)
    it(`plays a cut-out intro in place of the ${theme} portrait`, async () => {
      const gl = noWebGl();
      const play = vi
        .spyOn(HTMLMediaElement.prototype, "play")
        .mockResolvedValue(undefined);
      const content = buildPublishedContent(cutoutSource(), defaultConfig());
      expect(content.person.intro?.background).toBe("cutout");
      const { unmount } = render(<SiteView theme={theme} content={content} />);
      const button = screen.getByRole("button", {
        name: "Play Alex Example's video intro (0:58)",
      });
      expect(button).toHaveAttribute("data-track-event", "video_play");
      // The video element is there but loads nothing before the tap.
      const video = screen.getByLabelText("Alex Example's video intro");
      expect(video).toHaveAttribute("preload", "none");
      expect(video).toHaveAttribute("crossorigin", "anonymous");
      await userEvent.click(button);
      // Plays right there (inside the tap, so phones allow sound): no dialog.
      expect(play).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Stop video" }),
      ).toBeInTheDocument();
      play.mockRestore();
      gl.mockRestore();
      unmount();
    });

  it("opens a cut-out intro on a small avatar in the dialog, with its own controls", async () => {
    noWebGl();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const content = buildPublishedContent(cutoutSource(), defaultConfig());
    render(<SiteView theme="minimal" content={content} />);
    await userEvent.click(
      screen.getByRole("button", {
        name: "Play Alex Example's video intro (0:58)",
      }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog.querySelector("video")).toHaveAttribute(
      "src",
      intro.videoUrl,
    );
    expect(screen.getByRole("slider", { name: "Seek" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Read transcript" }),
    ).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("offers the intro on the links page too", () => {
    const content = buildPublishedContent(source(true), defaultConfig());
    render(
      <LinksView
        content={{
          ...content,
          links: { buttonStyle: "filled", socials: [], items: [] },
        }}
        items={[]}
        siteSlug="alex"
        colors={{ bg: "#ffffff", fg: "#111111", accent: "#ff7a59" }}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Play Alex Example's video intro/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Tap my photo to watch my intro"),
    ).toBeInTheDocument();
  });
});

describe("video intro insights", () => {
  it("sends non-click events through the page tracker", async () => {
    const beacon = vi.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", {
      value: beacon,
      configurable: true,
    });
    render(<PageTracker surface="website" id={takeId} />);
    act(() =>
      trackInsight({
        event: "video_complete",
        kind: "intro",
        label: "Video intro",
      }),
    );
    await waitFor(() => expect(beacon).toHaveBeenCalledTimes(2));
    const calls = beacon.mock.calls as unknown as [string, Blob][];
    const body = JSON.parse(await calls[1]![1].text());
    expect(body).toMatchObject({
      surface: "website",
      id: takeId,
      event: "video_complete",
      kind: "intro",
    });
  });

  it("reports intro plays and how many were watched to the end", () => {
    const now = new Date("2026-11-18T12:00:00Z");
    const at = "2026-11-17T10:00:00Z";
    const r = aggregateInsights(
      [
        {
          website_id: "w",
          event: "video_play",
          target_kind: "intro",
          occurred_at: at,
        },
        {
          website_id: "w",
          event: "video_play",
          target_kind: "intro",
          occurred_at: at,
        },
        {
          website_id: "w",
          event: "video_play",
          target_kind: "featured",
          occurred_at: at,
        },
        {
          website_id: "w",
          event: "video_complete",
          target_kind: "intro",
          occurred_at: at,
        },
      ] as never,
      { days: 7, now },
    );
    expect(r.kpis.videoPlays.current).toBe(3);
    expect(r.kpis.introPlays.current).toBe(2);
    expect(r.kpis.introCompletionRate).toBe(50);
  });
});

describe("video intro SQL", () => {
  const storage = readFileSync(
    "docs/sql/milestone-13/001-intro-video-storage.sql",
    "utf8",
  );
  const table = readFileSync(
    "docs/sql/milestone-13/002-intro-videos.sql",
    "utf8",
  );
  const validate = readFileSync("scripts/validate/validate.mjs", "utf8");
  const background = readFileSync(
    "docs/sql/milestone-13/003-intro-video-background.sql",
    "utf8",
  );

  it("adds trim columns and allows every background the app records (004)", () => {
    const trim = readFileSync(
      "docs/sql/milestone-13/004-intro-trim-and-studio.sql",
      "utf8",
    );
    expect(trim).toContain(
      `CHECK (background IN (${INTRO_BACKGROUNDS.map((b) => `'${b}'`).join(", ")}))`,
    );
    expect(trim).toMatch(/trim_end >= trim_start \+ 1/);
    expect(trim).not.toMatch(/^\s*(CREATE POLICY|GRANT|REVOKE)/im);
    expect(validate).toContain(
      '"docs/sql/milestone-13/004-intro-trim-and-studio.sql"',
    );
  });

  it("adds the background column (003)", () => {
    expect(background).toContain(
      "ADD COLUMN background text NOT NULL DEFAULT 'none';",
    );
    expect(background).toContain(
      "CHECK (background IN ('none', 'blur', 'cutout'))",
    );
    // Policies, grants and Storage are untouched.
    expect(background).not.toMatch(/^\s*(CREATE POLICY|GRANT|REVOKE|DROP)/im);
    expect(background).not.toMatch(/storage\./);
    expect(validate).toContain(
      '"docs/sql/milestone-13/003-intro-video-background.sql"',
    );
  });

  it("keeps recordings private and only published copies public", () => {
    expect(storage).toMatch(
      /\('identity-video', 'identity-video', false, 52428800/,
    );
    expect(storage).toMatch(
      /\('public-video',\s+'public-video',\s+true,\s+52428800/,
    );
    expect(storage).toContain(
      "name ~ '^[0-9a-f-]{36}/intro/[0-9a-f-]{36}\\.(webm|mp4|jpg)$'",
    );
    expect(storage).not.toMatch(/TO (anon|public|service_role)/i);
    expect(storage).not.toMatch(/^\s*[^-\s][^\n]*SECURITY DEFINER/m);
  });

  it("makes intro_videos owner-only with forced RLS", () => {
    expect(table).toContain(
      "ALTER TABLE folioone.intro_videos FORCE ROW LEVEL SECURITY;",
    );
    expect(table.match(/CREATE POLICY intro_videos_\w+_own/g)).toHaveLength(4);
    expect(table).not.toMatch(/GRANT [^;]* TO anon/);
    expect(table).not.toMatch(/^\s*[^-\s][^\n]*SECURITY DEFINER/m);
    for (const e of INSIGHT_EVENTS) expect(table).toContain(`'${e}'`);
  });

  it("applies the table locally but never the Storage file", () => {
    expect(validate).toContain('"docs/sql/milestone-13/002-intro-videos.sql"');
    expect(validate).not.toContain(
      '"docs/sql/milestone-13/001-intro-video-storage.sql"',
    );
    expect(validate).toContain("'intro_videos'");
  });
});
