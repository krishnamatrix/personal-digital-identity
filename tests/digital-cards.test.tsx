import { readFileSync } from "node:fs";
import { fireEvent, render, screen, within } from "@testing-library/react";
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
vi.mock("qrcode", () => ({
  default: {
    toString: vi.fn(
      async (value: string) => `<svg data-value="${value.length}"></svg>`,
    ),
  },
}));

import { BusinessCard } from "@/components/cards/business-card";
import { CardWithQr } from "@/components/cards/card-with-qr";
import {
  CARD_DESIGNS,
  CARD_DESIGN_IDS,
  cardDesign,
} from "@/domains/cards/card-designs";
import {
  CARD_TYPE_IDS,
  defaultCardConfig,
  initialsOf,
  normalizeCardConfig,
  cardConfigSchema,
} from "@/domains/cards/card-config";
import {
  buildCardContent,
  cardContentSchema,
  cardProblems,
  cardVCard,
  fieldValues,
  type CardSource,
} from "@/domains/cards/card-content";

const source: CardSource = {
  profile: {
    fullName: "Priya Natarajan",
    displayName: null,
    headline: "Data products",
    currentDesignation: "Head of Data",
    currentOrganization: "Northwind",
    contactEmail: "priya@example.com",
    phone: "+61 400 000 000",
    location: "Sydney",
    websiteUrl: "https://priya.example",
    linkedinUrl: null,
    githubUrl: "https://github.com/priya",
    profileImageUrl: "https://images.example/priya.jpg",
  },
  socialLinks: [
    { platform: "linkedin", url: "https://linkedin.com/in/priya" },
    { platform: "x", url: "https://x.com/priya" },
    { platform: "instagram", url: "javascript:alert(1)" },
  ],
};

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

