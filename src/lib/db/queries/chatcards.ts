import "server-only";
import type { FolioneClient } from "@/lib/db/schema";
import { ProRequiredError } from "@/domains/billing/plans";
import type {
  AccessPolicy,
  ChatCard,
  ChatCardValues,
  LinkKind,
  PublicChatCard,
  ReportReason,
  StoredCardStatus,
} from "@/domains/chatcards/chat-card-schema";

/**
 * ChatCards (docs/sql/milestone-chatcards/002-chatcards.sql). Every query runs with the
 * signed-in user's JWT (or anon), so RLS decides; the policies and triggers enforce PRO,
 * membership, the code rules and the rate limits even if the app were bypassed.
 */
type QueryClient = FolioneClient;

/** The SQL has not been applied to this project yet. */
export class ChatCardsNotInstalledError extends Error {
  constructor() {
    super("ChatCards are not available yet.");
    this.name = "ChatCardsNotInstalledError";
  }
}
/** Deliberately vague: not found, not yours, blocked, paused, code missing... */
export class ChatUnavailableError extends Error {
  constructor() {
    super("This conversation is not available.");
    this.name = "ChatUnavailableError";
  }
}
export class ChatRateLimitedError extends Error {
  constructor() {
    super("That is a lot at once. Please wait a few minutes and try again.");
    this.name = "ChatRateLimitedError";
  }
}
/** A rule refused the change (limit reached, wrong state). `reason` is the database's text. */
export class ChatConflictError extends Error {
  readonly reason: string;
  constructor(reason = "") {
    super("That change is not possible right now.");
    this.name = "ChatConflictError";
    this.reason = reason;
  }
}
export class ChatPersistenceError extends Error {
  readonly code?: string;
  constructor(code?: string) {
    super("We could not save that. Please try again.");
    this.name = "ChatPersistenceError";
    this.code = code;
  }
}

type PgError = { code?: string; message?: string };

function mapError(error: PgError): Error {
  switch (error.code) {
    case "PGRST205":
    case "42P01":
    case "PGRST202":
    case "42883":
      return new ChatCardsNotInstalledError();
    case "PT402":
      return new ProRequiredError();
    case "PT429":
      return new ChatRateLimitedError();
    case "PT409":
      return new ChatConflictError(error.message ?? "");
    case "P0002":
      return new ChatUnavailableError();
    case "42501":
    case "PGRST301":
      return new ChatUnavailableError();
    case "PGRST116":
      return new ChatUnavailableError();
    default:
      return new ChatPersistenceError(error.code);
  }
}

/** Owner-side writes: a refusal by RLS is a permission problem, not "unavailable". */
function mapOwnerError(error: PgError): Error {
  if (error.code === "42501" || error.code === "PGRST301") {
    // has_pro() in the policy is the usual reason an owner's own write is refused.
    return new ProRequiredError();
  }
  return mapError(error);
}

/* ------------------------------------------------------------------ cards */

const CARD_COLUMNS =
  "id,public_id,status,title,description,host_name,welcome_message,cover_image_url,persona_id,link_kind,access_policy,auto_accept,accepting_new,allow_follow_ups,max_active_conversations,max_conversations_per_recipient,expires_at,published_at,created_at,updated_at";

const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : null);

function parseCard(row: Record<string, unknown>): ChatCard {
  return {
    id: String(row.id),
    publicId: String(row.public_id),
    status: row.status as StoredCardStatus,
    title: String(row.title),
    description: (row.description as string | null) ?? null,
    hostName: String(row.host_name),
    welcomeMessage: (row.welcome_message as string | null) ?? null,
    coverImageUrl: (row.cover_image_url as string | null) ?? null,
    personaId: (row.persona_id as string | null) ?? null,
    linkKind: (row.link_kind as LinkKind | null) ?? null,
    accessPolicy: row.access_policy as AccessPolicy,
    autoAccept: Boolean(row.auto_accept),
    acceptingNew: Boolean(row.accepting_new),
    allowFollowUps: Boolean(row.allow_follow_ups),
    maxActiveConversations:
      row.max_active_conversations == null
        ? null
        : Number(row.max_active_conversations),
    maxConversationsPerRecipient: Number(row.max_conversations_per_recipient),
    expiresAt: iso(row.expires_at),
    publishedAt: iso(row.published_at),
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
  };
}

