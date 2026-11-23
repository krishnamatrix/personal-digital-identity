import { describe, expect, it } from "vitest";
import { formatIdentityDesignContext } from "@/domains/folio-designer/identity-design-context";

describe("formatIdentityDesignContext", () => {
  it("formats profile details and visible highlights while omitting empty fields", () => {
    const text = formatIdentityDesignContext({
      name: "Jamie Chen",
      headline: "Product designer",
      professionalSummary: null,
      biographyExcerpt: "Designs calm interfaces.",
      location: "Sarajevo",
      industry: "Technology",
      purpose: "portfolio",
      designation: "Principal Designer",
      organization: "Studio North",
      websiteUrl: null,
      linkedinUrl: null,
      githubUrl: null,
      visibleEntryCounts: { project: 1 },
      highlights: {
        project: [
          {
            title: "Neretva Atlas",
            subtitle: "Lead Designer",
            description: "Interactive river typography guide.",
          },
        ],
        skill: [{ title: "Design Systems" }, { title: "Motion" }],
      },
      articles: [],
      populatedFields: [
        "displayName",
        "headline",
        "summary",
        "location",
        "industry",
        "projects",
        "skills",
      ],
    });
    expect(text).toContain("Name: Jamie Chen");
    expect(text).toContain("Headline: Product designer");
    expect(text).toContain("Principal Designer at Studio North");
    expect(text).toContain("Neretva Atlas — Lead Designer");
    expect(text).toContain("Skills: Design Systems, Motion");
    expect(text).not.toContain("Professional summary:");
  });
});
