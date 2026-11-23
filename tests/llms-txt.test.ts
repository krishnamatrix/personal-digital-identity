import { describe, expect, it } from "vitest";
import {
  buildPlatformLlmsTxt,
  buildWebsiteLlmsTxt,
  LLMS_MAX_BYTES,
} from "@/domains/llms/llms-txt";
import { validateSlug } from "@/domains/website/slug";
import type { PublishedContent } from "@/domains/website/published-content";

function fullSnapshot(): PublishedContent {
  return {
    version: 1,
    person: {
      name: "Ada Lovelace",
      headline: "Analytical Engine Architect",
      role: "Principal Mathematician",
      location: "London, UK",
      shortBio: "Writing algorithms for general-purpose computing machines.",
    },
    sections: [
      {
        id: "about",
        heading: "About",
        paragraphs: [
          "First programmer of the Analytical Engine.",
          "Interested in poetical science and symbolic computation.",
        ],
      },
      {
        id: "featured",
        heading: "Featured",
        items: [
          {
            title: "Notes on the Analytical Engine",
            url: "https://example.com/notes",
            platform: "web",
            platformLabel: "Journal",
            mediaType: "article",
            date: "1843-09",
            summary: "Includes Note G computing Bernoulli numbers.",
          },
        ],
      },
      {
        id: "experience",
        heading: "Experience",
        items: [
          {
            title: "Lead Algorithmist",
            organization: "Analytical Engine Lab",
            location: "London",
            start: "1842-10",
            current: true,
            description: "Designed mechanical computation tables.",
          },
        ],
      },
      {
        id: "education",
        heading: "Education",
        items: [
          {
            institution: "University of London",
            qualification: "Private Tutelage",
            specialization: "Mathematics",
            start: "1839-01",
            end: "1842-06",
          },
        ],
      },
      {
        id: "skills",
        heading: "Skills",
        groups: [
          {
            category: "Mathematics",
            skills: [{ name: "Calculus" }, { name: "Symbolic Logic" }],
          },
        ],
      },
      {
        id: "projects",
        heading: "Projects",
        items: [
          {
            name: "Bernoulli Sequence",
            role: "Author",
            description: "Step-by-step table of operations.",
            technologies: ["Punch Cards", "Difference Tables"],
            url: "https://example.com/bernoulli",
          },
        ],
      },
      {
        id: "articles",
        heading: "Writing",
        items: [
          {
            slug: "poetical-science",
            title: "On Poetical Science",
            excerpt: "Combining imagination with formal analysis.",
            publishedAt: "2026-11-01T00:00:00.000Z",
            readingMinutes: 6,
            rev: 1,
          },
        ],
      },
      {
        id: "achievements",
        heading: "Achievements",
        items: [
          {
            title: "Published Note G",
            date: "1843-09",
            description:
              "Recognized as the first published computer algorithm.",
          },
        ],
      },
      {
        id: "certifications",
        heading: "Certifications",
        items: [
          {
            name: "Royal Society Monograph",
            issuer: "Royal Society",
            date: "1843-10",
            url: "https://example.com/royal-society",
          },
        ],
      },
      {
        id: "social",
        heading: "Social",
        items: [
          {
            platform: "github",
            label: "GitHub",
            url: "https://github.com/ada",
          },
        ],
      },
      {
        id: "booking",
        heading: "Book a Session",
        provider: "cal",
        providerLabel: "Cal.com",
        url: "https://cal.com/ada/intro",
        title: "30-minute consultation",
        description: "Discuss mathematical modeling.",
      },
      {
        id: "contact",
        heading: "Contact",
        email: "ada@example.com",
        website: "https://ada.example.com",
      },
    ],
    links: {
      buttonStyle: "filled",
      socials: [],
      items: [
        { kind: "website", title: "My Website" },
        {
          kind: "custom",
          title: "Active Resource",
          url: "https://example.com/active",
          startsOn: "2026-11-01",
          endsOn: "2026-11-30",
        },
        {
          kind: "custom",
          title: "Future Campaign",
          url: "https://example.com/future",
          startsOn: "2026-12-01",
        },
        {
          kind: "custom",
          title: "Expired Campaign",
          url: "https://example.com/expired",
          endsOn: "2026-10-31",
        },
        {
          kind: "article",
          title: "Live Article Link",
          articleSlug: "poetical-science",
        },
        {
          kind: "article",
          title: "Withdrawn Article Link",
          articleSlug: "deleted-draft",
        },
      ],
    },
  };
}

describe("buildPlatformLlmsTxt", () => {
  it("renders valid Markdown with absolute public links and zero private/user data", () => {
    const out = buildPlatformLlmsTxt("https://folioone.example/");
    expect(out.startsWith("# Folioone\n\n> ")).toBe(true);
    expect(out).toContain("[Home](https://folioone.example/)");
    expect(out).toContain("[Pricing](https://folioone.example/pricing)");
    expect(out).toContain("https://folioone.example/<slug>/llms.txt");
    for (const forbidden of [
      "/profile",
      "/website",
      "/articles",
      "/personas",
      "/cards",
      "/insights",
    ]) {
      expect(out).not.toContain(forbidden);
    }
  });
});

