import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  plan: vi.fn(),
  admin: vi.fn(),
  log: vi.fn(),
  signal: new Error("framework control flow"),
}));
vi.mock("@/lib/db/query", async () => ({
  ...(await vi.importActual("@/lib/db/queries/identity")),
  ...(await vi.importActual("@/lib/db/queries/billing")),
  getAuthenticatedDb: mocks.session,
  findPlan: mocks.plan,
  isPlatformAdmin: mocks.admin,
}));
vi.mock("@/lib/server-log", () => ({ logLoadError: mocks.log }));
vi.mock("next/navigation", () => ({
  unstable_rethrow: (error: unknown) => {
    if (error === mocks.signal) throw error;
  },
}));

import { getViewer } from "@/domains/identity/viewer";
import { AuthenticationRequiredError } from "@/lib/supabase/server";
import { BillingPersistenceError } from "@/lib/db/queries/billing";

const ownerId = "0f00b3c8-7ea4-42ad-a544-4d62d1a42f54";
function queryReturning(data: unknown = null, error: unknown = null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  mocks.session.mockResolvedValue({
    client: { from: vi.fn(() => query) },
    user: {
      id: ownerId,
      email: "priya@example.com",
      user_metadata: { full_name: "Priya Signup" },
    },
  });
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.plan.mockResolvedValue(null);
  mocks.admin.mockResolvedValue(false);
});

