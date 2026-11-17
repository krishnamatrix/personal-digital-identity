import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  getAnonymousDb: vi.fn(),
  getAuthenticatedDb: vi.fn(),
  insertInsightEvent: vi.fn(),
  findOwnPublicIds: vi.fn(),
  findLivePublicId: vi.fn(),
  listInsightEvents: vi.fn(),
}));
vi.mock("@/lib/db/query", () => db);

import {
  detectPlatform,
  guessMediaType,
  youtubeVideoId,
} from "@/domains/featured/featured-link";
import {
  ENTRY_KINDS,
  entryDataSchema,
  type EntryItem,
} from "@/domains/identity/entry-kinds";
import { buildPublishedContent } from "@/domains/website/build-published";
import { defaultConfig } from "@/domains/website/config";
import { publishedContentSchema } from "@/domains/website/published-content";
import { SectionBlock, type Tone } from "@/components/website/sections";
import {
  fetchLinkPreview,
  isPublicAddress,
  LinkPreviewError,
  parseMeta,
  previewFromMeta,
} from "@/lib/link-preview/fetch-preview";
import {
  cleanTargetUrl,
  primaryLanguage,
  referrerHost,
  toEventRow,
} from "@/domains/insights/event-input";
import { browserOf, deviceOf, isBot } from "@/domains/insights/user-agent";
import { aggregateInsights } from "@/domains/insights/aggregate";
import { recordBeacon } from "@/domains/insights/insights-service";
import type { StoredInsightEvent } from "@/lib/db/queries/insights";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

/* ------------------------------ featured ------------------------------- */

