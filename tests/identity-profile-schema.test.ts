import { describe, expect, it } from "vitest";
import { profileInputSchema } from "@/domains/identity/profile-schema";

describe("profileInputSchema", () => {
  it("accepts an empty private profile draft", () => {
    expect(profileInputSchema.parse({})).toEqual({});
  });

  it("trims text and accepts secure profile links", () => {
    expect(
      profileInputSchema.parse({
        displayName: "  Alex Morgan  ",
        websiteUrl: "https://example.com/about",
      }),
    ).toEqual({
      displayName: "Alex Morgan",
      websiteUrl: "https://example.com/about",
    });
  });

  it("rejects unsafe schemes and unknown fields", () => {
    expect(() =>
      profileInputSchema.parse({ websiteUrl: "javascript:alert(1)" }),
    ).toThrow();
    expect(() =>
      profileInputSchema.parse({ accountId: "caller-supplied" }),
    ).toThrow();
  });

  it("enforces field length limits", () => {
    expect(() =>
      profileInputSchema.parse({ displayName: "a".repeat(121) }),
    ).toThrow();
  });
});
