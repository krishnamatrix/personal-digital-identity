import { describe, expect, it } from "vitest";
import {
  buildPublishedContent,
  sectionHasContent,
  selectedArticles,
  stableStringify,
  type ArticleSource,
  type IdentitySource,
} from "@/domains/website/build-published";
import {
  defaultConfig,
  normalizeConfig,
  websiteConfigSchema,
} from "@/domains/website/config";
import { publishedContentSchema } from "@/domains/website/published-content";
import { applyLiveArticles } from "@/domains/articles/public";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const art = (n: number, over: Partial<ArticleSource> = {}): ArticleSource => ({
  id: id(n),
  slug: `article-${n}`,
  title: `Article ${n}`,
  excerpt: `Excerpt ${n}`,
  coverImageUrl: null,
  category: null,
  publishedAt: new Date("2026-03-01T10:00:00Z"),
  readingMinutes: 3,
  version: 2,
  ...over,
});
const source = (articles: ArticleSource[]): IdentitySource => ({
  profile: {
    fullName: "Jane Doe",
    displayName: "Jane",
    headline: "Designer",
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
  entries: {},
  articles,
});
const withConfig = (selectedIds: string[], visible = true) => {
  const c = defaultConfig();
  c.articles.selectedIds = selectedIds;
  c.sections = c.sections.map((s) =>
    s.id === "articles" ? { ...s, visible } : s,
  );
  return c;
};
const articlesSection = (s: IdentitySource, c = withConfig([id(1)])) =>
  buildPublishedContent(s, c).sections.find((x) => x.id === "articles");

describe("website configuration for articles", () => {
  it("articles are off by default and never auto-selected", () => {
    const c = defaultConfig();
    expect(c.articles.selectedIds).toEqual([]);
    expect(c.sections.find((s) => s.id === "articles")!.visible).toBe(false);
    expect(articlesSection(source([art(1), art(2)]), c)).toBeUndefined();
  });
  it("upgrades a stored M5 config without articles", () => {
    const old = JSON.parse(JSON.stringify(defaultConfig()));
    delete old.articles;
    old.sections = old.sections.filter(
      (s: { id: string }) => s.id !== "articles",
    );
    const fixed = normalizeConfig(old);
    expect(fixed.articles.selectedIds).toEqual([]);
    expect(fixed.sections.find((s) => s.id === "articles")!.visible).toBe(
      false,
    );
    expect(fixed.sections[0]!.id).toBe("intro");
  });
  it("limits and validates selected ids", () => {
    const c = defaultConfig();
    expect(
      websiteConfigSchema.safeParse({
        ...c,
        articles: { selectedIds: ["nope"] },
      }).success,
    ).toBe(false);
    expect(
      websiteConfigSchema.safeParse({
        ...c,
        articles: {
          selectedIds: Array.from({ length: 51 }, (_, i) => id(i + 1)),
        },
      }).success,
    ).toBe(false);
  });
});

describe("what may be published", () => {
  it("includes only selected published articles, in the owner's order", () => {
    const section = articlesSection(
      source([art(1), art(2), art(3)]),
      withConfig([id(3), id(1)]),
    );
    expect(
      section && "items" in section && section.items.map((i) => i.slug),
    ).toEqual(["article-3", "article-1"]);
  });
  it("never includes articles that are not passed in (drafts, archived) or are not selected", () => {
    // The service passes only status=published rows; a selected id that is not among them is dropped.
    expect(
      selectedArticles(source([art(1)]), withConfig([id(9), id(1)])).map(
        (a) => a.id,
      ),
    ).toEqual([id(1)]);
    expect(
      articlesSection(source([art(2)]), withConfig([id(1)])),
    ).toBeUndefined();
  });
  it("drops an article without an address or publish date, and duplicates", () => {
    const s = source([
      art(1, { slug: null }),
      art(2, { publishedAt: null }),
      art(3),
    ]);
    expect(
      selectedArticles(s, withConfig([id(1), id(2), id(3), id(3)])).map(
        (a) => a.id,
      ),
    ).toEqual([id(3)]);
  });
  it("omits the section when switched off, and counts as content only when something is selected", () => {
    expect(
      articlesSection(source([art(1)]), withConfig([id(1)], false)),
    ).toBeUndefined();
    expect(
      sectionHasContent(source([art(1)]), withConfig([]), "articles"),
    ).toBe(false);
    expect(
      sectionHasContent(
        source([art(1)]),
        withConfig([id(1)], false),
        "articles",
      ),
    ).toBe(true);
  });
  it("the snapshot validates against the published schema and carries no private ids", () => {
    const content = buildPublishedContent(
      source([
        art(1, { coverImageUrl: "https://e.com/c.png", category: "Design" }),
      ]),
      withConfig([id(1)]),
    );
    expect(publishedContentSchema.safeParse(content).success).toBe(true);
    expect(JSON.stringify(content)).not.toContain(id(1));
  });
  it("later article edits make the website show unpublished changes", () => {
    const base = withConfig([id(1)]);
    const a = stableStringify(buildPublishedContent(source([art(1)]), base));
    const b = stableStringify(
      buildPublishedContent(source([art(1, { version: 3 })]), base),
    );
    expect(a).not.toBe(b);
  });
});

describe("public listing comes from the live snapshot rows", () => {
  const content = buildPublishedContent(
    source([art(1), art(2)]),
    withConfig([id(1), id(2)]),
  );
  const row = (slug: string) => ({
    slug,
    title: slug,
    subtitle: null,
    excerpt: "e",
    coverImageUrl: null,
    category: null,
    readingMinutes: 1,
    publishedAt: new Date("2026-03-01T00:00:00Z"),
  });
  it("lists only rows that are still live, scoped to the website slug", () => {
    const out = applyLiveArticles(content, "jane", [row("article-2")]);
    const s = out.sections.find((x) => x.id === "articles");
    expect(s && "items" in s && s.items.map((i) => [i.slug, i.href])).toEqual([
      ["article-2", "/jane/articles/article-2"],
    ]);
  });
  it("removes the section when no article is live", () => {
    expect(
      applyLiveArticles(content, "jane", []).sections.some(
        (x) => x.id === "articles",
      ),
    ).toBe(false);
  });
  it("leaves other sections untouched", () => {
    const withAbout = {
      ...content,
      sections: [
        { id: "about" as const, heading: "About", paragraphs: ["x"] },
        ...content.sections,
      ],
    };
    expect(
      applyLiveArticles(withAbout, "jane", []).sections.map((s) => s.id),
    ).toEqual(["about"]);
  });
});
