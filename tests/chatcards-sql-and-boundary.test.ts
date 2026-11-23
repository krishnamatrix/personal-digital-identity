// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static review of the ChatCards SQL (docs/sql/milestone-chatcards). It is never executed
 * here; `pnpm validate` applies it to the local stack and tests/hosted/chatcards.hosted.ts
 * proves the behaviour against real Postgres + PostgREST.
 */
const dir = "docs/sql/milestone-chatcards";
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const read = (f: string) => readFileSync(join(dir, f), "utf8");
/** SQL without comments. */
const code = (f: string) =>
  read(f)
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
const main = code("002-chatcards.sql");

const TABLES = [
  "chat_cards",
  "chat_card_public",
  "chat_card_code_batches",
  "chat_card_codes",
  "chat_card_redemptions",
  "chat_card_redeem_attempts",
  "conversations",
  "conversation_messages",
  "conversation_blocks",
  "conversation_reports",
];

describe("ChatCards SQL package", () => {
  it("is three ordered files, each with preflight, verification, rollback and a NOT EXECUTED status", () => {
    expect(files).toEqual([
      "001-chatcard-routes.sql",
      "002-chatcards.sql",
      "003-chatcard-insights.sql",
    ]);
    for (const f of files) {
      const s = read(f);
      expect(s).toContain("STATUS:        PREPARED - NOT EXECUTED");
      expect(s).toMatch(/preflight/i);
      expect(s).toMatch(/verification/i);
      expect(s).toMatch(/Rollback/);
      expect(s).toContain("session_user = 'postgres'");
      expect(code(f)).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;/);
    }
  });

  it("has no SECURITY DEFINER, no service_role grant, no custom role and no schema public", () => {
    for (const f of files) {
      const s = code(f);
      expect(s).not.toMatch(/SECURITY\s+DEFINER/i);
      expect(s).not.toMatch(/GRANT[^;]*\bservice_role\b/i);
      expect(s).not.toMatch(/CREATE\s+ROLE/i);
      expect(s).not.toMatch(/\bpublic\./);
      expect(s).not.toMatch(/BYPASSRLS|DISABLE ROW LEVEL SECURITY/i);
    }
    expect(main.match(/SECURITY INVOKER SET search_path = ''/g)!.length).toBe(
      10,
    );
  });

  it("creates ten tables and enables AND forces RLS on every one", () => {
    const created = [...main.matchAll(/CREATE TABLE folioone\.(\w+)/g)].map(
      (m) => m[1],
    );
    expect(created.sort()).toEqual([...TABLES].sort());
    const loop = main.match(/FOREACH t IN ARRAY ARRAY\[([\s\S]*?)\]/)![1]!;
    for (const t of TABLES) expect(loop).toContain(`'${t}'`);
    expect(main).toContain("ENABLE ROW LEVEL SECURITY");
    expect(main).toContain("FORCE ROW LEVEL SECURITY");
    expect(main).toContain(
      "REVOKE ALL PRIVILEGES ON TABLE folioone.%I FROM PUBLIC, anon, authenticated, service_role",
    );
  });

  it("requires PRO in the database for every owner write", () => {
    for (const policy of [
      "chat_cards_insert_pro",
      "chat_cards_update_pro",
      "chat_card_public_insert_pro",
      "chat_card_public_update_pro",
      "chat_card_code_batches_insert_pro",
      "chat_card_codes_insert_pro",
      "chat_card_codes_update_pro",
    ]) {
      const body = main
        .slice(main.indexOf(`CREATE POLICY ${policy}`))
        .split(";")[0]!;
      expect(body, policy).toContain("folioone.has_pro()");
    }
    // Accepting a request needs PRO too (in the lifecycle trigger).
    expect(main).toMatch(
      /'requested' AND NEW\.status = 'active' THEN\s+IF NOT folioone\.has_pro\(\)/,
    );
  });

  it("never lets any API role read a code hash or anon read the owner", () => {
    const codeGrant = main.match(
      /GRANT SELECT \(([^)]*)\)\s+ON TABLE folioone\.chat_card_codes TO authenticated/,
    )![1]!;
    expect(codeGrant).not.toContain("code_hash");
    const anonGrant = main.match(
      /GRANT SELECT \(([^)]*)\)\s+ON TABLE folioone\.chat_card_public TO anon/,
    )![1]!;
    expect(anonGrant).not.toContain("account_id");
    // Cards cannot be listed: anon sees a snapshot row only by the public id the function set.
    expect(main).toMatch(
      /chat_card_public_select_by_id[\s\S]*?current_setting\('folioone\.chat_card', true\)/,
    );
    // A code row is visible to a redeemer only for the hash they supplied.
    expect(main).toMatch(
      /code_hash = current_setting\('folioone\.code_hash', true\)/,
    );
    expect(main).not.toMatch(/GRANT[^;]*chat_card_codes[^;]*TO anon/);
  });

  it("makes redemption atomic, rate-limited and auditable", () => {
    expect(main).toContain(
      "CONSTRAINT chat_card_redemptions_code_slot_key UNIQUE (code_id, slot)",
    );
    expect(main).toContain(
      "CONSTRAINT chat_card_redemptions_code_recipient_key UNIQUE (code_id, recipient_id)",
    );
    const redeem = main.slice(
      main.indexOf("CREATE FUNCTION folioone.chat_card_redeem("),
    );
    // The attempt is written before anything is checked.
    expect(
      redeem.indexOf("INSERT INTO folioone.chat_card_redeem_attempts"),
    ).toBeLessThan(redeem.indexOf("set_config('folioone.chat_card'"));
    expect(redeem).toContain("interval '15 minutes') > 10");
    // No DELETE on redemptions or codes for anyone.
    expect(main).not.toMatch(
      /GRANT[^;]*DELETE[^;]*chat_card_(redemptions|codes)/,
    );
    expect(main).toContain("ON DELETE SET NULL");
  });

  it("keeps senders, timestamps and ordering server-side and limits floods", () => {
    expect(main).toContain(
      "GRANT INSERT (conversation_id, body) ON TABLE folioone.conversation_messages TO authenticated",
    );
    expect(main).toContain(
      "id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n  conversation_id uuid NOT NULL",
    );
    expect(main).toMatch(
      /NEW\.sender_id := v_uid;\s+NEW\.created_at := now\(\);/,
    );
    expect(main).toContain("interval '1 minute') >= 20");
    expect(main).toContain("interval '1 hour') >= 5");
  });

  it("does not cascade conversations away when a card is archived (archive is a status)", () => {
    expect(main).not.toMatch(/GRANT[^;]*DELETE[^;]*folioone\.chat_cards\b/);
    expect(main).not.toMatch(/GRANT[^;]*DELETE[^;]*folioone\.conversations\b/);
  });

  it("is applied by local validation, in order, after M13", () => {
    const v = readFileSync("scripts/validate/validate.mjs", "utf8");
    const at = (f: string) => v.indexOf(`"docs/sql/milestone-chatcards/${f}"`);
    expect(at("001-chatcard-routes.sql")).toBeGreaterThan(
      v.indexOf("004-intro-trim-and-studio.sql"),
    );
    expect(at("002-chatcards.sql")).toBeGreaterThan(
      at("001-chatcard-routes.sql"),
    );
    expect(at("003-chatcard-insights.sql")).toBeGreaterThan(
      at("002-chatcards.sql"),
    );
  });
});

