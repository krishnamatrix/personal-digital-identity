import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublishedContent } from "@/domains/website/published-content";

const getSiteUrlMock = vi.fn<() => Promise<string>>();
const getPublicSiteMock = vi.fn();
const getPublicArticlesMock = vi.fn();

vi.mock("@/lib/site-url", () => ({
  getSiteUrl: () => getSiteUrlMock(),
}));

vi.mock("@/domains/website/website-service", () => ({
  getPublicSite: (slug: string) => getPublicSiteMock(slug),
}));

vi.mock("@/domains/articles/article-service", () => ({
  getPublicArticles: (slug: string) => getPublicArticlesMock(slug),
}));

vi.mock("@/domains/insights/insights-service", () => ({
  publicIdFor: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/components/website/site-view", () => ({
  SiteView: () => null,
}));

vi.mock("@/components/insights/page-tracker", () => ({
  PageTracker: () => null,
}));

vi.mock("@/components/marketing/landing-page", () => ({
  LandingPage: () => null,
}));

vi.mock("@/components/workspace/dashboard", () => ({
  Dashboard: () => null,
}));

vi.mock("@/components/workspace/workspace-shell", () => ({
  WorkspaceShell: () => null,
}));

import { GET as getPlatformLlms } from "@/app/llms.txt/route";
import { GET as getWebsiteLlms } from "@/app/[slug]/llms.txt/route";
import { metadata as homeMetadata } from "@/app/page";
import { generateMetadata as generatePublicSiteMetadata } from "@/app/[slug]/page";

function makeSite(slug: string, articleSlugs: string[] = ["hello-world"]) {
  const content: PublishedContent = {
    version: 1,
    person: {
      name: "Ada Lovelace",
      headline: "Mathematician",
    },
    sections: [
      {
        id: "about",
        heading: "About",
        paragraphs: ["Published bio."],
      },
      {
        id: "articles",
        heading: "Articles",
        items: articleSlugs.map((a) => ({
          slug: a,
          title: `Article ${a}`,
          excerpt: "Snapshot excerpt",
          publishedAt: "2026-11-01T00:00:00.000Z",
          readingMinutes: 4,
          rev: 1,
        })),
      },
    ],
    links: {
      buttonStyle: "filled",
      socials: [],
      items: articleSlugs.map((a) => ({
        kind: "article" as const,
        title: `Link to ${a}`,
        articleSlug: a,
      })),
    },
  };
  return {
    slug,
    theme: "editorial",
    title: "Ada Lovelace",
    description: "Mathematician",
    content,
  };
}

describe("GET /llms.txt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSiteUrlMock.mockResolvedValue("https://folioone.example");
  });

  it("returns 200 UTF-8 Markdown with cache headers and absolute platform links", async () => {
    const res = await getPlatformLlms();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "text/markdown; charset=utf-8",
    );
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=300, stale-while-revalidate=3600",
    );
    const body = await res.text();
    expect(body).toContain("# Folioone");
    expect(body).toContain("https://folioone.example/pricing");
  });
});

