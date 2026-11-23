// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  availabilityOf,
  chatCardInputSchema,
  codeBatchSchema,
  effectiveStatus,
  LIMITS,
  messageSchema,
  recipientNameSchema,
  type PublicChatCard,
} from "@/domains/chatcards/chat-card-schema";
import {
  CODE_ALPHABET,
  codeHint,
  generateCode,
  hashCode,
  issueCodes,
  normalizeCode,
} from "@/domains/chatcards/activation-codes";
import { CHAT_CARD_EVENTS } from "@/domains/chatcards/chat-card-events";
import { codesCsv } from "@/app/chatcards/issued-codes";
import { returnPathAfterAuth } from "@/lib/site-url";

const base = {
  title: "Ask the Author",
  hostName: "J. Writer",
  accessPolicy: "verified" as const,
  autoAccept: true,
};

describe("ChatCard input", () => {
  it("trims, empties optional fields and stores an expiry as the end of that day", () => {
    const v = chatCardInputSchema.parse({
      ...base,
      title: "  Ask the Author  ",
      description: "   ",
      expiresOn: "2027-03-01",
    });
    expect(v.title).toBe("Ask the Author");
    expect(v.description).toBeNull();
    expect(v.expiresOn).toBe("2027-03-01T23:59:59.000Z");
    expect(v.maxConversationsPerRecipient).toBe(1);
  });

  it("never lets an approval-required card accept automatically", () => {
    const v = chatCardInputSchema.parse({
      ...base,
      accessPolicy: "approval",
      autoAccept: true,
    });
    expect(v.autoAccept).toBe(false);
  });

  it("rejects a missing title or host name, a non-https cover and out-of-range limits", () => {
    expect(chatCardInputSchema.safeParse({ ...base, title: " " }).success).toBe(
      false,
    );
    expect(
      chatCardInputSchema.safeParse({ ...base, hostName: "" }).success,
    ).toBe(false);
    expect(
      chatCardInputSchema.safeParse({
        ...base,
        coverImageUrl: "http://x.test/a.png",
      }).success,
    ).toBe(false);
    expect(
      chatCardInputSchema.safeParse({
        ...base,
        coverImageUrl: "javascript:alert(1)",
      }).success,
    ).toBe(false);
    expect(
      chatCardInputSchema.safeParse({
        ...base,
        maxConversationsPerRecipient: 21,
      }).success,
    ).toBe(false);
    expect(
      chatCardInputSchema.safeParse({ ...base, personaId: "not-a-uuid" })
        .success,
    ).toBe(false);
  });

  it("bounds messages, names and code batches", () => {
    expect(messageSchema.safeParse("  ").success).toBe(false);
    expect(
      messageSchema.safeParse("x".repeat(LIMITS.message + 1)).success,
    ).toBe(false);
    expect(messageSchema.parse("  hello ")).toBe("hello");
    expect(recipientNameSchema.parse("  Ada   Reader ")).toBe("Ada Reader");
    expect(
      codeBatchSchema.safeParse({ label: "Run", count: 501 }).success,
    ).toBe(false);
    expect(codeBatchSchema.parse({ label: "Run", count: 10 }).usesPerCode).toBe(
      1,
    );
  });
});

describe("status and availability", () => {
  const card = (over: Partial<PublicChatCard> = {}): PublicChatCard => ({
    cardId: "c",
    publicId: "p",
    status: "active",
    title: "t",
    description: null,
    hostName: "h",
    welcomeMessage: null,
    coverImageUrl: null,
    linkPath: null,
    accessPolicy: "open",
    autoAccept: true,
    acceptingNew: true,
    allowFollowUps: true,
    maxConversationsPerRecipient: 1,
    expiresAt: null,
    ownerProActive: true,
    isOwner: false,
    ...over,
  });

  it("shows a card past its end date as Expired", () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(effectiveStatus({ status: "active", expiresAt: past })).toBe(
      "expired",
    );
    expect(effectiveStatus({ status: "draft", expiresAt: past })).toBe("draft");
    expect(effectiveStatus({ status: "active", expiresAt: null })).toBe(
      "active",
    );
  });

  it("reports why a public card cannot take a conversation", () => {
    expect(availabilityOf(null)).toBe("unavailable");
    expect(availabilityOf(card())).toBe("open");
    expect(availabilityOf(card({ status: "paused" }))).toBe("paused");
    expect(availabilityOf(card({ acceptingNew: false }))).toBe("closed");
    expect(availabilityOf(card({ status: "archived" }))).toBe("unavailable");
    // The owner's PRO has lapsed: unavailable, whatever the recipient's plan.
    expect(availabilityOf(card({ ownerProActive: false }))).toBe("unavailable");
    expect(
      availabilityOf(
        card({ expiresAt: new Date(Date.now() - 1).toISOString() }),
      ),
    ).toBe("expired");
  });
});