describe("card catalogue", () => {
  it("offers 30-odd designs with unique ids, kept in step with SQL", () => {
    expect(CARD_DESIGNS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(CARD_DESIGN_IDS).size).toBe(CARD_DESIGN_IDS.length);
    const sql = readFileSync(
      "docs/sql/milestone-8/001-digital-cards.sql",
      "utf8",
    );
    const lists = (col: string) =>
      [
        ...sql.matchAll(new RegExp(`CHECK \\(${col} IN \\(([^)]*)\\)\\)`, "g")),
      ].map((m) =>
        m[1]!
          .split(",")
          .map((s) => s.trim().replace(/'/g, ""))
          .sort(),
      );
    expect(lists("design")).toHaveLength(2);
    for (const l of lists("design"))
      expect(l).toEqual([...CARD_DESIGN_IDS].sort());
    expect(lists("card_type")).toHaveLength(2);
    for (const l of lists("card_type"))
      expect(l).toEqual([...CARD_TYPE_IDS].sort());
  });

  it("includes photo and initials embossed designs", () => {
    expect(
      CARD_DESIGNS.filter((d) => d.emboss === "photo").length,
    ).toBeGreaterThan(5);
    expect(
      CARD_DESIGNS.filter((d) => d.emboss === "monogram").length,
    ).toBeGreaterThan(5);
  });

  it.each(CARD_DESIGNS.map((d) => [d.id, d] as const))(
    "%s is readable (WCAG AA)",
    (_id, d) => {
      const p = d.palette;
      expect(contrast(p.ink, p.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.muted, p.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.onAccent, p.accent)).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe("card content", () => {
  it("draws only from the profile and only the fields switched on", () => {
    const config = {
      ...defaultCardConfig("professional"),
      design: "slate" as const, // a photo-emboss design
      fields: ["role", "email", "linkedin", "x"] as const,
    };
    const content = buildCardContent(source, {
      ...config,
      fields: [...config.fields],
    });
    expect(content).toMatchObject({
      name: "Priya Natarajan",
      initials: "PN",
      role: "Head of Data, Northwind",
      email: "priya@example.com",
      photoUrl: "https://images.example/priya.jpg",
    });
    expect(content.phone).toBeUndefined();
    expect(content.location).toBeUndefined();
    expect(content.links.map((l) => l.kind)).toEqual(["linkedin", "x"]);
    expect(cardContentSchema.safeParse(content).success).toBe(true);
  });

  it("publishes the photo only when the design embosses it", () => {
    const monogram = buildCardContent(source, {
      ...defaultCardConfig("professional"),
      design: "ivory",
    });
    expect(monogram.photoUrl).toBeUndefined();
    const photo = buildCardContent(source, {
      ...defaultCardConfig("professional"),
      design: "slate",
    });
    expect(photo.photoUrl).toBe("https://images.example/priya.jpg");
    const off = buildCardContent(source, {
      ...defaultCardConfig("professional"),
      design: "slate",
      usePhoto: false,
    });
    expect(off.photoUrl).toBeUndefined();
  });

  it("uses the display name and initials overrides, and a custom link", () => {
    const content = buildCardContent(source, {
      ...defaultCardConfig("personal"),
      displayName: "Priya N.",
      initials: "PRI",
      fields: ["custom"],
      customLink: { label: "Photography", url: "https://photos.example" },
      usePhoto: false,
    });
    expect(content.name).toBe("Priya N.");
    expect(content.initials).toBe("PRI");
    expect(content.photoUrl).toBeUndefined();
    expect(content.links).toEqual([
      { kind: "custom", label: "Photography", url: "https://photos.example" },
    ]);
  });

  it("never shows non-http links and reports what blocks publishing", () => {
    expect(Object.values(fieldValues(source))).not.toContain(
      "javascript:alert(1)",
    );
    const empty = buildCardContent(
      { ...source, profile: { ...source.profile, fullName: null } },
      { ...defaultCardConfig(), fields: [] },
    );
    expect(cardProblems(empty)).toEqual(["no_name", "no_details"]);
  });

  it("repairs stored config and rejects bad input", () => {
    const repaired = normalizeCardConfig({
      type: "nope",
      design: "noir",
      fields: ["email", "email", "bogus", "role"],
      usePhoto: "yes",
    });
    expect(repaired.type).toBe("professional");
    expect(repaired.design).toBe("noir");
    expect(repaired.fields).toEqual(["role", "email"]);
    expect(repaired.usePhoto).toBe(true);
    expect(
      cardConfigSchema.safeParse({
        ...defaultCardConfig(),
        customLink: { label: "x", url: "ftp://nope" },
      }).success,
    ).toBe(false);
    expect(initialsOf("ana maria de souza")).toBe("AS");
  });

  it("builds a vCard phones can import, with escaping", () => {
    const vcard = cardVCard(
      {
        type: "professional",
        name: "Priya Natarajan",
        initials: "PN",
        role: "Head of Data, Northwind",
        email: "priya@example.com",
        phone: "+61 400 000 000",
        location: "Sydney",
        links: [{ kind: "x", label: "X", url: "https://x.com/priya" }],
      },
      "https://folioone.app/social/priya",
    );
    expect(vcard.split("\r\n")).toEqual([
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:Natarajan;Priya;;;",
      "FN:Priya Natarajan",
      "TITLE:Head of Data\\, Northwind",
      "EMAIL;TYPE=INTERNET:priya@example.com",
      "TEL;TYPE=CELL:+61 400 000 000",
      "ADR:;;;Sydney;;;",
      "URL:https://x.com/priya",
      "URL:https://folioone.app/social/priya",
      "END:VCARD",
    ]);
  });
});

describe("card rendering", () => {
  const content = buildCardContent(source, {
    ...defaultCardConfig("professional"),
    design: "slate",
    fields: ["role", "email", "phone", "linkedin", "location"],
  });

  it.each(CARD_DESIGN_IDS)("renders %s with the name and details", (id) => {
    const { container, unmount } = render(
      <BusinessCard design={cardDesign(id)} content={content} interactive />,
    );
    const face = container.querySelector(`[data-card-design="${id}"]`)!;
    expect(face).not.toBeNull();
    expect(face).toHaveTextContent("Priya Natarajan");
    expect(
      within(face as HTMLElement).getByRole("link", {
        name: /priya@example.com/,
      }),
    ).toHaveAttribute("href", "mailto:priya@example.com");
    unmount();
  });

  it("embosses the photo, or the initials when there is no photo", () => {
    const photo = render(
      <BusinessCard design={cardDesign("slate")} content={content} />,
    );
    expect(photo.container.querySelector("img")).toHaveAttribute(
      "src",
      "https://images.example/priya.jpg",
    );
    photo.unmount();
    const none = render(
      <BusinessCard
        design={cardDesign("slate")}
        content={{ ...content, photoUrl: undefined }}
      />,
    );
    expect(none.container.querySelector("img")).toBeNull();
    expect(none.container).toHaveTextContent("PN");
    none.unmount();
  });

  it("hides the QR code until the icon is pressed, then overlays it", async () => {
    render(
      <CardWithQr value="BEGIN:VCARD">
        <BusinessCard design={cardDesign("ivory")} content={content} />
      </CardWithQr>,
    );
    expect(screen.queryByRole("dialog", { name: "QR code" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show QR code" }));
    expect(screen.getByRole("dialog", { name: "QR code" })).toBeInTheDocument();
    expect(await screen.findByTestId("card-qr")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hide QR code" }));
    expect(screen.queryByRole("dialog", { name: "QR code" })).toBeNull();
  });
});
