import { z } from "zod";
import type {
  FontKey,
  HeadingStyle,
  SectionStyle,
  TemplateCategory,
  TemplateLayout,
  TemplateSpec,
} from "@/domains/website/templates";
import type {
  CardCategory,
  CardDesign,
  CardEmboss,
  CardLayout,
} from "@/domains/cards/card-designs";

/**
 * Folio Designer (M14): the JSON a designer design is made of. A design is DATA drawn by the
 * app's own renderers (template-site.tsx for websites, business-card.tsx for cards), never code:
 * every field is an enum, a bounded number or a #rrggbb colour, so a spec cannot carry script,
 * CSS or a URL. The same schema checks AI output, the editor's form, what is stored, and every
 * spec read back from the database or a published snapshot.
 */

export const DESIGN_SURFACES = ["website", "card"] as const;
export type DesignSurface = (typeof DESIGN_SURFACES)[number];

/** Same format as the SQL CHECK on design ids and on the theme/design columns. */
export const DESIGN_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const designIdSchema = z
  .string()
  .min(2)
  .max(48)
  .regex(DESIGN_ID_PATTERN);

/** Typefaces self-hosted by next/font (template-fonts.ts); a design picks from these only. */
export const FONT_KEYS = [
  "cormorant",
  "playfair",
  "fraunces",
  "dmSerif",
  "libreBaskerville",
  "ebGaramond",
  "instrumentSerif",
  "bodoni",
  "inter",
  "manrope",
  "spaceGrotesk",
  "syne",
  "archivo",
  "outfit",
  "sora",
  "unbounded",
  "jetbrainsMono",
  "plexMono",
] as const satisfies readonly FontKey[];

export const FONT_LABELS: Record<FontKey, string> = {
  cormorant: "Cormorant Garamond (serif)",
  playfair: "Playfair Display (serif)",
  fraunces: "Fraunces (serif)",
  dmSerif: "DM Serif Display (serif)",
  libreBaskerville: "Libre Baskerville (serif)",
  ebGaramond: "EB Garamond (serif)",
  instrumentSerif: "Instrument Serif (serif)",
  bodoni: "Bodoni Moda (Didone serif)",
  inter: "Inter (sans)",
  manrope: "Manrope (sans)",
  spaceGrotesk: "Space Grotesk (sans)",
  syne: "Syne (display sans)",
  archivo: "Archivo (sans)",
  outfit: "Outfit (sans)",
  sora: "Sora (sans)",
  unbounded: "Unbounded (display sans)",
  jetbrainsMono: "JetBrains Mono (mono)",
  plexMono: "IBM Plex Mono (mono)",
};

export const WEBSITE_LAYOUTS = [
  "split",
  "centered",
  "masthead",
  "sidebar",
  "cover",
  "poster",
  "terminal",
] as const satisfies readonly TemplateLayout[];
export const SECTION_STYLES = [
  "professional",
  "creative",
  "minimal",
] as const satisfies readonly SectionStyle[];
export const HEADING_STYLES = [
  "eyebrow",
  "display",
  "numbered",
  "centered",
  "mono",
] as const satisfies readonly HeadingStyle[];
export const WEBSITE_CATEGORIES = [
  "Editorial",
  "Classic",
  "Minimal",
  "Bold",
  "Creative",
  "Technical",
] as const satisfies readonly TemplateCategory[];

export const CARD_LAYOUTS = [
  "classic",
  "centered",
  "split",
  "banner",
  "edge",
  "frame",
  "terminal",
] as const satisfies readonly CardLayout[];
export const CARD_EMBOSSES = [
  "photo",
  "monogram",
  "none",
] as const satisfies readonly CardEmboss[];
export const CARD_DESIGN_CATEGORIES = [
  "Professional",
  "Personal",
  "Social",
  "Creative",
  "Technical",
] as const satisfies readonly CardCategory[];

