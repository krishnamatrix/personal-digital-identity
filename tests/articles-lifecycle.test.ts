import { describe, expect, it } from "vitest";
import {
  articleInputSchema,
  displayExcerpt,
  deriveBodyFacts,
} from "@/domains/articles/article-schema";
import {
  canTransition,
  publishProblems,
  slugFromTitle,
  withSuffix,
} from "@/domains/articles/lifecycle";
import { sanitizeDoc } from "@/domains/articles/rich-text";

describe("lifecycle rules", () => {
  it("allows exactly Draft -> Published -> Archived with unpublish and restore", () => {
    const ok = [
      ["draft", "published"],
      ["draft", "archived"],
      ["published", "draft"],
      ["published", "archived"],
      ["archived", "draft"],
    ] as const;
    const all = ["draft", "published", "archived"] as const;
    for (const from of all)
      for (const to of all)
        expect(canTransition(from, to), `${from}->${to}`).toBe(
          ok.some(([a, b]) => a === from && b === to),
        );
  });
  it("an archived article cannot jump straight to published", () => {
    expect(canTransition("archived", "published")).toBe(false);
  });
  it("publishing needs a title and content", () => {
    const body = sanitizeDoc({
      content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }],
    });
    expect(publishProblems({ title: " ", content: body })).toEqual([
      "no_title",
    ]);
    expect(publishProblems({ title: "T", content: sanitizeDoc(null) })).toEqual(
      ["no_content"],
    );
    expect(publishProblems({ title: "T", content: body })).toEqual([]);
  });
});

describe("slugs", () => {
  it("makes a safe, stable address from the title", () => {
    expect(slugFromTitle("Hello, World!")).toBe("hello-world");
    expect(slugFromTitle("Café déjà vu")).toBe("cafe-deja-vu");
    expect(slugFromTitle("  ")).toBe("article");
    expect(slugFromTitle("Hi")).toBe("article-hi");
    expect(slugFromTitle("x".repeat(200)).length).toBeLessThanOrEqual(60);
    for (const t of ["Hello, World!", "日本語", "A/B test #1"])
      expect(slugFromTitle(t)).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
  it("adds a suffix only on retry", () => {
    expect(withSuffix("a-title", 0, "abc")).toBe("a-title");
    expect(withSuffix("a-title", 1, "abc")).toBe("a-title-abc");
  });
});

describe("input validation", () => {
  const base = { title: "T", content: { type: "doc", content: [] } };
  it("normalises blanks, tags and the body", () => {
    const parsed = articleInputSchema.parse({
      ...base,
      subtitle: "  ",
      tags: ["A", "a", "b"],
      content: { content: [{ type: "script" }] },
    });
    expect(parsed.subtitle).toBeNull();
    expect(parsed.tags).toEqual(["A", "b"]);
    expect(parsed.content).toEqual({ type: "doc", content: [] });
  });
  it("rejects bad URLs and over-long fields", () => {
    expect(() =>
      articleInputSchema.parse({ ...base, coverImageUrl: "javascript:x" }),
    ).toThrow();
    expect(() =>
      articleInputSchema.parse({ ...base, title: "x".repeat(201) }),
    ).toThrow();
    expect(() =>
      articleInputSchema.parse({
        ...base,
        tags: Array(11)
          .fill("t")
          .map((t, i) => t + i),
      }),
    ).toThrow();
    expect(
      articleInputSchema.parse({
        ...base,
        coverImageUrl: "https://e.com/a.png",
      }).coverImageUrl,
    ).toBe("https://e.com/a.png");
  });
  it("derives facts and excerpts", () => {
    const content = sanitizeDoc({
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "one two three" }],
        },
      ],
    });
    expect(deriveBodyFacts(content)).toEqual({
      bodyText: "one two three",
      wordCount: 3,
      readingMinutes: 1,
    });
    expect(displayExcerpt({ excerpt: "E", subtitle: "S", content })).toBe("E");
    expect(displayExcerpt({ excerpt: null, subtitle: "S", content })).toBe("S");
    expect(displayExcerpt({ excerpt: null, subtitle: null, content })).toBe(
      "one two three",
    );
  });
});
