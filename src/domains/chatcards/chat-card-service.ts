import "server-only";
import { z } from "zod";
import {
  findOwnChatCard,
  findOwnPublishedCard,
  findOwnSnapshot,
  findViewerProfile,
  getAuthenticatedDb,
  insertChatCard,
  insertCodeBatch,
  listChatCardEvents,
  listCodes,
  listOwnChatCards,
  listOwnerConversationStats,
  refreshChatCardEntitlement,
  revokeCodes,
  setChatCardStatus,
  updateChatCard,
  ChatUnavailableError,
  type DbClient,
} from "@/lib/db/query";
import { getPersonaService } from "@/domains/personas/persona-runtime";
import {
  chatCardInputSchema,
  codeBatchSchema,
  effectiveStatus,
  type CardStatus,
  type ChatCard,
  type ChatCardValues,
  type LinkKind,
} from "./chat-card-schema";
import { issueCodes } from "./activation-codes";
import { canUseChatCards, requireChatCardOwner } from "./entitlement";
import { recordChatCardEvent } from "./chat-card-events";

/** Publishing an invitation whose expiry date has passed. */
export class ChatCardExpiredError extends Error {
  constructor() {
    super("This card's expiry date has passed. Choose a later date first.");
    this.name = "ChatCardExpiredError";
  }
}

export type CardStats = {
  views: number;
  uniqueVisitors: number;
  qrVisits: number;
  codeAttempts: number;
  redemptions: number;
  requests: number;
  pending: number;
  active: number;
  closed: number;
};

export type OwnerCardSummary = ChatCard & {
  effective: CardStatus;
  personaName: string | null;
  stats: CardStats;
};

export type PersonaOption = { id: string; name: string };
export type LinkOptions = { website: string | null; card: string | null };

/** Ids come from URLs and forms: anything malformed is simply "not found". */
function cardId(id: unknown): string {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) throw new ChatUnavailableError();
  return parsed.data;
}

const EMPTY_STATS: CardStats = {
  views: 0,
  uniqueVisitors: 0,
  qrVisits: 0,
  codeAttempts: 0,
  redemptions: 0,
  requests: 0,
  pending: 0,
  active: 0,
  closed: 0,
};

async function personaOptions(): Promise<PersonaOption[]> {
  try {
    const { personas } = await getPersonaService().list("active");
    return personas.map((p) => ({ id: p.id, name: p.name }));
  } catch {
    // Personas are optional here: a card works without one.
    return [];
  }
}

/** Live addresses the card may link to (never a draft or offline page). */
async function linkOptions(
  client: DbClient,
  userId: string,
): Promise<LinkOptions> {
  const [site, card] = await Promise.all([
    findOwnSnapshot(client, userId).catch(() => null),
    findOwnPublishedCard(client, userId).catch(() => null),
  ]);
  return {
    website: site ? `/${site.slug}` : null,
    card: card ? `/social/${card.slug}` : null,
  };
}

function linkPathFor(kind: LinkKind | null, links: LinkOptions) {
  if (kind === "website") return links.website;
  if (kind === "card") return links.card;
  return null;
}

/** A Persona id must be one of the owner's own active Personas. */
async function checkedValues(raw: unknown): Promise<ChatCardValues> {
  const values = chatCardInputSchema.parse(raw);
  if (values.personaId) {
    const mine = await personaOptions();
    if (!mine.some((p) => p.id === values.personaId)) values.personaId = null;
  }
  return values;
}

function statsFor(
  cards: ChatCard[],
  conversations: { cardId: string; status: string }[],
  events: { chatCardId: string; event: string; visitorHash: string | null }[],
): Map<string, CardStats> {
  const out = new Map(cards.map((c) => [c.id, { ...EMPTY_STATS }]));
  const visitors = new Map<string, Set<string>>();
  for (const c of conversations) {
    const s = out.get(c.cardId);
    if (!s) continue;
    s.requests += 1;
    if (c.status === "requested") s.pending += 1;
    else if (c.status === "active") s.active += 1;
    else s.closed += 1;
  }
  for (const e of events) {
    const s = out.get(e.chatCardId);
    if (!s) continue;
    if (e.event === "chat_card_viewed") {
      s.views += 1;
      if (e.visitorHash) {
        const set = visitors.get(e.chatCardId) ?? new Set();
        set.add(e.visitorHash);
        visitors.set(e.chatCardId, set);
      }
    } else if (e.event === "chat_card_qr_scanned") s.qrVisits += 1;
    else if (e.event === "activation_code_attempted") s.codeAttempts += 1;
    else if (e.event === "activation_code_redeemed") s.redemptions += 1;
  }
  for (const [id, set] of visitors) out.get(id)!.uniqueVisitors = set.size;
  return out;
}