const hex = z
  .string()
  .regex(/^#[0-9a-f]{6}$/, "Use a colour like #1f2a44")
  .describe("A colour as lowercase #rrggbb");
const weight = z.number().int().min(300).max(900).multipleOf(100);

export const websiteSpecSchema = z
  .object({
    layout: z
      .enum(WEBSITE_LAYOUTS)
      .describe(
        "split: name left, portrait right. centered: portrait and name centred. masthead: newspaper masthead with rules. sidebar: fixed identity column. cover: full-bleed cover with the name over it. poster: oversized display name. terminal: monospaced console.",
      ),
    sections: z
      .enum(SECTION_STYLES)
      .describe(
        "How lists (experience, projects) look: professional = timeline, creative = visual cards, minimal = compact rows.",
      ),
    heading: z
      .enum(HEADING_STYLES)
      .describe(
        "eyebrow: small letter-spaced label. display: large display-face heading. numbered: '01 — Experience'. centered: centred small caps between rules. mono: '## experience'.",
      ),
    display: z.enum(FONT_KEYS).describe("Headline typeface"),
    body: z.enum(FONT_KEYS).describe("Body typeface"),
    displayWeight: weight.describe("Headline weight, 300 to 900"),
    displayTracking: z
      .string()
      .regex(/^-?0(\.\d{1,3})?em$/, "Use a value like -0.02em")
      .describe("Headline letter spacing between -0.06em and 0.1em"),
    displayItalic: z.boolean().describe("Italic headlines"),
    radius: z
      .number()
      .int()
      .refine((v) => (v >= 0 && v <= 32) || v === 999, "Use 0 to 32, or 999")
      .describe(
        "Corner radius of cards and chips in px, 0 to 32; 999 means fully rounded pills",
      ),
    palette: z
      .object({
        bg: hex.describe("Page background"),
        surface: hex.describe("Panels and cards on the page"),
        ink: hex.describe("Main text"),
        muted: hex.describe("Secondary text"),
        accent: hex.describe("Buttons, links and highlights"),
        onAccent: hex.describe("Text on an accent-coloured button"),
        rule: hex.describe("Hairlines and borders"),
      })
      .strict(),
  })
  .strict()
  .refine(
    (s) => {
      const v = Number.parseFloat(s.displayTracking);
      return v >= -0.06 && v <= 0.1;
    },
    { path: ["displayTracking"], message: "Keep between -0.06em and 0.1em" },
  );
export type WebsiteSpec = z.infer<typeof websiteSpecSchema>;

export const cardSpecSchema = z
  .object({
    layout: z
      .enum(CARD_LAYOUTS)
      .describe(
        "classic: name top-left, details bottom-left. centered: all centred. split: coloured panel with the emboss. banner: coloured band with the name. edge: thin accent rule down the left, oversized name. frame: inset hairline frame, centred. terminal: monospaced.",
      ),
    emboss: z
      .enum(CARD_EMBOSSES)
      .describe(
        "photo: profile photo faded in like a watermark. monogram: initials pressed into the card. none.",
      ),
    display: z.enum(FONT_KEYS).describe("Name typeface"),
    body: z.enum(FONT_KEYS).describe("Details typeface"),
    displayWeight: weight.describe("Name weight, 300 to 900"),
    dark: z.boolean().describe("True for a dark card background"),
    glow: z.boolean().describe("A soft accent glow in one corner"),
    radius: z
      .number()
      .min(0)
      .max(0.08)
      .describe("Corner radius as a fraction of the card width, 0 to 0.08"),
    palette: z
      .object({
        bg: hex.describe("Card background"),
        ink: hex.describe("Name and main text"),
        muted: hex.describe("Secondary text"),
        accent: hex.describe("Panels, bands and rules"),
        onAccent: hex.describe("Text on an accent-coloured panel"),
      })
      .strict(),
  })
  .strict();
export type CardSpec = z.infer<typeof cardSpecSchema>;

export type DesignSpec = WebsiteSpec | CardSpec;

export function specSchemaFor(surface: DesignSurface) {
  return surface === "website" ? websiteSpecSchema : cardSpecSchema;
}

/** What a published snapshot pins: the design, its version and an exact copy of its spec. */
export const pinnedWebsiteDesignSchema = z.object({
  id: designIdSchema,
  version: z.number().int().min(1),
  spec: websiteSpecSchema,
});
export const pinnedCardDesignSchema = z.object({
  id: designIdSchema,
  version: z.number().int().min(1),
  spec: cardSpecSchema,
});
export type PinnedWebsiteDesign = z.infer<typeof pinnedWebsiteDesignSchema>;
export type PinnedCardDesign = z.infer<typeof pinnedCardDesignSchema>;

/** Metadata shown in pickers. */
export type DesignMeta = { id: string; label: string; category: string };

export function toTemplateSpec(
  meta: DesignMeta & { blurb?: string },
  spec: WebsiteSpec,
): TemplateSpec {
  return {
    id: meta.id,
    label: meta.label,
    category: (WEBSITE_CATEGORIES as readonly string[]).includes(meta.category)
      ? (meta.category as TemplateCategory)
      : "Creative",
    blurb: meta.blurb ?? "",
    ...spec,
  };
}

export function toCardDesign(meta: DesignMeta, spec: CardSpec): CardDesign {
  return {
    id: meta.id,
    label: meta.label,
    category: (CARD_DESIGN_CATEGORIES as readonly string[]).includes(
      meta.category,
    )
      ? (meta.category as CardCategory)
      : "Creative",
    ...spec,
  };
}

/** A starting spec taken from an existing code design ("start from Atelier"). */
export function websiteSpecFrom(t: TemplateSpec): WebsiteSpec {
  return {
    layout: t.layout,
    sections: t.sections,
    heading: t.heading,
    display: t.display,
    body: t.body,
    displayWeight: t.displayWeight,
    displayTracking: t.displayTracking,
    displayItalic: t.displayItalic ?? false,
    radius: t.radius,
    palette: { ...t.palette },
  };
}

export function cardSpecFrom(d: CardDesign): CardSpec {
  return {
    layout: d.layout,
    emboss: d.emboss,
    display: d.display,
    body: d.body,
    displayWeight: d.displayWeight,
    dark: d.dark,
    glow: d.glow ?? false,
    radius: d.radius,
    palette: { ...d.palette },
  };
}

/** "Quiet Harbour" -> "quiet-harbour" (the caller adds a short suffix for uniqueness). */
export function designIdFrom(label: string): string {
  const base = label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36)
    .replace(/-+$/g, "");
  return base.length >= 2 ? base : "design";
}

/** A design offered in the website Design tab (code designs first, then designer designs). */
export type WebsiteDesignOption = {
  id: string;
  label: string;
  category: string;
  blurb: string;
  pro: boolean;
  source: "builtin" | "designer";
  /** Retired designs are listed only for the site that already uses one. */
  retired?: boolean;
  /** Full spec for designer designs (thumbnails); code designs are looked up by id. */
  spec?: TemplateSpec;
};

/** A design offered in the card designer: a full CardDesign plus its tier and origin. */
export type CardDesignOption = CardDesign & {
  pro: boolean;
  source: "builtin" | "designer";
  retired?: boolean;
};
