/**
 * Portfolio templates: data only (shared by the server, the theme picker and the public
 * renderer). Each template combines one hero/page LAYOUT, one SECTION style (how lists such
 * as experience and projects are laid out), a type pairing, a palette and a heading style.
 * `src/components/website/template-site.tsx` renders any of them from this description.
 *
 * Adding a template: add an entry here AND its id to the theme CHECK constraints in SQL
 * (docs/sql/milestone-7/001-website-templates.sql shows the pattern).
 */

export type TemplateLayout =
  | "split" // name left, portrait right
  | "centered" // portrait/monogram and name centred
  | "masthead" // newspaper/magazine masthead with rules
  | "sidebar" // fixed identity column, content to the right
  | "cover" // full-bleed cover image (or tonal field) with the name over it
  | "poster" // oversized display name, poster-like
  | "terminal"; // monospaced, developer-console flavour

export type SectionStyle = "professional" | "creative" | "minimal";

export type HeadingStyle =
  | "eyebrow" // small letter-spaced label
  | "display" // large display-face heading
  | "numbered" // "01 — Experience"
  | "centered" // centred small caps between rules
  | "mono"; // "## experience"

export type FontKey =
  | "cormorant"
  | "playfair"
  | "fraunces"
  | "dmSerif"
  | "libreBaskerville"
  | "ebGaramond"
  | "instrumentSerif"
  | "bodoni"
  | "inter"
  | "manrope"
  | "spaceGrotesk"
  | "syne"
  | "archivo"
  | "outfit"
  | "sora"
  | "unbounded"
  | "jetbrainsMono"
  | "plexMono";

export type TemplatePalette = {
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  accent: string;
  /** Text colour on an accent-coloured background. */
  onAccent: string;
  rule: string;
};

export type TemplateCategory =
  | "Editorial"
  | "Minimal"
  | "Bold"
  | "Creative"
  | "Technical"
  | "Classic";

export type TemplateSpec = {
  id: string;
  label: string;
  category: TemplateCategory;
  blurb: string;
  layout: TemplateLayout;
  sections: SectionStyle;
  heading: HeadingStyle;
  display: FontKey;
  body: FontKey;
  /** Display weight and tracking, e.g. 400 / "-0.02em". */
  displayWeight: number;
  displayTracking: string;
  displayItalic?: boolean;
  /** Card/chip corner radius in px (0 = square). */
  radius: number;
  palette: TemplatePalette;
};

