import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  ArticleConflictError,
  ArticleNotFoundError,
  deleteArticle,
  findArticle,
  findLiveArticle,
  findLiveArticles,
  insertArticle,
  listArticles,
  listPublishedArticles,
  updateArticleContent,
  updateArticleStatus,
} from "@/lib/db/queries/articles";
import {
  changeSlug,
  createSite,
  findLiveBySlug,
  publish,
  unpublish,
} from "@/lib/db/queries/website";
import { defaultConfig } from "@/domains/website/config";
import {
  articleInputSchema,
  deriveBodyFacts,
} from "@/domains/articles/article-schema";
import { sanitizeDoc } from "@/domains/articles/rich-text";
import { folioneDbOptions, type FolioneClient } from "../../src/lib/db/schema";

/**
 * LOCAL Supabase only (run by `pnpm validate`): articles, ownership, optimistic concurrency, and the
 * published article snapshot - RLS, the invalidation trigger, and the three replaced website
 * functions - against real Postgres + PostgREST, using the app's own query modules.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ready = Boolean(
  url &&
    anon &&
    process.env.FOLIOONE_RLS_USER_A_EMAIL &&
    process.env.FOLIOONE_RLS_USER_A_PASSWORD &&
    process.env.FOLIOONE_RLS_USER_B_EMAIL &&
    process.env.FOLIOONE_RLS_USER_B_PASSWORD,
);

const options = {
  db: folioneDbOptions,
  auth: { persistSession: false, autoRefreshToken: false },
};
const tag = Date.now().toString(36);
const body = (t: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: t }] }],
});

async function session(email: string, password: string) {
  const client: FolioneClient = createClient(url!, anon!, options);
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) throw new Error("sign-in failed");
  const { error: anchorError } = await client
    .from("accounts")
    .insert({ id: data.user.id });
  if (anchorError && anchorError.code !== "23505")
    throw new Error("anchor failed");
  return { client, id: data.user.id };
}

async function create(
  s: Awaited<ReturnType<typeof session>>,
  title: string,
  text: string,
) {
  const draft = await insertArticle(s.client, s.id, {
    title: "",
    content: sanitizeDoc(null),
  });
  const input = articleInputSchema.parse({
    title,
    content: body(text),
    tags: ["x"],
  });
  return updateArticleContent(
    s.client,
    s.id,
    draft.id,
    draft.version,
    input,
    deriveBodyFacts(input.content),
  );
}
async function publishArticle(
  s: Awaited<ReturnType<typeof session>>,
  a: { id: string; version: number },
  slug: string,
) {
  return updateArticleStatus(s.client, s.id, a.id, a.version, {
    status: "published",
    slug,
    publishedAt: new Date(),
  });
}
const site = (s: Awaited<ReturnType<typeof session>>, articleIds: string[]) =>
  publish(s.client, {
    theme: "professional",
    title: "Site",
    description: null,
    content: { version: 1, person: { name: "N" }, sections: [] },
    articleIds,
  });

describe.skipIf(!ready)(
  "articles + published snapshot (local Postgres)",
  () => {
    it("owner CRUD, optimistic concurrency and account isolation", async () => {
      const a = await session(
        process.env.FOLIOONE_RLS_USER_A_EMAIL!,
        process.env.FOLIOONE_RLS_USER_A_PASSWORD!,
      );
      const b = await session(
        process.env.FOLIOONE_RLS_USER_B_EMAIL!,
        process.env.FOLIOONE_RLS_USER_B_PASSWORD!,
      );

      const art = await create(a, `Mine ${tag}`, "alpha beta gamma");
      expect(art.version).toBe(2);
      expect(art.status).toBe("draft");
      expect(art.wordCount).toBe(3);
      expect(art.content).toEqual(body("alpha beta gamma"));
      expect(art.tags).toEqual(["x"]);

      // Stale version -> conflict, and nothing is overwritten.
      const input = articleInputSchema.parse({
        title: "Overwrite",
        content: body("zzz"),
      });
      await expect(
        updateArticleContent(
          a.client,
          a.id,
          art.id,
          1,
          input,
          deriveBodyFacts(input.content),
        ),
      ).rejects.toBeInstanceOf(ArticleConflictError);
      expect((await findArticle(a.client, a.id, art.id))!.title).toBe(
        `Mine ${tag}`,
      );

      // Another account sees and changes nothing.
      expect(await findArticle(b.client, b.id, art.id)).toBeNull();
      expect(
        (await b.client.from("articles").select("id").eq("id", art.id)).data,
      ).toEqual([]);
      await expect(
        updateArticleContent(
          b.client,
          b.id,
          art.id,
          art.version,
          input,
          deriveBodyFacts(input.content),
        ),
      ).rejects.toBeInstanceOf(ArticleNotFoundError);
      await expect(
        deleteArticle(b.client, b.id, art.id, art.version),
      ).rejects.toBeInstanceOf(ArticleNotFoundError);
      // Even naming A's account id, B's writes are refused by RLS.
      const forged = await b.client
        .from("articles")
        .insert({ account_id: a.id, title: "forged" });
      expect(forged.error).not.toBeNull();

      // Search and filters.
      const found = await listArticles(a.client, a.id, {
        filter: "all",
        sort: "updated",
        search: "beta",
        page: 1,
        pageSize: 10,
      });
      expect(found.items.map((i) => i.id)).toContain(art.id);
      const none = await listArticles(a.client, a.id, {
        filter: "published",
        sort: "title",
        search: "",
        page: 1,
        pageSize: 10,
      });
      expect(none.items.map((i) => i.id)).not.toContain(art.id);
      const wildcard = await listArticles(a.client, a.id, {
        filter: "all",
        sort: "updated",
        search: "100%_,)",
        page: 1,
        pageSize: 10,
      });
      expect(wildcard.items).toEqual([]);

      // The database refuses to publish without an address.
      const noSlug = await a.client
        .from("articles")
        .update({ status: "published", published_at: new Date().toISOString() })
        .eq("id", art.id);
      expect(noSlug.error?.code).toBe("23514");

      await deleteArticle(a.client, a.id, art.id, art.version);
      expect(await findArticle(a.client, a.id, art.id)).toBeNull();
    });

    it("publishes only explicitly selected, published articles, and revokes them immediately", async () => {
      const a = await session(
        process.env.FOLIOONE_RLS_USER_A_EMAIL!,
        process.env.FOLIOONE_RLS_USER_A_PASSWORD!,
      );
      const b = await session(
        process.env.FOLIOONE_RLS_USER_B_EMAIL!,
        process.env.FOLIOONE_RLS_USER_B_PASSWORD!,
      );
      const publicClient: FolioneClient = createClient(url!, anon!, options);
      const siteSlug = `art-${tag}-a`;
      const siteSlugB = `art-${tag}-b`;

      await createSite(a.client, a.id, siteSlug, defaultConfig());
      await createSite(b.client, b.id, siteSlugB, defaultConfig());

      const first = await publishArticle(
        a,
        await create(a, `First ${tag}`, "first body"),
        `first-${tag}`,
      );
      const second = await publishArticle(
        a,
        await create(a, `Second ${tag}`, "second body"),
        `second-${tag}`,
      );
      const unselected = await publishArticle(
        a,
        await create(a, `Unselected ${tag}`, "x"),
        `unselected-${tag}`,
      );
      const draft = await create(a, `Draft ${tag}`, "draft body");
      const bOwn = await publishArticle(
        b,
        await create(b, `Bs ${tag}`, "b body"),
        `bs-${tag}`,
      );
      expect(
        (await listPublishedArticles(a.client, a.id)).map((x) => x.id),
      ).toContain(unselected.id);

      // Before publishing the website: nothing is public.
      expect(await findLiveArticles(publicClient, siteSlug)).toEqual([]);

      // Selection order is honoured; a draft, B's article and a duplicate are never copied.
      await site(a, [second.id, first.id, draft.id, bOwn.id, second.id]);
      const live = await findLiveArticles(publicClient, siteSlug);
      expect(live.map((x) => x.slug)).toEqual([
        `second-${tag}`,
        `first-${tag}`,
      ]);
      expect(live.map((x) => x.position)).toEqual([0, 1]);
      const detail = await findLiveArticle(
        publicClient,
        siteSlug,
        `first-${tag}`,
      );
      expect(detail?.content).toEqual(body("first body"));
      expect(
        await findLiveArticle(publicClient, siteSlug, `unselected-${tag}`),
      ).toBeNull();
      expect(
        await findLiveArticle(publicClient, siteSlug, `bs-${tag}`),
      ).toBeNull();
      expect(
        await findLiveArticle(publicClient, siteSlugB, `first-${tag}`),
      ).toBeNull();

      // Anonymous visitors cannot read owner columns or other tables.
      for (const column of ["account_id", "article_id"]) {
        const r = await publicClient
          .from("website_published_articles")
          .select(column);
        expect(r.error, column).not.toBeNull();
      }
      expect(
        (await publicClient.from("articles").select("id")).error,
      ).not.toBeNull();
      expect(
        (
          await publicClient
            .from("website_published_articles")
            .insert({ site_slug: siteSlug })
        ).error,
      ).not.toBeNull();

      // Editing the canonical article does not change the snapshot until republish.
      const fresh = (await findArticle(a.client, a.id, first.id))!;
      const edit = articleInputSchema.parse({
        title: `First v2 ${tag}`,
        content: body("changed"),
      });
      await updateArticleContent(
        a.client,
        a.id,
        first.id,
        fresh.version,
        edit,
        deriveBodyFacts(edit.content),
      );
      expect(
        (await findLiveArticle(publicClient, siteSlug, `first-${tag}`))?.title,
      ).toBe(`First ${tag}`);
      await site(a, [second.id, first.id]);
      expect(
        (await findLiveArticle(publicClient, siteSlug, `first-${tag}`))?.title,
      ).toBe(`First v2 ${tag}`);

      // Unpublishing an article removes it at once (no republish needed).
      const s2 = (await findArticle(a.client, a.id, second.id))!;
      await updateArticleStatus(a.client, a.id, s2.id, s2.version, {
        status: "draft",
      });
      expect(
        (await findLiveArticles(publicClient, siteSlug)).map((x) => x.slug),
      ).toEqual([`first-${tag}`]);
      // Republishing the website does not resurrect it (it is a draft now).
      await site(a, [second.id, first.id]);
      expect(
        (await findLiveArticles(publicClient, siteSlug)).map((x) => x.slug),
      ).toEqual([`first-${tag}`]);

      // Archiving removes it at once; restoring does not bring it back by itself.
      const f1 = (await findArticle(a.client, a.id, first.id))!;
      const archived = await updateArticleStatus(
        a.client,
        a.id,
        f1.id,
        f1.version,
        { status: "archived" },
      );
      expect(await findLiveArticles(publicClient, siteSlug)).toEqual([]);
      await updateArticleStatus(a.client, a.id, f1.id, archived.version, {
        status: "draft",
      });
      expect(await findLiveArticles(publicClient, siteSlug)).toEqual([]);

      // Deleting removes the snapshot with it.
      const u = (await findArticle(a.client, a.id, unselected.id))!;
      await site(a, [u.id]);
      expect(
        (await findLiveArticles(publicClient, siteSlug)).map((x) => x.slug),
      ).toEqual([`unselected-${tag}`]);
      await deleteArticle(a.client, a.id, u.id, u.version);
      expect(await findLiveArticles(publicClient, siteSlug)).toEqual([]);

      // Changing the site address re-addresses the articles; the old address stops resolving.
      const kept = await publishArticle(
        a,
        await create(a, `Kept ${tag}`, "kept"),
        `kept-${tag}`,
      );
      await site(a, [kept.id]);
      const moved = `art-${tag}-moved`;
      await changeSlug(a.client, a.id, moved);
      expect(await findLiveArticles(publicClient, siteSlug)).toEqual([]);
      expect(
        (await findLiveArticles(publicClient, moved)).map((x) => x.slug),
      ).toEqual([`kept-${tag}`]);
      expect((await findLiveBySlug(publicClient, moved))?.slug).toBe(moved);

      // Unpublishing the website withdraws every article and the site itself.
      await unpublish(a.client);
      expect(await findLiveArticles(publicClient, moved)).toEqual([]);
      expect(
        await findLiveArticle(publicClient, moved, `kept-${tag}`),
      ).toBeNull();
      expect(await findLiveBySlug(publicClient, moved)).toBeNull();
      const leftovers = await a.client
        .from("website_published_articles")
        .select("article_id");
      expect(leftovers.data).toEqual([]);

      // B's own site is unaffected by A's operations.
      await site(b, [bOwn.id]);
      expect(
        (await findLiveArticles(publicClient, siteSlugB)).map((x) => x.slug),
      ).toEqual([`bs-${tag}`]);
      await unpublish(b.client);
    });

    it("snapshot writes are request-gated: direct PostgREST writes are rejected, the RPCs still work", async () => {
      const a = await session(
        process.env.FOLIOONE_RLS_USER_A_EMAIL!,
        process.env.FOLIOONE_RLS_USER_A_PASSWORD!,
      );
      const b = await session(
        process.env.FOLIOONE_RLS_USER_B_EMAIL!,
        process.env.FOLIOONE_RLS_USER_B_PASSWORD!,
      );
      const publicClient: FolioneClient = createClient(url!, anon!, options);
      const t = `${tag}g`;
      const mine = await publishArticle(
        a,
        await create(a, `Gate A ${t}`, "gate a"),
        `gate-a-${t}`,
      );
      const theirs = await publishArticle(
        b,
        await create(b, `Gate B ${t}`, "gate b"),
        `gate-b-${t}`,
      );
      await site(a, [mine.id]);
      await site(b, [theirs.id]);
      const aSite = (
        await a.client
          .from("website_sites")
          .select("slug")
          .eq("account_id", a.id)
          .single()
      ).data!.slug as string;
      const bSite = (
        await b.client
          .from("website_sites")
          .select("slug")
          .eq("account_id", b.id)
          .single()
      ).data!.slug as string;
      expect(
        (await findLiveArticles(publicClient, aSite)).map((x) => x.slug),
      ).toEqual([`gate-a-${t}`]);

      const rows = async (c: FolioneClient) =>
        ((
          await c
            .from("website_published_articles")
            .select("article_id,site_slug,title")
        ).data ?? []) as {
          article_id: string;
          site_slug: string;
          title: string;
        }[];
      const before = await rows(a.client);
      expect(before.map((r) => r.article_id)).toEqual([mine.id]);

      const valid = (
        siteSlug: string,
        articleId: string,
        accountId: string,
      ) => ({
        article_id: articleId,
        account_id: accountId,
        site_slug: siteSlug,
        slug: `forged-${t}`,
        title: "Forged",
        content: { type: "doc", content: [] },
        position: 5,
        published_at: new Date().toISOString(),
      });

      // --- anonymous: every write is refused ------------------------------------------------------
      const anonInsert = await publicClient
        .from("website_published_articles")
        .insert(valid(aSite, mine.id, a.id));
      expect(anonInsert.error).not.toBeNull();
      const anonDelete = await publicClient
        .from("website_published_articles")
        .delete()
        .eq("site_slug", aSite)
        .select("slug");
      expect(
        anonDelete.error !== null || (anonDelete.data ?? []).length === 0,
      ).toBe(true);
      const anonUpdate = await publicClient
        .from("website_published_articles")
        .update({ site_slug: "hijacked" })
        .eq("site_slug", aSite)
        .select("slug");
      expect(
        anonUpdate.error !== null || (anonUpdate.data ?? []).length === 0,
      ).toBe(true);

      // --- the owner, directly (not through an RPC): rejected --------------------------------------
      await a.client
        .from("website_published_articles")
        .delete()
        .eq("article_id", mine.id);
      // (a rejected DELETE is filtered out by RLS: no error, no rows)
      const ownerDelete = await a.client
        .from("website_published_articles")
        .delete()
        .eq("article_id", mine.id)
        .select("article_id");
      expect(
        ownerDelete.error !== null || (ownerDelete.data ?? []).length === 0,
        "direct owner DELETE",
      ).toBe(true);
      const ownerInsert = await a.client
        .from("website_published_articles")
        .insert({
          ...valid(aSite, mine.id, a.id),
          article_id: (await create(a, `Extra ${t}`, "x")).id,
        });
      expect(ownerInsert.error, "direct owner INSERT").not.toBeNull();
      // Even for an article that exists, is published and is the owner's own.
      const another = await publishArticle(
        a,
        await create(a, `Another ${t}`, "another"),
        `another-${t}`,
      );
      const ownerInsert2 = await a.client
        .from("website_published_articles")
        .insert(valid(aSite, another.id, a.id));
      expect(
        ownerInsert2.error,
        "direct owner INSERT of an eligible article",
      ).not.toBeNull();
      const ownerSlug = await a.client
        .from("website_published_articles")
        .update({ site_slug: `moved-${t}` })
        .eq("article_id", mine.id)
        .select("article_id");
      expect(
        ownerSlug.error !== null || (ownerSlug.data ?? []).length === 0,
        "direct owner site_slug UPDATE",
      ).toBe(true);
      const ownerOther = await a.client
        .from("website_published_articles")
        .update({ title: "tampered" })
        .eq("article_id", mine.id);
      expect(
        ownerOther.error,
        "no column grant other than site_slug",
      ).not.toBeNull();
      expect(await rows(a.client)).toEqual(before);
      expect(
        (await findLiveArticles(publicClient, aSite)).map((x) => x.slug),
      ).toEqual([`gate-a-${t}`]);

      // --- one account cannot expose content under another account's slug ----------------------------
      const crossInsert = await b.client
        .from("website_published_articles")
        .insert(valid(aSite, theirs.id, b.id));
      expect(
        crossInsert.error,
        "B inserting under A's site slug",
      ).not.toBeNull();
      const asOwner = await b.client
        .from("website_published_articles")
        .insert(valid(aSite, theirs.id, a.id));
      expect(asOwner.error, "B inserting as account A").not.toBeNull();
      const crossUpdate = await b.client
        .from("website_published_articles")
        .update({ site_slug: aSite })
        .eq("article_id", theirs.id)
        .select("article_id");
      expect(
        crossUpdate.error !== null || (crossUpdate.data ?? []).length === 0,
      ).toBe(true);
      // Through the RPC, B's snapshot always carries B's own address, and A's article id is ignored.
      await site(b, [theirs.id, mine.id]);
      const bRows = await rows(b.client);
      expect(bRows.map((r) => [r.article_id, r.site_slug])).toEqual([
        [theirs.id, bSite],
      ]);
      expect(
        (await findLiveArticles(publicClient, aSite)).map((x) => x.slug),
      ).toEqual([`gate-a-${t}`]);
      expect(
        (await findLiveArticles(publicClient, bSite)).map((x) => x.slug),
      ).toEqual([`gate-b-${t}`]);

      // --- the gate helpers themselves answer false outside their own RPC request -------------------
      for (const fn of [
        "website_snapshot_insert_context",
        "website_snapshot_delete_context",
        "website_snapshot_update_context",
      ]) {
        const r = await a.client.rpc(fn);
        expect(r.error, fn).toBeNull();
        expect(r.data, fn).toBe(false);
        expect((await publicClient.rpc(fn)).error, `anon ${fn}`).not.toBeNull();
      }

      // --- the RPCs still work ----------------------------------------------------------------------
      await site(a, [mine.id, another.id]);
      expect(
        (await findLiveArticles(publicClient, aSite)).map((x) => x.slug),
      ).toEqual([`gate-a-${t}`, `another-${t}`]);
      const newSlug = `gate-moved-${t}`;
      await changeSlug(a.client, a.id, newSlug);
      expect(await findLiveArticles(publicClient, aSite)).toEqual([]);
      expect(
        (await findLiveArticles(publicClient, newSlug)).map((x) => x.slug),
      ).toEqual([`gate-a-${t}`, `another-${t}`]);
      // Trigger: published -> draft and published -> archived remove the row at once (gate allows the trigger).
      const m = (await findArticle(a.client, a.id, mine.id))!;
      await updateArticleStatus(a.client, a.id, m.id, m.version, {
        status: "draft",
      });
      expect(
        (await findLiveArticles(publicClient, newSlug)).map((x) => x.slug),
      ).toEqual([`another-${t}`]);
      const o = (await findArticle(a.client, a.id, another.id))!;
      await updateArticleStatus(a.client, a.id, o.id, o.version, {
        status: "archived",
      });
      expect(await findLiveArticles(publicClient, newSlug)).toEqual([]);
      // Unpublish removes everything.
      await site(a, []);
      await publishArticle(
        a,
        (await findArticle(a.client, a.id, m.id))!,
        `gate-a-${t}`,
      ).catch(() => undefined);
      const again = (await findArticle(a.client, a.id, m.id))!;
      const republished =
        again.status === "published"
          ? again
          : await updateArticleStatus(a.client, a.id, m.id, again.version, {
              status: "published",
              publishedAt: new Date(),
            });
      await site(a, [republished.id]);
      expect((await findLiveArticles(publicClient, newSlug)).length).toBe(1);
      await unpublish(a.client);
      expect(await findLiveArticles(publicClient, newSlug)).toEqual([]);
      expect(await rows(a.client)).toEqual([]);
      await unpublish(b.client);
    });
  },
);
