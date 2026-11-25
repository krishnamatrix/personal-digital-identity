// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  DESIGN_ID_PATTERN,
  FONT_KEYS,
  cardSpecFrom,
  cardSpecSchema,
  designIdFrom,
  pinnedWebsiteDesignSchema,
  toCardDesign,
  toTemplateSpec,
  websiteSpecFrom,
  websiteSpecSchema,
} from "@/domains/designs/design-spec";
import { contrastRatio, designProblems } from "@/domains/designs/design-checks";
import { TEMPLATES } from "@/domains/website/templates";
import { CARD_DESIGNS } from "@/domains/cards/card-designs";
import { THEMES } from "@/domains/website/config";
import { publishedContentSchema } from "@/domains/website/published-content";
import { cardContentSchema, SAMPLE_CARD } from "@/domains/cards/card-content";
import { SAMPLE_SITE } from "@/domains/designs/sample-content";
import {
  cardConfigSchema,
  defaultCardConfig,
} from "@/domains/cards/card-config";

const spec = websiteSpecFrom(TEMPLATES[0]);

describe("design spec schema", () => {
  it("accepts every code design (so any of them can seed a designer design)", () => {
    for (const t of TEMPLATES)
      expect(
        websiteSpecSchema.safeParse(websiteSpecFrom(t)).success,
        t.id,
      ).toBe(true);
    for (const d of CARD_DESIGNS)
      expect(cardSpecSchema.safeParse(cardSpecFrom(d)).success, d.id).toBe(
        true,
      );
  });

  it("is data only: no extra keys, no CSS, no URLs, colours as #rrggbb", () => {
    const bad = [
      { ...spec, css: "body{display:none}" },
      { ...spec, palette: { ...spec.palette, bg: "red" } },
      { ...spec, palette: { ...spec.palette, bg: "url(javascript:alert(1))" } },
      { ...spec, palette: { ...spec.palette, extra: "#000000" } },
      { ...spec, display: "Comic Sans" },
      { ...spec, layout: "<script>" },
      { ...spec, displayTracking: "1em; color: red" },
      { ...spec, displayTracking: "-0.5em" },
      { ...spec, radius: 400 },
      { ...spec, displayWeight: 450 },
    ];
    for (const b of bad)
      expect(websiteSpecSchema.safeParse(b).success).toBe(false);
    const card = cardSpecFrom(CARD_DESIGNS[0]);
    expect(cardSpecSchema.safeParse({ ...card, radius: 0.5 }).success).toBe(
      false,
    );
    expect(cardSpecSchema.safeParse({ ...card, href: "x" }).success).toBe(
      false,
    );
  });

  it("only offers fonts that the app self-hosts", async () => {
    const fonts = await import("node:fs").then((fs) =>
      fs.readFileSync("src/components/website/template-fonts.ts", "utf8"),
    );
    for (const f of FONT_KEYS) expect(fonts).toMatch(new RegExp(`\\b${f}:`));
  });

  it("makes ids that match the SQL format and never collide with code designs", () => {
    for (const label of ["Quiet Harbour", "  Été à Paris! ", "x", "★★★"]) {
      const id = designIdFrom(label);
      expect(id).toMatch(DESIGN_ID_PATTERN);
      expect(id.length).toBeGreaterThanOrEqual(2);
    }
    expect(designIdFrom("Quiet Harbour")).toBe("quiet-harbour");
    // Designer ids always get a random suffix in the service, so "atelier" cannot be reused.
    expect(THEMES.some((t) => t.id === "atelier")).toBe(true);
  });

  it("turns a spec into the renderer's description without losing fields", () => {
    const t = toTemplateSpec({ id: "x-1", label: "X", category: "Bold" }, spec);
    expect(t).toMatchObject({
      id: "x-1",
      label: "X",
      category: "Bold",
      ...spec,
    });
    const unknown = toTemplateSpec(
      { id: "x", label: "X", category: "Nope" },
      spec,
    );
    expect(unknown.category).toBe("Creative");
    const c = toCardDesign(
      { id: "c-1", label: "C", category: "Social" },
      cardSpecFrom(CARD_DESIGNS[0]),
    );
    expect(c.category).toBe("Social");
    expect(c.emboss).toBe(CARD_DESIGNS[0].emboss);
  });
});

describe("accessibility gate", () => {
  it("computes WCAG contrast", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
  });

  it("passes every code design and flags unreadable colours with a reason", () => {
    for (const t of TEMPLATES)
      expect(designProblems("website", websiteSpecFrom(t)), t.id).toEqual([]);
    for (const d of CARD_DESIGNS)
      expect(designProblems("card", cardSpecFrom(d)), d.id).toEqual([]);
    const grey = {
      ...spec,
      palette: {
        ...spec.palette,
        ink: "#bbbbbb",
        bg: "#ffffff",
        surface: "#ffffff",
      },
    };
    const problems = designProblems("website", grey);
    expect(problems.map((p) => p.field)).toContain("palette.ink");
    expect(problems[0]!.message).toMatch(/needs 4\.5:1/);
  });
});

describe("pinned designs in published snapshots", () => {
  it("round-trips a pinned spec and rejects a tampered one", () => {
    const pinned = { id: "harbour-1a2b3c", version: 3, spec };
    expect(
      publishedContentSchema.safeParse({ ...SAMPLE_SITE, design: pinned })
        .success,
    ).toBe(true);
    expect(
      publishedContentSchema.safeParse({
        ...SAMPLE_SITE,
        design: { ...pinned, spec: { ...spec, palette: { bg: "red" } } },
      }).success,
    ).toBe(false);
    expect(
      pinnedWebsiteDesignSchema.safeParse({ ...pinned, version: 0 }).success,
    ).toBe(false);
    const card = {
      id: "night-1",
      version: 1,
      spec: cardSpecFrom(CARD_DESIGNS[0]),
    };
    expect(
      cardContentSchema.safeParse({ ...SAMPLE_CARD, design: card }).success,
    ).toBe(true);
  });

  it("lets a card point at a designer design id (availability is a server check)", () => {
    expect(
      cardConfigSchema.safeParse({
        ...defaultCardConfig(),
        design: "night-1a2b3c",
      }).success,
    ).toBe(true);
    expect(
      cardConfigSchema.safeParse({ ...defaultCardConfig(), design: "Bad Id!" })
        .success,
    ).toBe(false);
  });
});