describe("workspace viewer loading", () => {
  it("keeps modern saved-full-name precedence and headline", async () => {
    queryReturning({
      display_name: " ",
      full_name: "Priya Saved",
      headline: "Builder",
    });
    await expect(getViewer()).resolves.toEqual({
      name: "Priya Saved",
      headline: "Builder",
      isPro: false,
      isAdmin: false,
    });
    expect(mocks.log).not.toHaveBeenCalled();
  });

  it("uses a legacy display name without logging a recovered missing column", async () => {
    const query = queryReturning();
    query.maybeSingle
      .mockResolvedValueOnce({ data: null, error: { code: "42703" } })
      .mockResolvedValueOnce({
        data: { display_name: "Priya Legacy", headline: "Builder" },
        error: null,
      });
    await expect(getViewer()).resolves.toEqual({
      name: "Priya Legacy",
      headline: "Builder",
      isPro: false,
      isAdmin: false,
    });
    expect(query.eq.mock.calls).toEqual([
      ["account_id", ownerId],
      ["account_id", ownerId],
    ]);
    expect(mocks.log).not.toHaveBeenCalled();
  });

  it("uses signup identity when a legacy row has no display name", async () => {
    const query = queryReturning();
    query.maybeSingle
      .mockResolvedValueOnce({ data: null, error: { code: "42703" } })
      .mockResolvedValueOnce({
        data: { display_name: null, headline: null },
        error: null,
      });
    await expect(getViewer()).resolves.toMatchObject({ name: "Priya Signup" });
    expect(mocks.log).not.toHaveBeenCalled();
  });

  it("uses signup identity without an error when no profile row exists", async () => {
    queryReturning();
    await expect(getViewer()).resolves.toMatchObject({
      name: "Priya Signup",
      headline: null,
    });
    expect(mocks.log).not.toHaveBeenCalled();
  });

  it("retains a profile error log and fallback identity after an unrecovered failure", async () => {
    const query = queryReturning(null, { code: "42501" });
    await expect(getViewer()).resolves.toMatchObject({ name: "Priya Signup" });
    expect(query.maybeSingle).toHaveBeenCalledTimes(1);
    expect(mocks.log).toHaveBeenCalledWith(
      "workspace-viewer",
      expect.objectContaining({ name: "AuthorizationError" }),
    );
  });

  it("preserves Free chrome and the distinct diagnostic when the billing read fails", async () => {
    queryReturning({ display_name: "Priya", full_name: null, headline: null });
    const error = new Error("billing unavailable");
    mocks.plan.mockRejectedValueOnce(error);
    await expect(getViewer()).resolves.toMatchObject({
      name: "Priya",
      isPro: false,
      isAdmin: false,
    });
    expect(mocks.log).toHaveBeenCalledExactlyOnceWith(
      "workspace-viewer:plan",
      error,
    );
  });

  it("keeps the paid-plan result when profile compatibility is needed", async () => {
    const query = queryReturning();
    query.maybeSingle
      .mockResolvedValueOnce({ data: null, error: { code: "42703" } })
      .mockResolvedValueOnce({
        data: { display_name: "Priya", headline: null },
        error: null,
      });
    mocks.plan.mockResolvedValueOnce({
      plan: "pro",
      proUntil: new Date("2099-01-01"),
    });
    await expect(getViewer()).resolves.toMatchObject({
      name: "Priya",
      isPro: true,
      isAdmin: false,
    });
  });

  it.each(["PGRST205", "42P01"])(
    "uses Free chrome without an error overlay when billing tables are unavailable (%s)",
    async (code) => {
      queryReturning({
        display_name: "Priya",
        full_name: null,
        headline: null,
      });
      mocks.plan.mockRejectedValueOnce(new BillingPersistenceError(code));
      await expect(getViewer()).resolves.toMatchObject({
        name: "Priya",
        isPro: false,
        isAdmin: false,
      });
      expect(mocks.plan).toHaveBeenCalledTimes(1);
      expect(mocks.log).not.toHaveBeenCalled();
    },
  );

  it.each(["42703", "42501", "08006"])(
    "retains diagnostics for other billing failures (%s)",
    async (code) => {
      queryReturning({
        display_name: "Priya",
        full_name: null,
        headline: null,
      });
      const error = new BillingPersistenceError(code);
      mocks.plan.mockRejectedValueOnce(error);
      await expect(getViewer()).resolves.toMatchObject({ isPro: false });
      expect(mocks.log).toHaveBeenCalledExactlyOnceWith(
        "workspace-viewer:plan",
        error,
      );
    },
  );

  it("does not silence a missing-table code on an unrelated error type", async () => {
    queryReturning({ display_name: "Priya", full_name: null, headline: null });
    const error = Object.assign(new Error("unrelated"), { code: "PGRST205" });
    mocks.plan.mockRejectedValueOnce(error);
    await getViewer();
    expect(mocks.log).toHaveBeenCalledExactlyOnceWith(
      "workspace-viewer:plan",
      error,
    );
  });

  it("rethrows billing framework signals without logging or returning a plan", async () => {
    queryReturning({ display_name: "Priya", full_name: null, headline: null });
    mocks.plan.mockRejectedValueOnce(mocks.signal);
    await expect(getViewer()).rejects.toBe(mocks.signal);
    expect(mocks.log).not.toHaveBeenCalled();
  });

  it("returns null quietly for signed-out callers", async () => {
    mocks.session.mockRejectedValueOnce(new AuthenticationRequiredError());
    await expect(getViewer()).resolves.toBeNull();
    expect(mocks.log).not.toHaveBeenCalled();
    expect(mocks.plan).not.toHaveBeenCalled();
  });

  it("logs an unexpected session failure without reading profile or plan", async () => {
    const error = new Error("session unavailable");
    mocks.session.mockRejectedValueOnce(error);
    await expect(getViewer()).resolves.toBeNull();
    expect(mocks.log).toHaveBeenCalledExactlyOnceWith(
      "workspace-viewer",
      error,
    );
    expect(mocks.plan).not.toHaveBeenCalled();
  });

  it("propagates framework control-flow signals instead of treating them as load failures", async () => {
    const query = queryReturning();
    query.maybeSingle.mockRejectedValueOnce(mocks.signal);
    await expect(getViewer()).rejects.toBe(mocks.signal);
    expect(mocks.log).not.toHaveBeenCalled();
    expect(mocks.plan).not.toHaveBeenCalled();
  });
});

describe("workspace viewer: platform admin flag", () => {
  it("marks a platform admin, and never fails the chrome if the lookup fails", async () => {
    queryReturning({ display_name: "Ada", headline: null });
    mocks.admin.mockResolvedValueOnce(true);
    await expect(getViewer()).resolves.toMatchObject({ isAdmin: true });
    const error = new Error("down");
    mocks.admin.mockRejectedValueOnce(error);
    await expect(getViewer()).resolves.toMatchObject({ isAdmin: false });
    expect(mocks.log).toHaveBeenCalledWith("workspace-viewer:admin", error);
  });
});