describe("featured links", () => {
  it("recognises platforms and YouTube ids", () => {
    expect(detectPlatform("https://www.linkedin.com/posts/x").id).toBe(
      "linkedin",
    );
    expect(detectPlatform("https://twitter.com/a/status/1").label).toBe("X");
    expect(detectPlatform("https://blog.example.com/post").label).toBe(
      "blog.example.com",
    );
    expect(
      youtubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10"),
    ).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
    expect(youtubeVideoId("https://www.youtube.com/watch?v=bad")).toBeNull();
    expect(youtubeVideoId("https://evil.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(guessMediaType("https://open.spotify.com/episode/1")).toBe(
      "podcast",
    );
  });

  it("is a list kind the database allows", () => {
    expect(ENTRY_KINDS).toContain("featured_post");
    const sql = readFileSync(
      "docs/sql/milestone-11/001-featured-posts.sql",
      "utf8",
    );
    for (const kind of ENTRY_KINDS) expect(sql).toContain(`'${kind}'`);
    expect(
      entryDataSchema("featured_post").safeParse({
        url: "javascript:alert(1)",
        title: "x",
      }).success,
    ).toBe(false);
  });

  const item = (
    id: string,
    data: EntryItem["data"],
    isVisible = true,
  ): EntryItem => ({
    id,
    isVisible,
    data,
  });
  const ids = [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
    "44444444-4444-4444-8444-444444444444",
  ];
  const source = {
    profile: {
      fullName: "Priya Raman",
      displayName: null,
      headline: null,
      summary: null,
      location: null,
      websiteUrl: null,
      profileImageUrl: null,
      coverImageUrl: null,
      contactEmail: null,
      phone: null,
      currentDesignation: null,
      currentOrganization: null,
      professionalSummary: null,
    },
    entries: {
      featured_post: [
        item(ids[0]!, {
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          title: "My keynote",
          headline: true,
        }),
        item(ids[1]!, {
          url: "https://www.linkedin.com/posts/priya_launch",
          title: "Launch post",
          mediaType: "post",
          date: "2026-03",
          summary: "40k impressions.",
        }),
        item(
          ids[2]!,
          { url: "https://example.com/hidden", title: "Hidden" },
          false,
        ),
        item(ids[3]!, {
          url: "https://example.com/excluded",
          title: "Excluded",
        }),
      ],
    },
  };

  it("publishes only visible, ticked items, with platform, video id and thumbnail", () => {
    const config = { ...defaultConfig(), excludedEntryIds: [ids[3]!] };
    const content = buildPublishedContent(source, config);
    expect(publishedContentSchema.safeParse(content).success).toBe(true);
    const featured = content.sections.find((s) => s.id === "featured");
    expect(featured?.id).toBe("featured");
    if (featured?.id !== "featured") return;
    expect(featured.items.map((i) => i.title)).toEqual([
      "My keynote",
      "Launch post",
    ]);
    expect(featured.items[0]).toMatchObject({
      platform: "youtube",
      mediaType: "video",
      youtubeId: "dQw4w9WgXcQ",
      thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
      headline: true,
    });
    expect(featured.items[1]).toMatchObject({
      platformLabel: "LinkedIn",
      date: "2026-03",
    });
    // Right after "about" in the default order.
    expect(content.sections[0]?.id).toBe("featured");
  });

  it("renders a headline card, tracked links and a click-to-play video", () => {
    const content = buildPublishedContent(source, defaultConfig());
    const section = content.sections.find((s) => s.id === "featured")!;
    const tone: Tone = {
      h2: "",
      muted: "",
      link: "",
      chip: "",
      card: "",
      strong: "",
      rule: "",
    };
    render(
      <SectionBlock
        section={section}
        variant="creative"
        tone={tone}
        index={0}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Play video: My keynote" }),
    ).toBeInTheDocument();
    expect(document.querySelector("iframe")).toBeNull();
    const cta = screen.getByRole("link", { name: /View post on LinkedIn/ });
    expect(cta).toHaveAttribute("data-track-kind", "featured");
    expect(cta).toHaveAttribute("rel", "noopener noreferrer nofollow");
  });
});

/* ---------------------------- link preview ----------------------------- */

describe("link preview", () => {
  it("reads Open Graph tags, decoding entities and resolving relative images", () => {
    const html = `<html><head><title>Fallback</title>
      <meta property="og:title" content="Scaling &amp; shipping">
      <meta name="description" content="Short &#39;desc&#39;">
      <meta property="og:image" content="/img/cover.png">
      <meta property="article:published_time" content="2026-02-14T10:00:00Z">
      <meta property="og:type" content="article"></head></html>`;
    const preview = previewFromMeta(
      parseMeta(html),
      "https://blog.example.com/p/1",
    );
    expect(preview).toEqual({
      title: "Scaling & shipping",
      summary: "Short 'desc'",
      thumbnailUrl: "https://blog.example.com/img/cover.png",
      date: "2026-02",
      mediaType: "article",
    });
    const insecure = previewFromMeta(
      { "og:image": "http://x.com/a.png" },
      "https://x.com/",
    );
    expect(insecure.thumbnailUrl).toBeUndefined();
  });

  it.each([
    ["10.0.0.1", false],
    ["127.0.0.1", false],
    ["169.254.169.254", false],
    ["100.64.1.1", false],
    ["192.168.1.10", false],
    ["172.20.0.1", false],
    ["::1", false],
    ["fd00::1", false],
    ["fe80::1", false],
    ["::ffff:127.0.0.1", false],
    ["8.8.8.8", true],
    ["2606:4700:4700::1111", true],
  ])("isPublicAddress(%s) = %s", (ip, expected) => {
    expect(isPublicAddress(ip)).toBe(expected);
  });

  it.each([
    ["http://example.com/", "invalid"],
    ["https://user:pw@example.com/", "invalid"],
    ["https://127.0.0.1/", "blocked"],
    ["https://169.254.169.254/latest/meta-data", "blocked"],
    ["https://localhost/", "blocked"],
    ["https://example.com:8443/", "blocked"],
  ])("refuses %s before any request", async (url, reason) => {
    const error = await fetchLinkPreview(url).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LinkPreviewError);
    expect((error as LinkPreviewError).reason).toBe(reason);
  });
});

/* ------------------------------- events -------------------------------- */