describe("GET /<slug>/llms.txt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSiteUrlMock.mockResolvedValue("https://folioone.example");
  });

  it("returns 200 no-store Markdown for a live site and reflects live article snapshots", async () => {
    getPublicSiteMock.mockResolvedValue(
      makeSite("ada", ["live-post", "withdrawn-post"]),
    );
    getPublicArticlesMock.mockResolvedValue([
      {
        slug: "live-post",
        title: "Live Post",
        subtitle: null,
        excerpt: "Still live.",
        coverImageUrl: null,
        category: "Notes",
        readingMinutes: 5,
        publishedAt: new Date("2026-11-10T00:00:00.000Z"),
      },
    ]);

    const res = await getWebsiteLlms(
      new Request("https://folioone.example/ada/llms.txt"),
      { params: Promise.resolve({ slug: "ada" }) },
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "text/markdown; charset=utf-8",
    );
    expect(res.headers.get("cache-control")).toBe("no-store");

    const body = await res.text();
    expect(body).toContain("# Ada Lovelace");
    expect(body).toContain(
      "[Live Post](https://folioone.example/ada/articles/live-post)",
    );
    expect(body).toContain(
      "[Link to live-post](https://folioone.example/ada/articles/live-post)",
    );
    expect(body).not.toContain("withdrawn-post");
  });

  it("returns 404 noindex no-store for unknown, unpublished, reserved, or dotted slugs", async () => {
    getPublicSiteMock.mockResolvedValue(null);

    for (const slug of ["missing-user", "admin", "llms.txt"]) {
      const res = await getWebsiteLlms(
        new Request(`https://folioone.example/${slug}/llms.txt`),
        { params: Promise.resolve({ slug }) },
      );
      expect(res.status).toBe(404);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("x-robots-tag")).toBe("noindex");
      expect(await res.text()).toBe("Not Found\n");
    }
  });

  it("returns 503 safely if snapshot lookup throws, and degrades gracefully if article lookup throws", async () => {
    getPublicSiteMock.mockRejectedValueOnce(new Error("DB offline"));
    const errRes = await getWebsiteLlms(
      new Request("https://folioone.example/ada/llms.txt"),
      { params: Promise.resolve({ slug: "ada" }) },
    );
    expect(errRes.status).toBe(503);
    expect(errRes.headers.get("x-robots-tag")).toBe("noindex");
    expect(await errRes.text()).toBe("Service Unavailable\n");

    getPublicSiteMock.mockResolvedValueOnce(makeSite("ada", ["live-post"]));
    getPublicArticlesMock.mockRejectedValueOnce(new Error("Articles offline"));
    const okRes = await getWebsiteLlms(
      new Request("https://folioone.example/ada/llms.txt"),
      { params: Promise.resolve({ slug: "ada" }) },
    );
    expect(okRes.status).toBe(200);
    const body = await okRes.text();
    expect(body).toContain("# Ada Lovelace");
    expect(body).not.toContain("live-post");
  });

  it("reflects slug rename and unpublish immediately across sequential requests", async () => {
    const liveSites = new Map<string, ReturnType<typeof makeSite>>([
      ["old-slug", makeSite("old-slug", [])],
    ]);
    getPublicSiteMock.mockImplementation(
      async (slug: string) => liveSites.get(slug) ?? null,
    );
    getPublicArticlesMock.mockResolvedValue([]);

    // Step 1: Published at old-slug
    const r1 = await getWebsiteLlms(
      new Request("https://folioone.example/old-slug/llms.txt"),
      { params: Promise.resolve({ slug: "old-slug" }) },
    );
    expect(r1.status).toBe(200);
    expect(await r1.text()).toContain("https://folioone.example/old-slug");

    // Step 2: Renamed to new-slug
    liveSites.delete("old-slug");
    liveSites.set("new-slug", makeSite("new-slug", []));

    const r2Old = await getWebsiteLlms(
      new Request("https://folioone.example/old-slug/llms.txt"),
      { params: Promise.resolve({ slug: "old-slug" }) },
    );
    expect(r2Old.status).toBe(404);

    const r2New = await getWebsiteLlms(
      new Request("https://folioone.example/new-slug/llms.txt"),
      { params: Promise.resolve({ slug: "new-slug" }) },
    );
    expect(r2New.status).toBe(200);
    expect(await r2New.text()).toContain("https://folioone.example/new-slug");

    // Step 3: Unpublished
    liveSites.delete("new-slug");
    const r3 = await getWebsiteLlms(
      new Request("https://folioone.example/new-slug/llms.txt"),
      { params: Promise.resolve({ slug: "new-slug" }) },
    );
    expect(r3.status).toBe(404);
  });
});

describe("HTML discovery metadata (FR-008)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSiteUrlMock.mockResolvedValue("https://folioone.example");
  });

  it("advertises /llms.txt on the root landing page metadata", () => {
    expect(homeMetadata.alternates?.types).toEqual({
      "text/markdown": "/llms.txt",
    });
  });

  it("advertises /<slug>/llms.txt only on live published websites and omits it on 404", async () => {
    getPublicSiteMock.mockResolvedValueOnce(makeSite("ada", []));
    const liveMeta = await generatePublicSiteMetadata({
      params: Promise.resolve({ slug: "ada" }),
    });
    expect(liveMeta.alternates?.types).toEqual({
      "text/markdown": "https://folioone.example/ada/llms.txt",
    });

    getPublicSiteMock.mockResolvedValueOnce(null);
    const missingMeta = await generatePublicSiteMetadata({
      params: Promise.resolve({ slug: "unknown" }),
    });
    expect(missingMeta.alternates).toBeUndefined();
    expect(missingMeta.robots).toEqual({ index: false });
  });
});
