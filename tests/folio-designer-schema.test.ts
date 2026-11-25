import { describe, expect, it } from "vitest";
import {
  designPromptSchema,
  extractHtmlDocument,
  extractHtmlTitle,
  PROMPT_MAX,
  stitchHtmlContinuation,
} from "@/domains/folio-designer/folio-designer-schema";

describe("folio-designer-schema", () => {
  it("validates prompt length bounds and supports long design specs", () => {
    expect(() => designPromptSchema.parse("short")).toThrow();
    expect(designPromptSchema.parse("a".repeat(20))).toBe("a".repeat(20));
    expect(designPromptSchema.parse("a".repeat(20_000)).length).toBe(20_000);
    expect(() => designPromptSchema.parse("a".repeat(PROMPT_MAX + 1))).toThrow();
  });

  it("extracts standalone HTML from fenced or thinking-prefixed output", () => {
    const raw = `<think>planning</think>\n\`\`\`html\n<!DOCTYPE html>\n<html lang="en"><head><title>Jamie Portfolio</title></head><body><h1>Jamie</h1></body></html>\n\`\`\``;
    const html = extractHtmlDocument(raw);
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html.endsWith("</html>")).toBe(true);
    expect(extractHtmlTitle(html)).toBe("Jamie Portfolio");
  });

  it("throws when model output does not contain an HTML document", () => {
    expect(() => extractHtmlDocument("Just plain text without html")).toThrow();
  });

  it("stitches continuation chunks seamlessly and trims overlapping tail text", () => {
    const part1 =
      "<!DOCTYPE html><html><body><section class=\"projects\"><h2>Projects</h2>";
    const part2 =
      "class=\"projects\"><h2>Projects</h2><p>Neretva Atlas</p></section></body></html>";
    const stitched = stitchHtmlContinuation(part1, part2);
    expect(stitched).toBe(
      "<!DOCTYPE html><html><body><section class=\"projects\"><h2>Projects</h2><p>Neretva Atlas</p></section></body></html>",
    );
  });
});
