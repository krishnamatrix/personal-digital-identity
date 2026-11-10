import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "preview.vercel.app" }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { signupAction } from "@/app/signup/actions";
import { forgotPasswordAction } from "@/app/forgot-password/actions";
import { resetPasswordAction } from "@/app/reset-password/actions";
import { GET } from "@/app/auth/callback/route";

const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};
const idle = { status: "idle", message: "" } as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClient.mockResolvedValue({
    auth: {
      signUp: mocks.signUp,
      resetPasswordForEmail: mocks.resetPasswordForEmail,
      getUser: mocks.getUser,
      updateUser: mocks.updateUser,
      signOut: mocks.signOut,
      exchangeCodeForSession: mocks.exchangeCodeForSession,
      verifyOtp: mocks.verifyOtp,
    },
  });
});

describe("sign-up", () => {
  const valid = {
    name: "Sam",
    email: "sam@example.test",
    password: "correct-horse",
    confirmPassword: "correct-horse",
  };

  it("rejects mismatched or short passwords without calling Supabase", async () => {
    const result = await signupAction(
      idle,
      form({ ...valid, confirmPassword: "different" }),
    );
    expect(result.status).toBe("error");
    expect(result.fieldErrors?.confirmPassword).toBeTruthy();
    expect(
      (
        await signupAction(
          idle,
          form({ ...valid, password: "short", confirmPassword: "short" }),
        )
      ).fieldErrors?.password,
    ).toBeTruthy();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("sends the confirmation link back to this deployment's callback and asks to check email", async () => {
    mocks.signUp.mockResolvedValue({ data: { session: null }, error: null });
    const result = await signupAction(idle, form(valid));
    expect(result.status).toBe("check_email");
    expect(mocks.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "sam@example.test",
        options: expect.objectContaining({
          data: { full_name: "Sam" },
          emailRedirectTo:
            "https://preview.vercel.app/auth/callback?next=/onboarding",
        }),
      }),
    );
  });

  it("goes straight to onboarding when a session exists (confirmation disabled locally)", async () => {
    mocks.signUp.mockResolvedValue({ data: { session: {} }, error: null });
    await expect(signupAction(idle, form(valid))).rejects.toThrow(
      "redirect:/onboarding",
    );
  });
});

describe("password reset", () => {
  it("gives the same answer for any address and uses the recovery callback", async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({
      error: { message: "user not found" },
    });
    const result = await forgotPasswordAction(
      { status: "idle", message: "" },
      form({ email: "ghost@example.test" }),
    );
    expect(result.status).toBe("sent");
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith(
      "ghost@example.test",
      {
        redirectTo:
          "https://preview.vercel.app/auth/callback?type=recovery&next=/reset-password",
      },
    );
  });

  it("requires a recovery session and matching passwords, then sends the user to sign in", async () => {
    const pw = {
      password: "a-new-password",
      confirmPassword: "a-new-password",
    };
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect(
      (await resetPasswordAction({ error: null }, form(pw))).error,
    ).toMatch(/expired/);
    expect(
      (
        await resetPasswordAction(
          { error: null },
          form({ ...pw, confirmPassword: "x" }),
        )
      ).error,
    ).toBeTruthy();

    mocks.getUser.mockResolvedValue({ data: { user: { id: "u" } } });
    mocks.updateUser.mockResolvedValue({ error: null });
    await expect(
      resetPasswordAction({ error: null }, form(pw)),
    ).rejects.toThrow("redirect:/login?message=password_updated");
    expect(mocks.updateUser).toHaveBeenCalledWith({
      password: "a-new-password",
    });
  });
});

describe("auth callback", () => {
  const call = (qs: string) =>
    GET({
      nextUrl: new URL(`https://preview.vercel.app/auth/callback?${qs}`),
    } as never);

  it("exchanges a code and lands on onboarding by default", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    const res = await call("code=abc");
    expect(res.headers.get("location")).toBe(
      "https://preview.vercel.app/onboarding",
    );
  });

  it("verifies a token hash for recovery and lands on reset-password", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: null });
    const res = await call("token_hash=h&type=recovery");
    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      type: "recovery",
      token_hash: "h",
    });
    expect(res.headers.get("location")).toBe(
      "https://preview.vercel.app/reset-password",
    );
  });

  it("never redirects off-site and fails safely on a bad link", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    expect(
      (await call("code=abc&next=//evil.test")).headers.get("location"),
    ).toBe("https://preview.vercel.app/onboarding");
    mocks.exchangeCodeForSession.mockResolvedValue({
      error: { message: "bad" },
    });
    expect((await call("code=bad")).headers.get("location")).toBe(
      "https://preview.vercel.app/login?error=link_invalid",
    );
    expect((await call("type=recovery")).headers.get("location")).toBe(
      "https://preview.vercel.app/forgot-password?error=link_invalid",
    );
  });
});
