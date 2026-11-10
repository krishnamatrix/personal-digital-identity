import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scanSources } from "../scripts/check-db-boundary.mjs";

const sql = readFileSync("docs/sql/milestone-6/001-articles.sql", "utf8");
const active = sql
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");

describe("milestone-6 SQL package", () => {
  it("is a single reviewed file with preflight, transaction, verification and rollback", () => {
    expect(readdirSync("docs/sql/milestone-6")).toEqual(["001-articles.sql"]);
    expect(sql).toMatch(/Read-only preflight/);
    expect(active).toMatch(/\nBEGIN;[\s\S]*\nCOMMIT;/);
    expect(sql).toMatch(/Post-execution verification/);
    expect(sql).toMatch(/Rollback/);
    expect(sql).toMatch(/NOT EXECUTED/);
  });
  it("adds no roles, no SECURITY DEFINER, no service-role grant and nothing outside folioone", () => {
    expect(active).not.toMatch(/SECURITY\s+DEFINER/i);
    expect(active).not.toMatch(/CREATE\s+ROLE|ALTER\s+ROLE/i);
    expect(active).not.toMatch(/GRANT[^;]*service_role/i);
    expect(active).not.toMatch(/\bpublic\./);
    expect(active).not.toMatch(/DISABLE\s+ROW\s+LEVEL|NO\s+FORCE/i);
    expect(active.match(/SECURITY\s+INVOKER/gi)?.length).toBe(7);
  });
  it("forces RLS on both new tables and gives anon only the snapshot columns, never account_id or article_id", () => {
    for (const table of ["articles", "website_published_articles"]) {
      expect(active).toContain(
        `ALTER TABLE folioone.${table} FORCE ROW LEVEL SECURITY`,
      );
      expect(active).toContain(
        `REVOKE ALL PRIVILEGES ON TABLE folioone.${table} FROM PUBLIC, anon, service_role`,
      );
    }
    const grant =
      /GRANT SELECT \(([^)]*)\)\s+ON TABLE folioone\.website_published_articles TO anon/.exec(
        active,
      )![1]!;
    const cols = grant.split(",").map((c) => c.trim());
    expect(cols).not.toContain("account_id");
    expect(cols).not.toContain("article_id");
    expect(cols).toContain("site_slug");
    expect(active).not.toMatch(/GRANT[^;]*ON TABLE folioone\.articles TO anon/);
  });
  it("the public policy requires a live website, and article deletion cascades to the snapshot", () => {
    expect(active).toMatch(/wpa_select_live[\s\S]*TO anon[\s\S]*p\.is_live/);
    expect(active).toMatch(
      /wpa_article_id_articles_fk[\s\S]*ON DELETE CASCADE/,
    );
    expect(active).toMatch(
      /AFTER UPDATE OF status ON folioone\.articles[\s\S]*OLD\.status = 'published' AND NEW\.status <> 'published'/,
    );
  });
  it("replaces website_publish with the 5-argument form the application calls", () => {
    expect(active).toContain(
      "DROP FUNCTION folioone.website_publish(text, text, text, jsonb);",
    );
    expect(active).toContain("p_article_ids uuid[]");
    expect(readFileSync("src/lib/db/queries/website.ts", "utf8")).toContain(
      "p_article_ids: args.articleIds",
    );
  });
});

describe("database boundary covers the article code", () => {
  it("articles queries are server-only and live under src/lib/db", () => {
    const text = readFileSync("src/lib/db/queries/articles.ts", "utf8");
    expect(text.split("\n")[0]).toBe('import "server-only";');
    expect(text).not.toMatch(/\.select\(\s*["'`]\*|select\(\)/);
  });
  it("flags article code that queries directly or uses a wildcard", () => {
    const rules = (path: string, text: string) =>
      scanSources([{ path, text }]).map((v: { rule: string }) => v.rule);
    expect(
      rules("src/domains/articles/x.ts", 'client.from("articles").select("*")'),
    ).toEqual(expect.arrayContaining(["db-from", "wildcard"]));
    expect(
      rules(
        "src/app/articles/x.tsx",
        'await client.rpc("website_publish", {})',
      ),
    ).toContain("db-rpc");
    expect(
      rules(
        "src/lib/db/queries/articles.ts",
        'client.from("articles").select("id,title")',
      ),
    ).toEqual([]);
  });
  it("the editor (a client component) never imports the DB layer", () => {
    const editor = readFileSync(
      "src/app/articles/[id]/article-editor.tsx",
      "utf8",
    );
    expect(editor.startsWith('"use client"')).toBe(true);
    expect(editor).not.toMatch(/@\/lib\/db\/|@\/lib\/supabase|server-only/);
  });
  it("the article service and actions use only the central query entry", () => {
    for (const file of ["src/domains/articles/article-service.ts"]) {
      const text = readFileSync(file, "utf8");
      expect(text).not.toMatch(
        /\.from\(|\.rpc\(|@supabase|lib\/supabase\/server/,
      );
      expect(text).toContain('from "@/lib/db/query"');
    }
  });
});
