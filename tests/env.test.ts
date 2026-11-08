import { afterEach, describe, expect, it, vi } from "vitest";

describe("Supabase environment validation", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("allows static UI startup without Supabase configuration", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("NODE_ENV", "test");

    const { env, requireSupabaseConfig } = await import("@/lib/env");
    expect(env.NODE_ENV).toBe("test");
    expect(Object.keys(env)).not.toContain("DATABASE_URL");
    expect(Object.keys(env)).not.toContain("MIGRATION_DATABASE_URL");
    expect(() => requireSupabaseConfig()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("rejects invalid Supabase URLs", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "not-a-url");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-publishable-key");
    vi.stubEnv("NODE_ENV", "test");

    await expect(import("@/lib/env")).rejects.toThrow();
  });

  it("returns only public Supabase configuration, not administrative secrets", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-publishable-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-admin-key");
    vi.stubEnv("DATABASE_URL", "postgres://synthetic-admin-url");
    vi.stubEnv("MIGRATION_DATABASE_URL", "postgres://synthetic-migration-url");
    vi.stubEnv("NODE_ENV", "test");

    const { env, requireSupabaseConfig } = await import("@/lib/env");
    expect(requireSupabaseConfig()).toEqual({
      url: "https://project.supabase.co",
      anonKey: "test-publishable-key",
    });
    expect(Object.keys(env)).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(Object.keys(env)).not.toContain("DATABASE_URL");
    expect(Object.keys(env)).not.toContain("MIGRATION_DATABASE_URL");
  });
});
