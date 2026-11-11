import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import { loginAction, logoutAction } from "@/app/login/actions";

describe("authentication actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({
      auth: {
        signInWithPassword: mocks.signInWithPassword,
        signOut: mocks.signOut,
      },
    });
  });

  it("signs in with submitted credentials and redirects without echoing them", async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: null });
    const form = new FormData();
    form.set("email", "dev@example.test");
    form.set("password", "synthetic-test-password");

    await expect(loginAction({ error: null }, form)).rejects.toThrow(
      "redirect:/onboarding",
    );
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "dev@example.test",
      password: "synthetic-test-password",
    });
  });

  it("returns a generic error when Supabase rejects sign-in", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      error: new Error("synthetic provider detail"),
    });
    const form = new FormData();
    form.set("email", "dev@example.test");
    form.set("password", "synthetic-test-password");

    await expect(loginAction({ error: null }, form)).resolves.toEqual({
      error: "We could not sign you in with those credentials.",
    });
  });

  it("signs out only the current session and redirects to login", async () => {
    mocks.signOut.mockResolvedValue({ error: null });

    await expect(logoutAction({ error: null }, new FormData())).rejects.toThrow(
      "redirect:/login",
    );
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("keeps logout errors generic", async () => {
    mocks.signOut.mockResolvedValue({
      error: new Error("synthetic provider detail"),
    });

    await expect(
      logoutAction({ error: null }, new FormData()),
    ).resolves.toEqual({
      error: "We could not sign you out. Please try again.",
    });
  });
});