export const ANALYTICS_DAYS = 90;

export type ChatCardsHome =
  | { entitled: false }
  | {
      entitled: true;
      cards: OwnerCardSummary[];
    };

/** The ChatCards dashboard. A Free account gets the upgrade screen (and no ChatCard query). */
export async function getChatCardsHome(): Promise<ChatCardsHome> {
  const { client, user } = await getAuthenticatedDb();
  if (!(await canUseChatCards(client, user.id))) return { entitled: false };
  await refreshChatCardEntitlement(client, user.id);
  const cards = await listOwnChatCards(client, user.id);
  const [conversations, events, personas] = await Promise.all([
    listOwnerConversationStats(client, user.id),
    listChatCardEvents(
      client,
      cards.map((c) => c.id),
      new Date(Date.now() - ANALYTICS_DAYS * 86_400_000),
    ),
    cards.some((c) => c.personaId) ? personaOptions() : Promise.resolve([]),
  ]);
  const stats = statsFor(cards, conversations, events);
  const names = new Map(personas.map((p) => [p.id, p.name]));
  return {
    entitled: true,
    cards: cards.map((c) => ({
      ...c,
      effective: effectiveStatus(c),
      personaName: c.personaId ? (names.get(c.personaId) ?? null) : null,
      stats: stats.get(c.id) ?? { ...EMPTY_STATS },
    })),
  };
}

export type EditorContext = {
  personas: PersonaOption[];
  links: LinkOptions;
  defaultHostName: string;
};

export async function getEditorContext(): Promise<EditorContext> {
  const { client, user } = await requireChatCardOwner();
  const [personas, links, profile] = await Promise.all([
    personaOptions(),
    linkOptions(client, user.id),
    findViewerProfile(client, user.id).catch(() => null),
  ]);
  return {
    personas,
    links,
    defaultHostName: (profile?.displayName || profile?.fullName || "").slice(
      0,
      80,
    ),
  };
}

export async function getOwnChatCard(id: string): Promise<OwnerCardSummary> {
  const { client, user } = await requireChatCardOwner();
  const card = await findOwnChatCard(client, user.id, cardId(id));
  if (!card) throw new ChatUnavailableError();
  const [conversations, events, personas] = await Promise.all([
    listOwnerConversationStats(client, user.id),
    listChatCardEvents(
      client,
      [card.id],
      new Date(Date.now() - ANALYTICS_DAYS * 86_400_000),
    ),
    card.personaId ? personaOptions() : Promise.resolve([]),
  ]);
  return {
    ...card,
    effective: effectiveStatus(card),
    personaName: card.personaId
      ? (personas.find((p) => p.id === card.personaId)?.name ?? null)
      : null,
    stats: statsFor([card], conversations, events).get(card.id) ?? {
      ...EMPTY_STATS,
    },
  };
}

export async function createChatCard(raw: unknown): Promise<ChatCard> {
  const { client } = await requireChatCardOwner();
  return insertChatCard(client, await checkedValues(raw));
}

/** Saves edits; a published card's public page follows at once. */
export async function saveChatCard(
  id: string,
  raw: unknown,
): Promise<ChatCard> {
  const { client, user } = await requireChatCardOwner();
  const values = await checkedValues(raw);
  const card = await updateChatCard(client, user.id, cardId(id), values);
  if (card.status === "active" || card.status === "paused") {
    const links = await linkOptions(client, user.id);
    await setChatCardStatus(
      client,
      card.id,
      card.status,
      linkPathFor(card.linkKind, links),
    );
  }
  return card;
}

export type StatusChange = "publish" | "pause" | "resume" | "archive";

