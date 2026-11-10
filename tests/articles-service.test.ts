import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ArticleRecord,
  ArticleStatus,
} from "@/domains/articles/article-schema";
import { sanitizeDoc } from "@/domains/articles/rich-text";

type Stored = ArticleRecord & { accountId: string };
const store = new Map<string, Stored>();
let currentUser = "user-a";
let counter = 0;
let slugClashes = 0;

vi.mock("@/lib/db/query", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/db/queries/articles")
  >("@/lib/db/queries/articles");
  const own = (userId: string, id: string) => {
    const a = store.get(id);
    return a && a.accountId === userId ? a : undefined;
  };
  const versioned = (
    userId: string,
    id: string,
    version: number,
    patch: Partial<Stored>,
  ) => {
    const a = own(userId, id);
    if (!a) throw new actual.ArticleNotFoundError();
    if (a.version !== version) throw new actual.ArticleConflictError();
    const next = {
      ...a,
      ...patch,
      version: version + 1,
      updatedAt: new Date(),
    };
    store.set(id, next);
    return next;
  };
  return {
    ...actual,
    getAuthenticatedDb: async () => ({ client: {}, user: { id: currentUser } }),
    getAnonymousDb: async () => ({}),
    ensureAccount: async () => undefined,
    insertArticle: async (
      _c: unknown,
      userId: string,
      v: { title: string; content: ArticleRecord["content"] },
    ) => {
      const now = new Date();
      const a: Stored = {
        accountId: userId,
        id: `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`,
        slug: null,
        title: v.title,
        subtitle: null,
        excerpt: null,
        coverImageUrl: null,
        category: null,
        tags: [],
        seoTitle: null,
        seoDescription: null,
        content: v.content,
        status: "draft",
        version: 1,
        wordCount: 0,
        readingMinutes: 0,
        publishedAt: null,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      store.set(a.id, a);
      return a;
    },
    findArticle: async (_c: unknown, userId: string, id: string) =>
      own(userId, id) ?? null,
    updateArticleContent: async (
      _c: unknown,
      userId: string,
      id: string,
      version: number,
      input: Partial<Stored>,
      facts: { wordCount: number; readingMinutes: number },
    ) =>
      versioned(userId, id, version, {
        ...input,
        wordCount: facts.wordCount,
        readingMinutes: facts.readingMinutes,
      }),
    updateArticleStatus: async (
      _c: unknown,
      userId: string,
      id: string,
      version: number,
      change: { status: ArticleStatus; slug?: string; publishedAt?: Date },
    ) => {
      if (change.slug && slugClashes > 0) {
        slugClashes--;
        throw new actual.ArticleSlugTakenError();
      }
      return versioned(userId, id, version, {
        status: change.status,
        ...(change.slug ? { slug: change.slug } : {}),
        ...(change.publishedAt ? { publishedAt: change.publishedAt } : {}),
      });
    },
    deleteArticle: async (
      _c: unknown,
      userId: string,
      id: string,
      version: number,
    ) => {
      versioned(userId, id, version, {});
      store.delete(id);
    },
  };
});

const svc = await import("@/domains/articles/article-service");
const { InvalidTransitionError, PublishArticleBlockedError } = await import(
  "@/domains/articles/lifecycle"
);
const { ArticleConflictError, ArticleNotFoundError, ArticleSlugTakenError } =
  await import("@/lib/db/queries/articles");

const doc = (t: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: t }] }],
});
const input = (title: string, text = "some words here") => ({
  title,
  content: doc(text),
});

beforeEach(() => {
  store.clear();
  currentUser = "user-a";
  slugClashes = 0;
});

