import "server-only";
import type { FolioneClient } from "@/lib/db/schema";
import { AuthorizationError } from "@/lib/supabase/server";
import { ProRequiredError } from "@/domains/billing/plans";
import { DesignUnavailableError } from "@/domains/designs/design-errors";
import {
  normalizeConfig,
  type ThemeId,
  type WebsiteConfig,
  type WebsiteStatus,
} from "@/domains/website/config";
import {
  publishedContentSchema,
  type PublishedContent,
} from "@/domains/website/published-content";

export class WebsiteSlugTakenError extends Error {
  constructor() {
    super("That address is already taken.");
    this.name = "WebsiteSlugTakenError";
  }
}
export class WebsitePersistenceError extends Error {
  /** PostgREST / Postgres error code, kept for logs only (never shown to users). */
  readonly code?: string;
  constructor(code?: string) {
    super("We could not save your website. Please try again.");
    this.name = "WebsitePersistenceError";
    this.code = code;
  }
}

function mapError(error: { code?: string }): Error {
  // PT402: the M9 trigger refused a PRO design for a Free account.
  if (error.code === "PT402") return new ProRequiredError();
  // PT422: the M14 trigger refused a design that is not (or no longer) available.
  if (error.code === "PT422") return new DesignUnavailableError();
  if (error.code === "23505") return new WebsiteSlugTakenError();
  if (error.code === "42501" || error.code === "PGRST301")
    return new AuthorizationError();
  return new WebsitePersistenceError(error.code);
}

export type SiteRow = {
  slug: string;
  status: Exclude<WebsiteStatus, "not_created">;
  theme: ThemeId;
  config: WebsiteConfig;
  publishedAt: Date | null;
  updatedAt: Date;
};

const SITE_COLUMNS = "slug,status,theme,config,published_at,updated_at";

function parseSite(row: Record<string, unknown>): SiteRow {
  return {
    slug: String(row.slug),
    status: row.status as SiteRow["status"],
    theme: row.theme as ThemeId,
    config: normalizeConfig(row.config),
    publishedAt: row.published_at ? new Date(String(row.published_at)) : null,
    updatedAt: new Date(String(row.updated_at)),
  };
}

export async function findSite(
  client: FolioneClient,
  userId: string,
): Promise<SiteRow | null> {
  const { data, error } = await client
    .from("website_sites")
    .select(SITE_COLUMNS)
    .eq("account_id", userId)
    .maybeSingle();
  if (error) throw mapError(error);
  return data ? parseSite(data) : null;
}

export async function createSite(
  client: FolioneClient,
  userId: string,
  slug: string,
  config: WebsiteConfig,
): Promise<SiteRow> {
  const { data, error } = await client
    .from("website_sites")
    .insert({ account_id: userId, slug, config })
    .select(SITE_COLUMNS)
    .single();
  if (error) throw mapError(error);
  return parseSite(data);
}

export async function saveDraft(
  client: FolioneClient,
  userId: string,
  theme: ThemeId,
  config: WebsiteConfig,
): Promise<void> {
  const { data, error } = await client
    .from("website_sites")
    .update({ theme, config, updated_at: new Date().toISOString() })
    .eq("account_id", userId)
    .select("account_id");
  if (error) throw mapError(error);
  if (!data?.length) throw new WebsitePersistenceError();
}

export async function changeSlug(
  client: FolioneClient,
  userId: string,
  slug: string,
): Promise<void> {
  const { error } = await client.rpc("website_change_slug", { p_slug: slug });
  void userId;
  if (error) throw mapError(error);
}

export async function publish(
  client: FolioneClient,
  args: {
    theme: ThemeId;
    title: string;
    description: string | null;
    content: PublishedContent;
    /** Ordered ids of the owner's published articles to snapshot (copied from `articles` by the RPC). */
    articleIds: string[];
  },
): Promise<Date> {
  const { data, error } = await client.rpc("website_publish", {
    p_article_ids: args.articleIds,
    p_theme: args.theme,
    p_title: args.title,
    p_description: args.description,
    p_content: args.content,
  });
  if (error) throw mapError(error);
  return new Date(String(data));
}

export async function unpublish(client: FolioneClient): Promise<void> {
  const { error } = await client.rpc("website_unpublish");
  if (error) throw mapError(error);
}

export type PublishedSnapshot = {
  slug: string;
  theme: ThemeId;
  title: string;
  description: string | null;
  content: PublishedContent;
  publishedAt: Date;
};

/**
 * The ONLY columns an anonymous visitor may read from website_published (they match the
 * column-level GRANT to anon in docs/sql/milestone-5/001-website.sql). Listed explicitly:
 * never a wildcard, and never account_id.
 */
export const PUBLIC_PUBLISHED_COLUMNS =
  "slug,theme,title,description,content,is_live,published_at,updated_at";
/** The owner's view of their own snapshot (also never account_id). */
const OWN_PUBLISHED_COLUMNS =
  "slug,theme,title,description,content,is_live,published_at";

/** The owner's own snapshot (to detect unpublished changes). Null if never published or unpublished. */
export async function findOwnSnapshot(
  client: FolioneClient,
  userId: string,
): Promise<PublishedSnapshot | null> {
  const { data, error } = await client
    .from("website_published")
    .select(OWN_PUBLISHED_COLUMNS)
    .eq("account_id", userId)
    .eq("is_live", true)
    .maybeSingle();
  if (error) throw mapError(error);
  return data ? parseSnapshot(data) : null;
}

/**
 * Public read, with an ANONYMOUS client: only live rows are visible (RLS) and only the
 * granted columns. The stored content is untrusted: it is validated again here.
 */
export async function findLiveBySlug(
  client: FolioneClient,
  slug: string,
): Promise<PublishedSnapshot | null> {
  const { data, error } = await client
    .from("website_published")
    .select(PUBLIC_PUBLISHED_COLUMNS)
    .eq("slug", slug)
    .eq("is_live", true)
    .maybeSingle();
  if (error || !data) return null;
  return parseSnapshot(data);
}

/** Is this slug the address of a live site? (Anonymous view: unpublished claims are not visible.) */
export async function isSlugLive(
  client: FolioneClient,
  slug: string,
): Promise<boolean> {
  const { data } = await client
    .from("website_published")
    .select("slug")
    .eq("slug", slug)
    .eq("is_live", true)
    .maybeSingle();
  return Boolean(data);
}

function parseSnapshot(row: Record<string, unknown>): PublishedSnapshot | null {
  const content = publishedContentSchema.safeParse(row.content);
  if (!content.success) return null;
  return {
    slug: String(row.slug),
    theme: row.theme as ThemeId,
    title: String(row.title),
    description: row.description ? String(row.description) : null,
    content: content.data,
    publishedAt: new Date(String(row.published_at)),
  };
}
