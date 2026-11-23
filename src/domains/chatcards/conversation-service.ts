import "server-only";
import { z } from "zod";
import {
  ChatConflictError,
  ChatUnavailableError,
  ensureAccount,
  findConversation,
  findViewerProfile,
  getAnonymousDb,
  getAuthenticatedDb,
  getPublicChatCard,
  hasOwnRedemption,
  insertBlock,
  insertMessage,
  insertReport,
  listCardLabels,
  listConversations,
  listMessages,
  redeemChatCode,
  refreshChatCardEntitlement,
  requestConversation,
  updateConversation,
  type ConversationRow,
  type ConversationStatus,
  type MessageRow,
} from "@/lib/db/query";
import { AuthenticationRequiredError } from "@/lib/supabase/server";
import {
  availabilityOf,
  LIMITS,
  messageSchema,
  publicIdSchema,
  recipientNameSchema,
  REPORT_REASONS,
  type Availability,
  type PublicChatCard,
} from "./chat-card-schema";
import { hashCode, normalizeCode } from "./activation-codes";
import { canUseChatCards } from "./entitlement";
import { recordChatCardEvent } from "./chat-card-events";

/**
 * Recipient and conversation flows. Anyone signed in can use these, on any plan: the card
 * OWNER's PRO is what the database checks (chat_card_public.owner_pro_until). Membership is
 * enforced by RLS on every read and write; the checks here only produce clear messages.
 */

const conversationId = (id: unknown) => {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) throw new ChatUnavailableError();
  return parsed.data;
};

/* ------------------------------------------------------------ public card */

export type LandingViewer =
  | { signedIn: false }
  | {
      signedIn: true;
      isOwner: boolean;
      hasCode: boolean;
      suggestedName: string;
      conversations: { id: string; status: ConversationStatus }[];
    };

export type LandingView = {
  card: PublicChatCard | null;
  availability: Availability;
  viewer: LandingViewer;
};

async function optionalSession() {
  try {
    return await getAuthenticatedDb();
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return null;
    throw error;
  }
}

/** The public page. Unknown, archived and malformed ids all look the same: unavailable. */
export async function getLandingView(publicId: string): Promise<LandingView> {
  const id = publicIdSchema.safeParse(publicId);
  if (!id.success)
    return {
      card: null,
      availability: "unavailable",
      viewer: { signedIn: false },
    };
  const session = await optionalSession();
  const client = session?.client ?? (await getAnonymousDb());
  const card = await getPublicChatCard(client, id.data).catch(() => null);
  const availability = availabilityOf(card);
  if (!session || !card)
    return { card, availability, viewer: { signedIn: false } };

  const { user } = session;
  const [hasCode, mine, profile] = await Promise.all([
    card.accessPolicy === "verified"
      ? hasOwnRedemption(session.client, user.id, card.cardId).catch(
          () => false,
        )
      : Promise.resolve(false),
    listConversations(session.client, user.id, "recipient").catch(() => []),
    findViewerProfile(session.client, user.id).catch(() => null),
  ]);
  return {
    card,
    availability,
    viewer: {
      signedIn: true,
      isOwner: card.isOwner,
      hasCode,
      suggestedName: (profile?.displayName || profile?.fullName || "").slice(
        0,
        LIMITS.recipientName,
      ),
      conversations: mine
        .filter((c) => c.cardId === card.cardId)
        .map((c) => ({ id: c.id, status: c.status })),
    },
  };
}

export type RedeemResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "unavailable" | "rate_limited" };

/**
 * Redeems an activation code for the signed-in person. Only the code's SHA-256 leaves this
 * function; the code itself is never logged or stored. Every attempt counts toward the
 * database's limit (10 per 15 minutes), including malformed ones.
 */
