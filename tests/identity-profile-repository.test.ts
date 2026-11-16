import type { FolioneClient } from "@/lib/db/schema";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  findProfile,
  findViewerProfile,
  ProfilePersistenceError,
  updateProfile,
} from "@/lib/db/queries/identity";
import { AuthorizationError } from "@/lib/supabase/server";

const verifiedUserId = "0f00b3c8-7ea4-42ad-a544-4d62d1a42f54";

function makeQuery(data: unknown = null, error: unknown = null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
    update: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.update.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data, error });
  const client = {
    from: vi.fn(() => query),
  } as unknown as FolioneClient;
  return { client, query };
}

const profileRow = {
  account_id: verifiedUserId,
  display_name: "Alex Morgan",
  headline: null,
  summary: null,
  location: null,
  website_url: null,
  linkedin_url: null,
  github_url: null,
  full_name: null,
  profile_image_url: null,
  cover_image_url: null,
  contact_email: null,
  phone: null,
  current_designation: null,
  current_organization: null,
  industry: null,
  professional_summary: null,
  primary_purpose: null,
  onboarding_step: 1,
  onboarding_completed_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("identity profile repository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes retrieval to the verified account id", async () => {
    const { client, query } = makeQuery(null);

    await expect(findProfile(client, verifiedUserId)).resolves.toBeNull();
    expect(client.from).toHaveBeenCalledWith("identity_profiles");
    expect(query.eq).toHaveBeenCalledWith("account_id", verifiedUserId);
  });

  it("scopes updates to the verified account and returns the updated profile", async () => {
    const { client, query } = makeQuery(profileRow);

    await expect(
      updateProfile(client, verifiedUserId, { headline: "Builder" }),
    ).resolves.toMatchObject({ accountId: verifiedUserId, headline: null });
    expect(query.update).toHaveBeenCalledWith(
      expect.objectContaining({ headline: "Builder" }),
    );
    expect(query.eq).toHaveBeenCalledWith("account_id", verifiedUserId);
  });

  it("maps database privilege errors to an authorization error", async () => {
    const { client } = makeQuery(null, { code: "42501" });

    await expect(findProfile(client, verifiedUserId)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  });
});

describe("workspace viewer profile projection", () => {
  it("loads only viewer fields with the verified owner filter", async () => {
    const { client, query } = makeQuery({
      display_name: "Priya",
      full_name: "Priya Natarajan",
      headline: "Builder",
    });
    await expect(findViewerProfile(client, verifiedUserId)).resolves.toEqual({
      displayName: "Priya",
      fullName: "Priya Natarajan",
      headline: "Builder",
    });
    expect(query.select).toHaveBeenCalledExactlyOnceWith(
      "display_name,full_name,headline",
    );
    expect(query.eq).toHaveBeenCalledExactlyOnceWith(
      "account_id",
      verifiedUserId,
    );
  });

  it.each(["42703", "PGRST204"])(
    "recovers %s once with baseline viewer columns and the same owner",
    async (code) => {
      const { client, query } = makeQuery();
      query.maybeSingle
        .mockResolvedValueOnce({ data: null, error: { code } })
        .mockResolvedValueOnce({
          data: { display_name: "Priya", headline: null },
          error: null,
        });
      await expect(findViewerProfile(client, verifiedUserId)).resolves.toEqual({
        displayName: "Priya",
        fullName: null,
        headline: null,
      });
      expect(query.select.mock.calls).toEqual([
        ["display_name,full_name,headline"],
        ["display_name,headline"],
      ]);
      expect(query.eq.mock.calls).toEqual([
        ["account_id", verifiedUserId],
        ["account_id", verifiedUserId],
      ]);
    },
  );

  it("returns null for a missing profile without attempting to create it", async () => {
    const { client, query } = makeQuery();
    await expect(findViewerProfile(client, verifiedUserId)).resolves.toBeNull();
    expect(client.from).toHaveBeenCalledTimes(1);
    expect(query.update).not.toHaveBeenCalled();
  });

  it.each(["42501", "PGRST301", "42P01", "08006"])(
    "does not retry or swallow %s",
    async (code) => {
      const { client, query } = makeQuery(null, { code });
      await expect(
        findViewerProfile(client, verifiedUserId),
      ).rejects.toBeInstanceOf(
        code === "42501" || code === "PGRST301"
          ? AuthorizationError
          : ProfilePersistenceError,
      );
      expect(query.maybeSingle).toHaveBeenCalledTimes(1);
    },
  );

  it("surfaces a failed compatibility retry without retrying again", async () => {
    const { client, query } = makeQuery(null, { code: "42703" });
    await expect(
      findViewerProfile(client, verifiedUserId),
    ).rejects.toMatchObject({
      name: "ProfilePersistenceError",
      code: "42703",
    });
    expect(query.maybeSingle).toHaveBeenCalledTimes(2);
  });

  it("keeps full profile reads strict when expanded columns are missing", async () => {
    const { client, query } = makeQuery(null, { code: "42703" });
    await expect(findProfile(client, verifiedUserId)).rejects.toMatchObject({
      name: "ProfilePersistenceError",
      code: "42703",
    });
    expect(query.maybeSingle).toHaveBeenCalledTimes(1);
  });
});
