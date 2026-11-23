import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ChatConflictError,
  ChatUnavailableError,
  findConversation,
  findOwnChatCard,
  getPublicChatCard,
  insertBlock,
  insertChatCard,
  insertCodeBatch,
  insertMessage,
  insertReport,
  listCodes,
  listConversations,
  listMessages,
  listOwnChatCards,
  redeemChatCode,
  requestConversation,
  revokeCodes,
  setChatCardStatus,
  updateConversation,
} from "@/lib/db/queries/chatcards";
import { ensureAccount } from "@/lib/db/queries/identity";
import { ProRequiredError } from "@/domains/billing/plans";
import { chatCardInputSchema } from "@/domains/chatcards/chat-card-schema";
import { issueCodes } from "@/domains/chatcards/activation-codes";
import { folioneDbOptions, type FolioneClient } from "../../src/lib/db/schema";
import { localPsql, setLocalPro } from "../helpers/local-psql";

/**
 * LOCAL Supabase only (run by `pnpm validate`): ChatCards against real Postgres + PostgREST and
 * real Auth, through the app's own query modules. Three throwaway accounts: an owner (made PRO
 * here, then lapsed), a Free reader, and a Free outsider.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const owner = {
  email: process.env.FOLIOONE_CHAT_OWNER_EMAIL!,
  password: process.env.FOLIOONE_CHAT_OWNER_PASSWORD!,
};
const reader = {
  email: process.env.FOLIOONE_CHAT_READER_EMAIL!,
  password: process.env.FOLIOONE_CHAT_READER_PASSWORD!,
};
const other = {
  email: process.env.FOLIOONE_CHAT_OTHER_EMAIL!,
  password: process.env.FOLIOONE_CHAT_OTHER_PASSWORD!,
};
const ready = Boolean(
  url &&
    anonKey &&
    owner.email &&
    reader.email &&
    other.email &&
    process.env.FOLIOONE_LOCAL_DB_CONTAINER,
);
const options = {
  db: folioneDbOptions,
  auth: { persistSession: false, autoRefreshToken: false },
};

async function session(who: { email: string; password: string }) {
  const client: FolioneClient = createClient(url, anonKey, options);
  const { data, error } = await client.auth.signInWithPassword(who);
  if (error || !data.user) throw new Error(`sign-in failed for ${who.email}`);
  await ensureAccount(client, data.user.id);
  return { client, id: data.user.id };
}

const values = (over: Record<string, unknown> = {}) =>
  chatCardInputSchema.parse({
    title: "Ask the Author",
    hostName: "J. Writer",
    accessPolicy: "verified",
    autoAccept: false,
    ...over,
  });

describe.skipIf(!ready)("ChatCards on the local stack", () => {
  let o: Awaited<ReturnType<typeof session>>;
  let r: Awaited<ReturnType<typeof session>>;
  let x: Awaited<ReturnType<typeof session>>;
  const anon: FolioneClient = createClient(url, anonKey, options);
  let cardId = "";
  let publicId = "";
  const codes = issueCodes(4);
  const hash = (i: number) => codes[i]!.hash;
  let conversationId = "";

  beforeAll(async () => {
    [o, r, x] = await Promise.all([
      session(owner),
      session(reader),
      session(other),
    ]);
    setLocalPro(owner.email, null);
  });

  it("a Free owner cannot create a ChatCard, even calling the API directly", async () => {
    await expect(insertChatCard(o.client, values())).rejects.toBeInstanceOf(
      ProRequiredError,
    );
    const { error } = await o.client
      .from("chat_cards")
      .insert({ title: "x", host_name: "y" });
    expect(error?.code).toBe("42501");
  });

  it("a PRO owner creates and publishes; nothing is visible before publishing", async () => {
    setLocalPro(owner.email, "30 days");
    const card = await insertChatCard(o.client, values());
    cardId = card.id;
    publicId = card.publicId;
    expect(card.status).toBe("draft");
    expect(await getPublicChatCard(anon, publicId)).toBeNull();
    expect(await listOwnChatCards(r.client, o.id)).toEqual([]);
    await setChatCardStatus(o.client, cardId, "active", null);
    const pub = await getPublicChatCard(anon, publicId);
    expect(pub).toMatchObject({
      title: "Ask the Author",
      status: "active",
      ownerProActive: true,
      isOwner: false,
    });
    expect(await getPublicChatCard(o.client, publicId)).toMatchObject({
      isOwner: true,
    });
  });

  it("cards cannot be listed or traced to their owner", async () => {
    const list = await anon.from("chat_card_public").select("public_id,title");
    expect(list.data ?? []).toEqual([]);
    const owners = await anon.from("chat_card_public").select("account_id");
    expect(owners.error).not.toBeNull();
    const asOther = await x.client.from("chat_card_public").select("public_id");
    expect(asOther.data ?? []).toEqual([]);
    expect(await getPublicChatCard(anon, "f".repeat(32))).toBeNull();
  });

  it("codes are stored as hashes the API can never read", async () => {
    await insertCodeBatch(o.client, {
      cardId,
      label: "Print run",
      maxRedemptions: 1,
      expiresAt: null,
      codes: codes.map(({ hash, hint }) => ({ hash, hint })),
    });
    const own = await listCodes(o.client, cardId);
    expect(own.codes).toHaveLength(4);
    const hashRead = await o.client.from("chat_card_codes").select("code_hash");
    expect(hashRead.error).not.toBeNull();
    const asReader = await listCodes(r.client, cardId);
    expect(asReader.codes).toEqual([]);
    // A Free outsider cannot add codes to someone's card.
    const forged = await x.client
      .from("chat_card_code_batches")
      .insert({ card_id: cardId, label: "x", code_count: 1 });
    expect(forged.error).not.toBeNull();
  });

  it("a verified card needs a redeemed code before a conversation", async () => {
    await expect(
      requestConversation(r.client, { publicId, name: "Ada", message: "Hi" }),
    ).rejects.toBeInstanceOf(ChatUnavailableError);
    expect(await redeemChatCode(r.client, publicId, "0".repeat(64))).toBe(
      "invalid",
    );
    expect(await redeemChatCode(r.client, publicId, hash(0))).toBe("redeemed");
    // Again by the same person: still fine (idempotent), and the code is now used.
    expect(await redeemChatCode(r.client, publicId, hash(0))).toBe("redeemed");
    expect(await redeemChatCode(x.client, publicId, hash(0))).toBe("invalid");
    // Owner cannot redeem their own card.
    expect(await redeemChatCode(o.client, publicId, hash(1))).toBe(
      "unavailable",
    );
  });

  it("a redemption cannot be inserted around the function", async () => {
    const own = await listCodes(o.client, cardId);
    const { error } = await x.client.from("chat_card_redemptions").insert({
      code_id: own.codes[1]!.id,
      card_id: cardId,
      recipient_id: x.id,
      slot: 1,
    });
    expect(error).not.toBeNull();
  });

  it("two people racing for one code: exactly one wins", async () => {
    const [a, b] = await Promise.all([
      redeemChatCode(r.client, publicId, hash(1)),
      redeemChatCode(x.client, publicId, hash(1)),
    ]);
    expect([a, b].sort()).toEqual(["invalid", "redeemed"]);
    const own = await listCodes(o.client, cardId);
    expect(
      own.redemptions.filter(
        (d) =>
          d.codeId === own.codes.find((c) => c.hint === codes[1]!.hint)!.id,
      ),
    ).toHaveLength(1);
  });

  it("revoked and expired codes fail; history is kept", async () => {
    const own = await listCodes(o.client, cardId);
    const third = own.codes.find((c) => c.hint === codes[2]!.hint)!;
    expect(await revokeCodes(o.client, cardId, [third.id])).toBe(1);
    expect(await redeemChatCode(x.client, publicId, hash(2))).toBe("invalid");
    const expired = issueCodes(1)[0]!;
    await insertCodeBatch(o.client, {
      cardId,
      label: "Old",
      maxRedemptions: 1,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      codes: [{ hash: expired.hash, hint: expired.hint }],
    });
    expect(await redeemChatCode(x.client, publicId, expired.hash)).toBe(
      "invalid",
    );
    expect(
      (await listCodes(o.client, cardId)).redemptions.length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("approval: the request waits; only the owner can accept; outsiders see nothing", async () => {
    conversationId = await requestConversation(r.client, {
      publicId,
      name: "Ada Reader",
      message: "Loved the book.",
    });
    const row = await findConversation(r.client, conversationId);
    expect(row).toMatchObject({
      status: "requested",
      recipientName: "Ada Reader",
      hasEntitlement: true,
    });
    await expect(
      insertMessage(r.client, conversationId, "Second!"),
    ).rejects.toBeInstanceOf(ChatConflictError);
    await expect(
      updateConversation(r.client, conversationId, { status: "active" }),
    ).rejects.toBeInstanceOf(ChatConflictError);
    expect(await findConversation(x.client, conversationId)).toBeNull();
    expect(await listMessages(x.client, conversationId, { limit: 50 })).toEqual(
      [],
    );
    await expect(
      insertMessage(x.client, conversationId, "intruder"),
    ).rejects.toBeInstanceOf(ChatUnavailableError);
    await updateConversation(o.client, conversationId, { status: "active" });
    // Per-recipient limit (1) holds.
    await expect(
      requestConversation(r.client, {
        publicId,
        name: "Ada",
        message: "again",
      }),
    ).rejects.toBeInstanceOf(ChatConflictError);
  });

  it("participants exchange ordered, server-timestamped messages", async () => {
    await insertMessage(o.client, conversationId, "Thank you!");
    await insertMessage(
      r.client,
      conversationId,
      "A question about chapter 3.",
    );
    const asReader = (
      await listMessages(r.client, conversationId, { limit: 50 })
    ).reverse();
    expect(asReader.map((m) => m.body)).toEqual([
      "Loved the book.",
      "Thank you!",
      "A question about chapter 3.",
    ]);
    expect(asReader[1]!.senderId).toBe(o.id);
    const ids = asReader.map((m) => m.id);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
    // The sender cannot be forged.
    const forged = await r.client
      .from("conversation_messages")
      .insert({ conversation_id: conversationId, body: "x", sender_id: o.id });
    expect(forged.error).not.toBeNull();
  });

  it("reports go to the operator, not to the other participant", async () => {
    await insertReport(r.client, {
      conversationId,
      messageId: null,
      reason: "other",
      details: "test",
    });
    const seenByOwner = await o.client
      .from("conversation_reports")
      .select("id");
    expect(seenByOwner.data ?? []).toEqual([]);
  });

  it("a closed conversation rejects new messages", async () => {
    await updateConversation(o.client, conversationId, {
      status: "closed",
      close_reason: "closed",
    });
    await expect(
      insertMessage(r.client, conversationId, "still there?"),
    ).rejects.toBeInstanceOf(ChatUnavailableError);
    await expect(
      updateConversation(o.client, conversationId, { status: "active" }),
    ).rejects.toBeInstanceOf(ChatConflictError);
  });

  it("open card: starts at once; a block stops new conversations; paused cards take none", async () => {
    const open = await insertChatCard(
      o.client,
      values({
        title: "Office hours",
        accessPolicy: "open",
        autoAccept: true,
        maxConversationsPerRecipient: 5,
      }),
    );
    await setChatCardStatus(o.client, open.id, "active", null);
    const id = await requestConversation(r.client, {
      publicId: open.publicId,
      name: "Ada",
      message: "Hello",
    });
    expect((await findConversation(r.client, id))?.status).toBe("active");
    await insertBlock(o.client, r.id, id);
    await updateConversation(o.client, id, {
      status: "closed",
      close_reason: "blocked",
    });
    await expect(
      requestConversation(r.client, {
        publicId: open.publicId,
        name: "Ada",
        message: "Hi again",
      }),
    ).rejects.toBeInstanceOf(ChatUnavailableError);
    // The outsider is not blocked, but a paused card takes nobody.
    await setChatCardStatus(o.client, open.id, "paused", null);
    await expect(
      requestConversation(x.client, {
        publicId: open.publicId,
        name: "Bo",
        message: "Hi",
      }),
    ).rejects.toBeInstanceOf(ChatUnavailableError);
    await setChatCardStatus(o.client, open.id, "active", null);
    const xid = await requestConversation(x.client, {
      publicId: open.publicId,
      name: "Bo",
      message: "Hi",
    });
    expect(
      (await listConversations(o.client, o.id, "owner")).some(
        (c) => c.id === xid,
      ),
    ).toBe(true);
    expect(
      (await listConversations(r.client, r.id, "recipient")).some(
        (c) => c.id === xid,
      ),
    ).toBe(false);
  });

  it("an expired invitation takes no new conversations", async () => {
    const card = await insertChatCard(
      o.client,
      values({ title: "Event", accessPolicy: "open", autoAccept: true }),
    );
    await setChatCardStatus(o.client, card.id, "active", null);
    localPsql(
      `UPDATE folioone.chat_card_public SET expires_at = now() - interval '1 minute' WHERE card_id = '${card.id}';`,
    );
    await expect(
      requestConversation(x.client, {
        publicId: card.publicId,
        name: "Bo",
        message: "Hi",
      }),
    ).rejects.toBeInstanceOf(ChatUnavailableError);
  });

  it("redemption attempts are rate-limited per account", async () => {
    const outcomes: string[] = [];
    for (let i = 0; i < 12; i++)
      outcomes.push(await redeemChatCode(x.client, publicId, "1".repeat(64)));
    expect(outcomes.at(-1)).toBe("rate_limited");
    // Even a valid code is refused while limited.
    expect(await redeemChatCode(x.client, publicId, hash(3))).toBe(
      "rate_limited",
    );
  });

  it("when the owner's PRO lapses: nothing new starts, nothing is deleted, history stays readable", async () => {
    const open = (await listOwnChatCards(o.client, o.id)).find(
      (c) => c.title === "Office hours",
    )!;
    // Time passes: the paid period ends (the mirror on the snapshot carries the end date).
    setLocalPro(owner.email, "-1 minute");
    localPsql(
      `UPDATE folioone.chat_card_public SET owner_pro_until = now() - interval '1 minute' WHERE account_id = '${o.id}';`,
    );
    const xid = (await listConversations(x.client, x.id, "recipient"))[0]!.id;
    await expect(
      insertMessage(x.client, xid, "anyone there?"),
    ).rejects.toBeInstanceOf(ChatUnavailableError);
    await expect(insertMessage(o.client, xid, "reply")).rejects.toBeInstanceOf(
      ChatUnavailableError,
    );
    expect((await getPublicChatCard(anon, open.publicId))?.ownerProActive).toBe(
      false,
    );
    expect(
      (await listMessages(x.client, xid, { limit: 50 })).length,
    ).toBeGreaterThan(0);
    expect(
      (await listMessages(o.client, conversationId, { limit: 50 })).length,
    ).toBe(3);
    await expect(insertChatCard(o.client, values())).rejects.toBeInstanceOf(
      ProRequiredError,
    );
    expect(await findOwnChatCard(o.client, o.id, cardId)).not.toBeNull();
  });
});
