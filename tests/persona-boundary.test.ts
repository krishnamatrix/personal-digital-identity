import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PERSONA_READ_RPC, PERSONA_RPC } from "@/lib/db/queries/personas";

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

const root = process.cwd();
const RUNTIME = "src/domains/personas/persona-runtime.ts";
const REPOSITORY = "src/lib/db/queries/personas.ts";
const personaFiles = [
  ...files(join(root, "src/domains/personas")),
  join(root, REPOSITORY),
  ...files(join(root, "src/app/personas")),
];
const read = (path: string) => readFileSync(path, "utf8");
/** Source with comments removed, so prose cannot trigger or mask a check. */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** The RPC allowlist exactly as the database gate defines it (002). */
function gateAllowlist(): string[] {
  const sql = read(
    join(root, "docs/sql/milestone-3c/002-persona-gate-policies-grants.sql"),
  );
  const body = sql.slice(
    sql.indexOf("CREATE FUNCTION public.persona_write_rpc_context"),
  );
  return [
    ...body
      .slice(0, body.indexOf("$$;", 20))
      .matchAll(/'\/rpc\/(persona_[a-z_]+)'/g),
  ]
    .map((m) => m[1])
    .sort();
}
const ALLOWED_RPCS = gateAllowlist();

/**
 * The boundary rules, as a function of one file's source. Used on the real
 * files (must be clean) and on deliberately bad snippets (must be caught), so
 * the test is shown to detect violations rather than merely pass.
 *
 * Persona persistence is allowed ONLY in src/lib/db/queries/personas.ts, ONLY as
 * PostgREST reads of `personas` (with embedded children) and calls to the nine
 * allowlisted RPCs. Nothing may write a table directly, touch Master Identity
 * tables, or use any credential or connection that bypasses RLS.
 */