export async function redeemActivationCode(
  publicId: string,
  code: string,
): Promise<RedeemResult> {
  const { client, user } = await getAuthenticatedDb();
  const id = publicIdSchema.safeParse(publicId);
  if (!id.success) return { ok: false, reason: "unavailable" };
  await ensureAccount(client, user.id);
  const normalized = normalizeCode(code);
  // A malformed code still goes to the database (as a hash that matches nothing) so that it
  // counts as an attempt.
  const hash = normalized ? hashCode(normalized) : "0".repeat(64);
  const card = await getPublicChatCard(client, id.data).catch(() => null);
  const outcome = await redeemChatCode(client, id.data, hash);
  if (card) {
    await recordChatCardEvent(card.cardId, "activation_code_attempted");
    if (outcome === "redeemed")
      await recordChatCardEvent(card.cardId, "activation_code_redeemed");
  }
  return outcome === "redeemed" ? { ok: true } : { ok: false, reason: outcome };
}

/** Starts a conversation (or a request awaiting approval) with its opening message. */
export async function startConversation(
  publicId: string,
  input: { name: string; message: string },
): Promise<{ id: string; status: ConversationStatus }> {
  const { client, user } = await getAuthenticatedDb();
  const id = publicIdSchema.safeParse(publicId);
  if (!id.success) throw new ChatUnavailableError();
  const name = recipientNameSchema.parse(input.name);
  const message = messageSchema.parse(input.message);
  await ensureAccount(client, user.id);
  const card = await getPublicChatCard(client, id.data);
  if (!card || availabilityOf(card) !== "open" || card.isOwner)
    throw new ChatUnavailableError();
  const newId = await requestConversation(client, {
    publicId: id.data,
    name,
    message,
  });
  await recordChatCardEvent(card.cardId, "conversation_requested");
  if (card.autoAccept)
    await recordChatCardEvent(card.cardId, "conversation_accepted");
  return { id: newId, status: card.autoAccept ? "active" : "requested" };
}

/* ------------------------------------------------------------------ inbox */

export type InboxItem = {
  id: string;
  role: "owner" | "recipient";
  status: ConversationStatus;
  counterpart: string;
  cardTitle: string;
  lastMessage: { body: string; fromMe: boolean; at: string } | null;
  unread: boolean;
  createdAt: string;
};

export type Inbox = {
  ownerEntitled: boolean;
  received: InboxItem[];
  started: InboxItem[];
};

function unreadFor(
  row: ConversationRow & { lastMessage: MessageRow | null },
  me: string,
  role: "owner" | "recipient",
): boolean {
  const last = row.lastMessage;
  if (!last || last.senderId === me) return false;
  const read = role === "owner" ? row.ownerLastReadAt : row.recipientLastReadAt;
  return !read || new Date(read).getTime() < new Date(last.createdAt).getTime();
}

const preview = (body: string) =>
  body.length > 140 ? `${body.slice(0, 139)}…` : body;

export async function getInbox(): Promise<Inbox> {
  const { client, user } = await getAuthenticatedDb();
  const ownerEntitled = await canUseChatCards(client, user.id);
  if (ownerEntitled) await refreshChatCardEntitlement(client, user.id);
  const [received, started] = await Promise.all([
    listConversations(client, user.id, "owner"),
    listConversations(client, user.id, "recipient"),
  ]);
  const labels = await listCardLabels(
    client,
    [...received, ...started].map((c) => c.cardId),
  );
  const item =
    (role: "owner" | "recipient") =>
    (row: ConversationRow & { lastMessage: MessageRow | null }): InboxItem => {
      const label = labels.get(row.cardId);
      return {
        id: row.id,
        role,
        status: row.status,
        counterpart:
          role === "owner"
            ? row.recipientName
            : (label?.hostName ?? "ChatCard"),
        cardTitle: label?.title ?? "ChatCard",
        lastMessage: row.lastMessage
          ? {
              body: preview(row.lastMessage.body),
              fromMe: row.lastMessage.senderId === user.id,
              at: row.lastMessage.createdAt,
            }
          : null,
        unread: unreadFor(row, user.id, role),
        createdAt: row.createdAt,
      };
    };
  const byRecent = (a: InboxItem, b: InboxItem) =>
    (b.lastMessage?.at ?? b.createdAt).localeCompare(
      a.lastMessage?.at ?? a.createdAt,
    );
  return {
    ownerEntitled,
    received: received.map(item("owner")).sort(byRecent),
    started: started.map(item("recipient")).sort(byRecent),
  };
}

