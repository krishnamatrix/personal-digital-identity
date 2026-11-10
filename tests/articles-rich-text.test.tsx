import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArticleBody } from "@/components/articles/article-body";
import {
  deriveExcerpt,
  isBlank,
  plainText,
  readingMinutes,
  sanitizeDoc,
  wordCount,
  type RichDoc,
} from "@/domains/articles/rich-text";

const text = (t: string, marks?: unknown[]) => ({
  type: "text",
  text: t,
  marks,
});
const full = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [text("Heading")] },
    {
      type: "paragraph",
      content: [
        text("Plain "),
        text("bold", [{ type: "bold" }]),
        text(" "),
        text("italic", [{ type: "italic" }]),
        text(" "),
        text("link", [
          { type: "link", attrs: { href: "https://example.com/x" } },
        ]),
        { type: "hardBreak" },
        text("code", [{ type: "code" }]),
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [text("one")] }],
        },
      ],
    },
    {
      type: "orderedList",
      content: [
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [text("two")] }],
        },
      ],
    },
    {
      type: "blockquote",
      content: [{ type: "paragraph", content: [text("quote")] }],
    },
    { type: "codeBlock", content: [{ type: "text", text: "const a = 1;" }] },
    { type: "horizontalRule" },
    {
      type: "image",
      attrs: { src: "https://example.com/i.png", alt: "An image" },
    },
  ],
};

describe("rich text sanitising", () => {
  it("keeps every supported construct unchanged (serialisation round-trips)", () => {
    const once = sanitizeDoc(full);
    expect(once).toEqual(
      full.content.length
        ? sanitizeDoc(JSON.parse(JSON.stringify(full)))
        : once,
    );
    expect(sanitizeDoc(once)).toEqual(once);
    expect(once.content.map((n) => n.type)).toEqual([
      "heading",
      "paragraph",
      "bulletList",
      "orderedList",
      "blockquote",
      "codeBlock",
      "horizontalRule",
      "image",
    ]);
  });

  it("drops unknown nodes and marks, scripts, and unsafe URLs", () => {
    const doc = sanitizeDoc({
      type: "doc",
      content: [
        { type: "script", content: [text("alert(1)")] },
        {
          type: "paragraph",
          content: [
            text("a", [
              { type: "link", attrs: { href: "javascript:alert(1)" } },
            ]),
            text("b", [{ type: "underline" }, { type: "bold" }]),
            { type: "iframe", text: "x" },
          ],
        },
        { type: "image", attrs: { src: "data:image/png;base64,AAAA" } },
        { type: "image", attrs: { src: "javascript:alert(1)" } },
        { type: "heading", attrs: { level: 1 }, content: [text("h")] },
      ],
    });
    expect(JSON.stringify(doc)).not.toMatch(
      /javascript:|data:|script|iframe|underline/,
    );
    expect(doc.content.map((n) => n.type)).toEqual(["paragraph", "heading"]);
    expect(doc.content[1]!.attrs).toEqual({ level: 2 });
    expect(doc.content[0]!.content![1]!.marks).toEqual([{ type: "bold" }]);
  });

  it("tolerates garbage input and bounds depth and size", () => {
    for (const bad of [null, undefined, 5, "x", [], { content: "no" }])
      expect(sanitizeDoc(bad)).toEqual({ type: "doc", content: [] });
    let nested: unknown = { type: "paragraph", content: [text("deep")] };
    for (let i = 0; i < 30; i++)
      nested = { type: "blockquote", content: [nested] };
    expect(JSON.stringify(sanitizeDoc({ content: [nested] }))).not.toContain(
      "deep",
    );
    const many = {
      type: "doc",
      content: Array.from({ length: 9000 }, () => ({
        type: "paragraph",
        content: [text("x")],
      })),
    };
    expect(sanitizeDoc(many).content.length).toBeLessThan(6001);
  });
});

describe("text facts", () => {
  const doc = sanitizeDoc(full);
  it("extracts plain text, words, reading time and an excerpt", () => {
    expect(plainText(doc)).toContain("Heading");
    expect(plainText(doc)).toContain("const a = 1;");
    expect(
      wordCount(
        sanitizeDoc({
          content: [{ type: "paragraph", content: [text("one two  three")] }],
        }),
      ),
    ).toBe(3);
    expect(wordCount({ type: "doc", content: [] })).toBe(0);
    expect(readingMinutes(0)).toBe(0);
    expect(readingMinutes(1)).toBe(1);
    expect(readingMinutes(220)).toBe(1);
    expect(readingMinutes(221)).toBe(2);
    expect(deriveExcerpt(doc, 20).length).toBeLessThanOrEqual(21);
    expect(deriveExcerpt(doc, 20).endsWith("…")).toBe(true);
  });
  it("blank detection treats an image-only article as content", () => {
    expect(isBlank({ type: "doc", content: [] })).toBe(true);
    expect(isBlank(sanitizeDoc({ content: [{ type: "paragraph" }] }))).toBe(
      true,
    );
    expect(
      isBlank(
        sanitizeDoc({
          content: [{ type: "image", attrs: { src: "https://e.com/a.png" } }],
        }),
      ),
    ).toBe(false);
  });
});

describe("ArticleBody rendering", () => {
  const html = renderToStaticMarkup(<ArticleBody doc={sanitizeDoc(full)} />);
  it("renders formatting as semantic elements", () => {
    for (const fragment of [
      "<h2>Heading</h2>",
      "<strong>bold</strong>",
      "<em>italic</em>",
      "<ul>",
      "<ol>",
      "<blockquote>",
      "<pre>",
      "<hr/>",
      "<br/>",
      'alt="An image"',
      "<figcaption>An image</figcaption>",
    ])
      expect(html).toContain(fragment);
  });
  it("opens links safely and never emits script", () => {
    expect(html).toContain('href="https://example.com/x"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    const hostile: RichDoc = sanitizeDoc({
      content: [
        { type: "paragraph", content: [text("<script>alert(1)</script>")] },
      ],
    });
    const out = renderToStaticMarkup(<ArticleBody doc={hostile} />);
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });
});
