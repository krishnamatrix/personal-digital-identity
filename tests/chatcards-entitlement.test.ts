// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PRO is decided on the server from the account's own plan row, for every owner action, and
 * never for recipients. The data layer is mocked: these tests watch which queries run.
 */
const db = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    getAuthenticatedDb: fn(),
    getAnonymousDb: fn(),
    findPlan: fn(),
    ensureAccount: fn(),
    findViewerProfile: fn(),
    findOwnSnapshot: fn(),
    findOwnPublishedCard: fn(),
    listOwnChatCards: fn(),
    findOwnChatCard: fn(),
    insertChatCard: fn(),
    updateChatCard: fn(),
    setChatCardStatus: fn(),
    refreshChatCardEntitlement: fn(),
    insertCodeBatch: fn(),
    listCodes: fn(),
    revokeCodes: fn(),
    listOwnerConversationStats: fn(),
    listChatCardEvents: fn(),
    getPublicChatCard: fn(),
    redeemChatCode: fn(),
    hasOwnRedemption: fn(),
    requestConversation: fn(),
    listConversations: fn(),
    listCardLabels: fn(),
    findConversation: fn(),
    listMessages: fn(),
    insertMessage: fn(),
    updateConversation: fn(),
    insertBlock: fn(),
    insertReport: fn(),
    insertInsightEvent: fn(),
    activatePro: fn(),
  };
});