describe("article service", () => {
  it("creates a draft, saves content with derived counts and bumps the version", async () => {
    const a = await svc.createArticle();
    expect(a).toMatchObject({ status: "draft", version: 1 });
    const saved = await svc.saveArticle(
      a.id,
      a.version,
      input("My title", "one two three four"),
    );
    expect(saved).toMatchObject({
      version: 2,
      title: "My title",
      wordCount: 4,
      readingMinutes: 1,
    });
    expect((await svc.getArticle(a.id))!.content).toEqual(
      sanitizeDoc(doc("one two three four")),
    );
  });

  it("rejects a stale save instead of overwriting newer work", async () => {
    const a = await svc.createArticle();
    await svc.saveArticle(a.id, 1, input("Session one"));
    await expect(
      svc.saveArticle(a.id, 1, input("Session two")),
    ).rejects.toBeInstanceOf(ArticleConflictError);
    expect((await svc.getArticle(a.id))!.title).toBe("Session one");
  });

  it("sanitises hostile content and rejects invalid fields", async () => {
    const a = await svc.createArticle();
    const saved = await svc.saveArticle(a.id, 1, {
      title: "T",
      content: {
        content: [
          { type: "script" },
          { type: "image", attrs: { src: "javascript:x" } },
        ],
      },
    });
    expect(saved.content.content).toEqual([]);
    await expect(
      svc.saveArticle(a.id, 2, {
        title: "T",
        coverImageUrl: "ftp://x",
        content: doc("x"),
      }),
    ).rejects.toThrow();
  });

  it("walks Draft -> Published -> Draft -> Archived -> Draft with the rules enforced", async () => {
    const a = await svc.createArticle();
    let v = (await svc.saveArticle(a.id, 1, input("Hello World"))).version;
    const published = await svc.transitionArticle(a.id, v, "published");
    expect(published).toMatchObject({
      status: "published",
      slug: "hello-world",
    });
    expect(published.publishedAt).toBeInstanceOf(Date);
    v = published.version;
    const back = await svc.transitionArticle(a.id, v, "draft");
    expect(back.status).toBe("draft");
    const again = await svc.transitionArticle(a.id, back.version, "published");
    expect(again.slug).toBe("hello-world"); // address is stable
    const archived = await svc.transitionArticle(
      a.id,
      again.version,
      "archived",
    );
    expect(archived.status).toBe("archived");
    await expect(
      svc.transitionArticle(a.id, archived.version, "published"),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
    const restored = await svc.transitionArticle(
      a.id,
      archived.version,
      "draft",
    );
    expect(restored.status).toBe("draft");
  });

  it("will not publish without a title or content", async () => {
    const a = await svc.createArticle();
    await expect(
      svc.transitionArticle(a.id, 1, "published"),
    ).rejects.toBeInstanceOf(PublishArticleBlockedError);
    const titled = await svc.saveArticle(a.id, 1, {
      title: "Only title",
      content: doc(""),
    });
    await expect(
      svc.transitionArticle(a.id, titled.version, "published"),
    ).rejects.toBeInstanceOf(PublishArticleBlockedError);
  });

  it("assigns a unique address when two articles share a title", async () => {
    const a = await svc.createArticle();
    const b = await svc.createArticle();
    const sa = await svc.saveArticle(a.id, 1, input("Same Title"));
    const sb = await svc.saveArticle(b.id, 1, input("Same Title"));
    await svc.transitionArticle(a.id, sa.version, "published");
    slugClashes = 1;
    const pb = await svc.transitionArticle(b.id, sb.version, "published");
    expect(pb.slug).toMatch(/^same-title-[0-9a-f]{6}$/);
    slugClashes = 99;
    const c = await svc.createArticle();
    const sc = await svc.saveArticle(c.id, 1, input("Same Title"));
    await expect(
      svc.transitionArticle(c.id, sc.version, "published"),
    ).rejects.toBeInstanceOf(ArticleSlugTakenError);
  });

  it("needs the current version to delete", async () => {
    const a = await svc.createArticle();
    await svc.saveArticle(a.id, 1, input("x"));
    await expect(svc.removeArticle(a.id, 1)).rejects.toBeInstanceOf(
      ArticleConflictError,
    );
    await svc.removeArticle(a.id, 2);
    expect(await svc.getArticle(a.id)).toBeNull();
    await expect(svc.removeArticle(a.id, 2)).rejects.toBeInstanceOf(
      ArticleNotFoundError,
    );
  });

  it("keeps accounts isolated: another user cannot read, save, transition or delete", async () => {
    const a = await svc.createArticle();
    currentUser = "user-b";
    expect(await svc.getArticle(a.id)).toBeNull();
    await expect(
      svc.saveArticle(a.id, 1, input("hijack")),
    ).rejects.toBeInstanceOf(ArticleNotFoundError);
    await expect(
      svc.transitionArticle(a.id, 1, "published"),
    ).rejects.toBeInstanceOf(ArticleNotFoundError);
    await expect(svc.removeArticle(a.id, 1)).rejects.toBeInstanceOf(
      ArticleNotFoundError,
    );
    expect((store.get(a.id) as Stored).title).toBe("");
  });

  it("rejects malformed ids without querying", async () => {
    expect(await svc.getArticle("not-an-id")).toBeNull();
    expect(await svc.getArticle("1' or '1'='1")).toBeNull();
  });
});

describe("list parameters", () => {
  it("falls back to safe defaults for hostile input", () => {
    expect(svc.parseListParams({})).toMatchObject({
      filter: "all",
      sort: "updated",
      search: "",
      page: 1,
      pageSize: 12,
    });
    expect(
      svc.parseListParams({ status: "x", sort: "y", page: "-5" }),
    ).toMatchObject({ filter: "all", sort: "updated", page: 1 });
    expect(
      svc.parseListParams({
        status: "draft",
        sort: "title",
        page: "3",
        q: "hi",
      }),
    ).toMatchObject({ filter: "draft", sort: "title", page: 3, search: "hi" });
    expect(svc.parseListParams({ page: "99999999" }).page).toBe(500);
    expect(svc.parseListParams({ q: "x".repeat(500) }).search).toHaveLength(80);
    expect(svc.parseListParams({ q: ["a", "b"] }).search).toBe("a");
  });
});
