import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertLocalUrl,
  installFetchGuard,
  isLocalHost,
} from "../scripts/validate/local-guard.mjs";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("local validation guard", () => {
  it("accepts only loopback hosts", () => {
    for (const host of ["127.0.0.1", "localhost", "LOCALHOST", "::1", "[::1]"])
      expect(isLocalHost(host)).toBe(true);
    for (const host of [
      "abcd.supabase.co",
      "127.0.0.1.evil.example",
      "localhost.example.com",
      "10.0.0.5",
      "0.0.0.0",
    ])
      expect(isLocalHost(host)).toBe(false);
  });

  it("assertLocalUrl rejects hosted, malformed and empty URLs", () => {
    expect(assertLocalUrl("http://127.0.0.1:54321").port).toBe("54321");
    expect(() => assertLocalUrl("https://abcd.supabase.co")).toThrow(
      /not a local address/,
    );
    expect(() => assertLocalUrl("not a url")).toThrow(/not a valid URL/);
    expect(() => assertLocalUrl(undefined)).toThrow();
  });

  it("the fetch guard blocks non-loopback hosts before any network I/O", async () => {
    const calls: string[] = [];
    const fake = {
      fetch: async (input: unknown) => {
        calls.push(String(input));
        return new Response("ok");
      },
    } as unknown as typeof globalThis;
    const uninstall = installFetchGuard(fake);
    await expect(
      fake.fetch("https://abcd.supabase.co/rest/v1/personas"),
    ).rejects.toThrow(/Blocked request to "abcd.supabase.co"/);
    await expect(
      fake.fetch(new Request("https://evil.example/x")),
    ).rejects.toThrow(/Blocked request/);
    expect(calls).toEqual([]);
    expect(await (await fake.fetch("http://127.0.0.1:54321/x")).text()).toBe(
      "ok",
    );
    expect(calls).toEqual(["http://127.0.0.1:54321/x"]);
    uninstall();
  });
});

describe("local validation workflow (static properties)", () => {
  const files = [
    ...readdirSync(join(process.cwd(), "scripts/validate"))
      .filter((f) => f.endsWith(".mjs"))
      .map((f) => `scripts/validate/${f}`),
    "playwright.local.config.ts",
    "vitest.local.config.ts",
    "tests/helpers/local-only-setup.ts",
  ];

  it("never reads or uses the service-role key, JWT secret or a DB URL", () => {
    for (const file of files) {
      const text = read(file).replace(/^\s*\/\/.*$/gm, "");
      expect(text, file).not.toMatch(
        /SERVICE_ROLE|JWT_SECRET|DB_URL|process\.env\.(MIGRATION_)?DATABASE_URL/,
      );
    }
  });

  it("only the orchestrator's isolation probe touches env-file loading, and the Playwright config never does", () => {
    expect(read("playwright.local.config.ts")).not.toMatch(
      /loadEnvConfig|dotenv/,
    );
    expect(read("vitest.local.config.ts")).not.toMatch(/loadEnvConfig|dotenv/);
  });

  it("local suites refuse to run outside `pnpm validate`", () => {
    expect(read("tests/helpers/local-only-setup.ts")).toMatch(
      /FOLIOONE_VALIDATE/,
    );
    expect(read("playwright.local.config.ts")).toMatch(/FOLIOONE_VALIDATE/);
    expect(read("playwright.local.config.ts")).toMatch(/assertLocalUrl/);
  });

  it("applies the canonical folioone package in order, and mirrors the legacy public package only on request", () => {
    const script = read("scripts/validate/validate.mjs");
    const order = [
      "folioone-schema/001-create-schema.sql",
      "folioone-schema/002-identity-tables.sql",
      "folioone-schema/003-identity-rls.sql",
      "folioone-schema/004-persona-tables.sql",
      "folioone-schema/005-persona-rls-and-grants.sql",
      "folioone-schema/006-persona-functions.sql",
    ].map((f) => script.indexOf(f));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(script).toMatch(/--public-decoy/);
    expect(script).toMatch(/schema public is unchanged/);
  });

  it("always cleans up, and the validate script is registered", () => {
    expect(read("scripts/validate/validate.mjs")).toMatch(
      /finally\s*{\s*await cleanup\(\)/,
    );
    const pkg = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.validate).toBe("node scripts/validate/validate.mjs");
    expect(pkg.scripts.test).toBe("vitest run");
  });

  it("local Supabase config exposes only what the app uses", () => {
    const config = read("supabase/config.toml");
    expect(config).toMatch(/project_id = "folioone-local"/);
    expect(config).toMatch(
      /schemas = \["public", "graphql_public", "folioone"\]/,
    );
    for (const section of [
      "realtime",
      "studio",
      "storage",
      "edge_runtime",
      "analytics",
    ])
      expect(config, section).toMatch(
        new RegExp(`\\[${section}\\]\\nenabled = false`),
      );
  });
});