vi.mock("@/lib/db/query", async () => {
  const real = await vi.importActual<
    typeof import("@/lib/db/queries/chatcards")
  >("@/lib/db/queries/chatcards");
  return {
    ...db,
    ChatUnavailableError: real.ChatUnavailableError,
    ChatConflictError: real.ChatConflictError,
    ChatRateLimitedError: real.ChatRateLimitedError,
    ChatPersistenceError: real.ChatPersistenceError,
    ChatCardsNotInstalledError: real.ChatCardsNotInstalledError,
  };
});
vi.mock("@/domains/personas/persona-runtime", () => ({
  getPersonaService: () => ({
    list: async () => ({
      personas: [
        { id: "11111111-1111-4111-8111-111111111111", name: "Author" },
      ],
    }),
  }),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  changeChatCardStatus,
  createChatCard,
  generateActivationCodes,
  getActivationCodes,
  getChatCardsHome,
  revokeActivationCodes,
  saveChatCard,
} from "@/domains/chatcards/chat-card-service";
import {
  redeemActivationCode,
  sendMessage,
  startConversation,
} from "@/domains/chatcards/conversation-service";
import { ChatCardsProRequiredError } from "@/domains/chatcards/entitlement";
import {
  createChatCardAction,
  generateCodesAction,
} from "@/app/chatcards/actions";
import { startConversationAction } from "@/app/chat/actions";

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CARD_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PUBLIC_ID = "0123456789abcdef0123456789abcdef";
const future = new Date(Date.now() + 86_400_000);
const input = {
  title: "Ask the Author",
  hostName: "J. Writer",
  accessPolicy: "verified",
  autoAccept: false,
};
const card = {
  id: CARD_ID,
  publicId: PUBLIC_ID,
  status: "active",
  title: "Ask the Author",
  description: null,
  hostName: "J. Writer",
  welcomeMessage: null,
  coverImageUrl: null,
  personaId: null,
  linkKind: null,
  accessPolicy: "verified",
  autoAccept: false,
  acceptingNew: true,
  allowFollowUps: true,
  maxActiveConversations: null,
  maxConversationsPerRecipient: 1,
  expiresAt: null,
  publishedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
const publicCard = {
  cardId: CARD_ID,
  publicId: PUBLIC_ID,
  status: "active",
  title: "Ask the Author",
  description: null,
  hostName: "J. Writer",
  welcomeMessage: null,
  coverImageUrl: null,
  linkPath: null,
  accessPolicy: "open",
  autoAccept: false,
  acceptingNew: true,
  allowFollowUps: true,
  maxConversationsPerRecipient: 1,
  expiresAt: null,
  ownerProActive: true,
  isOwner: false,
};

function signedIn(plan: "free" | "pro" | "expired") {
  db.getAuthenticatedDb.mockResolvedValue({ client: {}, user: { id: OWNER } });
  db.findPlan.mockResolvedValue(
    plan === "free"
      ? null
      : {
          plan: "pro",
          proUntil: plan === "pro" ? future : new Date(Date.now() - 1000),
        },
  );
}

beforeEach(() => {
  for (const f of Object.values(db)) f.mockReset();
  db.getAnonymousDb.mockResolvedValue({});
  db.insertInsightEvent.mockResolvedValue(true);
  db.findOwnSnapshot.mockResolvedValue(null);
  db.findOwnPublishedCard.mockResolvedValue(null);
  db.findViewerProfile.mockResolvedValue(null);
});

describe("owner actions need active PRO, checked on the server", () => {
  const ownerCalls = [
    ["create", () => createChatCard(input)],
    ["save", () => saveChatCard(CARD_ID, input)],
    ["publish", () => changeChatCardStatus(CARD_ID, "publish")],
    ["pause", () => changeChatCardStatus(CARD_ID, "pause")],
    [
      "generate codes",
      () => generateActivationCodes(CARD_ID, { label: "Run", count: 5 }),
    ],
    ["list codes", () => getActivationCodes(CARD_ID)],
    ["revoke codes", () => revokeActivationCodes(CARD_ID, {})],
  ] as const;

  for (const plan of ["free", "expired"] as const)
    for (const [name, call] of ownerCalls)
      it(`${plan} account: ${name} is refused before any ChatCard query`, async () => {
        signedIn(plan);
        await expect(call()).rejects.toBeInstanceOf(ChatCardsProRequiredError);
        for (const q of [
          db.insertChatCard,
          db.updateChatCard,
          db.setChatCardStatus,
          db.insertCodeBatch,
          db.listCodes,
          db.revokeCodes,
          db.findOwnChatCard,
        ])
          expect(q).not.toHaveBeenCalled();
      });

  it("a Free account gets the upgrade screen, and no ChatCard is listed", async () => {
    signedIn("free");
    await expect(getChatCardsHome()).resolves.toEqual({ entitled: false });
    expect(db.listOwnChatCards).not.toHaveBeenCalled();
  });

  it("the server action reports proRequired, whatever the client claims", async () => {
    signedIn("free");
    const r = await createChatCardAction({
      ...input,
      plan: "pro",
      isPro: true,
    });
    expect(r).toMatchObject({
      ok: false,
      proRequired: true,
      message: "ChatCards are part of Folioone PRO.",
    });
    const codes = await generateCodesAction(CARD_ID, { label: "x", count: 1 });
    expect(codes).toMatchObject({ ok: false, proRequired: true });
  });

  it("a PRO account creates cards and generates codes; only hashes reach the database", async () => {
    signedIn("pro");
    db.insertChatCard.mockResolvedValue(card);
    await expect(createChatCard(input)).resolves.toMatchObject({ id: CARD_ID });
    db.findOwnChatCard.mockResolvedValue(card);
    db.insertCodeBatch.mockResolvedValue("batch-1");
    const issued = await generateActivationCodes(CARD_ID, {
      label: "Run",
      count: 3,
    });
    expect(issued.codes).toHaveLength(3);
    const sent = db.insertCodeBatch.mock.calls[0]![1] as { codes: object[] };
    expect(JSON.stringify(sent)).not.toContain(issued.codes[0]!);
    for (const c of sent.codes)
      expect(Object.keys(c).sort()).toEqual(["hash", "hint"]);
  });

  it("a Persona that is not the owner's own is dropped", async () => {
    signedIn("pro");
    db.insertChatCard.mockResolvedValue(card);
    await createChatCard({
      ...input,
      personaId: "22222222-2222-4222-8222-222222222222",
    });
    expect(db.insertChatCard.mock.calls[0]![1]).toMatchObject({
      personaId: null,
    });
    await createChatCard({
      ...input,
      personaId: "11111111-1111-4111-8111-111111111111",
    });
    expect(db.insertChatCard.mock.calls[1]![1]).toMatchObject({
      personaId: "11111111-1111-4111-8111-111111111111",
    });
  });
});

describe("recipients do not need PRO", () => {
  it("a Free account can redeem a code and start a conversation (no plan lookup at all)", async () => {
    signedIn("free");
    db.getPublicChatCard.mockResolvedValue({
      ...publicCard,
      accessPolicy: "verified",
    });
    db.redeemChatCode.mockResolvedValue("redeemed");
    await expect(
      redeemActivationCode(PUBLIC_ID, "k7qf-9xmb-2tra-we4h"),
    ).resolves.toEqual({ ok: true });
    // Only the hash is sent.
    const [, , hash] = db.redeemChatCode.mock.calls[0]!;
    expect(hash).toMatch(/^[0-9a-f]{64}$/);

    db.getPublicChatCard.mockResolvedValue(publicCard);
    db.requestConversation.mockResolvedValue("conv-1");
    const r = await startConversationAction(PUBLIC_ID, {
      name: "Ada",
      message: "Hello!",
    });
    expect(r).toMatchObject({
      ok: true,
      data: { id: "conv-1", status: "requested" },
    });
    expect(db.findPlan).not.toHaveBeenCalled();
  });

  it("a malformed code still counts as an attempt and gets the generic answer", async () => {
    signedIn("free");
    db.getPublicChatCard.mockResolvedValue({
      ...publicCard,
      accessPolicy: "verified",
    });
    db.redeemChatCode.mockResolvedValue("invalid");
    await expect(redeemActivationCode(PUBLIC_ID, "nope")).resolves.toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(db.redeemChatCode).toHaveBeenCalledWith(
      {},
      PUBLIC_ID,
      "0".repeat(64),
    );
  });

  it("refuses to start a conversation on a paused, expired or lapsed card", async () => {
    signedIn("free");
    for (const over of [
      { status: "paused" },
      { expiresAt: new Date(Date.now() - 1000).toISOString() },
      { ownerProActive: false },
      { acceptingNew: false },
      { isOwner: true },
    ]) {
      db.getPublicChatCard.mockResolvedValue({ ...publicCard, ...over });
      await expect(
        startConversation(PUBLIC_ID, { name: "Ada", message: "Hi" }),
      ).rejects.toThrow("This conversation is not available.");
    }
    expect(db.requestConversation).not.toHaveBeenCalled();
  });
});

describe("analytics never carry message text or codes", () => {
  it("records message_sent with only the card id and the event name", async () => {
    signedIn("free");
    db.findConversation.mockResolvedValue({
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      cardId: CARD_ID,
      ownerId: "other",
      recipientId: OWNER,
      status: "active",
    });
    db.insertMessage.mockResolvedValue({
      id: 1,
      senderId: OWNER,
      body: "secret plans",
      createdAt: new Date().toISOString(),
    });
    db.updateConversation.mockResolvedValue({});
    await sendMessage("dddddddd-dddd-4ddd-8ddd-dddddddddddd", "secret plans");
    const rows = db.insertInsightEvent.mock.calls.map((c) => c[1]);
    expect(rows).toEqual([{ chat_card_id: CARD_ID, event: "message_sent" }]);
    expect(JSON.stringify(rows)).not.toContain("secret");
  });

  it("records a redemption attempt without the code", async () => {
    signedIn("free");
    db.getPublicChatCard.mockResolvedValue({
      ...publicCard,
      accessPolicy: "verified",
    });
    db.redeemChatCode.mockResolvedValue("redeemed");
    await redeemActivationCode(PUBLIC_ID, "K7QF-9XMB-2TRA-WE4H");
    const rows = db.insertInsightEvent.mock.calls.map((c) => c[1]);
    expect(rows.map((r) => r.event)).toEqual([
      "activation_code_attempted",
      "activation_code_redeemed",
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/K7QF|9XMB/i);
  });
});