describe("event input", () => {
  const headers = new Headers({ "accept-language": "en-in,en;q=0.9" });
  const base = {
    surface: "website" as const,
    id: "55555555-5555-4555-8555-555555555555",
  };

  it("keeps only coarse, non-identifying values", () => {
    const view = toEventRow(
      {
        ...base,
        event: "view",
        path: "/priya?email=a@b.com#x",
        referrer: "https://www.linkedin.com/feed/?trk=abc",
        utmSource: "linkedin",
        timeZone: "Asia/Kolkata",
      },
      {
        userAgent: IPHONE,
        headers,
        ownHost: "folioone.com",
        visitorHash: "0123456789abcdef",
      },
    );
    expect(view).toMatchObject({
      website_id: base.id,
      card_id: null,
      path: "/priya",
      referrer_host: "linkedin.com",
      utm_source: "linkedin",
      time_zone: "Asia/Kolkata",
      language: "en-IN",
      device: "mobile",
      browser: "Safari",
      os: "iOS",
      target_url: null,
    });
    const click = toEventRow(
      {
        ...base,
        event: "link_click",
        kind: "social",
        label: "GitHub",
        url: "https://github.com/p?tab=repos&utm=x#top",
      },
      { userAgent: CHROME_MAC, headers, ownHost: null, visitorHash: null },
    );
    expect(click.target_url).toBe("https://github.com/p");
    expect(click.referrer_host).toBeNull();
    expect(cleanTargetUrl("mailto:me@x.com")).toBeNull();
    expect(cleanTargetUrl("https://youtube.com/watch?v=abc&si=track")).toBe(
      "https://youtube.com/watch?v=abc",
    );
    expect(
      referrerHost("https://folioone.com/x", "www.folioone.com"),
    ).toBeNull();
    expect(primaryLanguage("de")).toBe("de");
  });

  it("classifies devices and drops bots and link-preview fetchers", () => {
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isBot("facebookexternalhit/1.1")).toBe(true);
    expect(isBot("LinkedInBot/1.0 (compatible; Mozilla/5.0)")).toBe(true);
    expect(isBot(IPHONE)).toBe(false);
    expect(deviceOf("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe(
      "tablet",
    );
    expect(browserOf(`${IPHONE} LinkedInApp`)).toBe("LinkedIn app");
  });
});

describe("recording", () => {
  beforeEach(() => {
    for (const fn of Object.values(db)) fn.mockReset();
    db.getAnonymousDb.mockResolvedValue({ role: "anon" });
    db.insertInsightEvent.mockResolvedValue(true);
  });
  const valid = {
    surface: "card",
    id: "66666666-6666-4666-8666-666666666666",
    event: "vcard_save",
  };
  const req = (extra: Record<string, string> = {}) => ({
    headers: new Headers({
      "user-agent": CHROME_MAC,
      "x-forwarded-for": "203.0.113.9",
      ...extra,
    }),
    host: "folioone.com",
  });

  it("stores a valid event with the anonymous client and a short visitor hash", async () => {
    expect(await recordBeacon(valid, req())).toBe("recorded");
    const [client, row] = db.insertInsightEvent.mock.calls[0]!;
    expect(client).toEqual({ role: "anon" });
    expect(row).toMatchObject({
      card_id: valid.id,
      website_id: null,
      event: "vcard_save",
    });
    expect(row.visitor_hash).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(row)).not.toContain("203.0.113.9");
  });

  it("ignores invalid input, bots and prefetches", async () => {
    expect(await recordBeacon({ ...valid, event: "drop_table" }, req())).toBe(
      "ignored",
    );
    expect(await recordBeacon({ ...valid, id: "not-a-uuid" }, req())).toBe(
      "ignored",
    );
    expect(await recordBeacon(valid, req({ "user-agent": "curl/8.0" }))).toBe(
      "ignored",
    );
    expect(await recordBeacon(valid, req({ "sec-purpose": "prefetch" }))).toBe(
      "ignored",
    );
    expect(db.insertInsightEvent).not.toHaveBeenCalled();
  });

  it("does not count the owner viewing their own card", async () => {
    db.getAuthenticatedDb.mockResolvedValue({ client: {}, user: { id: "u" } });
    db.findOwnPublicIds.mockResolvedValue({
      websiteId: null,
      cardId: valid.id,
    });
    const result = await recordBeacon(
      valid,
      req({
        cookie: "sb-proj-auth-token=abc",
        "x-forwarded-for": "198.51.100.7",
      }),
    );
    expect(result).toBe("ignored");
    expect(db.insertInsightEvent).not.toHaveBeenCalled();
  });
});

/* ----------------------------- aggregation ----------------------------- */

