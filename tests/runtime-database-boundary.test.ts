import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("application database security boundary", () => {
  it("has no direct PostgreSQL or administrative credential path in src", () => {
    const source = sourceFiles(join(process.cwd(), "src"))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(source).not.toMatch(/from\s+["']postgres["']/);
    expect(source).not.toMatch(/\b(?:DATABASE_URL|MIGRATION_DATABASE_URL)\b/);
    expect(source).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(source).not.toMatch(
      /requireDatabaseUrl|requireMigrationDatabaseUrl/,
    );
  });
});
