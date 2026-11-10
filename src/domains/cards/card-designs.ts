import type { FontKey } from "@/domains/website/templates";

/**
 * Digital card designs: data only (shared by the server, the picker and the public card).
 * `src/components/cards/business-card.tsx` renders any of them from this description.
 *
 * Adding a design: add an entry here AND its id to the design CHECK constraints in
 * docs/sql/milestone-8/001-digital-cards.sql (a test keeps the two lists equal).
 */

export type CardLayout =
  | "classic" // name top-left, details bottom-left, emboss to the right
  | "centered" // everything centred over the emboss
  | "split" // a coloured panel holding the emboss, details beside it
  | "banner" // a coloured band with the name, details below
  | "edge" // a thin accent rule down the left, oversized name
  | "frame" // stationery: an inset hairline frame, centred
  | "terminal"; // monospaced, console-like

/**
 * photo:    the profile photo, faded into the card like a watermark (initials if there is none)
 * monogram: the initials, pressed into the card (embossed)
 * none:     no emboss
 */
export type CardEmboss = "photo" | "monogram" | "none";

export type CardCategory =
  | "Professional"
  | "Personal"
  | "Social"
  | "Creative"
  | "Technical";

export type CardPalette = {
  bg: string;
  ink: string;
  muted: string;
  accent: string;
  /** Text colour on an accent-coloured panel or band. */
  onAccent: string;
};

export type CardDesign = {
  id: string;
  label: string;
  category: CardCategory;
  layout: CardLayout;
  emboss: CardEmboss;
  display: FontKey;
  body: FontKey;
  displayWeight: number;
  /** Dark card: emboss highlights and shadows are tuned for a dark surface. */
  dark: boolean;
  /** A soft accent glow in one corner. */
  glow?: boolean;
  /** Corner radius as a fraction of the card width (0 = square). */
  radius: number;
  palette: CardPalette;
};

const d = <I extends string>(
  id: I,
  label: string,
  category: CardCategory,
  layout: CardLayout,
  emboss: CardEmboss,
  fonts: [FontKey, FontKey, number],
  palette: CardPalette,
  extra: { dark?: boolean; glow?: boolean; radius?: number } = {},
): CardDesign & { id: I } => ({
  id,
  label,
  category,
  layout,
  emboss,
  display: fonts[0],
  body: fonts[1],
  displayWeight: fonts[2],
  dark: extra.dark ?? false,
  glow: extra.glow,
  radius: extra.radius ?? 0.035,
  palette,
});

const p = (
  bg: string,
  ink: string,
  muted: string,
  accent: string,
  onAccent: string,
): CardPalette => ({ bg, ink, muted, accent, onAccent });