/* ------------------------------------------------------------ conversation */

export type ChatMessage = {
  id: number;
  body: string;
  fromMe: boolean;
  at: string;
};

export type ConversationView = {
  id: string;
  role: "owner" | "recipient";
  status: ConversationStatus;
  closeReason: ConversationRow["closeReason"];
  closedBy: ConversationRow["closedBy"];
  counterpart: string;
  card: { title: string; publicId: string | null; status: string };
  /** Owner only: how this person got access. */
  origin: { viaCode: boolean; requestedAt: string; acceptedAt: string | null };
  messages: ChatMessage[];
  hasOlder: boolean;
  /** Why sending is disabled, or null when the viewer can send now. */
  sendBlock:
    | null
    | "requested"
    | "awaiting_reply"
    | "closed"
    | "owner_lapsed"
    | "pro_required";
  ownerCanManage: boolean;
};

function toChat(m: MessageRow, me: string): ChatMessage {
  return { id: m.id, body: m.body, fromMe: m.senderId === me, at: m.createdAt };
}

async function load(id: string) {
  const session = await getAuthenticatedDb();
  const row = await findConversation(session.client, conversationId(id));
  // RLS returns nothing to a non-participant: the same answer as a wrong id.
  if (!row) throw new ChatUnavailableError();
  const role: "owner" | "recipient" =
    row.ownerId === session.user.id ? "owner" : "recipient";
  return { ...session, row, role };
}

export async function getConversation(id: string): Promise<ConversationView> {
  const { client, user, row, role } = await load(id);
  const ownerEntitled =
    role === "owner" ? await canUseChatCards(client, user.id) : false;
  if (ownerEntitled) await refreshChatCardEntitlement(client, user.id);
  const [labels, page] = await Promise.all([
    listCardLabels(client, [row.cardId]),
    listMessages(client, row.id, { limit: LIMITS.messagePage + 1 }),
  ]);
  const label = labels.get(row.cardId);
  const hasOlder = page.length > LIMITS.messagePage;
  const messages = page
    .slice(0, LIMITS.messagePage)
    .reverse()
    .map((m) => toChat(m, user.id));
  const last = page[0];
  const sendBlock: ConversationView["sendBlock"] =
    row.status === "declined" || row.status === "closed"
      ? "closed"
      : !label?.ownerProActive
        ? role === "owner"
          ? "pro_required"
          : "owner_lapsed"
        : row.status === "requested"
          ? "requested"
          : role === "recipient" &&
              !label.allowFollowUps &&
              last?.senderId === user.id
            ? "awaiting_reply"
            : null;
  return {
    id: row.id,
    role,
    status: row.status,
    closeReason: row.closeReason,
    closedBy: row.closedBy,
    counterpart:
      role === "owner" ? row.recipientName : (label?.hostName ?? "ChatCard"),
    card: {
      title: label?.title ?? "ChatCard",
      publicId: label?.publicId ?? null,
      status: label?.status ?? "archived",
    },
    origin: {
      viaCode: row.hasEntitlement,
      requestedAt: row.createdAt,
      acceptedAt: row.acceptedAt,
    },
    messages,
    hasOlder,
    sendBlock,
    ownerCanManage: role === "owner" && ownerEntitled,
  };
}

export async function getOlderMessages(
  id: string,
  before: number,
): Promise<{ messages: ChatMessage[]; hasOlder: boolean }> {
  const { client, user, row } = await load(id);
  const page = await listMessages(client, row.id, {
    before: Math.max(1, Math.floor(before)),
    limit: LIMITS.messagePage + 1,
  });
  return {
    messages: page
      .slice(0, LIMITS.messagePage)
      .reverse()
      .map((m) => toChat(m, user.id)),
    hasOlder: page.length > LIMITS.messagePage,
  };
}

