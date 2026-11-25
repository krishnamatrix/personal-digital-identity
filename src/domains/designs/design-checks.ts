import type { CardSpec, DesignSurface, WebsiteSpec } from "./design-spec";

/** WCAG 2 relative-luminance contrast ratio of two #rrggbb colours. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

export type DesignProblem = { field: string; message: string };

type Pair = [field: string, fg: string, bg: string, min: number, what: string];

/**
 * Accessibility gate (WCAG AA), the same thresholds the code designs are tested against:
 * a design with any problem can be saved as a draft but cannot be published.
 */
export function designProblems(
  surface: DesignSurface,
  spec: WebsiteSpec | CardSpec,
): DesignProblem[] {
  const p = spec.palette as Record<string, string>;
  const pairs: Pair[] =
    surface === "website"
      ? [
          ["palette.ink", p.ink!, p.bg!, 4.5, "Main text on the background"],
          ["palette.ink", p.ink!, p.surface!, 4.5, "Main text on panels"],
          [
            "palette.onAccent",
            p.onAccent!,
            p.accent!,
            4.5,
            "Button text on the accent",
          ],
          [
            "palette.muted",
            p.muted!,
            p.bg!,
            3,
            "Secondary text on the background",
          ],
        ]
      : [
          ["palette.ink", p.ink!, p.bg!, 4.5, "Name on the card"],
          ["palette.muted", p.muted!, p.bg!, 4.5, "Details on the card"],
          [
            "palette.onAccent",
            p.onAccent!,
            p.accent!,
            4.5,
            "Text on the accent panel",
          ],
        ];
  const problems: DesignProblem[] = [];
  for (const [field, fg, bg, min, what] of pairs) {
    const ratio = contrastRatio(fg, bg);
    if (ratio < min)
      problems.push({
        field,
        message: `${what}: contrast ${ratio.toFixed(2)}:1, needs ${min}:1.`,
      });
  }
  return problems;
}
