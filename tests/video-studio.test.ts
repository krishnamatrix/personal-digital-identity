import { describe, expect, it } from "vitest";
import {
  draftFromResume,
  validateImage,
  validateScript,
} from "@/domains/video-studio/studio";

describe("video studio inputs", () => {
  it("accepts PNG signatures and rejects disguised or oversized photos", () => {
    expect(() =>
      validateImage(
        new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
        "image/png",
        8,
      ),
    ).not.toThrow();
    expect(() =>
      validateImage(new Uint8Array([1, 2, 3]), "image/png", 3),
    ).toThrow(/JPEG or PNG/);
    expect(() =>
      validateImage(new Uint8Array([255, 216, 255]), "image/jpeg", 3_000_000),
    ).toThrow(/2 MB/);
  });
  it("bounds scripts and counts whitespace consistently", () => {
    expect(validateScript("hello ".repeat(20)).words).toBe(20);
    expect(() => validateScript("hello")).toThrow(/10/);
    expect(() => validateScript("hello ".repeat(141))).toThrow(/140/);
  });
  it("extracts only provided résumé text and excludes contact lines", () => {
    const draft = draftFromResume(
      "Jamie Chen\njamie@example.com\nProduct designer building useful tools.\nExperience\nDesigning accessible products for teams.",
    );
    expect(draft).toContain("Product designer");
    expect(draft).not.toContain("example.com");
    expect(draft).not.toContain("10 years");
    expect(() => draftFromResume(" ")).toThrow(/readable/);
  });
});
