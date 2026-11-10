import "server-only";
import { randomBytes } from "node:crypto";
import {
  ArticleSlugTakenError,
  deleteArticle,
  ensureAccount,
  findArticle,
  getAnonymousDb,
  getAuthenticatedDb,
  countArticlesByStatus,
  findLiveArticle,
  findLiveArticles,
  insertArticle,
  listArticles,
  updateArticleContent,
  updateArticleStatus,
  ArticleNotFoundError,
  type ListParams,
} from "@/lib/db/query";
import {
  articleInputSchema,
  deriveBodyFacts,
  LIST_FILTERS,
  LIST_SORTS,
  PAGE_SIZE,
  type ArticleRecord,
  type ArticleStatus,
} from "@/domains/articles/article-schema";
import {
  canTransition,
  InvalidTransitionError,
  PublishArticleBlockedError,
  publishProblems,
  slugFromTitle,
  withSuffix,
} from "@/domains/articles/lifecycle";
import { EMPTY_DOC } from "@/domains/articles/rich-text";

export { ArticleConflictError, ArticleNotFoundError } from "@/lib/db/query";
export { ArticlePersistenceError } from "@/lib/db/query";

/** Parses untrusted list parameters from the URL into safe values. */
export function parseListParams(raw: {
  q?: string | string[];
  status?: string | string[];
  sort?: string | string[];
  page?: string | string[];
}): ListParams {
  const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v) ?? "";
  const filter = LIST_FILTERS.find((f) => f === one(raw.status)) ?? "all";
  const sort = LIST_SORTS.find((s) => s === one(raw.sort)) ?? "updated";
  const page = Math.min(Math.max(parseInt(one(raw.page), 10) || 1, 1), 500);
  return {
    filter,
    sort,
    search: one(raw.q).slice(0, 80),
    page,
    pageSize: PAGE_SIZE,
  };
}

export async function getArticleList(params: ListParams) {
  const { client, user } = await getAuthenticatedDb();
  const [list, counts] = await Promise.all([
    listArticles(client, user.id, params),
    countArticlesByStatus(client, user.id),
  ]);
  return { ...list, counts };
}

export async function getArticle(id: string): Promise<ArticleRecord | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { client, user } = await getAuthenticatedDb();
  return findArticle(client, user.id, id);
}

export async function createArticle(): Promise<ArticleRecord> {
  const { client, user } = await getAuthenticatedDb();
  await ensureAccount(client, user.id);
  return insertArticle(client, user.id, { title: "", content: EMPTY_DOC });
}

/** Saves the editable fields. `version` is the version the editor loaded (optimistic concurrency). */
export async function saveArticle(
  id: string,
  version: number,
  input: unknown,
): Promise<ArticleRecord> {
  const parsed = articleInputSchema.parse(input);
  const { client, user } = await getAuthenticatedDb();
  return updateArticleContent(
    client,
    user.id,
    id,
    version,
    parsed,
    deriveBodyFacts(parsed.content),
  );
}

const random = () => randomBytes(3).toString("hex");

/**
 * Moves an article through Draft -> Published -> Archived. The transition is validated here
 * against the stored state; the database enforces the version and (via a trigger) removes the
 * article from the public snapshot the moment it stops being published.
 */
export async function transitionArticle(
  id: string,
  version: number,
  target: ArticleStatus,
): Promise<ArticleRecord> {
  const { client, user } = await getAuthenticatedDb();
  const current = await findArticle(client, user.id, id);
  if (!current) throw new ArticleNotFoundError();
  if (!canTransition(current.status, target))
    throw new InvalidTransitionError(current.status, target);

  if (target !== "published")
    return updateArticleStatus(client, user.id, id, version, {
      status: target,
    });

  const problems = publishProblems(current);
  if (problems.length) throw new PublishArticleBlockedError(problems);
  const publishedAt = new Date();
  if (current.slug)
    return updateArticleStatus(client, user.id, id, version, {
      status: "published",
      publishedAt,
    });

  // First publish: assign a stable address from the title (retry with a suffix on a clash).
  const base = slugFromTitle(current.title);
  for (let attempt = 0; attempt < 4; attempt++) {
    const slug = withSuffix(base, attempt, random());
    try {
      return await updateArticleStatus(client, user.id, id, version, {
        status: "published",
        slug,
        publishedAt,
      });
    } catch (error) {
      if (!(error instanceof ArticleSlugTakenError)) throw error;
    }
  }
  throw new ArticleSlugTakenError();
}

export async function removeArticle(id: string, version: number) {
  const { client, user } = await getAuthenticatedDb();
  await deleteArticle(client, user.id, id, version);
}

/* ------------------------------ public reads ------------------------------ */

export async function getPublicArticles(siteSlug: string) {
  return findLiveArticles(await getAnonymousDb(), siteSlug);
}

export async function getPublicArticle(siteSlug: string, articleSlug: string) {
  return findLiveArticle(await getAnonymousDb(), siteSlug, articleSlug);
}
