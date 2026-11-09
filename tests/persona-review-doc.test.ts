import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PERSONA_RPC } from "@/domains/personas/persona-supabase-repository";

// Keeps docs/sql/milestone-3c/REVIEW.md (what an independent reviewer reads)
// consistent with the SQL it describes. Text only; nothing is executed.

const dir = join(process.cwd(), "docs/sql/milestone-3c");
const doc = readFileSync(join(dir, "REVIEW.md"), "utf8");
const sql = (name: string) =>
  readFileSync(join(dir, name), "utf8").replace(/--[^\n]*/g, "");
const s002 = sql("002-persona-gate-policies-grants.sql");
const s003 = sql("003-persona-mutation-rpcs.sql");

describe("REVIEW.md matches the SQL package", () => {
  it("lists every policy, and only the policies, that 002 creates", () => {
    const inSql = [...s002.matchAll(/CREATE POLICY\s+(\w+)/g)]
      .map((m) => m[1])
      .sort();
    const inDoc = [
      ...doc.matchAll(
        /\|\s*`(persona\w+_(?:select|insert|update|delete)_\w+)`\s*\|/g,
      ),
    ]
      .map((m) => m[1])
      .sort();
    expect(inSql).toHaveLength(16);
    expect(inDoc).toEqual(inSql);
    expect(doc).toContain("### Policies (16)");
  });

  it("lists every function, with the right count and no SECURITY DEFINER", () => {
    const inSql = [
      ...s003.matchAll(/CREATE FUNCTION public\.(persona_[a-z_]+)\(/g),
      ...s002.matchAll(/CREATE FUNCTION public\.(persona_[a-z_]+)\(/g),
    ]
      .map((m) => m[1])
      .sort();
    expect(inSql).toHaveLength(11);
    for (const name of inSql)
      expect(doc, name).toMatch(new RegExp(`\\|\\s*\`${name}\`\\s*\\|`));
    expect(doc).toContain("### Functions (11)");
    expect(doc).not.toMatch(/SECURITY DEFINER\*\*/);
    expect(doc).toMatch(/none `SECURITY DEFINER`/);
  });

  it("documents each grant that 002 issues", () => {
    const grants = [...s002.matchAll(/GRANT\s+(SELECT|INSERT|UPDATE|DELETE)/g)]
      .length;
    const rows = [
      ...doc.matchAll(
        /^\|\s*`persona\w*`\s*\|\s*(SELECT|INSERT|UPDATE|DELETE)\s*\|/gm,
      ),
    ].length;
    // The policy table and the grant table both start with a table name and a
    // command: 16 policies + one row per (table, privilege) grant. 002 groups the
    // five SELECT grants into one statement, hence "- 1 + 5".
    expect(rows).toBe(16 + (grants - 1 + 5));
  });

  it("maps every application mutation to one of the nine RPCs, and every RPC is mapped", () => {
    for (const rpc of Object.values(PERSONA_RPC)) {
      expect(doc, rpc).toMatch(new RegExp(`\\|\\s*\`${rpc}\`\\s*\\|`));
    }
    const mapping = doc.slice(
      doc.indexOf("## 3. Application mutation"),
      doc.indexOf("## 4."),
    );
    for (const op of [
      "createWithConfiguration",
      "updateMetadata",
      "applyProfileFieldChanges",
      "upsertSection",
      "reorderSections",
      "setDefault",
      "setLifecycle",
      "duplicate",
      "delete",
    ]) {
      expect(mapping, op).toContain(`\`${op}\``);
    }
    // bulk actions, field moves and multi-field saves all use the batch RPC
    expect(mapping.match(/persona_apply_profile_field_changes/g)?.length).toBe(
      3,
    );
  });

  it("states the Master Identity guarantees the SQL actually provides", () => {
    expect(doc).toMatch(/No Persona function modifies `identity_profiles`/);
    expect(
      s003.replace(/DO \$(preflight|assert)\$[\s\S]*?\$\1\$;/g, ""),
    ).not.toMatch(/identity_profiles/);
    expect(doc).toMatch(
      /INSERT INTO public\.accounts \(id\) VALUES \(v_uid\) ON CONFLICT \(id\) DO NOTHING/,
    );
  });

  it("documents the return contract and its single-request consequence", () => {
    expect(doc).toMatch(/complete resulting Persona state/);
    expect(doc).toMatch(/no second request/i);
    expect(doc).toMatch(/`persona_delete` returns the deleted id/);
  });

  it("records 001-003 as developer-reported, and records 004 as developer-reported executed", () => {
    const tracker = readFileSync(
      join(process.cwd(), "docs/sql/execution-tracker.md"),
      "utf8",
    );
    const section = tracker.slice(
      tracker.indexOf("## Milestone 3C Persona persistence proposals"),
      tracker.indexOf("## Milestone 3A request-path diagnostic"),
    );
    const rows = section.split("\n").filter((l) => /^\| \[/.test(l));
    expect(rows.length).toBe(6);
    const row = (name: string) => rows.find((r) => r.includes(name))!;
    for (const name of [
      "001-persona-schema-secured",
      "002-persona-gate",
      "003-persona-mutation",
    ]) {
      expect(row(name)).toMatch(/executed \(developer report\)/);
      expect(row(name)).toMatch(/not seen by the assistant/);
    }
    expect(row("004-persona-version-conflict")).toMatch(
      /\|\s*executed \(developer report\)\s*\|/,
    );
    expect(row("004-persona-version-conflict")).toMatch(/PT409/);
    expect(section).toMatch(/has not executed any SQL/);
  });
});