export const CARD_DESIGNS = [
  // Professional
  d(
    "ivory",
    "Ivory",
    "Professional",
    "classic",
    "monogram",
    ["playfair", "inter", 500],
    p("#f7f3ea", "#1f1b16", "#625a4e", "#8a5a2b", "#ffffff"),
  ),
  d(
    "slate",
    "Slate",
    "Professional",
    "split",
    "photo",
    ["libreBaskerville", "inter", 400],
    p("#ffffff", "#1d2733", "#55616f", "#1d2733", "#f5f1e8"),
  ),
  d(
    "pinstripe",
    "Pinstripe",
    "Professional",
    "banner",
    "monogram",
    ["ebGaramond", "manrope", 500],
    p("#f4f6fa", "#142033", "#4f5c73", "#142d5c", "#ffffff"),
  ),
  d(
    "graphite",
    "Graphite",
    "Professional",
    "classic",
    "photo",
    ["dmSerif", "inter", 400],
    p("#1f2124", "#f2f2f0", "#a9acb2", "#c9a86a", "#1f2124"),
    { dark: true },
  ),
  d(
    "monogram",
    "Monogram",
    "Professional",
    "frame",
    "monogram",
    ["cormorant", "inter", 500],
    p("#fbfaf7", "#222222", "#64615b", "#222222", "#fbfaf7"),
  ),
  d(
    "ledger",
    "Ledger",
    "Professional",
    "edge",
    "none",
    ["libreBaskerville", "plexMono", 400],
    p("#f3f1ea", "#1b1b1b", "#57554f", "#2f4f3a", "#ffffff"),
  ),
  d(
    "meridian",
    "Meridian",
    "Professional",
    "centered",
    "monogram",
    ["sora", "inter", 600],
    p("#eef1f4", "#16202b", "#4f5a67", "#2c5d8a", "#ffffff"),
  ),
  d(
    "counsel",
    "Counsel",
    "Professional",
    "frame",
    "monogram",
    ["bodoni", "manrope", 500],
    p("#0f1a2b", "#f1ede4", "#aab2c0", "#b89b5e", "#0f1a2b"),
    { dark: true, radius: 0.02 },
  ),
  // Personal
  d(
    "linen",
    "Linen",
    "Personal",
    "centered",
    "photo",
    ["instrumentSerif", "manrope", 400],
    p("#f2ece3", "#2b241d", "#655a4f", "#9a6b4f", "#ffffff"),
  ),
  d(
    "sage",
    "Sage",
    "Personal",
    "classic",
    "monogram",
    ["fraunces", "outfit", 500],
    p("#e9eee6", "#1f2a22", "#4f5d54", "#3f6b4f", "#ffffff"),
    { radius: 0.05 },
  ),
  d(
    "blush",
    "Blush",
    "Personal",
    "centered",
    "photo",
    ["playfair", "outfit", 500],
    p("#f7e9e6", "#3a1f22", "#714e52", "#a4434f", "#ffffff"),
    { radius: 0.05 },
  ),
  d(
    "dune",
    "Dune",
    "Personal",
    "split",
    "photo",
    ["dmSerif", "manrope", 400],
    p("#f3e6d3", "#33261a", "#67533f", "#8c5a2e", "#ffffff"),
  ),
  d(
    "coastal",
    "Coastal",
    "Personal",
    "banner",
    "monogram",
    ["outfit", "outfit", 600],
    p("#eef5f7", "#12303a", "#47626a", "#1f5f73", "#ffffff"),
    { radius: 0.05 },
  ),
  d(
    "vellum",
    "Vellum",
    "Personal",
    "frame",
    "monogram",
    ["ebGaramond", "ebGaramond", 500],
    p("#f6efe2", "#2a2118", "#65563f", "#875c32", "#ffffff"),
  ),
  d(
    "lavender",
    "Lavender",
    "Personal",
    "classic",
    "photo",
    ["fraunces", "inter", 500],
    p("#efecf6", "#231d33", "#585170", "#5b4a8c", "#ffffff"),
    { radius: 0.05 },
  ),
  // Social
  d(
    "aurora",
    "Aurora",
    "Social",
    "centered",
    "photo",
    ["sora", "sora", 600],
    p("#0d1b2a", "#f4f1ea", "#a3b3c5", "#e07a5f", "#0d1b2a"),
    { dark: true, glow: true, radius: 0.06 },
  ),
  d(
    "neon",
    "Neon",
    "Social",
    "edge",
    "monogram",
    ["unbounded", "spaceGrotesk", 600],
    p("#0b0b10", "#f5f5f7", "#a0a0ae", "#7cf29a", "#0b0b10"),
    { dark: true, radius: 0.06 },
  ),
  d(
    "pop",
    "Pop",
    "Social",
    "banner",
    "monogram",
    ["syne", "outfit", 700],
    p("#fff8e7", "#1d1a14", "#5a5446", "#c23a26", "#ffffff"),
    { radius: 0.06 },
  ),
  d(
    "bubble",
    "Bubble",
    "Social",
    "centered",
    "photo",
    ["outfit", "outfit", 600],
    p("#e8f0ff", "#14213d", "#445272", "#3a5bd9", "#ffffff"),
    { radius: 0.08 },
  ),
  d(
    "grid",
    "Grid",
    "Social",
    "classic",
    "none",
    ["archivo", "archivo", 800],
    p("#ffffff", "#111111", "#555555", "#cf2a24", "#ffffff"),
    { radius: 0 },
  ),
  d(
    "bauhaus",
    "Bauhaus",
    "Social",
    "split",
    "monogram",
    ["unbounded", "spaceGrotesk", 600],
    p("#f1ebdc", "#1a1a1a", "#524d47", "#1f3fa0", "#ffffff"),
    { radius: 0 },
  ),
  d(
    "sunset",
    "Sunset",
    "Social",
    "banner",
    "photo",
    ["syne", "manrope", 700],
    p("#fff3ea", "#2d1a12", "#684d41", "#b4462b", "#ffffff"),
    { glow: true, radius: 0.06 },
  ),
  // Creative
  d(
    "noir",
    "Noir",
    "Creative",
    "classic",
    "photo",
    ["bodoni", "inter", 500],
    p("#0e0e0e", "#f4f1ea", "#a8a39a", "#d6b36a", "#0e0e0e"),
    { dark: true },
  ),
  d(
    "gallery",
    "Gallery",
    "Creative",
    "edge",
    "photo",
    ["instrumentSerif", "inter", 400],
    p("#fafafa", "#141414", "#575757", "#141414", "#fafafa"),
    { radius: 0 },
  ),
  d(
    "studio",
    "Studio",
    "Creative",
    "split",
    "photo",
    ["syne", "manrope", 700],
    p("#f4f0ff", "#1e1533", "#574d70", "#6d3fd1", "#ffffff"),
    { radius: 0.05 },
  ),
  d(
    "atelier",
    "Atelier",
    "Creative",
    "classic",
    "photo",
    ["cormorant", "manrope", 600],
    p("#f6f0e6", "#2a1e16", "#655446", "#7a2e24", "#ffffff"),
  ),
  d(
    "obsidian",
    "Obsidian",
    "Creative",
    "centered",
    "monogram",
    ["spaceGrotesk", "inter", 600],
    p("#141416", "#ededed", "#a0a0a6", "#8fb3ff", "#141416"),
    { dark: true, glow: true, radius: 0.05 },
  ),
  d(
    "terracotta",
    "Terracotta",
    "Creative",
    "banner",
    "monogram",
    ["fraunces", "outfit", 600],
    p("#f5ebe3", "#2e1c14", "#684f42", "#a34a2a", "#ffffff"),
  ),
  // Technical
  d(
    "console",
    "Console",
    "Technical",
    "terminal",
    "none",
    ["jetbrainsMono", "jetbrainsMono", 600],
    p("#0f1720", "#e6edf3", "#93a0ad", "#7ee787", "#0f1720"),
    { dark: true, radius: 0.03 },
  ),
  d(
    "typewriter",
    "Typewriter",
    "Technical",
    "terminal",
    "monogram",
    ["plexMono", "plexMono", 600],
    p("#f4f1e8", "#222222", "#59554d", "#222222", "#f4f1e8"),
    { radius: 0.02 },
  ),
  d(
    "blueprint",
    "Blueprint",
    "Technical",
    "frame",
    "monogram",
    ["spaceGrotesk", "plexMono", 600],
    p("#12355b", "#eaf2fb", "#b3c8e0", "#eaf2fb", "#12355b"),
    { dark: true, radius: 0.02 },
  ),
  d(
    "mint",
    "Mint",
    "Technical",
    "edge",
    "none",
    ["jetbrainsMono", "inter", 600],
    p("#effaf4", "#10261b", "#45604f", "#17714a", "#ffffff"),
  ),
] as const satisfies readonly CardDesign[];

export type CardDesignId = (typeof CARD_DESIGNS)[number]["id"];
export const CARD_DESIGN_IDS = CARD_DESIGNS.map((x) => x.id) as [
  CardDesignId,
  ...CardDesignId[],
];
export const CARD_CATEGORIES: CardCategory[] = [
  "Professional",
  "Personal",
  "Social",
  "Creative",
  "Technical",
];

export function cardDesign(id: string): CardDesign {
  return CARD_DESIGNS.find((x) => x.id === id) ?? CARD_DESIGNS[0];
}
