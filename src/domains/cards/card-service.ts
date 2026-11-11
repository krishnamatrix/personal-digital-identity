import "server-only";
import {
  changeCardSlug,
  CardPersistenceError,
  CardSlugTakenError,
  createCard,
  ensureAccount,
  findCard,
  findLiveCardBySlug,
  findOwnPublishedCard,
  findProfile,
  getAnonymousDb,
  getAuthenticatedDb,
  isCardSlugLive,
  listEntries,
  publishCard,
  saveCardDraft,
  unpublishCard,
  type CardRow,
} from "@/lib/db/query";
import {
  cardConfigSchema,
  defaultCardConfig,
  normalizeCardConfig,
  type CardConfig,
  type CardField,
  type CardStatus,
} from "./card-config";
import {
  buildCardContent,
  cardName,
  cardProblems,
  fieldValues,
  type CardContent,
  type CardProblem,
  type CardSource,
} from "./card-content";
import { hasActivePro } from "@/domains/billing/billing-service";
import { isProCardDesign, ProRequiredError } from "@/domains/billing/plans";
import { stableStringify } from "@/domains/website/build-published";
import {
  normalizeSlug,
  suggestSlug,
  validateSlug,
  type SlugProblem,
} from "@/domains/website/slug";

export type CardState = {
  status: CardStatus;
  slug: string | null;
  config: CardConfig;
  /** What each field would show (null: not in My Identity yet). */
  values: Record<CardField, string | null>;
  photoUrl: string | null;
  profileName: string;
  suggestedSlug: string;
  publishedAt: string | null;
  hasUnpublishedChanges: boolean;
  problems: CardProblem[];
};

async function loadSource() {
  const { client, user } = await getAuthenticatedDb();
  const profile = await findProfile(client, user.id);
  const entries = await listEntries(client, user.id);
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const source: CardSource = {
    profile: {
      fullName: profile?.fullName ?? null,
      displayName: profile?.displayName ?? null,
      headline: profile?.headline ?? null,
      currentDesignation: profile?.currentDesignation ?? null,
      currentOrganization: profile?.currentOrganization ?? null,
      contactEmail: profile?.contactEmail ?? null,
      phone: profile?.phone ?? null,
      location: profile?.location ?? null,
      websiteUrl: profile?.websiteUrl ?? null,
      linkedinUrl: profile?.linkedinUrl ?? null,
      githubUrl: profile?.githubUrl ?? null,
      profileImageUrl: profile?.profileImageUrl ?? null,
    },
    socialLinks: entries
      .filter((e) => e.kind === "social_link")
      .map((e) => ({
        platform: str(e.data.platform),
        url: str(e.data.url),
        label: str(e.data.label),
      })),
  };
  return { client, user, source };
}

export async function getCardState(): Promise<CardState> {
  const { client, user, source } = await loadSource();
  const card = await findCard(client, user.id);
  const config = card?.config ?? defaultCardConfig();
  const content = buildCardContent(source, config);
  const live =
    card?.status === "published"
      ? await findOwnPublishedCard(client, user.id)
      : null;
  const name = cardName(source, { ...config, displayName: "" });
  return {
    status: card ? card.status : "not_created",
    slug: card?.slug ?? null,
    config,
    values: fieldValues(source),
    photoUrl: source.profile.profileImageUrl,
    profileName: name,
    suggestedSlug: suggestSlug(name),
    publishedAt: card?.publishedAt?.toISOString() ?? null,
    hasUnpublishedChanges: live
      ? stableStringify({ d: config.design, c: content }) !==
        stableStringify({ d: live.design, c: live.content })
      : false,
    problems: cardProblems(content),
  };
}

async function ensureCard(): Promise<{
  client: Awaited<ReturnType<typeof getAuthenticatedDb>>["client"];
  userId: string;
  card: CardRow;
}> {
  const { client, user } = await getAuthenticatedDb();
  const existing = await findCard(client, user.id);
  if (existing) return { client, userId: user.id, card: existing };
  await ensureAccount(client, user.id);
  return {
    client,
    userId: user.id,
    card: await createCard(client, user.id, defaultCardConfig()),
  };
}

export async function saveMyCardDraft(input: unknown): Promise<void> {
  const config = normalizeCardConfig(cardConfigSchema.parse(input));
  const { client, userId, card } = await ensureCard();
  // Switching TO a PRO design needs PRO; keeping one chosen earlier does not (same rule as SQL).
  if (
    config.design !== card.config.design &&
    isProCardDesign(config.design) &&
    !(await hasActivePro(client, userId))
  )
    throw new ProRequiredError();
  await saveCardDraft(client, userId, config);
}

export type CardSlugCheck =
  | { ok: true; state: "available" | "yours" }
  | { ok: false; state: "invalid"; problem: SlugProblem }
  | { ok: false; state: "taken" };

/** Availability as far as RLS lets anyone see (live cards); the unique constraint decides. */
export async function checkCardSlug(input: string): Promise<CardSlugCheck> {
  const slug = normalizeSlug(input);
  const problem = validateSlug(slug);
  if (problem) return { ok: false, state: "invalid", problem };
  const { client, user } = await getAuthenticatedDb();
  const own = await findCard(client, user.id);
  if (own?.slug === slug) return { ok: true, state: "yours" };
  if (await isCardSlugLive(await getAnonymousDb(), slug))
    return { ok: false, state: "taken" };
  return { ok: true, state: "available" };
}

export class InvalidCardSlugError extends Error {
  constructor(public problem: SlugProblem) {
    super(problem);
    this.name = "InvalidCardSlugError";
  }
}

export async function saveMyCardSlug(input: string): Promise<string> {
  const slug = normalizeSlug(input);
  const problem = validateSlug(slug);
  if (problem) throw new InvalidCardSlugError(problem);
  const { client, card } = await ensureCard();
  if (card.slug !== slug) await changeCardSlug(client, slug);
  return slug;
}

export class CardPublishBlockedError extends Error {
  constructor(public problems: CardProblem[]) {
    super("Add the missing details before publishing.");
    this.name = "CardPublishBlockedError";
  }
}

/** Builds the card from My Identity + the SAVED config right now, and publishes it. */
export async function publishMyCard(): Promise<Date> {
  const { client, user, source } = await loadSource();
  const card = await findCard(client, user.id);
  if (!card?.slug) throw new CardPublishBlockedError([]);
  const content = buildCardContent(source, card.config);
  const problems = cardProblems(content);
  if (problems.length) throw new CardPublishBlockedError(problems);
  if (
    isProCardDesign(card.config.design) &&
    !(await hasActivePro(client, user.id))
  )
    throw new ProRequiredError();
  return publishCard(client, {
    type: card.config.type,
    design: card.config.design,
    content,
  });
}

export async function unpublishMyCard(): Promise<void> {
  const { client } = await getAuthenticatedDb();
  await unpublishCard(client);
}

/** Public read: anonymous client, live rows only. */
export async function getPublicCard(slug: string) {
  if (validateSlug(slug)) return null;
  return findLiveCardBySlug(await getAnonymousDb(), normalizeSlug(slug));
}

export type { CardContent };
export { CardPersistenceError, CardSlugTakenError };