describe("ChatCards code stays inside the database boundary", () => {
  const walk = (d: string): string[] =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)],
    );
  const sources = [
    ...walk("src/domains/chatcards"),
    ...walk("src/app/chatcards"),
    ...walk("src/app/chat"),
    ...walk("src/app/messages"),
    ...walk("src/components/chatcards"),
  ].filter((f) => /\.(ts|tsx)$/.test(f));

  it("has no direct .from()/.rpc(), no service role and no Postgres connection", () => {
    expect(sources.length).toBeGreaterThan(10);
    for (const f of sources) {
      const s = readFileSync(f, "utf8");
      expect(s, f).not.toMatch(/\.(from|rpc)\(\s*["'`]/);
      expect(s, f).not.toMatch(/service_role|SERVICE_ROLE|postgres:\/\//);
    }
  });

  it("never sends message text or codes to analytics", () => {
    const events = readFileSync(
      "src/domains/chatcards/chat-card-events.ts",
      "utf8",
    );
    expect(events).not.toMatch(/body|code_hash|normalized/);
    const svc = readFileSync(
      "src/domains/chatcards/conversation-service.ts",
      "utf8",
    );
    for (const m of svc.matchAll(/recordChatCardEvent\(([^)]*)\)/g))
      expect(m[1]!.split(",")).toHaveLength(2);
  });
});
