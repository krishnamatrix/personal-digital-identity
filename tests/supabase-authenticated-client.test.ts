import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createServerClient: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));

describe("authenticated Supabase server client", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-publishable-key");
    vi.stubEnv("NODE_ENV", "test");
    mocks.cookies.mockResolvedValue({
      getAll: () => [],
      set: vi.fn(),
    });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "0f00b3c8-7ea4-42ad-a544-4d62d1a42f54" } },
      error: null,
    });
  });

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("uses the cookie-backed public client and requires a verified user", async () => {
    const authenticatedClient = {
      auth: { getUser: mocks.getUser },
      from: vi.fn(),
    };
    mocks.createServerClient.mockReturnValue(authenticatedClient);

    const { createAuthenticatedClient } = await import("@/lib/supabase/server");
    const result = await createAuthenticatedClient();

    expect(result.client).toBe(authenticatedClient);
    expect(result.user.id).toBe("0f00b3c8-7ea4-42ad-a544-4d62d1a42f54");
    expect(mocks.getUser).toHaveBeenCalledOnce();
    expect(mocks.createServerClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "test-publishable-key",
      expect.objectContaining({
        cookies: expect.any(Object),
        db: { schema: "folioone" },
      }),
    );
  });

  it("rejects invalid or missing sessions before any PostgREST query", async () => {
    const authenticatedClient = {
      auth: { getUser: mocks.getUser },
      from: vi.fn(),
    };
    mocks.createServerClient.mockReturnValue(authenticatedClient);
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: { status: 401 },
    });

    const { AuthenticationRequiredError, createAuthenticatedClient } =
      await import("@/lib/supabase/server");

    await expect(createAuthenticatedClient()).rejects.toBeInstanceOf(
      AuthenticationRequiredError,
    );
    expect(authenticatedClient.from).not.toHaveBeenCalled();
  });
});
