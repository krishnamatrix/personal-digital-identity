import { describe, expect, it } from "vitest";
import {
  cleanEntryData,
  entryListSchema,
  entryTitle,
  ENTRY_KINDS,
  ENTRY_KIND_DEFS,
} from "@/domains/identity/entry-kinds";
import { computeCompletion } from "@/domains/identity/completion";
import { profileInputSchema } from "@/domains/identity/profile-schema";
import { fieldsForStep } from "@/domains/identity/onboarding-steps";
import { PROFILE_SECTION_FIELDS } from "@/domains/identity/profile-sections";
import { resolveSiteUrl, safeNextPath } from "@/lib/site-url";

const id = "11111111-1111-4111-8111-111111111111";

describe("entry kinds", () => {
  it("has a definition for every kind", () => {
    for (const kind of ENTRY_KINDS)
      expect(ENTRY_KIND_DEFS[kind].fields.length).toBeGreaterThan(0);
  });

  it("accepts a valid employment entry and drops blanks", () => {
    const parsed = entryListSchema("employment").parse([
      {
        id,
        isVisible: true,
        data: {
          title: "Designer",
          organization: "Acme",
          location: "  ",
          startDate: "2020-01",
          isCurrent: false,
        },
      },
    ]);
    expect(parsed[0]!.data).toEqual({
      title: "Designer",
      organization: "Acme",
      startDate: "2020-01",
    });
  });

  it("requires the title field and rejects unknown keys", () => {
    expect(() =>
      entryListSchema("skill").parse([{ id, isVisible: true, data: {} }]),
    ).toThrow();
    expect(() =>
      entryListSchema("skill").parse([
        { id, isVisible: true, data: { name: "x", evil: 1 } },
      ]),
    ).toThrow();
  });

  it("rejects an end date before the start date and malformed months", () => {
    const base = { institution: "Uni" };
    expect(() =>
      entryListSchema("education").parse([
        {
          id,
          isVisible: true,
          data: { ...base, startDate: "2021-05", endDate: "2020-01" },
        },
      ]),
    ).toThrow();
    expect(() =>
      entryListSchema("education").parse([
        { id, isVisible: true, data: { ...base, startDate: "2021-13" } },
      ]),
    ).toThrow();
  });

  it("only allows http(s) URLs for links and projects", () => {
    expect(() =>
      entryListSchema("social_link").parse([
        {
          id,
          isVisible: true,
          data: { platform: "github", url: "javascript:alert(1)" },
        },
      ]),
    ).toThrow();
    expect(() =>
      entryListSchema("social_link").parse([
        {
          id,
          isVisible: true,
          data: { platform: "nope", url: "https://x.test" },
        },
      ]),
    ).toThrow();
    expect(
      entryListSchema("project").parse([
        {
          id,
          isVisible: false,
          data: {
            name: "P",
            technologies: ["a"],
            images: ["https://i.test/a.png"],
            url: "https://p.test",
          },
        },
      ]),
    ).toHaveLength(1);
  });

  it("requires uuid ids and caps list length", () => {
    expect(() =>
      entryListSchema("skill").parse([
        { id: "x", isVisible: true, data: { name: "a" } },
      ]),
    ).toThrow();
    const many = Array.from(
      { length: ENTRY_KIND_DEFS.employment.maxItems + 1 },
      () => ({ id, isVisible: true, data: { title: "t", organization: "o" } }),
    );
    expect(() => entryListSchema("employment").parse(many)).toThrow();
  });

  it("titles social links by platform, custom links by label", () => {
    expect(
      entryTitle("social_link", { platform: "github", url: "https://g.test" }),
    ).toBe("GitHub");
    expect(
      entryTitle("social_link", {
        platform: "custom",
        label: "Blog",
        url: "https://b.test",
      }),
    ).toBe("Blog");
    expect(cleanEntryData({ a: "", b: [], c: false, d: "x" })).toEqual({
      d: "x",
    });
  });
});

describe("profile input, onboarding and completion", () => {
  it("validates the new profile fields", () => {
    expect(
      profileInputSchema.parse({
        contactEmail: "a@b.test",
        phone: "+1 (555) 000-1111",
        primaryPurpose: "portfolio",
      }),
    ).toBeTruthy();
    expect(() => profileInputSchema.parse({ contactEmail: "nope" })).toThrow();
    expect(() => profileInputSchema.parse({ phone: "call me" })).toThrow();
    expect(() =>
      profileInputSchema.parse({ primaryPurpose: "hacking" }),
    ).toThrow();
    expect(() =>
      profileInputSchema.parse({ profileImageUrl: "ftp://x.test/a.png" }),
    ).toThrow();
    expect(() => profileInputSchema.parse({ onboardingStep: 8 })).toThrow();
  });

  it("limits each onboarding step to its own fields and sections to real inputs", () => {
    expect(fieldsForStep(2)).toEqual(["fullName", "displayName", "headline"]);
    expect(fieldsForStep(1)).toEqual([]);
    expect(fieldsForStep(99)).toEqual([]);
    expect(PROFILE_SECTION_FIELDS.personal).toContain("summary");
    expect(PROFILE_SECTION_FIELDS.personal).not.toContain("onboardingStep");
    for (const field of Object.values(PROFILE_SECTION_FIELDS).flat()) {
      expect(() => profileInputSchema.parse({ [field]: null })).not.toThrow();
    }
  });

  it("computes completion from filled fields and entries", () => {
    const empty = {
      fullName: null,
      displayName: null,
      headline: null,
      summary: null,
      location: null,
      profileImageUrl: null,
      contactEmail: null,
      phone: null,
      currentDesignation: null,
      currentOrganization: null,
      professionalSummary: null,
    };
    expect(computeCompletion(empty, {}).percent).toBe(0);
    const some = computeCompletion(
      { ...empty, fullName: "A", headline: "H" },
      { skill: 2 },
    );
    expect(some.percent).toBe(30);
    const all = computeCompletion(
      {
        fullName: "A",
        displayName: "A",
        headline: "H",
        summary: "S",
        location: "L",
        profileImageUrl: "https://i.test/a",
        contactEmail: "a@b.test",
        phone: null,
        currentDesignation: "D",
        currentOrganization: "O",
        professionalSummary: "P",
      },
      { employment: 1, education: 1, skill: 1, project: 1, social_link: 1 },
    );
    expect(all.percent).toBe(100);
  });
});

describe("site URL and redirects", () => {
  it("prefers configuration, then request host, then VERCEL_URL", () => {
    expect(
      resolveSiteUrl({
        configured: "https://app.example.com/",
        host: "x.test",
      }),
    ).toBe("https://app.example.com");
    expect(resolveSiteUrl({ host: "folioone-git-m4.vercel.app" })).toBe(
      "https://folioone-git-m4.vercel.app",
    );
    expect(resolveSiteUrl({ host: "localhost:3000" })).toBe(
      "http://localhost:3000",
    );
    expect(resolveSiteUrl({ host: "h.test", proto: "https,http" })).toBe(
      "https://h.test",
    );
    expect(resolveSiteUrl({ vercelUrl: "p.vercel.app" })).toBe(
      "https://p.vercel.app",
    );
  });

  it("only allows same-site relative post-auth paths", () => {
    expect(safeNextPath("/onboarding")).toBe("/onboarding");
    expect(safeNextPath("//evil.test")).toBe("/profile");
    expect(safeNextPath("https://evil.test")).toBe("/profile");
    expect(safeNextPath("/\\evil")).toBe("/profile");
    expect(safeNextPath(null, "/x")).toBe("/x");
  });
});