describe("activation codes", () => {
  it("are 16 unambiguous characters in four groups with 80 random bits", () => {
    const code = generateCode();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
    expect(CODE_ALPHABET).toHaveLength(32);
    expect(CODE_ALPHABET).not.toMatch(/[ILOU]/);
  });

  it("issues a batch of distinct codes, storing only a hash and a four-character hint", () => {
    const batch = issueCodes(500);
    expect(new Set(batch.map((c) => c.code)).size).toBe(500);
    for (const c of batch.slice(0, 20)) {
      const n = normalizeCode(c.code)!;
      expect(c.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(c.hash).toBe(hashCode(n));
      expect(c.hash).not.toContain(n.toLowerCase());
      expect(c.hint).toBe(n.slice(-4));
      expect(c.hint).toBe(codeHint(n));
    }
  });

  it("accepts what people type (case, spaces, dashes, O/0 and I/L/1) and rejects the rest", () => {
    expect(normalizeCode("k7qf 9xmb-2tra—we4h")).toBe("K7QF9XMB2TRAWE4H");
    expect(normalizeCode("O0IL-1111-1111-1111")).toBe("0011111111111111");
    expect(normalizeCode("SHORT")).toBeNull();
    expect(normalizeCode("UUUU-UUUU-UUUU-UUUU")).toBeNull();
    expect(normalizeCode("")).toBeNull();
  });

  it("downloads as CSV with every value escaped", () => {
    const csv = codesCsv(
      {
        batchId: "b",
        label: 'Run "1", hardback',
        codes: ["AAAA-BBBB-CCCC-DDDD"],
      },
      "Ask, the Author",
      "https://folioone.test/chat/abc",
    );
    expect(csv).toBe(
      'code,batch,card,link\r\nAAAA-BBBB-CCCC-DDDD,"Run ""1"", hardback","Ask, the Author",https://folioone.test/chat/abc\r\n',
    );
  });
});

describe("returning to a ChatCard after sign-in", () => {
  it("allows only a ChatCard page or Messages", () => {
    expect(returnPathAfterAuth(`/chat/${"a".repeat(32)}`)).toBe(
      `/chat/${"a".repeat(32)}`,
    );
    expect(returnPathAfterAuth("/messages")).toBe("/messages");
    expect(
      returnPathAfterAuth("/messages/0b0e8c2a-6a4f-4b7c-9d3e-1f2a3b4c5d6e"),
    ).not.toBeNull();
    for (const bad of [
      "//evil.test",
      "https://evil.test",
      "/profile",
      "/chat/x",
      null,
      3,
    ])
      expect(returnPathAfterAuth(bad)).toBeNull();
  });
});

describe("kept in step with the SQL", () => {
  const sql = readFileSync(
    "docs/sql/milestone-chatcards/002-chatcards.sql",
    "utf8",
  );
  const insights = readFileSync(
    "docs/sql/milestone-chatcards/003-chatcard-insights.sql",
    "utf8",
  );

  it("uses the same limits as the CHECK constraints", () => {
    expect(sql).toContain(
      `char_length(btrim(title)) BETWEEN 1 AND ${LIMITS.title}`,
    );
    expect(sql).toContain(
      `char_length(btrim(host_name)) BETWEEN 1 AND ${LIMITS.hostName}`,
    );
    expect(sql).toContain(
      `char_length(btrim(body)) BETWEEN 1 AND ${LIMITS.message}`,
    );
    expect(sql).toContain(`code_count BETWEEN 1 AND ${LIMITS.batchSize}`);
    expect(sql).toContain(
      `max_redemptions BETWEEN 1 AND ${LIMITS.usesPerCode}`,
    );
    expect(sql).toContain(
      `max_conversations_per_recipient BETWEEN 1 AND ${LIMITS.maxPerRecipient}`,
    );
    expect(sql).toContain(
      `char_length(btrim(recipient_name)) BETWEEN 1 AND ${LIMITS.recipientName}`,
    );
  });

  it("allows exactly the ChatCard events the app records", () => {
    const check = insights.match(
      /insight_events_chat_card_events_check CHECK \(([\s\S]*?)\)\)\);/,
    )![1]!;
    const listed = [...check.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(listed).toEqual([...CHAT_CARD_EVENTS].sort());
  });
});