describe("buildWebsiteLlmsTxt", () => {
  it("renders all approved sections, canonical URLs, active scheduled links, and live articles only", () => {
    const out = buildWebsiteLlmsTxt({
      origin: "https://folioone.example",
      slug: "ada",
      title: "Ada Lovelace — Portfolio",
      content: fullSnapshot(),
      today: "2026-11-20",
      liveArticleSlugs: new Set(["poetical-science"]),
    });

    expect(
      out.startsWith("# Ada Lovelace\n\n> Analytical Engine Architect"),
    ).toBe(true);
    expect(out).toContain(
      "- [Website](https://folioone.example/ada): Ada Lovelace — Portfolio",
    );
    expect(out).toContain("- [Links](https://folioone.example/ada/links)");
    expect(out).toContain("## About");
    expect(out).toContain("## Featured");
    expect(out).toContain("## Experience");
    expect(out).toContain("1842-10 – Present");
    expect(out).toContain("## Education");
    expect(out).toContain("## Skills");
    expect(out).toContain("**Mathematics**: Calculus, Symbolic Logic");
    expect(out).toContain("## Projects");
    expect(out).toContain("## Writing");
    expect(out).toContain(
      "[On Poetical Science](https://folioone.example/ada/articles/poetical-science)",
    );
    expect(out).toContain("## Achievements");
    expect(out).toContain("## Certifications");
    expect(out).toContain("## Social");
    expect(out).toContain("## Book a Session");
    expect(out).toContain("## Contact");
    expect(out).toContain("- Email: ada@example.com");
    expect(out).not.toContain("Phone:");

    // Scheduled & live article link filtering
    expect(out).toContain("- [Active Resource](https://example.com/active)");
    expect(out).toContain(
      "- [Live Article Link](https://folioone.example/ada/articles/poetical-science)",
    );
    expect(out).not.toContain("Future Campaign");
    expect(out).not.toContain("Expired Campaign");
    expect(out).not.toContain("Withdrawn Article Link");
  });

  it("renders a minimal profile cleanly without empty headings", () => {
    const out = buildWebsiteLlmsTxt({
      origin: "https://folioone.example",
      slug: "minimal",
      title: "Minimal User",
      content: {
        version: 1,
        person: { name: "Minimal User" },
        sections: [
          { id: "about", heading: "About", paragraphs: [] },
          { id: "contact", heading: "Contact" },
        ],
      },
    });

    expect(out).toContain("# Minimal User");
    expect(out).toContain(
      "> Minimal User's published personal website on Folioone.",
    );
    expect(out).not.toContain("## About");
    expect(out).not.toContain("## Contact");
    expect(out).not.toContain("## Active Links");
  });

  it("sanitizes Markdown injection, control characters, and unsafe URL schemes", () => {
    const out = buildWebsiteLlmsTxt({
      origin: "https://folioone.example",
      slug: "safe",
      title: "Safe\n# Injected",
      content: {
        version: 1,
        person: {
          name: "Jane [Admin]\u0000\n# Fake",
          shortBio: "# Heading\n> Quote\nClean bio line.",
        },
        sections: [
          {
            id: "about",
            heading: "About",
            paragraphs: ["# Fake H1\n## Fake H2\nReal paragraph."],
          },
          {
            id: "social",
            heading: "Social",
            items: [
              {
                platform: "web",
                label: "Bad [JS]",
                url: "javascript:alert(1)",
              },
              {
                platform: "web",
                label: "Good [Site]",
                url: "https://example.com/path_(1)",
              },
            ],
          },
        ],
      },
    });

    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("\u0000");
    expect(out).not.toMatch(/^# Fake/m);
    expect(out).not.toMatch(/^## Fake H2/m);
    expect(out).toContain(
      "[Good \\[Site\\]](https://example.com/path_%281%29)",
    );
  });

  it("bounds output strictly under 100 KB UTF-8 even for extreme payloads", () => {
    const longText = "A".repeat(1900) + " 🚀";
    const bigSections: PublishedContent["sections"] = Array.from(
      { length: 12 },
      (_, idx) => ({
        id: "experience" as const,
        heading: `Experience ${idx + 1}`,
        items: Array.from({ length: 10 }, (__, j) => ({
          title: `Role ${j}`,
          organization: `Org ${j}`,
          description: longText,
        })),
      }),
    );

    const out = buildWebsiteLlmsTxt({
      origin: "https://folioone.example",
      slug: "large-profile",
      title: "Large Profile",
      content: {
        version: 1,
        person: { name: "Large Profile" },
        sections: bigSections,
      },
    });

    const bytes = Buffer.byteLength(out, "utf8");
    expect(bytes).toBeLessThanOrEqual(LLMS_MAX_BYTES);
    expect(bytes).toBeLessThan(100 * 1024);
    expect(out).toContain("_Content truncated for brevity._");
    expect(out).not.toContain("\uFFFD");
  });

  it("rejects dotted llms.txt slugs in slug validation (FR-010)", () => {
    expect(validateSlug("llms.txt")).toBe("format");
    expect(validateSlug("llms-full.txt")).toBe("format");
  });
});
