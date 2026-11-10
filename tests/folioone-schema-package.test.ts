import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SCHEMA,
  generate,
  retarget,
} from "../scripts/schema/generate-folioone-sql.mjs";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const PKG = "docs/sql/folioone-schema";
const generated = generate();
const executable = (text: string) =>
  text
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");

describe("folioone schema package: generator", () => {
  it("uses folioone, never an environment-specific schema name", () => {
    expect(SCHEMA).toBe("folioone");
    for (const [path, text] of generated) {
      expect(text, path).not.toMatch(/folioone_staging|folioone_prod/);
    }
  });

  it("committed files equal the generator output (no hand edits, no drift)", () => {
    const expected = [...generated.keys()]
      .map((p) => p.split("/").pop())
      .sort();
    expect(readdirSync(join(root, PKG)).sort()).toEqual(expected);
    for (const [path, content] of generated)
      expect(read(path), path).toBe(content);
  });

  it("is deterministic", () => {
    const again = generate();
    for (const [path, content] of generated)
      expect(again.get(path), path).toBe(content);
  });

  it("leaves no reference to schema public in executable SQL", () => {
    for (const [path, text] of generated) {
      if (!path.endsWith(".sql") || path.endsWith("public-snapshot.sql"))
        continue;
      const code = executable(text);
      expect(code, path).not.toMatch(/\bpublic\b/);
    }
  });

  it("the only code that names schema public is the read-only snapshot", () => {
    const snapshot = executable(generated.get(`${PKG}/public-snapshot.sql`)!);
    expect(snapshot).toMatch(/'public'::regnamespace/);
    expect(snapshot).not.toMatch(
      /\b(CREATE|ALTER|DROP|GRANT|REVOKE|INSERT|UPDATE|DELETE|TRUNCATE)\b/i,
    );
  });

  it("never rewrites the PUBLIC role keyword", () => {
    const pairs: [string, string][] = [
      [
        "002-identity-tables.sql",
        "docs/sql/milestone-2/001-identity-tables.sql",
      ],
      ["003-identity-rls.sql", "docs/sql/milestone-2/002-identity-rls.sql"],
      [
        "004-persona-tables.sql",
        "docs/sql/milestone-3c/001-persona-schema-secured.sql",
      ],
      [
        "005-persona-rls-and-grants.sql",
        "docs/sql/milestone-3c/002-persona-gate-policies-grants.sql",
      ],
      [
        "006-persona-functions.sql",
        "docs/sql/milestone-3c/003-persona-mutation-rpcs.sql",
      ],
    ];
    for (const [name, source] of pairs) {
      const count = (t: string) => (t.match(/\bPUBLIC\b/g) ?? []).length;
      expect(
        count(generated.get(`${PKG}/${name}`)!),
        name,
      ).toBeGreaterThanOrEqual(count(read(source)));
    }
  });
});

