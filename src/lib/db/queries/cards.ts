import "server-only";
import type { FolioneClient } from "@/lib/db/schema";
import { AuthorizationError } from "@/lib/supabase/server";
import { ProRequiredError } from "@/domains/billing/plans";
import {
  isCardDesignId,
  normalizeCardConfig,
  type CardConfig,
  type CardStatus,
  type CardType,
} from "@/domains/cards/card-config";
import type { CardDesignId } from "@/domains/cards/card-designs";
import {
  cardContentSchema,
  type CardContent,
} from "@/domains/cards/card-content";

export class CardSlugTakenError extends Error {
  constructor() {
    super("That address is already taken.");
    this.name = "CardSlugTakenError";
  }
}
export class CardPersistenceError extends Error {
  /** PostgREST / Postgres error code, kept for logs only (never shown to users). */
  readonly code?: string;
  constructor(code?: string) {
    super("We could not save your card. Please try again.");
    this.name = "CardPersistenceError";
    this.code = code;
  }
}

function mapError(error: { code?: string }): Error {
  // PT402: the M9 trigger refused a PRO design for a Free account.
  if (error.code === "PT402") return new ProRequiredError();
  if (error.code === "23505") return new CardSlugTakenError();
  if (error.code === "42501" || error.code === "PGRST301")
    return new AuthorizationError();
  return new CardPersistenceError(error.code);
}

export type CardRow = {
  slug: string | null;
  status: Exclude<CardStatus, "not_created">;
  config: CardConfig;
  publishedAt: Date | null;
  updatedAt: Date;
};

const CARD_COLUMNS =
  "slug,status,card_type,design,config,published_at,updated_at";

function parseCard(row: Record<string, unknown>): CardRow {
  // card_type and design columns are authoritative; config carries the rest.
  const config = normalizeCardConfig({
    ...(row.config as object),
    type: row.card_type,
    design: row.design,
  });
  return {
    slug: row.slug ? String(row.slug) : null,
    status: row.status as CardRow["status"],
    config,
    publishedAt: row.published_at ? new Date(String(row.published_at)) : null,
    updatedAt: new Date(String(row.updated_at)),
  };
}

const configColumns = (config: CardConfig) => {
  const { type, design, ...rest } = config;
  return { card_type: type, design, config: rest };
};

export async function findCard(
  client: FolioneClient,
  userId: string,
): Promise<CardRow | null> {
  const { data, error } = await client
    .from("digital_cards")
    .select(CARD_COLUMNS)
    .eq("account_id", userId)
    .maybeSingle();
  if (error) throw mapError(error);
  return data ? parseCard(data) : null;
}

export async function createCard(
  client: FolioneClient,
  userId: string,
  config: CardConfig,
  slug: string | null = null,
): Promise<CardRow> {
  const { data, error } = await client
    .from("digital_cards")
    .insert({ account_id: userId, slug, ...configColumns(config) })
    .select(CARD_COLUMNS)
    .single();
  if (error) throw mapError(error);
  return parseCard(data);
}

export async function saveCardDraft(
  client: FolioneClient,
  userId: string,
  config: CardConfig,
): Promise<void> {
  const { data, error } = await client
    .from("digital_cards")
    .update({
      ...configColumns(config),
      updated_at: new Date().toISOString(),
    })
    .eq("account_id", userId)
    .select("account_id");
  if (error) throw mapError(error);
  if (!data?.length) throw new CardPersistenceError();
}

export async function changeCardSlug(
  client: FolioneClient,
  slug: string,
): Promise<void> {
  const { error } = await client.rpc("digital_card_change_slug", {
    p_slug: slug,
  });
  if (error) throw mapError(error);
}

export async function publishCard(
  client: FolioneClient,
  args: { type: CardType; design: CardDesignId; content: CardContent },
): Promise<Date> {
  const { data, error } = await client.rpc("digital_card_publish", {
    p_card_type: args.type,
    p_design: args.design,
    p_content: args.content,
  });
  if (error) throw mapError(error);
  return new Date(String(data));
}

export async function unpublishCard(client: FolioneClient): Promise<void> {
  const { error } = await client.rpc("digital_card_unpublish");
  if (error) throw mapError(error);
}

export type PublishedCard = {
  slug: string;
  design: CardDesignId;
  content: CardContent;
  publishedAt: Date;
};

/**
 * The ONLY columns an anonymous visitor may read from digital_card_published (they match the
 * column-level GRANT to anon in docs/sql/milestone-8/001-digital-cards.sql). Never account_id.
 */
export const PUBLIC_CARD_COLUMNS =
  "slug,card_type,design,content,is_live,published_at,updated_at";
const OWN_CARD_COLUMNS = "slug,card_type,design,content,is_live,published_at";

function parsePublished(row: Record<string, unknown>): PublishedCard | null {
  const content = cardContentSchema.safeParse(row.content);
  if (!content.success || !isCardDesignId(row.design)) return null;
  return {
    slug: String(row.slug),
    design: row.design,
    content: content.data,
    publishedAt: new Date(String(row.published_at)),
  };
}

/** The owner's own live snapshot (to detect unpublished changes). */
export async function findOwnPublishedCard(
  client: FolioneClient,
  userId: string,
): Promise<PublishedCard | null> {
  const { data, error } = await client
    .from("digital_card_published")
    .select(OWN_CARD_COLUMNS)
    .eq("account_id", userId)
    .eq("is_live", true)
    .maybeSingle();
  if (error) throw mapError(error);
  return data ? parsePublished(data) : null;
}

/** Public read with an ANONYMOUS client: live rows only (RLS), granted columns only. */
export async function findLiveCardBySlug(
  client: FolioneClient,
  slug: string,
): Promise<PublishedCard | null> {
  const { data, error } = await client
    .from("digital_card_published")
    .select(PUBLIC_CARD_COLUMNS)
    .eq("slug", slug)
    .eq("is_live", true)
    .maybeSingle();
  if (error || !data) return null;
  return parsePublished(data);
}

export async function isCardSlugLive(
  client: FolioneClient,
  slug: string,
): Promise<boolean> {
  const { data } = await client
    .from("digital_card_published")
    .select("slug")
    .eq("slug", slug)
    .eq("is_live", true)
    .maybeSingle();
  return Boolean(data);
}
