import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAuthenticatedClient: vi.fn(),
  ensureAccount: vi.fn(),
  findProfile: vi.fn(),
  createEmptyProfile: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createAuthenticatedClient: mocks.createAuthenticatedClient,
}));

vi.mock("@/domains/identity/profile-repository", () => ({
  ensureAccount: mocks.ensureAccount,
  findProfile: mocks.findProfile,
  createEmptyProfile: mocks.createEmptyProfile,
  updateProfile: mocks.updateProfile,
}));

import {
  getOwnProfile,
  updateOwnProfile,
} from "@/domains/identity/profile-service";

const verifiedUserId = "0f00b3c8-7ea4-42ad-a544-4d62d1a42f54";
const client = { from: vi.fn() };
const profile = {
  accountId: verifiedUserId,
  displayName: "Alex Morgan",
  headline: null,
  summary: null,
  location: null,
  websiteUrl: null,
  linkedinUrl: null,
  githubUrl: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("identity profile service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAuthenticatedClient.mockResolvedValue({
      client,
      user: { id: verifiedUserId },
    });
  });

  it("initializes an account and creates a profile for the verified user", async () => {
    mocks.findProfile.mockResolvedValue(null);
    mocks.createEmptyProfile.mockResolvedValue(profile);

    await expect(getOwnProfile()).resolves.toEqual(profile);
    expect(mocks.ensureAccount).toHaveBeenCalledWith(client, verifiedUserId);
    expect(mocks.findProfile).toHaveBeenCalledWith(client, verifiedUserId);
    expect(mocks.createEmptyProfile).toHaveBeenCalledWith(
      client,
      verifiedUserId,
    );
  });

  it("updates only the profile for the verified session user", async () => {
    mocks.createEmptyProfile.mockResolvedValue(profile);
    mocks.updateProfile.mockResolvedValue({ ...profile, headline: "Builder" });

    await expect(
      updateOwnProfile({ headline: " Builder " }),
    ).resolves.toMatchObject({ headline: "Builder" });
    expect(mocks.updateProfile).toHaveBeenCalledWith(client, verifiedUserId, {
      headline: "Builder",
    });
  });

  it("rejects unauthenticated profile access before repository calls", async () => {
    mocks.createAuthenticatedClient.mockRejectedValue(
      new Error("Sign in with a valid Folioone account to continue."),
    );

    await expect(getOwnProfile()).rejects.toThrow(/Sign in/);
    expect(mocks.ensureAccount).not.toHaveBeenCalled();
    expect(mocks.findProfile).not.toHaveBeenCalled();
  });

  it("rejects caller-supplied ownership fields before authentication or queries", async () => {
    await expect(
      updateOwnProfile({ accountId: "another-user", headline: "Builder" }),
    ).rejects.toThrow();
    expect(mocks.createAuthenticatedClient).not.toHaveBeenCalled();
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });
});
