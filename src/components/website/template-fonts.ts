import {
  Archivo,
  Bodoni_Moda,
  Cormorant_Garamond,
  DM_Serif_Display,
  EB_Garamond,
  Fraunces,
  IBM_Plex_Mono,
  Instrument_Serif,
  Inter,
  JetBrains_Mono,
  Libre_Baskerville,
  Manrope,
  Outfit,
  Playfair_Display,
  Sora,
  Space_Grotesk,
  Syne,
  Unbounded,
} from "next/font/google";
import type { FontKey } from "@/domains/website/templates";

/*
 * Typefaces for the portfolio templates, self-hosted by next/font (no request to Google at
 * runtime). `preload: false` keeps every page from preloading all of them: the browser only
 * downloads the faces a template actually uses. Each font exposes a CSS variable that the
 * template renderer maps onto --t-display / --t-body.
 */

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
});
const playfair = Playfair_Display({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  style: ["normal", "italic"],
  variable: "--font-playfair",
});
const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-fraunces",
});
const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-dm-serif",
});
const libreBaskerville = Libre_Baskerville({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: ["400", "700"],
  variable: "--font-libre-baskerville",
});
const ebGaramond = EB_Garamond({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  style: ["normal", "italic"],
  variable: "--font-eb-garamond",
});
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
});
const bodoni = Bodoni_Moda({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  style: ["normal", "italic"],
  variable: "--font-bodoni",
});
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-inter",
});
const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-manrope",
});
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-space-grotesk",
});
const syne = Syne({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-syne",
});
const archivo = Archivo({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-archivo",
});
const outfit = Outfit({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-outfit",
});
const sora = Sora({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-sora",
});
const unbounded = Unbounded({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-unbounded",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-jetbrains",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
});

const FONTS: Record<FontKey, { variable: string; family: string }> = {
  cormorant: { variable: cormorant.variable, family: "var(--font-cormorant)" },
  playfair: { variable: playfair.variable, family: "var(--font-playfair)" },
  fraunces: { variable: fraunces.variable, family: "var(--font-fraunces)" },
  dmSerif: { variable: dmSerif.variable, family: "var(--font-dm-serif)" },
  libreBaskerville: {
    variable: libreBaskerville.variable,
    family: "var(--font-libre-baskerville)",
  },
  ebGaramond: {
    variable: ebGaramond.variable,
    family: "var(--font-eb-garamond)",
  },
  instrumentSerif: {
    variable: instrumentSerif.variable,
    family: "var(--font-instrument-serif)",
  },
  bodoni: { variable: bodoni.variable, family: "var(--font-bodoni)" },
  inter: { variable: inter.variable, family: "var(--font-inter)" },
  manrope: { variable: manrope.variable, family: "var(--font-manrope)" },
  spaceGrotesk: {
    variable: spaceGrotesk.variable,
    family: "var(--font-space-grotesk)",
  },
  syne: { variable: syne.variable, family: "var(--font-syne)" },
  archivo: { variable: archivo.variable, family: "var(--font-archivo)" },
  outfit: { variable: outfit.variable, family: "var(--font-outfit)" },
  sora: { variable: sora.variable, family: "var(--font-sora)" },
  unbounded: { variable: unbounded.variable, family: "var(--font-unbounded)" },
  jetbrainsMono: {
    variable: jetbrainsMono.variable,
    family: "var(--font-jetbrains)",
  },
  plexMono: { variable: plexMono.variable, family: "var(--font-plex-mono)" },
};

/** Class names declaring the CSS variables for a template's two faces, and their families. */
export function templateFonts(display: FontKey, body: FontKey) {
  const d = FONTS[display];
  const b = FONTS[body];
  return {
    className: d === b ? d.variable : `${d.variable} ${b.variable}`,
    display: d.family,
    body: b.family,
  };
}
