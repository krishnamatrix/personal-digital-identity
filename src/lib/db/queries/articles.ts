import "server-only";
import type { FolioneClient } from "@/lib/db/schema";
import { AuthorizationError } from "@/lib/supabase/server";
import {
  type ArticleInput,
  type ArticleRecord,
  type ArticleStatus,
  type ArticleSummary,
  type ListFilter,
  type ListSort,
} from "@/domains/articles/article-schema";
import { sanitizeDoc, type RichDoc } from "@/domains/articles/rich-text";

export class ArticleNotFoundError extends Error {
  constructor() {
    super("That article could not be found.");
    this.name = "ArticleNotFoundError";
  }
}
export class ArticleConflictError extends Error {
  constructor() {
    super(
      "This article was changed in another session. Reload to see the latest version.",
    );
    this.name = "ArticleConflictError";
  }
}
export class ArticleSlugTakenError extends Error {
  constructor() {
    super("That article address is already used.");
    this.name = "ArticleSlugTakenError";
  }
}
export class ArticlePersistenceError extends Error {
  /** PostgREST / Postgres error code, kept for logs only (never shown to users). */
  readonly code?: string;
  constructor(code?: string) {
    super("We could not save or load your articles. Please try again.");
    this.name = "ArticlePersistenceError";
    this.code = code;
  }
}

function mapError(error: { code?: string; message?: string }): Error {
  if (error.code === "23505") return new ArticleSlugTakenError();
  if (error.code === "42501" || error.code === "PGRST301")
    return new AuthorizationError();
  return new ArticlePersistenceError(error.code);
}

/* Column lists: explicit, never a wildcard. */
const SUMMARY_COLUMNS =
  "id,slug,title,subtitle,excerpt,cover_image_url,category,status,version,word_count,reading_minutes,published_at,updated_at";
const FULL_COLUMNS = `${SUMMARY_COLUMNS},tags,content,seo_title,seo_description,archived_at,created_at`;

type Row = Record<string, unknown>;
const date = (v: unknown) => (v ? new Date(String(v)) : null);
const text = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);

function summaryOf(row: Row): ArticleSummary {
  return {
    id: String(row.id),
    slug: text(row.slug),
    title: String(row.title ?? ""),
    subtitle: text(row.subtitle),
    excerpt: text(row.excerpt),
    coverImageUrl: text(row.cover_image_url),
    category: text(row.category),
    status: row.status as ArticleStatus,
    version: Number(row.version),
    wordCount: Number(row.word_count),
    readingMinutes: Number(row.reading_minutes),
    publishedAt: date(row.published_at),
    updatedAt: new Date(String(row.updated_at)),
  };
}

function recordOf(row: Row): ArticleRecord {
  return {
    ...summaryOf(row),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    content: sanitizeDoc(row.content),
    seoTitle: text(row.seo_title),
    seoDescription: text(row.seo_description),
    archivedAt: date(row.archived_at),
    createdAt: new Date(String(row.created_at)),
  };
}

export type ListParams = {
  filter: ListFilter;
  sort: ListSort;
  search: string;
  page: number;
  pageSize: number;
};

