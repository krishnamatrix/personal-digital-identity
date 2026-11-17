import "server-only";
import type { FolioneClient } from "@/lib/db/schema";

/**
 * Insights (M11): anonymous events on live websites / cards, read back by their owner.
 * See docs/sql/milestone-11/002-insights.sql for the RLS that makes this safe.
 */
type QueryClient = FolioneClient;

export type InsightSurface = "website" | "card";

export class InsightsPersistenceError extends Error {
  readonly code?: string;
  constructor(code?: string) {
    super("We could not load your insights. Please try again.");
    this.name = "InsightsPersistenceError";
    this.code = code;
  }
}

/** One row as written by a visitor (anon). id and occurred_at are server-set. */
export type InsightEventRow = {
  website_id?: string | null;
  card_id?: string | null;
  event: string;
  path?: string | null;
  target_kind?: string | null;
  target_label?: string | null;
  target_url?: string | null;
  referrer_host?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  country?: string | null;
  time_zone?: string | null;
  language?: string | null;
  device?: string | null;
  browser?: string | null;
  os?: string | null;
  visitor_hash?: string | null;
};

/** Anonymous client only. Returns false when the database refused (e.g. the page went offline). */
export async function insertInsightEvent(
  client: QueryClient,
  row: InsightEventRow,
): Promise<boolean> {
  const { error } = await client.from("insight_events").insert(row);
  return !error;
}

/**
 * The public id of a LIVE page, or null. Read separately from the snapshot so that the public
 * page keeps rendering if the M11 SQL has not been applied yet (the column is then missing).
 */
export async function findLivePublicId(
  client: QueryClient,
  surface: InsightSurface,
  slug: string,
): Promise<string | null> {
  const table =
    surface === "website" ? "website_published" : "digital_card_published";
  const { data, error } = await client
    .from(table)
    .select("public_id")
    .eq("slug", slug)
    .eq("is_live", true)
    .maybeSingle();
  if (error || !data) return null;
  const id = (data as { public_id?: unknown }).public_id;
  return typeof id === "string" ? id : null;
}

/** The signed-in owner's own page ids (RLS: own rows only). */
export async function findOwnPublicIds(
  client: QueryClient,
  accountId: string,
): Promise<{
  websiteId: string | null;
  cardId: string | null;
  websiteSlug: string | null;
  cardSlug: string | null;
}> {
  const [site, card] = await Promise.all([
    client
      .from("website_published")
      .select("public_id,slug")
      .eq("account_id", accountId)
      .maybeSingle(),
    client
      .from("digital_card_published")
      .select("public_id,slug")
      .eq("account_id", accountId)
      .maybeSingle(),
  ]);
  if (site.error && site.error.code !== "PGRST116")
    throw new InsightsPersistenceError(site.error.code);
  if (card.error && card.error.code !== "PGRST116")
    throw new InsightsPersistenceError(card.error.code);
  const pick = (d: unknown, key: "public_id" | "slug") => {
    const v = (d as Record<string, unknown> | null)?.[key];
    return typeof v === "string" ? v : null;
  };
  return {
    websiteId: pick(site.data, "public_id"),
    cardId: pick(card.data, "public_id"),
    websiteSlug: pick(site.data, "slug"),
    cardSlug: pick(card.data, "slug"),
  };
}

const EVENT_COLUMNS =
  "website_id,card_id,event,path,target_kind,target_label,target_url,referrer_host,utm_source,utm_medium,utm_campaign,country,time_zone,language,device,browser,os,visitor_hash,occurred_at";

export type StoredInsightEvent = InsightEventRow & { occurred_at: string };

/** Owner read (RLS: own pages only), newest first, capped. */
export async function listInsightEvents(
  client: QueryClient,
  ids: { websiteId: string | null; cardId: string | null },
  since: Date,
  limit = 20_000,
): Promise<StoredInsightEvent[]> {
  const filters = [
    ids.websiteId ? `website_id.eq.${ids.websiteId}` : null,
    ids.cardId ? `card_id.eq.${ids.cardId}` : null,
  ].filter(Boolean);
  if (filters.length === 0) return [];
  const { data, error } = await client
    .from("insight_events")
    .select(EVENT_COLUMNS)
    .or(filters.join(","))
    .gte("occurred_at", since.toISOString())
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw new InsightsPersistenceError(error.code);
  return (data ?? []) as unknown as StoredInsightEvent[];
}