function violations(path: string, raw: string): string[] {
  const source = code(raw);
  const found: string[] = [];
  const isRuntime = path.endsWith("persona-runtime.ts");
  const isRepository = path.endsWith("queries/personas.ts");

  if (/SUPABASE_SERVICE_ROLE_KEY|service_role|serviceRole/.test(source))
    found.push("service-role credential");
  if (
    /DATABASE_URL|from\s+["']postgres["']|from\s+["']pg["']|drizzle-orm/.test(
      source,
    )
  )
    found.push("direct database access");
  if (
    /\b(updateProfile|createEmptyProfile|ensureAccount|updateOwnProfile|getOwnProfile)\b/.test(
      source,
    )
  )
    found.push("Master Identity write path");
  if (/@\/lib\/supabase\/client|createBrowserClient/.test(source))
    found.push("browser Supabase client");
  // A PostgREST table write: .from(...) followed by insert/update/upsert/delete.
  if (
    /\.from\([^)]*\)[\s\S]{0,300}?\.(insert|update|upsert|delete)\(/.test(
      source,
    )
  )
    found.push("direct table write call");

  // Master Identity tables are never referenced from Persona code. (The account
  // ownership anchor is created inside the SQL function, never from TypeScript.)
  if (/identity_profiles|["'`]accounts["'`]/.test(source))
    found.push("identity table reference");

  const froms = [...source.matchAll(/\.from\(\s*["'`]([^"'`]*)["'`]/g)].map(
    (m) => m[1],
  );
  const rpcLiterals = [
    ...source.matchAll(/\.rpc\(\s*["'`]([^"'`]*)["'`]/g),
  ].map((m) => m[1]);
  const usesRpc = /\.rpc\(/.test(source);
  const usesFrom = /\.from\(/.test(source);
  if (isRepository) {
    if (froms.some((table) => table !== "personas"))
      found.push(`table access other than personas: ${froms.join(", ")}`);
    if (usesFrom && froms.length === 0)
      found.push("table access with a non-literal name");
    if (rpcLiterals.some((name) => !ALLOWED_RPCS.includes(name)))
      found.push(`RPC outside the gate allowlist: ${rpcLiterals.join(", ")}`);
  } else {
    if (usesFrom) found.push("PostgREST table access outside the repository");
    if (usesRpc) found.push("RPC call outside the repository");
  }
  if (/["'`]persona_[a-z_]+["'`]/.test(source) && !isRepository) {
    // Persona table/RPC names appear as strings only in the repository.
    found.push("Persona table or RPC name outside the repository");
  }

  // Only the runtime may use the Supabase server client; actions and pages may
  // import the error class used to recognise a missing session, nothing else.
  const importsServer = [
    ...source.matchAll(
      /import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/supabase\/server["']/g,
    ),
  ];
  for (const [, names] of importsServer) {
    const imported = names
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    const allowed = isRuntime
      ? ["createAuthenticatedClient"]
      : ["AuthenticationRequiredError"];
    if (imported.some((name) => !allowed.includes(name)))
      found.push(`unexpected Supabase server import: ${imported.join(", ")}`);
  }
  return found;
}

describe("Persona persistence and Master Identity boundaries", () => {
  it("covers every Persona source file", () => {
    expect(personaFiles.length).toBeGreaterThan(20);
    for (const name of [
      "persona-runtime.ts",
      "actions.ts",
      "queries/personas.ts",
      "persona-db-errors.ts",
    ])
      expect(
        personaFiles.some((p) => p.endsWith(name)),
        name,
      ).toBe(true);
  });

  it("finds no violations in any Persona source file", () => {
    for (const path of personaFiles) {
      expect(violations(path, read(path)), path).toEqual([]);
    }
  });

  it("the repository's RPC names are exactly the database gate's allowlist", () => {
    expect(Object.values(PERSONA_RPC).sort()).toEqual(ALLOWED_RPCS);
    expect(ALLOWED_RPCS).toHaveLength(9);
    // The read helper is the ONLY other RPC the repository may call. It is not a
    // write path, so it must not appear on the gate allowlist.
    expect(Object.values(PERSONA_READ_RPC)).toEqual(["persona_detail_json"]);
    expect(ALLOWED_RPCS).not.toContain("persona_detail_json");
  });

  it("the fixture remains the default and the Supabase backend is opt-in", () => {
    const env = code(read(join(root, "src/lib/env.ts")));
    expect(env).toMatch(
      /PERSONA_STORAGE:\s*z\.enum\(\["fixture",\s*"supabase"\]\)\.default\("fixture"\)/,
    );
    const runtime = code(read(join(root, RUNTIME)));
    expect(runtime).toMatch(/env\.PERSONA_STORAGE === "supabase"/);
    expect(runtime).toMatch(/new InMemoryPersonaRepository\(/);
    expect(read(join(root, RUNTIME))).toMatch(/IN-MEMORY FIXTURE ADAPTER/);
    // 072b4e9 switched the runtime to findCanonicalProfile (same profile read through src/lib/db).
    expect(runtime).toMatch(/\bfind(Canonical)?Profile\b/);
  });

  it("never takes an account id from client input", () => {
    const actions = code(read(join(root, "src/app/personas/actions.ts")));
    expect(actions).not.toMatch(/accountId|account_id|userId/);
  });

  it("the repository never sends an account or user parameter to an RPC", () => {
    const repository = code(read(join(root, REPOSITORY)));
    expect(repository).not.toMatch(/p_account|p_user|account_id:|user_id:/);
  });

  describe("the rules detect violations (not just pass on clean code)", () => {
    const repo = "src/lib/db/queries/personas.ts";
    const cases: [string, string, string][] = [
      [
        "Persona table read outside the repository",
        "src/app/personas/x.ts",
        'client.from("personas").select("*")',
      ],
      [
        "RPC outside the repository",
        "src/domains/personas/persona-service.ts",
        'client.rpc("persona_delete", {})',
      ],
      [
        "Persona name outside the repository",
        "src/domains/personas/x.ts",
        'const t = "persona_sections"',
      ],
      [
        "service-role key",
        "src/domains/personas/x.ts",
        "const k = process.env.SUPABASE_SERVICE_ROLE_KEY",
      ],
      [
        "service_role role name",
        "src/domains/personas/x.ts",
        'const role = "service_role"',
      ],
      [
        "postgres client",
        "src/domains/personas/x.ts",
        'import postgres from "postgres"',
      ],
      ["pg client", "src/domains/personas/x.ts", 'import { Pool } from "pg"'],
      [
        "drizzle runtime",
        "src/domains/personas/x.ts",
        'import { drizzle } from "drizzle-orm/postgres-js"',
      ],
      ["database URL", "src/domains/personas/x.ts", "process.env.DATABASE_URL"],
      ["identity table", repo, 'client.from("identity_profiles")'],
      ["accounts table from TypeScript", repo, 'client.from("accounts")'],
      [
        "identity write helper",
        "src/domains/personas/x.ts",
        "await updateProfile(client, id, input)",
      ],
      [
        "identity auto-create",
        "src/domains/personas/persona-runtime.ts",
        "await getOwnProfile()",
      ],
      [
        "browser client",
        "src/app/personas/x.tsx",
        'import { createBrowserClient } from "@supabase/ssr"',
      ],
      [
        "server client outside the runtime",
        "src/app/personas/actions.ts",
        'import { createAuthenticatedClient } from "@/lib/supabase/server"',
      ],
      [
        "unexpected runtime import",
        "src/domains/personas/persona-runtime.ts",
        'import { createClient } from "@/lib/supabase/server"',
      ],
      [
        "repository writes a table directly (insert)",
        repo,
        'await client.from("personas").insert({ name })',
      ],
      [
        "repository writes a table directly (update)",
        repo,
        'await client.from("personas").update({ name }).eq("id", id)',
      ],
      [
        "repository deletes directly",
        repo,
        'await client.from("personas").delete().eq("id", id)',
      ],
      [
        "repository reads another table",
        repo,
        'client.from("persona_revisions").select("*")',
      ],
      [
        "repository calls an unlisted RPC",
        repo,
        'client.rpc("persona_delete_section", {})',
      ],
      [
        "repository calls a non-Persona RPC",
        repo,
        'client.rpc("exec_sql", {})',
      ],
    ];
    for (const [name, path, snippet] of cases) {
      it(`catches: ${name}`, () => {
        expect(violations(path, snippet).length, snippet).toBeGreaterThan(0);
      });
    }

    it("is not fooled by violations hidden in comments, and ignores prose mentions", () => {
      expect(
        violations(
          "src/domains/personas/x.ts",
          '// client.from("personas")\n/* service_role */ const a = 1;',
        ),
      ).toEqual([]);
    });

    it("allows exactly the intended repository and import shapes", () => {
      expect(
        violations(
          repo,
          'client.from("personas").select("*").eq("account_id", id);\nawait client.rpc(PERSONA_RPC.delete, {});\nawait client.rpc("persona_set_default", {});',
        ),
      ).toEqual([]);
      expect(
        violations(
          "src/app/personas/actions.ts",
          'import { AuthenticationRequiredError } from "@/lib/supabase/server";',
        ),
      ).toEqual([]);
      expect(
        violations(
          RUNTIME,
          'import { createAuthenticatedClient } from "@/lib/supabase/server";\nawait findProfile(client, id);',
        ),
      ).toEqual([]);
    });
  });
});