/** Escapes LIKE wildcards and the characters PostgREST treats as filter syntax. */
export function searchPattern(search: string): string {
  const cleaned = search
    .trim()
    .slice(0, 80)
    .replace(/[\\%_]/g, (c) => `\\${c}`)
    .replace(/[,()"*]/g, " ");
  return `%${cleaned}%`;
}

export async function listArticles(
  client: FolioneClient,
  userId: string,
  p: ListParams,
): Promise<{ items: ArticleSummary[]; total: number }> {
  let query = client
    .from("articles")
    .select(SUMMARY_COLUMNS, { count: "exact" })
    .eq("account_id", userId);
  if (p.filter !== "all") query = query.eq("status", p.filter);
  if (p.search.trim() !== "") {
    const pattern = searchPattern(p.search);
    query = query.or(`title.ilike.${pattern},body_text.ilike.${pattern}`);
  }
  query =
    p.sort === "title"
      ? query.order("title", { ascending: true })
      : p.sort === "published"
        ? query.order("published_at", { ascending: false, nullsFirst: false })
        : query.order("updated_at", { ascending: false });
  const from = (p.page - 1) * p.pageSize;
  const { data, error, count } = await query
    .order("id")
    .range(from, from + p.pageSize - 1);
  if (error) throw mapError(error);
  return { items: (data ?? []).map(summaryOf), total: count ?? 0 };
}

export async function countArticlesByStatus(
  client: FolioneClient,
  userId: string,
): Promise<Record<ArticleStatus, number>> {
  const out: Record<ArticleStatus, number> = {
    draft: 0,
    published: 0,
    archived: 0,
  };
  for (const status of Object.keys(out) as ArticleStatus[]) {
    const { count, error } = await client
      .from("articles")
      .select("id", { count: "exact", head: true })
      .eq("account_id", userId)
      .eq("status", status);
    if (error) throw mapError(error);
    out[status] = count ?? 0;
  }
  return out;
}

export async function findArticle(
  client: FolioneClient,
  userId: string,
  id: string,
): Promise<ArticleRecord | null> {
  const { data, error } = await client
    .from("articles")
    .select(FULL_COLUMNS)
    .eq("account_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw mapError(error);
  return data ? recordOf(data) : null;
}

export async function insertArticle(
  client: FolioneClient,
  userId: string,
  values: { title: string; content: RichDoc },
): Promise<ArticleRecord> {
  const { data, error } = await client
    .from("articles")
    .insert({
      account_id: userId,
      title: values.title,
      content: values.content,
    })
    .select(FULL_COLUMNS)
    .single();
  if (error) throw mapError(error);
  return recordOf(data);
}

export type BodyFacts = {
  bodyText: string;
  wordCount: number;
  readingMinutes: number;
};

/**
 * Optimistic concurrency: the update matches only the version the caller loaded and bumps it.
 * No row updated means another session got there first (or the article is gone).
 */
async function versioned(
  client: FolioneClient,
  userId: string,
  id: string,
  version: number,
  patch: Record<string, unknown>,
): Promise<ArticleRecord> {
  const { data, error } = await client
    .from("articles")
    .update({
      ...patch,
      version: version + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("account_id", userId)
    .eq("id", id)
    .eq("version", version)
    .select(FULL_COLUMNS);
  if (error) throw mapError(error);
  if (data?.length) return recordOf(data[0]!);
  const exists = await findArticle(client, userId, id);
  throw exists ? new ArticleConflictError() : new ArticleNotFoundError();
}

export function updateArticleContent(
  client: FolioneClient,
  userId: string,
  id: string,
  version: number,
  input: ArticleInput,
  facts: BodyFacts,
): Promise<ArticleRecord> {
  return versioned(client, userId, id, version, {
    title: input.title,
    subtitle: input.subtitle,
    excerpt: input.excerpt,
    cover_image_url: input.coverImageUrl,
    category: input.category,
    tags: input.tags,
    seo_title: input.seoTitle,
    seo_description: input.seoDescription,
    content: input.content,
    body_text: facts.bodyText,
    word_count: facts.wordCount,
    reading_minutes: facts.readingMinutes,
  });
}

export function updateArticleStatus(
  client: FolioneClient,
  userId: string,
  id: string,
  version: number,
  change: { status: ArticleStatus; slug?: string; publishedAt?: Date },
): Promise<ArticleRecord> {
  const patch: Record<string, unknown> = { status: change.status };
  if (change.slug !== undefined) patch.slug = change.slug;
  if (change.status === "published" && change.publishedAt)
    patch.published_at = change.publishedAt.toISOString();
  patch.archived_at =
    change.status === "archived" ? new Date().toISOString() : null;
  return versioned(client, userId, id, version, patch);
}

export async function deleteArticle(
  client: FolioneClient,
  userId: string,
  id: string,
  version: number,
): Promise<void> {
  const { data, error } = await client
    .from("articles")
    .delete()
    .eq("account_id", userId)
    .eq("id", id)
    .eq("version", version)
    .select("id");
  if (error) throw mapError(error);
  if (data?.length) return;
  const exists = await findArticle(client, userId, id);
  throw exists ? new ArticleConflictError() : new ArticleNotFoundError();
}

/** The owner's currently PUBLISHED articles (the only ones the website may select). */
export async function listPublishedArticles(
  client: FolioneClient,
  userId: string,
): Promise<ArticleSummary[]> {
  const { data, error } = await client
    .from("articles")
    .select(SUMMARY_COLUMNS)
    .eq("account_id", userId)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(200);
  if (error) throw mapError(error);
  return (data ?? []).map(summaryOf);
}

/* ------------------------------ public snapshot ------------------------------ */

/**
 * The ONLY columns an anonymous visitor may read from website_published_articles (they match the
 * column-level GRANT to anon in docs/sql/milestone-6/001-articles.sql). Never account_id or
 * article_id; never a wildcard.
 */
export const PUBLIC_ARTICLE_LIST_COLUMNS =
  "site_slug,slug,title,subtitle,excerpt,cover_image_url,category,tags,word_count,reading_minutes,position,published_at";
export const PUBLIC_ARTICLE_COLUMNS = `${PUBLIC_ARTICLE_LIST_COLUMNS},content,seo_title,seo_description,snapshot_at`;

export type PublicArticleListItem = {
  slug: string;
  title: string;
  subtitle: string | null;
  excerpt: string | null;
  coverImageUrl: string | null;
  category: string | null;
  tags: string[];
  wordCount: number;
  readingMinutes: number;
  position: number;
  publishedAt: Date;
};
export type PublicArticle = PublicArticleListItem & {
  siteSlug: string;
  content: RichDoc;
  seoTitle: string | null;
  seoDescription: string | null;
};

function publicListItem(row: Row): PublicArticleListItem {
  return {
    slug: String(row.slug),
    title: String(row.title),
    subtitle: text(row.subtitle),
    excerpt: text(row.excerpt),
    coverImageUrl: text(row.cover_image_url),
    category: text(row.category),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    wordCount: Number(row.word_count),
    readingMinutes: Number(row.reading_minutes),
    position: Number(row.position),
    publishedAt: new Date(String(row.published_at)),
  };
}

/** Public read with the ANONYMOUS client: snapshot rows of a live website only (RLS). */
export async function findLiveArticles(
  client: FolioneClient,
  siteSlug: string,
): Promise<PublicArticleListItem[]> {
  const { data, error } = await client
    .from("website_published_articles")
    .select(PUBLIC_ARTICLE_LIST_COLUMNS)
    .eq("site_slug", siteSlug)
    .order("position")
    .limit(50);
  if (error || !data) return [];
  return data.map(publicListItem);
}

export async function findLiveArticle(
  client: FolioneClient,
  siteSlug: string,
  articleSlug: string,
): Promise<PublicArticle | null> {
  const { data, error } = await client
    .from("website_published_articles")
    .select(PUBLIC_ARTICLE_COLUMNS)
    .eq("site_slug", siteSlug)
    .eq("slug", articleSlug)
    .maybeSingle();
  if (error || !data) return null;
  return {
    ...publicListItem(data),
    siteSlug: String(data.site_slug),
    content: sanitizeDoc(data.content),
    seoTitle: text(data.seo_title),
    seoDescription: text(data.seo_description),
  };
}
