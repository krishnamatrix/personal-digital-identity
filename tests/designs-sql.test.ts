// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { THEMES } from "@/domains/website/config";
import { CARD_DESIGNS } from "@/domains/cards/card-designs";
import { isProCardDesign, isProWebsiteTheme } from "@/domains/billing/plans";

/** Static review of docs/sql/milestone-14 (applied and exercised by `pnpm validate`). */
const file = "docs/sql/milestone-14/001-design-templates.sql";
const raw = readFileSync(file, "utf8");
const sql = raw
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

describe("Folio Designer SQL", () => {
  it("has the usual header, preflight, transaction, verification and rollback", () => {
    expect(raw).toContain("STATUS:        PREPARED - NOT EXECUTED");
    expect(raw).toContain("session_user = 'postgres'");
    expect(sql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;/);
    expect(raw).toMatch(/Read-only verification/);
    expect(raw).toMatch(/Rollback/);
  });

  it("has no SECURITY DEFINER, service_role grant, custom role or public. reference", () => {
    expect(sql).not.toMatch(/SECURITY\s+DEFINER/i);
    expect(sql).not.toMatch(/GRANT[^;]*\bservice_role\b/i);
    expect(sql).not.toMatch(/CREATE\s+ROLE/i);
    expect(sql).not.toMatch(/\bpublic\./);
    expect(sql).not.toMatch(/BYPASSRLS|DISABLE ROW LEVEL SECURITY/i);
    expect(sql.match(/SECURITY INVOKER SET search_path = ''/g)).toHaveLength(4);
  });

  it("forces RLS on the three new tables and starts from no privileges", () => {
    const loop = sql.match(/FOREACH t IN ARRAY ARRAY\[([^\]]*)\]/)![1]!;
    for (const t of [
      "platform_admins",
      "design_templates",
      "design_template_versions",
    ])
      expect(loop).toContain(`'${t}'`);
    expect(sql).toContain("FORCE ROW LEVEL SECURITY");
    expect(sql).toContain(
      "REVOKE ALL PRIVILEGES ON TABLE folioone.%I FROM PUBLIC, anon, authenticated, service_role",
    );
  });

  it("allows design writes only to platform admins, never to anon, never on built-ins", () => {
    for (const name of [
      "design_templates_insert_admin",
      "design_templates_update_admin",
      "design_templates_delete_admin",
      "design_template_versions_insert_admin",
    ]) {
      const body = sql
        .slice(sql.indexOf(`CREATE POLICY ${name}`))
        .split(";")[0]!;
      expect(body, name).toContain("folioone.is_platform_admin()");
    }
    expect(sql).not.toMatch(/GRANT[^;]*TO anon/);
    expect(sql).not.toMatch(
      /GRANT[^;]*(INSERT|UPDATE|DELETE)[^;]*platform_admins/,
    );
    // Versions are append-only: no UPDATE or DELETE grant.
    expect(sql).not.toMatch(
      /GRANT[^;]*(UPDATE|DELETE)[^;]*design_template_versions/,
    );
    expect(
      sql
        .slice(sql.indexOf("CREATE POLICY design_templates_update_admin"))
        .split(";")[0],
    ).toContain("source = 'designer'");
  });

  it("seeds exactly the code designs with the same tiers as plans.ts", () => {
    const rows = [
      ...sql.matchAll(
        /\('(website|card)', '([^']+)', '((?:[^']|'')*)', '([^']+)', '(free|pro)'\)/g,
      ),
    ].map((m) => ({ surface: m[1], id: m[2], category: m[4], tier: m[5] }));
    const website = rows.filter((r) => r.surface === "website");
    const card = rows.filter((r) => r.surface === "card");
    expect(website.map((r) => r.id).sort()).toEqual(
      THEMES.map((t) => t.id).sort(),
    );
    expect(card.map((r) => r.id).sort()).toEqual(
      CARD_DESIGNS.map((d) => d.id).sort(),
    );
    for (const r of website)
      expect(r.tier, r.id).toBe(isProWebsiteTheme(r.id!) ? "pro" : "free");
    for (const r of card)
      expect(r.tier, r.id).toBe(isProCardDesign(r.id!) ? "pro" : "free");
  });

  it("replaces the design CHECK lists with a format check and the design-table lookup", () => {
    for (const c of [
      "website_sites_theme_check",
      "website_published_theme_check",
      "digital_cards_design_check",
      "digital_card_published_design_check",
    ])
      expect(sql).toContain(`DROP CONSTRAINT ${c}`);
    const fn = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION folioone.enforce_pro_design()"),
    );
    expect(fn).toContain("FROM folioone.design_templates t");
    expect(fn).toContain("ERRCODE = 'PT422'");
    expect(fn).toContain("ERRCODE = 'PT402'");
    expect(fn).toContain("v.spec = v_pin -> 'spec'");
  });

  it("is applied by local validation after the ChatCards package", () => {
    const v = readFileSync("scripts/validate/validate.mjs", "utf8");
    expect(v.indexOf(`"${file}"`)).toBeGreaterThan(
      v.indexOf("milestone-chatcards/003-chatcard-insights.sql"),
    );
  });
});