/** New messages since `after`, plus the current status (the page polls this). */
export async function pollConversation(
  id: string,
  after: number,
): Promise<{ messages: ChatMessage[]; status: ConversationStatus }> {
  const { client, user, row } = await load(id);
  const page = await listMessages(client, row.id, {
    after: Math.max(0, Math.floor(after)),
    limit: 100,
  });
  return {
    messages: page.reverse().map((m) => toChat(m, user.id)),
    status: row.status,
  };
}

export async function sendMessage(
  id: string,
  body: string,
): Promise<ChatMessage> {
  const { client, user, row } = await load(id);
  const text = messageSchema.parse(body);
  const saved = await insertMessage(client, row.id, text);
  await markRead(client, row, user.id);
  await recordChatCardEvent(row.cardId, "message_sent");
  return toChat(saved, user.id);
}

async function markRead(
  client: Awaited<ReturnType<typeof getAuthenticatedDb>>["client"],
  row: ConversationRow,
  me: string,
) {
  const now = new Date().toISOString();
  await updateConversation(
    client,
    row.id,
    row.ownerId === me
      ? { owner_last_read_at: now }
      : { recipient_last_read_at: now },
  ).catch(() => undefined);
}

export async function markConversationRead(id: string): Promise<void> {
  const { client, user, row } = await load(id);
  await markRead(client, row, user.id);
}

export type ConversationAction =
  | "accept"
  | "decline"
  | "close"
  | "leave"
  | "block";

/**
 * Lifecycle changes. The database trigger is the authority (it knows who is the owner and
 * refuses anything else); this maps each button to the one change it means.
 */
export async function changeConversation(
  id: string,
  action: ConversationAction,
): Promise<void> {
  const { client, row, role } = await load(id);
  const ownerOnly =
    action === "accept" || action === "decline" || action === "close";
  if (ownerOnly && role !== "owner") throw new ChatUnavailableError();
  if (action === "leave" && role !== "recipient")
    throw new ChatUnavailableError();
  if (action === "block") {
    await insertBlock(
      client,
      role === "owner" ? row.recipientId : row.ownerId,
      row.id,
    );
    if (row.status === "requested" || row.status === "active")
      await updateConversation(client, row.id, {
        status: "closed",
        close_reason: "blocked",
      });
    await recordChatCardEvent(row.cardId, "conversation_closed");
    return;
  }
  if (action === "accept") {
    await updateConversation(client, row.id, { status: "active" });
    await recordChatCardEvent(row.cardId, "conversation_accepted");
  } else if (action === "decline") {
    await updateConversation(client, row.id, { status: "declined" });
    await recordChatCardEvent(row.cardId, "conversation_declined");
  } else {
    if (row.status !== "requested" && row.status !== "active")
      throw new ChatConflictError("already closed");
    await updateConversation(client, row.id, {
      status: "closed",
      close_reason: action === "leave" ? "left" : "closed",
    });
    await recordChatCardEvent(row.cardId, "conversation_closed");
  }
}

const reportSchema = z.object({
  reason: z.enum(REPORT_REASONS),
  details: z
    .string()
    .nullish()
    .transform((s) => (s ?? "").trim())
    .pipe(z.string().max(LIMITS.reportDetails))
    .transform((s) => (s === "" ? null : s)),
  messageId: z.number().int().positive().nullish().default(null),
});

/** Files a report about the conversation (or one message in it). No details reach the other person. */
export async function reportConversation(
  id: string,
  raw: unknown,
): Promise<void> {
  const { client, row } = await load(id);
  const input = reportSchema.parse(raw);
  await insertReport(client, {
    conversationId: row.id,
    messageId: input.messageId,
    reason: input.reason,
    details: input.details,
  });
}
