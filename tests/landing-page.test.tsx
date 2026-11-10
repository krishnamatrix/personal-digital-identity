import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// next/font is compiled by Next; in tests each loader just returns a class/variable name.
vi.mock("next/font/google", async () => {
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

import { LandingPage } from "@/components/marketing/landing-page";
import { THEMES } from "@/domains/website/config";

describe("landing page", () => {
  it("introduces Folioone with sign-up and sign-in entry points", () => {
    render(<LandingPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /One identity\.\s*Every way you present it\./,
    );
    const account = screen.getByRole("navigation", { name: "Account" });
    expect(
      within(account).getByRole("link", { name: "Sign in" }),
    ).toHaveAttribute("href", "/login");
    expect(
      within(account).getByRole("link", { name: "Create account" }),
    ).toHaveAttribute("href", "/signup");
    expect(
      screen.getByRole("link", { name: /Start for free/ }),
    ).toHaveAttribute("href", "/signup");
  });

  it("shows real portfolio designs and the true count, with no sample person", () => {
    render(<LandingPage />);
    expect(
      screen.getByRole("heading", {
        name: `${THEMES.length} designs. Switch any time.`,
      }),
    ).toBeInTheDocument();
    for (const name of ["Atelier", "Noir", "Gazette", "Console"])
      expect(screen.getByText(name)).toBeInTheDocument();
    expect(screen.queryByText(/Alex Morgan/)).toBeNull();
  });
});
