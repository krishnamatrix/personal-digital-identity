import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  collectSources,
  formatViolation,
  scanSources,
} from "../scripts/check-db-boundary.mjs";
import {
  PUBLIC_PUBLISHED_COLUMNS,
  findLiveBySlug,
  isSlugLive,
} from "@/lib/db/queries/website";
import type { FolioneClient } from "@/lib/db/schema";

const scan = (path: string, text: string) => scanSources([{ path, text }]);
const rules = (path: string, text: string) =>
  scan(path, text).map((v) => v.rule);

describe("database boundary: the real source tree", () => {
  const files = collectSources(process.cwd());

  it("has no violations", () => {
    const violations = scanSources(files);
    expect(violations.map(formatViolation)).toEqual([]);
  });

  it("keeps every query module server-only and under src/lib/db", () => {
    const queries = files.filter((f) => f.path.startsWith("src/lib/db/"));
    expect(queries.map((f) => f.path).sort()).toEqual(
      expect.arrayContaining([
        "src/lib/db/client.ts",
        "src/lib/db/query.ts",
        "src/lib/db/schema.ts",
        "src/lib/db/queries/entries.ts",
        "src/lib/db/queries/identity.ts",
        "src/lib/db/queries/personas.ts",
        "src/lib/db/queries/website.ts",
      ]),
    );
    for (const f of queries.filter((q) => q.path !== "src/lib/db/schema.ts"))
      expect(f.text, f.path).toMatch(/^import "server-only";/m);
  });

  it("uses no service-role credential in the data layer", () => {
    for (const f of files.filter((x) => x.path.startsWith("src/lib/db/")))
      expect(f.text, f.path).not.toMatch(
        /service_role|SERVICE_ROLE|DATABASE_URL/,
      );
  });
});

describe("database boundary: the rules detect violations", () => {
  it("flags .from() and .rpc() outside src/lib/db, with file and line", () => {
    const v = scan(
      "src/app/x/page.tsx",
      'const a = 1;\nconst { data } = await client\n  .from("personas")\n  .select("id");\nawait client.rpc("persona_delete", {});',
    );
    expect(v.map((x) => [x.rule, x.line])).toEqual([
      ["db-from", 3],
      ["db-rpc", 5],
    ]);
    expect(formatViolation(v[0]!)).toContain("src/app/x/page.tsx:3");
  });

  it("allows them inside src/lib/db", () => {
    expect(
      rules(
        "src/lib/db/queries/x.ts",
        'client.from("t").select("id"); client.rpc("f");',
      ),
    ).toEqual([]);
  });

  it("ignores comments, builtins like Array.from, and prose", () => {
    expect(
      rules(
        "src/app/x.ts",
        '// client.from("x")\n/* client.rpc("y") */\nconst a = Array.from(xs); const b = Buffer.from("a"); const c = Object.fromEntries(e);',
      ),
    ).toEqual([]);
  });

  it("flags wildcard selections everywhere, including via a constant", () => {
    expect(rules("src/lib/db/queries/x.ts", 'q.select("*");')).toEqual([
      "wildcard",
    ]);
    expect(rules("src/lib/db/queries/x.ts", "q.select('*, rel(*)');")).toEqual([
      "wildcard",
    ]);
    expect(rules("src/lib/db/queries/x.ts", "q.select(`a,*`);")).toEqual([
      "wildcard",
    ]);
    expect(rules("src/lib/db/queries/x.ts", "q.insert(r).select();")).toEqual([
      "wildcard",
    ]);
    expect(
      rules(
        "src/lib/db/queries/x.ts",
        'const COLS = "id," + "*";\nq.select(COLS);',
      ),
    ).toEqual(["wildcard"]);
    expect(
      rules(
        "src/lib/db/queries/x.ts",
        'const COLS = "id,name,persona_revisions(count)";\nq.select(COLS);',
      ),
    ).toEqual([]);
  });

  it("flags Supabase client construction outside the approved modules", () => {
    expect(
      rules("src/app/x.ts", "const c = createServerClient(u, k, {});"),
    ).toEqual(["client-init"]);
    expect(
      rules("src/domains/x.ts", "const c = createBrowserClient(u, k);"),
    ).toEqual(["client-init"]);
    expect(
      rules(
        "src/domains/x.ts",
        'import { createClient } from "@supabase/supabase-js";',
      ),
    ).toEqual(["client-init"]);
    expect(
      rules(
        "src/domains/x.ts",
        'import type { SupabaseClient } from "@supabase/supabase-js";',
      ),
    ).toEqual([]);
    expect(
      rules("src/lib/supabase/server.ts", "createServerClient(u, k, {});"),
    ).toEqual([]);
    expect(rules("src/middleware.ts", "createServerClient(u, k, {});")).toEqual(
      [],
    );
  });

  it("flags client components that import the database layer or the server client", () => {
    const client = (imp: string) =>
      `"use client";\n\nimport { x } from "${imp}";\n`;
    expect(rules("src/app/a.tsx", client("@/lib/db/query"))).toEqual([
      "client-import",
    ]);
    expect(rules("src/app/a.tsx", client("@/lib/db/queries/website"))).toEqual([
      "client-import",
    ]);
    expect(rules("src/app/a.tsx", client("../../lib/db/client"))).toEqual([
      "client-import",
    ]);
    expect(rules("src/app/a.tsx", client("@/lib/supabase/server"))).toEqual([
      "client-import",
    ]);
    expect(rules("src/app/a.tsx", client("server-only"))).toEqual([
      "client-import",
    ]);
    // allowed: the schema constant, and server modules importing the layer
    expect(rules("src/app/a.tsx", client("@/lib/db/schema"))).toEqual([]);
    expect(
      rules("src/app/a.tsx", 'import { x } from "@/lib/db/query";'),
    ).toEqual([]);
    expect(
      rules(
        "src/app/a.tsx",
        `// "use client"\nimport { x } from "@/lib/db/query";`,
      ),
    ).toEqual([]);
  });
});

