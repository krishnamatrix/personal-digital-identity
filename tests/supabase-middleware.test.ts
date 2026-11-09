import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getUser: vi.fn(),
  next: vi.fn(),
  responseCookieSet: vi.fn(),
  requestCookieSet: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));
vi.mock("next/server", () => ({
  NextResponse: { next: mocks.next },
}));

describe("Supabase profile-session middleware", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-publishable-key");
    vi.stubEnv("NODE_ENV", "test");
    mocks.responseCookieSet.mockReset();
    mocks.requestCookieSet.mockReset();
    mocks.next.mockReturnValue({
      cookies: { set: mocks.responseCookieSet },
    });
    mocks.createServerClient.mockImplementation((_url, _key, options) => {
      return {
        auth: {
          getUser: async () => {
            mocks.getUser();
            options.cookies.setAll([
              {
                name: "sb-project-auth-token",
                value: "refreshed-session",
                options: { httpOnly: true },
              },
            ]);
            return { data: { user: null }, error: null };
          },
        },
      };
    });
  });

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("refreshes cookies on the request and response before profile rendering", async () => {
    const { middleware } = await import("@/middleware");
    const request = {
      cookies: {
        getAll: () => [],
        set: mocks.requestCookieSet,
      },
    } as unknown as NextRequest;

    await middleware(request);

    expect(mocks.createServerClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "test-publishable-key",
      expect.objectContaining({
        cookies: expect.any(Object),
        db: { schema: "folioone" },
      }),
    );
    expect(mocks.getUser).toHaveBeenCalledOnce();
    expect(mocks.requestCookieSet).toHaveBeenCalledWith(
      "sb-project-auth-token",
      "refreshed-session",
    );
    expect(mocks.responseCookieSet).toHaveBeenCalledWith(
      "sb-project-auth-token",
      "refreshed-session",
      { httpOnly: true },
    );
  });
});
