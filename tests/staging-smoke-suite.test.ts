import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("staging smoke suite (static safety properties)", () => {
  const spec = read("e2e/staging-smoke.spec.ts");
  const config = read("playwright.staging.config.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("reads only the process environment, starts no server, and requires https for deployed URLs", () => {
    expect(config).not.toMatch(
      /loadEnvConfig|dotenv|@next\/env|\.env\.(local|staging|production)/,
    );
    expect(config).toMatch(/process\.env\.SMOKE_BASE_URL/);
    expect(config).not.toMatch(/webServer/);
    expect(config).toMatch(/SMOKE_BASE_URL/);
    expect(config).toMatch(/https:/);
  });

  it("is skipped unless both dedicated accounts are configured", () => {
    expect(spec).toMatch(/test\.skip\(\s*!configured/);
  });

  it("creates exactly one SMOKE-tagged Persona and deletes only that one", () => {
    expect(spec).toMatch(/const personaName = `SMOKE \$\{tag\}`/);
    expect((spec.match(/\/personas\/new/g) ?? []).length).toBe(1);
    expect((spec.match(/Delete permanently/g) ?? []).length).toBeGreaterThan(0);
    // Cleanup navigates to the URL captured at creation, never to a list or pattern.
    expect(spec).toMatch(/await page\.goto\(personaUrl\)/);
    expect(spec).not.toMatch(/\.like\(|DELETE FROM|from\("personas"\)/);
  });

  it("never touches either account's profile", () => {
    expect(spec).not.toMatch(/Save profile/);
  });

  it("covers the eight required checks", () => {
    for (const label of [
      "health endpoint",
      "sign in",
      "account and profile",
      "Persona list",
      "can be created",
      "persists across a reload",
      "second user cannot see",
      "signing out closes the protected routes",
    ])
      expect(spec).toContain(label);
  });

  it("the local validation runs it too, so the suite is verified before staging", () => {
    expect(read("playwright.local.config.ts")).toMatch(
      /staging-smoke\.spec\.ts/,
    );
  });
});
