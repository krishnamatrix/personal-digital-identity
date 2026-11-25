import { readFileSync } from "node:fs";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// next/font is compiled by Next; in tests each loader just returns a class/variable name.
vi.mock("next/font/google", () => {
  const names = [
    "Archivo",
    "Bodoni_Moda",
    "Cormorant_Garamond",
    "DM_Serif_Display",
    "EB_Garamond",
    "Fraunces",
    "IBM_Plex_Mono",
    "Instrument_Serif",
    "Inter",
    "JetBrains_Mono",
    "Libre_Baskerville",
    "Manrope",
    "Outfit",
    "Playfair_Display",
    "Sora",
    "Space_Grotesk",
    "Syne",
    "Unbounded",
  ];
  return Object.fromEntries(
    names.map((n) => [
      n,
      () => ({ variable: `font-${n}`, className: `font-${n}` }),
    ]),
  );
});

import { SiteView } from "@/components/website/site-view";
import { ThemeThumb } from "@/components/website/theme-thumb";
import {
  THEME_IDS,
  THEMES,
  isThemeId,
  siteColors,
  themeColors,
} from "@/domains/website/config";
import { websiteSpecFrom } from "@/domains/designs/design-spec";
import { TEMPLATES } from "@/domains/website/templates";
import type { PublishedContent } from "@/domains/website/published-content";

const content = {
  person: {
    name: "Elena Marlowe",
    role: "Principal Designer",
    headline: "Calm software for complicated work.",
    shortBio: "Fifteen years of product design.",
    location: "Lisbon",
    contactEmail: "elena@example.com",
  },
  sections: [
    { id: "about", heading: "About", paragraphs: ["Hello."] },
    {
      id: "experience",
      heading: "Experience",
      items: [
        {
          title: "Designer",
          organization: "Northwind",
          start: "2021-03",
          current: true,
        },
      ],
    },
    { id: "contact", heading: "Contact", email: "elena@example.com" },
  ],
} as PublishedContent;

/** WCAG relative-luminance contrast ratio of two #rrggbb colours. */
function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const [r, g, b2] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b2!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe("portfolio template catalogue", () => {
  it("offers at least 20 templates on top of the three built-in themes, with unique ids", () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(THEME_IDS).size).toBe(THEME_IDS.length);
    expect(THEMES).toHaveLength(TEMPLATES.length + 3);
    expect(isThemeId("noir")).toBe(true);
    expect(isThemeId("not-a-theme")).toBe(false);
  });

  it("keeps the SQL theme constraints in step with the application", () => {
    const sql = readFileSync(
      "docs/sql/milestone-7/001-website-templates.sql",
      "utf8",
    );
    const lists = [...sql.matchAll(/CHECK \(theme IN \(([^)]*)\)\)/g)].map(
      (m) => m[1]!.split(",").map((s) => s.trim().replace(/'/g, "")),
    );
    expect(lists).toHaveLength(2);
    for (const list of lists)
      expect([...list].sort()).toEqual([...THEME_IDS].sort());
  });

  it.each(TEMPLATES.map((t) => [t.id, t] as const))(
    "%s has readable text and buttons (WCAG AA)",
    (_id, t) => {
      const p = t.palette;
      expect(contrast(p.ink, p.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.ink, p.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.onAccent, p.accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.muted, p.bg)).toBeGreaterThanOrEqual(3);
    },
  );

  it("gives every theme colours for its share image and article pages", () => {
    for (const id of THEME_IDS) {
      expect(themeColors(id).bg).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("template rendering", () => {
  it.each(TEMPLATES.map((t) => t.id))(
    "renders %s with the person and every section",
    (id) => {
      const { container, unmount } = render(
        <SiteView theme={id} content={content} />,
      );
      const root = container.querySelector(
        `[data-theme="${id}"]`,
      ) as HTMLElement;
      expect(root).not.toBeNull();
      expect(within(root).getByRole("heading", { level: 1 })).toHaveTextContent(
        "Elena Marlowe",
      );
      for (const heading of ["About", "Experience", "Contact"]) {
        expect(
          root.querySelector(`[aria-labelledby="h-${heading.toLowerCase()}"]`),
        ).not.toBeNull();
      }
      expect(
        within(root).getAllByRole("link", { name: "Get in touch" })[0],
      ).toHaveAttribute("href", "mailto:elena@example.com");
      unmount();
    },
  );

  it("renders a pinned Folio Designer design from the snapshot, whatever the theme id", () => {
    const spec = {
      ...websiteSpecFrom(TEMPLATES[0]),
      layout: "sidebar" as const,
      palette: { ...TEMPLATES[0].palette, bg: "#123456", accent: "#abcdef" },
    };
    const { container } = render(
      <SiteView
        theme="harbour-1a2b3c"
        content={{
          ...content,
          design: { id: "harbour-1a2b3c", version: 2, spec },
        }}
      />,
    );
    const root = container.querySelector(
      '[data-theme="harbour-1a2b3c"]',
    ) as HTMLElement;
    expect(root).not.toBeNull();
    expect(root.style.getPropertyValue("--t-bg")).toBe("#123456");
    expect(root.style.getPropertyValue("--t-accent")).toBe("#abcdef");
    expect(siteColors("harbour-1a2b3c", { design: { spec } }).bg).toBe(
      "#123456",
    );
    expect(siteColors("noir").bg).toBe(themeColors("noir").bg);
  });

  it("keeps the built-in themes on their hand-built layouts", () => {
    const { container } = render(
      <SiteView theme="professional" content={content} />,
    );
    expect(
      container.querySelector('[data-theme="professional"]'),
    ).not.toBeNull();
  });

  it("draws a thumbnail from a designer spec passed in", () => {
    const spec = { ...TEMPLATES[1], id: "x-1" };
    const { container } = render(<ThemeThumb id="x-1" spec={spec} />);
    expect(
      (container.firstElementChild as HTMLElement).style.getPropertyValue(
        "--t-bg",
      ),
    ).toBe(TEMPLATES[1].palette.bg);
  });

  it("draws a decorative thumbnail for every theme", () => {
    for (const id of THEME_IDS) {
      const { container, unmount } = render(<ThemeThumb id={id} />);
      expect(container.firstElementChild).toHaveAttribute(
        "aria-hidden",
        "true",
      );
      unmount();
    }
    expect(screen.queryByRole("img")).toBeNull();
  });
});