describe("folioone schema package: preserved design", () => {
  const fns = executable(generated.get(`${PKG}/006-persona-functions.sql`)!);
  const functionStatements = [
    ...fns.matchAll(/CREATE FUNCTION folioone\.(\w+)\([\s\S]*?\$fn\$;/g),
  ];

  it("defines the nine mutation RPCs and the read helper, all schema-qualified", () => {
    expect(functionStatements.map((m) => m[1]).sort()).toEqual([
      "persona_apply_profile_field_changes",
      "persona_create_with_configuration",
      "persona_delete",
      "persona_detail_json",
      "persona_duplicate",
      "persona_reorder_sections",
      "persona_set_default",
      "persona_set_lifecycle",
      "persona_update_metadata",
      "persona_upsert_section",
    ]);
    expect(fns).not.toMatch(/CREATE (OR REPLACE )?FUNCTION (?!folioone\.)/);
  });

  it("keeps SECURITY INVOKER and an empty search_path on every function; no SECURITY DEFINER anywhere", () => {
    for (const [, name] of functionStatements.map((m) => [m[0], m[1]])) {
      const statement = functionStatements.find((m) => m[1] === name)![0];
      expect(statement, name).toMatch(/SECURITY INVOKER/);
      expect(statement, name).toMatch(/SET search_path = ''/);
    }
    for (const [path, text] of generated) {
      if (path.endsWith(".sql"))
        expect(executable(text), path).not.toMatch(/SECURITY\s+DEFINER/i);
    }
  });

  it("the version-checking functions are exactly the approved 004 definitions, retargeted", () => {
    const approved004 = retarget(
      "docs/sql/milestone-3c/004-persona-version-conflict-sqlstate.sql",
      read("docs/sql/milestone-3c/004-persona-version-conflict-sqlstate.sql"),
    );
    const replaced = [
      ...approved004.matchAll(
        /CREATE OR REPLACE FUNCTION folioone\.(\w+)\([\s\S]*?\$fn\$;/g,
      ),
    ];
    expect(replaced).toHaveLength(7);
    for (const match of replaced) {
      const built = functionStatements.find((m) => m[1] === match[1]);
      expect(built, match[1]).toBeDefined();
      expect(built![0], match[1]).toBe(
        match[0].replace("CREATE OR REPLACE FUNCTION", "CREATE FUNCTION"),
      );
    }
  });

  it("has PT409 for stale versions and no 40001 in the Persona functions", () => {
    expect(fns).toMatch(/ERRCODE = 'PT409'/);
    expect(fns).not.toMatch(/40001/);
    expect((fns.match(/ERRCODE = 'PT409'/g) ?? []).length).toBe(7);
  });

  it("keeps the advisory lock, the account-anchor insert and append-only revisions", () => {
    expect(fns).toMatch(
      /pg_advisory_xact_lock\(hashtextextended\('folioone\.persona:'/,
    );
    expect(fns).toMatch(
      /INSERT INTO folioone\.accounts \(id\) VALUES \(v_uid\) ON CONFLICT \(id\) DO NOTHING/,
    );
    expect(fns).not.toMatch(
      /UPDATE folioone\.persona_revisions|DELETE FROM folioone\.persona_revisions/,
    );
  });

  it("the schema is created for authenticated only, with no default privileges", () => {
    const create = executable(generated.get(`${PKG}/001-create-schema.sql`)!);
    expect(create).toMatch(/CREATE SCHEMA folioone AUTHORIZATION postgres/);
    expect(create).toMatch(/GRANT USAGE ON SCHEMA folioone TO authenticated;/);
    expect(create).not.toMatch(/GRANT[^;]*\b(anon|service_role)\b/);
    expect(create).not.toMatch(/ALTER DEFAULT PRIVILEGES/);
    expect(create).not.toMatch(/CREATE (ROLE|USER)|ALTER ROLE/i);
  });

  it("references only auth.users outside its own schema", () => {
    for (const name of ["002-identity-tables.sql", "004-persona-tables.sql"]) {
      const references = [
        ...executable(generated.get(`${PKG}/${name}`)!).matchAll(
          /REFERENCES\s+([\w.]+)/g,
        ),
      ].map((m) => m[1]);
      for (const target of references)
        expect(target, name).toMatch(/^(auth\.users|folioone\.)/);
    }
  });

  it("rollback is guidance only: every statement is commented out", () => {
    const rollback = generated.get(`${PKG}/rollback.sql`)!;
    expect(executable(rollback).trim()).toBe("");
    expect(rollback).toMatch(/DROP SCHEMA folioone CASCADE/);
  });

  it("every one-time script says so, and the verification is read-only", () => {
    for (const name of [
      "001-create-schema.sql",
      "002-identity-tables.sql",
      "003-identity-rls.sql",
      "004-persona-tables.sql",
      "005-persona-rls-and-grants.sql",
      "006-persona-functions.sql",
    ])
      expect(generated.get(`${PKG}/${name}`)!, name).toMatch(
        /Repeatable\?:\s+ONE-TIME/,
      );
    const verify = executable(generated.get(`${PKG}/007-verify-catalog.sql`)!);
    // Every statement is a SELECT (privilege names such as 'UPDATE' appear only as arguments).
    const statements = verify
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean);
    expect(statements.length).toBeGreaterThan(20);
    for (const statement of statements)
      expect(statement, statement.slice(0, 60)).toMatch(/^(SELECT|WITH)\b/i);
  });
});

describe("application uses the folioone schema everywhere", () => {
  const walk = (dir: string): string[] =>
    readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? walk(join(dir, e.name))
        : /\.(ts|tsx)$/.test(e.name)
          ? [join(dir, e.name)]
          : [],
    );
  const sources = walk("src");

  it("every Supabase client construction passes the central schema", () => {
    let found = 0;
    for (const file of sources) {
      const text = read(file);
      for (const match of text.matchAll(
        /(createServerClient|createBrowserClient)\(/g,
      )) {
        found += 1;
        const window = text.slice(match.index, match.index + 260);
        expect(window, `${file}`).toMatch(/folioneDbOptions/);
      }
    }
    expect(found).toBe(3); // server, browser, middleware
  });

  it("no source file selects schema public or builds its own client", () => {
    for (const file of sources) {
      const text = read(file);
      expect(text, file).not.toMatch(
        /schema:\s*["']public["']|\.schema\(\s*["']public["']/,
      );
      expect(text, file).not.toMatch(
        /from "@supabase\/supabase-js"[\s\S]*createClient\(/,
      );
    }
  });

  it("the schema name is defined once", () => {
    // slug.ts lists "folioone" only as a reserved public-website address, not as a schema.
    const definitions = sources.filter(
      (f) => f !== "src/domains/website/slug.ts" && /"folioone"/.test(read(f)),
    );
    expect(definitions).toEqual(["src/lib/db/schema.ts"]);
  });

  it("uses no service-role key anywhere", () => {
    for (const file of sources)
      expect(read(file), file).not.toMatch(/service_role|SERVICE_ROLE/);
  });
});
