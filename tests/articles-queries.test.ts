import { describe, expect, it, vi } from "vitest";
import {
  ArticleConflictError,
  ArticleNotFoundError,
  findLiveArticle,
  findLiveArticles,
  listArticles,
  PUBLIC_ARTICLE_COLUMNS,
  PUBLIC_ARTICLE_LIST_COLUMNS,
  searchPattern,
  updateArticleContent,
} from "@/lib/db/queries/articles";
import type { FolioneClient } from "@/lib/db/schema";

type Call = [string, unknown[]];
/** A recording stand-in for the Supabase client (no network). Each `from()` consumes the next result. */
function recorder(results: unknown[]) {
  const calls: Call[] = [];
  const queue = [...results];
  const make = (): unknown => {
    const result = queue.shift();
    const chain: Record<string, unknown> = {};
    for (const m of [
      "select",
      "eq",
      "update",
      "delete",
      "or",
      "order",
      "range",
      "limit",
      "insert",
      "maybeSingle",
      "single",
    ]) {
      chain[m] = vi.fn((...args: unknown[]) => {
        calls.push([m, args]);
        return chain;
      });
    }
    chain.then = (resolve: (v: unknown) => unknown) => resolve(result);
    return chain;
  };
  const client = {
    from: vi.fn((table: string) => {
      calls.push(["from", [table]]);
      return make();
    }),
  } as unknown as FolioneClient;
  return { client, calls };
}
const row = {
  id: "i",
  slug: "s",
  title: "T",
  status: "draft",
  version: 2,
  word_count: 1,
  reading_minutes: 1,
  updated_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
  tags: [],
  content: { type: "doc", content: [] },
};

describe("article queries", () => {
  it("never select a wildcard, and list columns explicitly", async () => {
    const { client, calls } = recorder([
      { data: [row], error: null, count: 1 },
    ]);
    await listArticles(client, "u", {
      filter: "draft",
      sort: "title",
      search: "x",
      page: 2,
      pageSize: 10,
    });
    const select = calls.find(([m]) => m === "select")![1][0] as string;
    expect(select).not.toContain("*");
    expect(select).not.toContain("content");
    expect(select).not.toContain("body_text");
    expect(calls).toContainEqual(["eq", ["account_id", "u"]]);
    expect(calls).toContainEqual(["eq", ["status", "draft"]]);
    expect(calls).toContainEqual(["range", [10, 19]]);
  });

  it("escapes search input so it cannot alter the filter", () => {
    expect(searchPattern("50%_off")).toBe("%50\\%\\_off%");
    expect(searchPattern('a,b)c(d"e*')).toBe("%a b c d e %");
    expect(searchPattern("x".repeat(500)).length).toBeLessThanOrEqual(82);
  });

  it("an update matches the loaded version and bumps it; a stale version is a conflict", async () => {
    const input = {
      title: "T",
      subtitle: null,
      excerpt: null,
      coverImageUrl: null,
      category: null,
      tags: [],
      seoTitle: null,
      seoDescription: null,
      content: { type: "doc" as const, content: [] },
    };
    const facts = { bodyText: "", wordCount: 0, readingMinutes: 0 };
    const ok = recorder([{ data: [{ ...row, version: 4 }], error: null }]);
    const saved = await updateArticleContent(
      ok.client,
      "u",
      "i",
      3,
      input,
      facts,
    );
    expect(saved.version).toBe(4);
    expect(ok.calls).toContainEqual(["eq", ["version", 3]]);
    expect(ok.calls).toContainEqual(["eq", ["account_id", "u"]]);
    const update = ok.calls.find(([m]) => m === "update")![1][0] as Record<
      string,
      unknown
    >;
    expect(update.version).toBe(4);
    expect(update).not.toHaveProperty("account_id");

    const stale = recorder([
      { data: [], error: null },
      { data: row, error: null },
    ]);
    await expect(
      updateArticleContent(stale.client, "u", "i", 1, input, facts),
    ).rejects.toBeInstanceOf(ArticleConflictError);
    const gone = recorder([
      { data: [], error: null },
      { data: null, error: null },
    ]);
    await expect(
      updateArticleContent(gone.client, "u", "i", 1, input, facts),
    ).rejects.toBeInstanceOf(ArticleNotFoundError);
  });
});

describe("public article reads", () => {
  it("expose only the approved snapshot columns of website_published_articles", async () => {
    const allowed = [
      "site_slug",
      "slug",
      "title",
      "subtitle",
      "excerpt",
      "cover_image_url",
      "category",
      "tags",
      "content",
      "seo_title",
      "seo_description",
      "word_count",
      "reading_minutes",
      "position",
      "published_at",
      "snapshot_at",
    ];
    const cols = PUBLIC_ARTICLE_COLUMNS.split(",");
    expect(cols.every((c) => allowed.includes(c))).toBe(true);
    expect(PUBLIC_ARTICLE_COLUMNS + PUBLIC_ARTICLE_LIST_COLUMNS).not.toMatch(
      /account_id|article_id|\*/,
    );
    expect(PUBLIC_ARTICLE_LIST_COLUMNS).not.toContain("content");

    const list = recorder([{ data: [], error: null }]);
    await findLiveArticles(list.client, "jane");
    expect(list.calls.filter(([m]) => m === "from")).toEqual([
      ["from", ["website_published_articles"]],
    ]);
    expect(list.calls).toContainEqual(["eq", ["site_slug", "jane"]]);

    const one = recorder([{ data: null, error: null }]);
    expect(await findLiveArticle(one.client, "jane", "x")).toBeNull();
    expect(one.calls.find(([m]) => m === "select")![1]).toEqual([
      PUBLIC_ARTICLE_COLUMNS,
    ]);
  });
  it("a failed public read behaves as nothing published", async () => {
    const r = recorder([{ data: null, error: { code: "42501" } }]);
    expect(await findLiveArticles(r.client, "jane")).toEqual([]);
  });
});