function cardColumns(v: ChatCardValues) {
  return {
    title: v.title,
    description: v.description,
    host_name: v.hostName,
    welcome_message: v.welcomeMessage,
    cover_image_url: v.coverImageUrl,
    persona_id: v.personaId,
    link_kind: v.linkKind,
    access_policy: v.accessPolicy,
    auto_accept: v.autoAccept,
    accepting_new: v.acceptingNew,
    allow_follow_ups: v.allowFollowUps,
    max_active_conversations: v.maxActiveConversations,
    max_conversations_per_recipient: v.maxConversationsPerRecipient,
    expires_at: v.expiresOn,
  };
}

export async function listOwnChatCards(
  client: QueryClient,
  userId: string,
): Promise<ChatCard[]> {
  const { data, error } = await client
    .from("chat_cards")
    .select(CARD_COLUMNS)
    .eq("account_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw mapError(error);
  return (data ?? []).map((r) => parseCard(r as Record<string, unknown>));
}

export async function findOwnChatCard(
  client: QueryClient,
  userId: string,
  id: string,
): Promise<ChatCard | null> {
  const { data, error } = await client
    .from("chat_cards")
    .select(CARD_COLUMNS)
    .eq("account_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw mapError(error);
  return data ? parseCard(data as Record<string, unknown>) : null;
}

export async function insertChatCard(
  client: QueryClient,
  values: ChatCardValues,
): Promise<ChatCard> {
  const { data, error } = await client
    .from("chat_cards")
    .insert(cardColumns(values))
    .select(CARD_COLUMNS)
    .single();
  if (error) throw mapOwnerError(error);
  return parseCard(data as Record<string, unknown>);
}

export async function updateChatCard(
  client: QueryClient,
  userId: string,
  id: string,
  values: ChatCardValues,
): Promise<ChatCard> {
  const { data, error } = await client
    .from("chat_cards")
    .update(cardColumns(values))
    .eq("account_id", userId)
    .eq("id", id)
    .select(CARD_COLUMNS)
    .maybeSingle();
  if (error) throw mapOwnerError(error);
  if (!data) throw new ChatUnavailableError();
  return parseCard(data as Record<string, unknown>);
}

/** Publish / pause / resume / archive, and refresh the public snapshot, in one transaction. */
export async function setChatCardStatus(
  client: QueryClient,
  id: string,
  status: Exclude<StoredCardStatus, "draft">,
  linkPath: string | null,
): Promise<void> {
  const { error } = await client.rpc("chat_card_set_status", {
    p_card_id: id,
    p_status: status,
    p_link_path: linkPath,
  });
  if (error) throw mapOwnerError(error);
}

/**
 * Re-reads the owner's PRO end date into their snapshots (the trigger copies it from their own
 * plan row). Called when they open ChatCards or their inbox, so a renewal takes effect at once.
 * Refused (and ignored) while PRO is inactive: the snapshots then keep the old, past date.
 */
export async function refreshChatCardEntitlement(
  client: QueryClient,
  userId: string,
): Promise<void> {
  await client
    .from("chat_card_public")
    .update({ updated_at: new Date().toISOString() })
    .eq("account_id", userId);
}

/* -------------------------------------------------------------- codes */

export type CodeRow = {
  id: string;
  batchId: string;
  hint: string;
  maxRedemptions: number;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};
export type BatchRow = {
  id: string;
  label: string;
  codeCount: number;
  maxRedemptions: number;
  expiresAt: string | null;
  createdAt: string;
};
export type RedemptionRow = {
  id: string;
  codeId: string;
  recipientId: string | null;
  redeemedAt: string;
};

export async function insertCodeBatch(
  client: QueryClient,
  args: {
    cardId: string;
    label: string;
    maxRedemptions: number;
    expiresAt: string | null;
    codes: { hash: string; hint: string }[];
  },
): Promise<string> {
  const { data, error } = await client
    .from("chat_card_code_batches")
    .insert({
      card_id: args.cardId,
      label: args.label,
      code_count: args.codes.length,
      max_redemptions: args.maxRedemptions,
      expires_at: args.expiresAt,
    })
    .select("id")
    .single();
  if (error) throw mapOwnerError(error);
  const batchId = String((data as { id: string }).id);
  // Only hashes and hints are sent; the raw codes never reach the database.
  const { error: codesError } = await client.from("chat_card_codes").insert(
    args.codes.map((c) => ({
      card_id: args.cardId,
      batch_id: batchId,
      code_hash: c.hash,
      hint: c.hint,
      max_redemptions: args.maxRedemptions,
      expires_at: args.expiresAt,
    })),
  );
  if (codesError) throw mapOwnerError(codesError);
  return batchId;
}

/** Owner read. Never selects code_hash (no role is even granted it). */
export async function listCodes(
  client: QueryClient,
  cardId: string,
): Promise<{
  batches: BatchRow[];
  codes: CodeRow[];
  redemptions: RedemptionRow[];
}> {
  const [batches, codes, redemptions] = await Promise.all([
    client
      .from("chat_card_code_batches")
      .select("id,label,code_count,max_redemptions,expires_at,created_at")
      .eq("card_id", cardId)
      .order("created_at", { ascending: false })
      .limit(100),
    client
      .from("chat_card_codes")
      .select(
        "id,batch_id,hint,max_redemptions,expires_at,revoked_at,created_at",
      )
      .eq("card_id", cardId)
      .order("created_at", { ascending: true })
      .limit(10_000),
    client
      .from("chat_card_redemptions")
      .select("id,code_id,recipient_id,redeemed_at")
      .eq("card_id", cardId)
      .order("redeemed_at", { ascending: false })
      .limit(10_000),
  ]);
  for (const r of [batches, codes, redemptions])
    if (r.error) throw mapError(r.error);
  return {
    batches: (batches.data ?? []).map((b) => ({
      id: String(b.id),
      label: String(b.label),
      codeCount: Number(b.code_count),
      maxRedemptions: Number(b.max_redemptions),
      expiresAt: iso(b.expires_at),
      createdAt: iso(b.created_at)!,
    })),
    codes: (codes.data ?? []).map((c) => ({
      id: String(c.id),
      batchId: String(c.batch_id),
      hint: String(c.hint),
      maxRedemptions: Number(c.max_redemptions),
      expiresAt: iso(c.expires_at),
      revokedAt: iso(c.revoked_at),
      createdAt: iso(c.created_at)!,
    })),
    redemptions: (redemptions.data ?? []).map((r) => ({
      id: String(r.id),
      codeId: String(r.code_id),
      recipientId: r.recipient_id ? String(r.recipient_id) : null,
      redeemedAt: iso(r.redeemed_at)!,
    })),
  };
}

export async function revokeCodes(
  client: QueryClient,
  cardId: string,
  codeIds: string[],
): Promise<number> {
  if (codeIds.length === 0) return 0;
  const { data, error } = await client
    .from("chat_card_codes")
    .update({ revoked_at: new Date().toISOString() })
    .eq("card_id", cardId)
    .in("id", codeIds)
    .is("revoked_at", null)
    .select("id");
  if (error) throw mapOwnerError(error);
  return data?.length ?? 0;
}

/* ------------------------------------------------------- public / recipient */

export async function getPublicChatCard(
  client: QueryClient,
  publicId: string,
): Promise<PublicChatCard | null> {
  const { data, error } = await client.rpc("chat_card_public_get", {
    p_public_id: publicId,
  });
  if (error) throw mapError(error);
  const row = (Array.isArray(data) ? data[0] : data) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  return {
    cardId: String(row.card_id),
    publicId: String(row.public_id),
    status: row.status as PublicChatCard["status"],
    title: String(row.title),
    description: (row.description as string | null) ?? null,
    hostName: String(row.host_name),
    welcomeMessage: (row.welcome_message as string | null) ?? null,
    coverImageUrl: (row.cover_image_url as string | null) ?? null,
    linkPath: (row.link_path as string | null) ?? null,
    accessPolicy: row.access_policy as AccessPolicy,
    autoAccept: Boolean(row.auto_accept),
    acceptingNew: Boolean(row.accepting_new),
    allowFollowUps: Boolean(row.allow_follow_ups),
    maxConversationsPerRecipient: Number(row.max_conversations_per_recipient),
    expiresAt: iso(row.expires_at),
    ownerProActive: Boolean(row.owner_pro_active),
    isOwner: Boolean(row.is_owner),
  };
}

export type RedeemOutcome =
  | "redeemed"
  | "invalid"
  | "unavailable"
  | "rate_limited";

export async function redeemChatCode(
  client: QueryClient,
  publicId: string,
  codeHash: string,
): Promise<RedeemOutcome> {
  const { data, error } = await client.rpc("chat_card_redeem", {
    p_public_id: publicId,
    p_code_hash: codeHash,
  });
  if (error) throw mapError(error);
  const v = String(data);
  return (
    ["redeemed", "invalid", "unavailable", "rate_limited"] as const
  ).includes(v as RedeemOutcome)
    ? (v as RedeemOutcome)
    : "invalid";
}

/** Has the signed-in person already redeemed a code on this card? (own rows only) */
export async function hasOwnRedemption(
  client: QueryClient,
  userId: string,
  cardId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("chat_card_redemptions")
    .select("id")
    .eq("card_id", cardId)
    .eq("recipient_id", userId)
    .limit(1);
  if (error) throw mapError(error);
  return Boolean(data?.length);
}

export async function requestConversation(
  client: QueryClient,
  args: { publicId: string; name: string; message: string },
): Promise<string> {
  const { data, error } = await client.rpc("chat_card_request", {
    p_public_id: args.publicId,
    p_name: args.name,
    p_message: args.message,
  });
  if (error) throw mapError(error);
  return String(data);
}

/* ----------------------------------------------------------- conversations */

export type ConversationStatus = "requested" | "active" | "declined" | "closed";
export type ConversationRow = {
  id: string;
  cardId: string;
  ownerId: string;
  recipientId: string;
  recipientName: string;
  status: ConversationStatus;
  closeReason: "closed" | "left" | "blocked" | null;
  closedBy: "owner" | "recipient" | null;
  hasEntitlement: boolean;
  createdAt: string;
  acceptedAt: string | null;
  closedAt: string | null;
  ownerLastReadAt: string | null;
  recipientLastReadAt: string | null;
};
export type MessageRow = {
  id: number;
  senderId: string;
  body: string;
  createdAt: string;
};

const CONVERSATION_COLUMNS =
  "id,card_id,owner_id,recipient_id,recipient_name,status,close_reason,closed_by,redemption_id,created_at,accepted_at,closed_at,owner_last_read_at,recipient_last_read_at";

function parseConversation(row: Record<string, unknown>): ConversationRow {
  return {
    id: String(row.id),
    cardId: String(row.card_id),
    ownerId: String(row.owner_id),
    recipientId: String(row.recipient_id),
    recipientName: String(row.recipient_name),
    status: row.status as ConversationStatus,
    closeReason: (row.close_reason as ConversationRow["closeReason"]) ?? null,
    closedBy: (row.closed_by as ConversationRow["closedBy"]) ?? null,
    hasEntitlement: Boolean(row.redemption_id),
    createdAt: iso(row.created_at)!,
    acceptedAt: iso(row.accepted_at),
    closedAt: iso(row.closed_at),
    ownerLastReadAt: iso(row.owner_last_read_at),
    recipientLastReadAt: iso(row.recipient_last_read_at),
  };
}

function parseMessage(row: Record<string, unknown>): MessageRow {
  return {
    id: Number(row.id),
    senderId: String(row.sender_id),
    body: String(row.body),
    createdAt: iso(row.created_at)!,
  };
}

/** Inbox rows (RLS: own conversations only) with each one's latest message. */
export async function listConversations(
  client: QueryClient,
  userId: string,
  role: "owner" | "recipient",
): Promise<(ConversationRow & { lastMessage: MessageRow | null })[]> {
  const { data, error } = await client
    .from("conversations")
    .select(
      `${CONVERSATION_COLUMNS},conversation_messages(id,sender_id,body,created_at)`,
    )
    .eq(role === "owner" ? "owner_id" : "recipient_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { referencedTable: "conversation_messages", ascending: false })
    .limit(1, { referencedTable: "conversation_messages" })
    .limit(500);
  if (error) throw mapError(error);
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    const msgs = (row.conversation_messages as Record<string, unknown>[]) ?? [];
    return {
      ...parseConversation(row),
      lastMessage: msgs[0] ? parseMessage(msgs[0]) : null,
    };
  });
}

/** Card titles for conversation lists (the snapshot; visible to owner and participants). */
export async function listCardLabels(
  client: QueryClient,
  cardIds: string[],
): Promise<
  Map<
    string,
    {
      title: string;
      hostName: string;
      publicId: string;
      status: string;
      allowFollowUps: boolean;
      ownerProActive: boolean;
    }
  >
> {
  const ids = [...new Set(cardIds)];
  if (ids.length === 0) return new Map();
  const { data, error } = await client
    .from("chat_card_public")
    .select(
      "card_id,title,host_name,public_id,status,allow_follow_ups,owner_pro_until",
    )
    .in("card_id", ids);
  if (error) throw mapError(error);
  const now = Date.now();
  return new Map(
    (data ?? []).map((r) => [
      String(r.card_id),
      {
        title: String(r.title),
        hostName: String(r.host_name),
        publicId: String(r.public_id),
        status: String(r.status),
        allowFollowUps: Boolean(r.allow_follow_ups),
        ownerProActive: Boolean(
          r.owner_pro_until &&
            new Date(String(r.owner_pro_until)).getTime() > now,
        ),
      },
    ]),
  );
}

export async function findConversation(
  client: QueryClient,
  id: string,
): Promise<ConversationRow | null> {
  const { data, error } = await client
    .from("conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    // A malformed id is just "not found" (22P02 invalid uuid).
    if (error.code === "22P02") return null;
    throw mapError(error);
  }
  return data ? parseConversation(data as Record<string, unknown>) : null;
}

/** Newest first, `limit` at a time; `before` pages back, `after` fetches what is new. */
export async function listMessages(
  client: QueryClient,
  conversationId: string,
  opts: { before?: number; after?: number; limit: number },
): Promise<MessageRow[]> {
  let q = client
    .from("conversation_messages")
    .select("id,sender_id,body,created_at")
    .eq("conversation_id", conversationId);
  if (opts.before) q = q.lt("id", opts.before);
  if (opts.after) q = q.gt("id", opts.after);
  const { data, error } = await q
    .order("id", { ascending: false })
    .limit(opts.limit);
  if (error) throw mapError(error);
  return (data ?? []).map((r) => parseMessage(r as Record<string, unknown>));
}

export async function insertMessage(
  client: QueryClient,
  conversationId: string,
  body: string,
): Promise<MessageRow> {
  const { data, error } = await client
    .from("conversation_messages")
    .insert({ conversation_id: conversationId, body })
    .select("id,sender_id,body,created_at")
    .single();
  if (error) throw mapError(error);
  return parseMessage(data as Record<string, unknown>);
}

export async function updateConversation(
  client: QueryClient,
  id: string,
  patch: {
    status?: ConversationStatus;
    close_reason?: "closed" | "left" | "blocked";
    owner_last_read_at?: string;
    recipient_last_read_at?: string;
  },
): Promise<ConversationRow> {
  const { data, error } = await client
    .from("conversations")
    .update(patch)
    .eq("id", id)
    .select(CONVERSATION_COLUMNS)
    .maybeSingle();
  if (error) throw mapError(error);
  if (!data) throw new ChatUnavailableError();
  return parseConversation(data as Record<string, unknown>);
}

/** Owner: conversation counts per card for the dashboard. */
export async function listOwnerConversationStats(
  client: QueryClient,
  userId: string,
): Promise<{ cardId: string; status: ConversationStatus }[]> {
  const { data, error } = await client
    .from("conversations")
    .select("card_id,status")
    .eq("owner_id", userId)
    .limit(20_000);
  if (error) throw mapError(error);
  return (data ?? []).map((r) => ({
    cardId: String(r.card_id),
    status: r.status as ConversationStatus,
  }));
}

export async function insertBlock(
  client: QueryClient,
  blockedId: string,
  conversationId: string,
): Promise<void> {
  const { error } = await client
    .from("conversation_blocks")
    .insert({ blocked_id: blockedId, conversation_id: conversationId });
  // Already blocked is fine.
  if (error && error.code !== "23505") throw mapError(error);
}

export async function insertReport(
  client: QueryClient,
  args: {
    conversationId: string;
    messageId: number | null;
    reason: ReportReason;
    details: string | null;
  },
): Promise<void> {
  const { error } = await client.from("conversation_reports").insert({
    conversation_id: args.conversationId,
    message_id: args.messageId,
    reason: args.reason,
    details: args.details,
  });
  if (error) throw mapError(error);
}

/* ------------------------------------------------------------- analytics */

export type ChatCardEventRow = {
  chatCardId: string;
  event: string;
  occurredAt: string;
  visitorHash: string | null;
};

/** Owner read (RLS: their own cards' events only). */
export async function listChatCardEvents(
  client: QueryClient,
  cardIds: string[],
  since: Date,
): Promise<ChatCardEventRow[]> {
  if (cardIds.length === 0) return [];
  const { data, error } = await client
    .from("insight_events")
    .select("chat_card_id,event,occurred_at,visitor_hash")
    .in("chat_card_id", cardIds)
    .gte("occurred_at", since.toISOString())
    .order("occurred_at", { ascending: false })
    .limit(50_000);
  if (error) {
    // 003 not applied yet: analytics are simply empty.
    if (error.code === "42703" || error.code === "PGRST204") return [];
    throw mapError(error);
  }
  return (data ?? []).map((r) => ({
    chatCardId: String(r.chat_card_id),
    event: String(r.event),
    occurredAt: iso(r.occurred_at)!,
    visitorHash: r.visitor_hash ? String(r.visitor_hash) : null,
  }));
}