export async function changeChatCardStatus(
  id: string,
  change: StatusChange,
): Promise<void> {
  const { client, user } = await requireChatCardOwner();
  const card = await findOwnChatCard(client, user.id, cardId(id));
  if (!card) throw new ChatUnavailableError();
  const status =
    change === "pause"
      ? "paused"
      : change === "archive"
        ? "archived"
        : "active";
  if (
    status === "active" &&
    card.expiresAt &&
    new Date(card.expiresAt).getTime() <= Date.now()
  )
    throw new ChatCardExpiredError();
  const links = await linkOptions(client, user.id);
  await setChatCardStatus(
    client,
    card.id,
    status,
    linkPathFor(card.linkKind, links),
  );
  if (change === "publish" || change === "resume")
    await recordChatCardEvent(card.id, "chat_card_published");
  if (change === "pause")
    await recordChatCardEvent(card.id, "chat_card_paused");
}

/* ------------------------------------------------------- activation codes */

export type IssuedBatch = { batchId: string; label: string; codes: string[] };

/**
 * Generates a batch. The raw codes are returned ONCE, to this response only; the database
 * receives hashes and four-character hints.
 */
export async function generateActivationCodes(
  id: string,
  raw: unknown,
): Promise<IssuedBatch> {
  const { client, user } = await requireChatCardOwner();
  const card = await findOwnChatCard(client, user.id, cardId(id));
  if (!card || card.status === "archived") throw new ChatUnavailableError();
  const input = codeBatchSchema.parse(raw);
  const issued = issueCodes(input.count);
  const batchId = await insertCodeBatch(client, {
    cardId: card.id,
    label: input.label,
    maxRedemptions: input.usesPerCode,
    expiresAt: input.expiresOn,
    codes: issued.map(({ hash, hint }) => ({ hash, hint })),
  });
  return { batchId, label: input.label, codes: issued.map((c) => c.code) };
}

export type CodeState = "unused" | "in_use" | "used" | "revoked" | "expired";
export type CodeView = {
  id: string;
  hint: string;
  uses: number;
  maxUses: number;
  state: CodeState;
  lastRedeemedAt: string | null;
};
export type BatchView = {
  id: string;
  label: string;
  createdAt: string;
  expiresAt: string | null;
  maxUses: number;
  codes: CodeView[];
  counts: Record<CodeState, number>;
};

export async function getActivationCodes(id: string): Promise<BatchView[]> {
  const { client, user } = await requireChatCardOwner();
  const card = await findOwnChatCard(client, user.id, cardId(id));
  if (!card) throw new ChatUnavailableError();
  const { batches, codes, redemptions } = await listCodes(client, card.id);
  const uses = new Map<string, { n: number; last: string }>();
  for (const r of redemptions) {
    const u = uses.get(r.codeId);
    if (u) u.n += 1;
    else uses.set(r.codeId, { n: 1, last: r.redeemedAt });
  }
  const now = Date.now();
  return batches.map((b) => {
    const list: CodeView[] = codes
      .filter((c) => c.batchId === b.id)
      .map((c) => {
        const u = uses.get(c.id);
        const n = u?.n ?? 0;
        const state: CodeState = c.revokedAt
          ? "revoked"
          : n >= c.maxRedemptions
            ? "used"
            : c.expiresAt && new Date(c.expiresAt).getTime() <= now
              ? "expired"
              : n > 0
                ? "in_use"
                : "unused";
        return {
          id: c.id,
          hint: c.hint,
          uses: n,
          maxUses: c.maxRedemptions,
          state,
          lastRedeemedAt: u?.last ?? null,
        };
      });
    const counts = { unused: 0, in_use: 0, used: 0, revoked: 0, expired: 0 };
    for (const c of list) counts[c.state] += 1;
    return {
      id: b.id,
      label: b.label,
      createdAt: b.createdAt,
      expiresAt: b.expiresAt,
      maxUses: b.maxRedemptions,
      codes: list,
      counts,
    };
  });
}

/** Revokes codes that can still be used (whole batch, or listed codes). Uses already made stay. */
export async function revokeActivationCodes(
  id: string,
  target: { batchId?: string; codeIds?: string[] },
): Promise<number> {
  const batches = await getActivationCodes(id);
  const revocable = batches
    .filter((b) => !target.batchId || b.id === target.batchId)
    .flatMap((b) => b.codes)
    .filter((c) => c.state === "unused" || c.state === "in_use")
    .filter((c) => !target.codeIds || target.codeIds.includes(c.id))
    .map((c) => c.id);
  const { client } = await requireChatCardOwner();
  return revokeCodes(client, cardId(id), revocable);
}