describe("aggregateInsights", () => {
  const now = new Date("2026-11-17T12:00:00Z");
  const at = (daysAgo: number) =>
    new Date(now.getTime() - daysAgo * 86_400_000).toISOString();
  const ev = (partial: Partial<StoredInsightEvent>): StoredInsightEvent => ({
    website_id: "w",
    card_id: null,
    event: "view",
    occurred_at: at(1),
    ...partial,
  });

  it("computes KPIs, trends, sources, featured and daily series", () => {
    const events = [
      ev({
        visitor_hash: "a",
        referrer_host: "linkedin.com",
        device: "mobile",
        time_zone: "Asia/Kolkata",
      }),
      ev({ visitor_hash: "a", occurred_at: at(1) }), // same visitor, same day
      ev({
        visitor_hash: "b",
        utm_source: "newsletter",
        utm_campaign: "nov",
        referrer_host: "mail.google.com",
      }),
      ev({ card_id: "c", website_id: null, visitor_hash: "c", country: "IN" }),
      ev({
        event: "link_click",
        target_kind: "social",
        target_label: "GitHub",
        target_url: "https://github.com/p",
      }),
      ev({
        event: "link_click",
        target_kind: "featured",
        target_label: "Launch post",
      }),
      ev({
        event: "video_play",
        target_kind: "featured",
        target_label: "My keynote",
      }),
      ev({ event: "vcard_save", card_id: "c", website_id: null }),
      ev({ visitor_hash: "z", occurred_at: at(10) }), // previous 7-day period
    ];
    const r = aggregateInsights(events, { days: 7, now });
    expect(r.kpis.views).toEqual({ current: 4, previous: 1 });
    expect(r.kpis.visitors.current).toBe(3);
    expect(r.kpis.linkClicks.current).toBe(2);
    expect(r.kpis.clickRate).toBe(50);
    expect(r.kpis.cardSaves.current).toBe(1);
    expect(r.kpis.videoPlays.current).toBe(1);
    expect(r.daily).toHaveLength(7);
    expect(r.daily.reduce((n, d) => n + d.views, 0)).toBe(4);
    expect(r.sources.map((s) => s.name)).toEqual(
      expect.arrayContaining(["linkedin.com", "newsletter", "Direct"]),
    );
    expect(r.sources.map((s) => s.name)).not.toContain("mail.google.com");
    expect(r.campaigns[0]?.name).toBe("nov · newsletter");
    expect(r.featured.find((f) => f.label === "My keynote")?.plays).toBe(1);
    expect(r.regions.map((x) => x.name)).toEqual(
      expect.arrayContaining(["Kolkata", "India"]),
    );
    expect(r.bySurface).toEqual({ website: 3, card: 1 });
  });
});

/* -------------------------------- SQL ---------------------------------- */

describe("M11 insights SQL", () => {
  const sql = readFileSync("docs/sql/milestone-11/002-insights.sql", "utf8");
  const code = sql
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

  it("lets anon insert only into live pages, never read, and never set the time", () => {
    expect(code).toContain("FORCE ROW LEVEL SECURITY");
    expect(code).toMatch(
      /CREATE POLICY insight_events_insert_live[\s\S]*?TO anon[\s\S]*?is_live/,
    );
    const grant =
      /GRANT INSERT \(([^)]*)\)\s+ON TABLE folioone\.insight_events TO anon/.exec(
        code,
      );
    expect(grant).not.toBeNull();
    expect(grant![1]).not.toMatch(/occurred_at|\bid\b/);
    expect(code).not.toMatch(
      /GRANT SELECT ON TABLE folioone\.insight_events TO anon/,
    );
    expect(code).not.toMatch(/SECURITY DEFINER|TO service_role/);
    expect(code).toMatch(
      /insight_events_select_own[\s\S]*?TO authenticated[\s\S]*?auth\.uid\(\)/,
    );
  });

  it("is part of local validation", () => {
    const script = readFileSync("scripts/validate/validate.mjs", "utf8");
    expect(script).toContain('"docs/sql/milestone-11/001-featured-posts.sql"');
    expect(script).toContain('"docs/sql/milestone-11/002-insights.sql"');
  });
});
