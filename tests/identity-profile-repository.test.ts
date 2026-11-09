import type { FolioneClient } from "@/lib/db-schema";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  findProfile,
  updateProfile,
} from "@/domains/identity/profile-repository";
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
