// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  ChatCardsNotInstalledError,
  ChatConflictError,
  ChatRateLimitedError,
  ChatUnavailableError,
  getPublicChatCard,
  listCodes,
  redeemChatCode,
  requestConversation,
} from "@/lib/db/queries/chatcards";
import { ProRequiredError } from "@/domains/billing/plans";
import type { FolioneClient } from "@/lib/db/schema";

/** Records every builder call; resolves to `result` (or per-table results). */
function fake(result: (table: string) => { data: unknown; error: unknown }) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const builder = (table: string): unknown =>
    new Proxy(
      {},
      {
        get(_t, method: string) {
          if (method === "then") {
            const r = result(table);
            return (ok: (v: unknown) => unknown) => Promise.resolve(r).then(ok);
          }
          return (...args: unknown[]) => {
            calls.push({ table, method, args });
            return builder(table);
          };
        },
      },
    );
  const client = {
    from: (table: string) => builder(table),
    rpc: (name: string, params: unknown) => {
      calls.push({ table: `rpc:${name}`, method: "rpc", args: [params] });
      return Promise.resolve(result(`rpc:${name}`));
    },
  } as unknown as FolioneClient;
  return { client, calls };
}

describe("ChatCard queries", () => {
  it("returns only allow-listed public fields, even if the database sent more", async () => {
    const { client } = fake(() => ({
      data: [
        {
          card_id: "c",
          public_id: "0123456789abcdef0123456789abcdef",
          status: "active",
          title: "Ask",
          description: null,
          host_name: "J",
          welcome_message: null,
          cover_image_url: null,
          link_path: null,
          access_policy: "open",
          auto_accept: true,
          accepting_new: true,
          allow_follow_ups: true,
          max_conversations_per_recipient: 1,
          expires_at: null,
          owner_pro_active: true,
          is_owner: false,
          published_at: new Date().toISOString(),
          // Never expected from the function; must not pass through if it ever appeared.
          account_id: "owner-uuid",
          contact_email: "owner@example.test",
          phone: "+100",
        },
      ],
      error: null,
    }));
    const card = await getPublicChatCard(
      client,
      "0123456789abcdef0123456789abcdef",
    );
    const json = JSON.stringify(card);
    expect(json).not.toMatch(/owner-uuid|owner@example|\+100/);
    expect(Object.keys(card!).sort()).toEqual(
      [
        "accessPolicy",
        "acceptingNew",
        "allowFollowUps",
        "autoAccept",
        "cardId",
        "coverImageUrl",
        "description",
        "expiresAt",
        "hostName",
        "isOwner",
        "linkPath",
        "maxConversationsPerRecipient",
        "ownerProActive",
        "publicId",
        "status",
        "title",
        "welcomeMessage",
      ].sort(),
    );
  });

  it("never selects a code hash when listing codes", async () => {
    const { client, calls } = fake(() => ({ data: [], error: null }));
    await listCodes(client, "card");
    const selects = calls
      .filter((c) => c.method === "select")
      .map((c) => String(c.args[0]));
    expect(selects).toHaveLength(3);
    for (const s of selects) {
      expect(s).not.toContain("code_hash");
      expect(s).not.toContain("*");
    }
  });

  it("maps database refusals to safe, generic errors", async () => {
    const cases: [string, unknown][] = [
      ["42501", ChatUnavailableError],
      ["P0002", ChatUnavailableError],
      ["PT429", ChatRateLimitedError],
      ["PT409", ChatConflictError],
      ["PT402", ProRequiredError],
      ["PGRST202", ChatCardsNotInstalledError],
    ];
    for (const [code, type] of cases) {
      const { client } = fake(() => ({
        data: null,
        error: { code, message: "detail" },
      }));
      await expect(
        requestConversation(client, { publicId: "p", name: "n", message: "m" }),
      ).rejects.toBeInstanceOf(type as never);
    }
  });

  it("passes through only the four redemption outcomes", async () => {
    for (const [sent, got] of [
      ["redeemed", "redeemed"],
      ["rate_limited", "rate_limited"],
      ["anything else", "invalid"],
    ]) {
      const { client } = fake(() => ({ data: sent, error: null }));
      await expect(redeemChatCode(client, "p", "h")).resolves.toBe(got);
    }
  });
});