export const TEMPLATES = [
  {
    id: "atelier",
    label: "Atelier",
    category: "Editorial",
    blurb:
      "Ivory paper, oxblood ink and a refined serif. For consultants and leaders who want quiet authority.",
    layout: "split",
    sections: "professional",
    heading: "eyebrow",
    display: "cormorant",
    body: "inter",
    displayWeight: 500,
    displayTracking: "-0.01em",
    radius: 2,
    palette: {
      bg: "#f7f3ec",
      surface: "#fffdf9",
      ink: "#231f1c",
      muted: "#7a6f66",
      accent: "#7a2e2a",
      onAccent: "#fbf5ee",
      rule: "#e4dacd",
    },
  },
  {
    id: "monograph",
    label: "Monograph",
    category: "Classic",
    blurb:
      "Black and white with a Didone headline and your monogram at the centre. Timeless and formal.",
    layout: "centered",
    sections: "minimal",
    heading: "centered",
    display: "bodoni",
    body: "manrope",
    displayWeight: 500,
    displayTracking: "-0.01em",
    radius: 0,
    palette: {
      bg: "#ffffff",
      surface: "#ffffff",
      ink: "#0c0c0c",
      muted: "#6d6d6d",
      accent: "#0c0c0c",
      onAccent: "#ffffff",
      rule: "#e2e2e2",
    },
  },
  {
    id: "gazette",
    label: "Gazette",
    category: "Editorial",
    blurb:
      "A broadsheet front page: masthead, column rules and numbered sections. Made for writers and analysts.",
    layout: "masthead",
    sections: "professional",
    heading: "numbered",
    display: "libreBaskerville",
    body: "ebGaramond",
    displayWeight: 700,
    displayTracking: "-0.02em",
    radius: 0,
    palette: {
      bg: "#f3efe6",
      surface: "#f8f5ee",
      ink: "#1b1a17",
      muted: "#6b665c",
      accent: "#1b1a17",
      onAccent: "#f3efe6",
      rule: "#cfc7b6",
    },
  },
  {
    id: "noir",
    label: "Noir",
    category: "Bold",
    blurb:
      "Black velvet, champagne accents and an oversized name. Dramatic, confident and unmistakably premium.",
    layout: "poster",
    sections: "creative",
    heading: "display",
    display: "syne",
    body: "manrope",
    displayWeight: 700,
    displayTracking: "-0.04em",
    radius: 14,
    palette: {
      bg: "#0b0b0c",
      surface: "#151517",
      ink: "#f2efe8",
      muted: "#9a958b",
      accent: "#d8b878",
      onAccent: "#0b0b0c",
      rule: "#2a2a2d",
    },
  },
  {
    id: "meridian",
    label: "Meridian",
    category: "Classic",
    blurb:
      "A résumé-style sidebar holds your identity while your story scrolls beside it. Navy, crisp and orderly.",
    layout: "sidebar",
    sections: "professional",
    heading: "eyebrow",
    display: "fraunces",
    body: "inter",
    displayWeight: 600,
    displayTracking: "-0.02em",
    radius: 8,
    palette: {
      bg: "#f6f7f9",
      surface: "#ffffff",
      ink: "#14213d",
      muted: "#5f6b7d",
      accent: "#1f3b73",
      onAccent: "#ffffff",
      rule: "#dfe3ea",
    },
  },
  {
    id: "linen",
    label: "Linen",
    category: "Minimal",
    blurb:
      "Soft oatmeal tones, an elegant italic serif and lots of air. Calm, warm and personal.",
    layout: "centered",
    sections: "minimal",
    heading: "display",
    display: "instrumentSerif",
    body: "inter",
    displayWeight: 400,
    displayTracking: "-0.01em",
    displayItalic: true,
    radius: 999,
    palette: {
      bg: "#f2ede5",
      surface: "#f8f4ee",
      ink: "#2b2723",
      muted: "#857b70",
      accent: "#8a6a4a",
      onAccent: "#fbf8f3",
      rule: "#e0d7ca",
    },
  },
  {
    id: "console",
    label: "Console",
    category: "Technical",
    blurb:
      "A developer console in monospace: prompts, comments and green-on-graphite. For engineers who ship.",
    layout: "terminal",
    sections: "minimal",
    heading: "mono",
    display: "jetbrainsMono",
    body: "jetbrainsMono",
    displayWeight: 700,
    displayTracking: "-0.02em",
    radius: 6,
    palette: {
      bg: "#0e1116",
      surface: "#151a21",
      ink: "#d7dde6",
      muted: "#7c8796",
      accent: "#5fd38d",
      onAccent: "#0e1116",
      rule: "#232a34",
    },
  },
  {
    id: "gallery",
    label: "Gallery",
    category: "Creative",
    blurb:
      "Your cover image takes the whole stage, then work unfolds in large cards. For photographers and designers.",
    layout: "cover",
    sections: "creative",
    heading: "display",
    display: "dmSerif",
    body: "manrope",
    displayWeight: 400,
    displayTracking: "-0.02em",
    radius: 4,
    palette: {
      bg: "#fafafa",
      surface: "#ffffff",
      ink: "#141414",
      muted: "#6f6f6f",
      accent: "#141414",
      onAccent: "#ffffff",
      rule: "#e8e8e8",
    },
  },
  {
    id: "bauhaus",
    label: "Bauhaus",
    category: "Bold",
    blurb:
      "Geometric and graphic: heavy grotesk type, primary-red accents and numbered sections.",
    layout: "poster",
    sections: "professional",
    heading: "numbered",
    display: "archivo",
    body: "spaceGrotesk",
    displayWeight: 900,
    displayTracking: "-0.05em",
    radius: 0,
    palette: {
      bg: "#f1ece1",
      surface: "#fbf8f1",
      ink: "#111111",
      muted: "#5c5a55",
      accent: "#d7322b",
      onAccent: "#ffffff",
      rule: "#111111",
    },
  },
  {
    id: "sage",
    label: "Sage",
    category: "Editorial",
    blurb:
      "Botanical green on cream with a soft, characterful serif. Grounded and approachable.",
    layout: "split",
    sections: "professional",
    heading: "display",
    display: "fraunces",
    body: "outfit",
    displayWeight: 500,
    displayTracking: "-0.03em",
    radius: 16,
    palette: {
      bg: "#f3f1e7",
      surface: "#fbfaf4",
      ink: "#1f2b22",
      muted: "#66705f",
      accent: "#2f5d43",
      onAccent: "#f3f1e7",
      rule: "#dcdccb",
    },
  },
  {
    id: "obsidian",
    label: "Obsidian",
    category: "Classic",
    blurb:
      "Deep charcoal, gold hairlines and a classical serif, centred like an invitation. Quietly luxurious.",
    layout: "centered",
    sections: "professional",
    heading: "centered",
    display: "cormorant",
    body: "inter",
    displayWeight: 500,
    displayTracking: "0em",
    radius: 2,
    palette: {
      bg: "#121212",
      surface: "#1a1a1a",
      ink: "#ece6da",
      muted: "#9b9488",
      accent: "#c9a96a",
      onAccent: "#121212",
      rule: "#2e2b26",
    },
  },
  {
    id: "grid",
    label: "Grid",
    category: "Minimal",
    blurb:
      "Swiss modernism: a strict grid, tight sans-serif and one red signal colour. Rational and precise.",
    layout: "masthead",
    sections: "minimal",
    heading: "numbered",
    display: "inter",
    body: "inter",
    displayWeight: 700,
    displayTracking: "-0.045em",
    radius: 0,
    palette: {
      bg: "#ffffff",
      surface: "#f5f5f5",
      ink: "#111111",
      muted: "#707070",
      accent: "#cf2a24",
      onAccent: "#ffffff",
      rule: "#111111",
    },
  },
  {
    id: "dune",
    label: "Dune",
    category: "Creative",
    blurb:
      "Warm sand and terracotta under a wide cover, with an expressive geometric display face.",
    layout: "cover",
    sections: "creative",
    heading: "display",
    display: "syne",
    body: "manrope",
    displayWeight: 700,
    displayTracking: "-0.03em",
    radius: 20,
    palette: {
      bg: "#efe4d4",
      surface: "#f7efe3",
      ink: "#2a1d14",
      muted: "#866e5a",
      accent: "#b4542f",
      onAccent: "#fff7ee",
      rule: "#dcc9b1",
    },
  },
  {
    id: "folio-ink",
    label: "Ink",
    category: "Editorial",
    blurb:
      "A fashion-magazine cover: high-contrast black and white, italic display and a bold masthead.",
    layout: "masthead",
    sections: "creative",
    heading: "display",
    display: "playfair",
    body: "inter",
    displayWeight: 600,
    displayTracking: "-0.03em",
    displayItalic: true,
    radius: 0,
    palette: {
      bg: "#fbfbfa",
      surface: "#ffffff",
      ink: "#0a0a0a",
      muted: "#6b6b6b",
      accent: "#0a0a0a",
      onAccent: "#ffffff",
      rule: "#0a0a0a",
    },
  },
  {
    id: "coastal",
    label: "Coastal",
    category: "Minimal",
    blurb:
      "Airy blues and whites with a friendly geometric sans. Fresh, open and easy to read.",
    layout: "centered",
    sections: "creative",
    heading: "eyebrow",
    display: "sora",
    body: "sora",
    displayWeight: 600,
    displayTracking: "-0.04em",
    radius: 18,
    palette: {
      bg: "#f4f8fb",
      surface: "#ffffff",
      ink: "#0f2537",
      muted: "#5b7286",
      accent: "#1f6fb2",
      onAccent: "#ffffff",
      rule: "#dbe6ef",
    },
  },
  {
    id: "studio",
    label: "Studio",
    category: "Creative",
    blurb:
      "Playful lavender and ink with a chunky rounded display face. For illustrators, makers and studios.",
    layout: "poster",
    sections: "creative",
    heading: "display",
    display: "unbounded",
    body: "manrope",
    displayWeight: 700,
    displayTracking: "-0.04em",
    radius: 24,
    palette: {
      bg: "#ece8fb",
      surface: "#f7f5ff",
      ink: "#1c1640",
      muted: "#6a6494",
      accent: "#1c1640",
      onAccent: "#ece8fb",
      rule: "#d6d0f2",
    },
  },
  {
    id: "ledger",
    label: "Ledger",
    category: "Classic",
    blurb:
      "Charcoal and emerald with a bookish serif in a steady sidebar. Built for finance, law and advisory.",
    layout: "sidebar",
    sections: "professional",
    heading: "eyebrow",
    display: "libreBaskerville",
    body: "inter",
    displayWeight: 700,
    displayTracking: "-0.02em",
    radius: 4,
    palette: {
      bg: "#fbfbf9",
      surface: "#ffffff",
      ink: "#1e2422",
      muted: "#66706c",
      accent: "#1d6b52",
      onAccent: "#ffffff",
      rule: "#e1e5e2",
    },
  },
  {
    id: "aurora",
    label: "Aurora",
    category: "Bold",
    blurb:
      "Deep teal night with a coral glow behind your name. Modern, atmospheric and memorable.",
    layout: "cover",
    sections: "creative",
    heading: "display",
    display: "spaceGrotesk",
    body: "spaceGrotesk",
    displayWeight: 600,
    displayTracking: "-0.04em",
    radius: 16,
    palette: {
      bg: "#071a1f",
      surface: "#0e262c",
      ink: "#e6f1ef",
      muted: "#8aa7a6",
      accent: "#ff8a6b",
      onAccent: "#071a1f",
      rule: "#1d3a40",
    },
  },
  {
    id: "typewriter",
    label: "Typewriter",
    category: "Minimal",
    blurb:
      "A typed letter on warm paper: monospace details and a literary serif. Personal and understated.",
    layout: "centered",
    sections: "minimal",
    heading: "mono",
    display: "ebGaramond",
    body: "plexMono",
    displayWeight: 500,
    displayTracking: "-0.01em",
    radius: 0,
    palette: {
      bg: "#f6f1e7",
      surface: "#fbf8f1",
      ink: "#2a2620",
      muted: "#7d7466",
      accent: "#2a2620",
      onAccent: "#f6f1e7",
      rule: "#ddd3c2",
    },
  },
  {
    id: "vellum",
    label: "Vellum",
    category: "Classic",
    blurb:
      "Cream, bronze and a Didone headline with an arched portrait. Couture polish for a personal brand.",
    layout: "split",
    sections: "professional",
    heading: "centered",
    display: "bodoni",
    body: "inter",
    displayWeight: 500,
    displayTracking: "-0.02em",
    radius: 2,
    palette: {
      bg: "#f5efe6",
      surface: "#fbf7f1",
      ink: "#2b2118",
      muted: "#8a7a68",
      accent: "#875c32",
      onAccent: "#fbf7f1",
      rule: "#e3d6c4",
    },
  },
] as const satisfies readonly TemplateSpec[];

export type TemplateId = (typeof TEMPLATES)[number]["id"];

const BY_ID = new Map<string, TemplateSpec>(TEMPLATES.map((t) => [t.id, t]));

export function templateSpec(id: string): TemplateSpec | undefined {
  return BY_ID.get(id);
}