describe("public website reads only the approved snapshot fields", () => {
  function recorder(result: unknown) {
    const calls: [string, unknown[]][] = [];
    const chain: Record<string, unknown> = {};
    for (const m of ["from", "select", "eq", "maybeSingle"]) {
      chain[m] = vi.fn((...args: unknown[]) => {
        calls.push([m, args]);
        return m === "maybeSingle" ? Promise.resolve(result) : chain;
      });
    }
    return { client: chain as unknown as FolioneClient, calls };
  }

  it("selects exactly the eight permitted columns from website_published and never account_id", async () => {
    expect(PUBLIC_PUBLISHED_COLUMNS.split(",").sort()).toEqual(
      [
        "slug",
        "theme",
        "title",
        "description",
        "content",
        "is_live",
        "published_at",
        "updated_at",
      ].sort(),
    );
    expect(PUBLIC_PUBLISHED_COLUMNS).not.toMatch(/account_id|\*/);
    const { client, calls } = recorder({ data: null, error: null });
    await findLiveBySlug(client, "jane");
    expect(calls.filter(([m]) => m === "from")).toEqual([
      ["from", ["website_published"]],
    ]);
    expect(calls.find(([m]) => m === "select")![1]).toEqual([
      PUBLIC_PUBLISHED_COLUMNS,
    ]);
    expect(
      calls.find(([m, a]) => m === "eq" && a[0] === "is_live")![1],
    ).toEqual(["is_live", true]);
  });

  it("the availability probe touches only website_published and only the slug column", async () => {
    const { client, calls } = recorder({ data: { slug: "x" }, error: null });
    expect(await isSlugLive(client, "x")).toBe(true);
    expect(calls.filter(([m]) => m === "from")).toEqual([
      ["from", ["website_published"]],
    ]);
    expect(calls.find(([m]) => m === "select")![1]).toEqual(["slug"]);
  });

  it("the public service reads through the anonymous client, never a session client", () => {
    const source = readFileSync(
      "src/domains/website/website-service.ts",
      "utf8",
    );
    const publicFn = /export async function getPublicSite[\s\S]*?\n}\n/.exec(
      source,
    )![0];
    expect(publicFn).toContain("getAnonymousDb()");
    expect(publicFn).not.toMatch(/getAuthenticatedDb|website_sites|findSite/);
    expect(readFileSync("src/lib/db/client.ts", "utf8")).toMatch(
      /anonymous: true/,
    );
  });

  it("publish / unpublish / change slug still use the existing RPC names", () => {
    const text = readFileSync("src/lib/db/queries/website.ts", "utf8");
    for (const rpc of [
      "website_publish",
      "website_unpublish",
      "website_change_slug",
    ])
      expect(text).toContain(`"${rpc}"`);
  });
});
