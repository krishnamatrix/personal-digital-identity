import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  RESERVED_SLUGS,
  suggestSlug,
  validateSlug,
} from "@/domains/website/slug";
import {
  defaultConfig,
  normalizeConfig,
  SECTION_IDS,
} from "@/domains/website/config";
import {
  buildPublishedContent,
  defaultSeo,
  publishProblems,
  shortBio,
  stableStringify,
  type IdentitySource,
} from "@/domains/website/build-published";
import { publishedContentSchema } from "@/domains/website/published-content";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const source = (): IdentitySource => ({
  profile: {
    fullName: "Jane Q Designer",
    displayName: "Jane",
    headline: "Designer",
    summary: "I design things. They work.\n\nSecond paragraph.",
    location: "Lisbon",
    websiteUrl: "https://jane.test",
    profileImageUrl: "https://img.test/j.png",
    coverImageUrl: null,
    contactEmail: "jane@private.test",
    phone: "+1 555 0100",
    currentDesignation: "Lead",
    currentOrganization: "Acme",
    professionalSummary: "Pro summary",
  },
  entries: {
    employment: [
      {
        id: id(1),
        isVisible: true,
        data: {
          title: "Lead",
          organization: "Acme",
          startDate: "2020-01",
          isCurrent: true,
        },
      },
      {
        id: id(2),
        isVisible: false,
        data: { title: "SECRET JOB", organization: "Hidden Inc" },
      },
      {
        id: id(3),
        isVisible: true,
        data: { title: "Excluded", organization: "X" },
      },
    ],
    skill: [
      {
        id: id(4),
        isVisible: true,
        data: { name: "Figma", category: "Design" },
      },
      { id: id(5), isVisible: true, data: { name: "TS", category: "Code" } },
      { id: id(6), isVisible: true, data: { name: "CSS", category: "Design" } },
    ],
    social_link: [
      {
        id: id(7),
        isVisible: true,
        data: { platform: "github", url: "https://github.com/jane" },
      },
    ],
  },
});

describe("slugs", () => {
  it("accepts good slugs and rejects bad ones", () => {
    for (const ok of [
      "krishna",
      "john-smith",
      "jane-designer",
      "a1b",
      "x".repeat(40),
    ])
      expect(validateSlug(ok), ok).toBeNull();
    expect(validateSlug("")).toBe("empty");
    expect(validateSlug("ab")).toBe("too_short");
    expect(validateSlug("x".repeat(41))).toBe("too_long");
    for (const bad of [
      "-ab",
      "ab-",
      "a--b",
      "a_b",
      "a b",
      "a.b",
      "jane/x",
      "é-é-é",
    ])
      expect(validateSlug(bad), bad).toBe("format");
  });

  it("normalizes case and reserves application routes", () => {
    expect(validateSlug("  Krishna ")).toBeNull();
    for (const word of [
      "login",
      "signup",
      "onboarding",
      "profile",
      "personas",
      "settings",
      "api",
      "auth",
      "admin",
      "dashboard",
      "website",
      "Admin",
    ])
      expect(validateSlug(word), word).toBe("reserved");
  });

  it("suggests a slug from a name", () => {
    expect(suggestSlug("Jane Q. Designer")).toBe("jane-q-designer");
    expect(suggestSlug("José Núñez")).toBe("jose-nunez");
    expect(suggestSlug("Al")).toBe("");
    expect(suggestSlug("Admin")).toBe("");
    expect(suggestSlug(null)).toBe("");
  });

  it("matches the reserved list in the SQL CHECK constraints and every top-level route", () => {
    // M8 redefines the website slug checks (adding cards/social) and uses the same list for cards.
    const sql = readFileSync(
      "docs/sql/milestone-8/001-digital-cards.sql",
      "utf8",
    );
    const arrays = [...sql.matchAll(/ARRAY\[([^\]]+)\]/g)].map((m) =>
      [...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]).sort(),
    );
    expect(arrays).toHaveLength(4);
    for (const a of arrays) expect(a).toEqual([...RESERVED_SLUGS].sort());
    for (const route of [
      "login",
      "signup",
      "forgot-password",
      "reset-password",
      "onboarding",
      "profile",
      "personas",
      "website",
      "cards",
      "social",
      "api",
      "auth",
    ])
      expect(RESERVED_SLUGS).toContain(route);
  });
});

describe("config", () => {
  it("repairs stored config: unknown input, missing sections, intro first", () => {
    const repaired = normalizeConfig({
      sections: [
        { id: "skills", visible: false },
        { id: "intro", visible: true },
        { id: "skills", visible: true },
      ],
    });
    // Missing sections go to their default position relative to the ones kept.
    expect(repaired.sections.map((s) => s.id)).toEqual([
      "intro",
      "about",
      "featured",
      "experience",
      "education",
      "skills",
      ...SECTION_IDS.slice(SECTION_IDS.indexOf("skills") + 1),
    ]);
    expect(repaired.sections.find((s) => s.id === "skills")!.visible).toBe(
      false,
    );
    expect(normalizeConfig("garbage")).toEqual(defaultConfig());
    // A config saved before "featured" existed gets it right after "about".
    const old = defaultConfig().sections.filter((x) => x.id !== "featured");
    const upgraded = normalizeConfig({
      ...defaultConfig(),
      sections: [...old].reverse(),
    });
    const ids = upgraded.sections.map((x) => x.id);
    expect(ids[0]).toBe("intro");
    expect(ids.indexOf("featured")).toBe(ids.indexOf("about") + 1);
    expect(normalizeConfig({ excludedEntryIds: ["nope"] })).toEqual(
      defaultConfig(),
    );
  });

  it("publishes contact details only when explicitly enabled", () => {
    expect(defaultConfig().contact).toEqual({
      showEmail: false,
      showPhone: false,
      showWebsite: false,
    });
  });
});

describe("buildPublishedContent", () => {
  it("never publishes hidden, excluded or private data by default", () => {
    const config = { ...defaultConfig(), excludedEntryIds: [id(3)] };
    const content = buildPublishedContent(source(), config);
    const json = JSON.stringify(content);
    expect(json).not.toContain("SECRET JOB");
    expect(json).not.toContain("Excluded");
    expect(json).not.toContain("jane@private.test");
    expect(json).not.toContain("+1 555 0100");
    expect(json).not.toContain("jane.test");
    expect(json).not.toMatch(/account/i);
    expect(content.sections.some((s) => s.id === "contact")).toBe(false);
    expect(publishedContentSchema.safeParse(content).success).toBe(true);
  });

  it("includes contact details when chosen, and uses them for the hero action", () => {
    const config = {
      ...defaultConfig(),
      contact: { showEmail: true, showPhone: true, showWebsite: true },
    };
    const content = buildPublishedContent(source(), config);
    const contact = content.sections.find((s) => s.id === "contact");
    expect(contact).toMatchObject({
      email: "jane@private.test",
      phone: "+1 555 0100",
      website: "https://jane.test",
    });
    expect(content.person.contactEmail).toBe("jane@private.test");
  });

  it("orders sections as configured", () => {
    const base = defaultConfig();
    const order = ["skills", "experience", "about"] as const;
    base.sections = [
      base.sections[0]!,
      ...order.map((id) => ({
        id,
        visible: true,
        heading: id === "skills" ? "Toolbox" : undefined,
      })),
      ...base.sections
        .slice(1)
        .filter((s) => !order.includes(s.id as never))
        .map((s) => ({ ...s, visible: false })),
    ];
    const content = buildPublishedContent(source(), base);
    expect(content.sections.map((s) => s.id)).toEqual([
      "skills",
      "experience",
      "about",
    ]);
    expect(content.sections[0]!.heading).toBe("Toolbox");
  });

  it("groups skills by category and keeps social links", () => {
    const content = buildPublishedContent(source(), defaultConfig());
    const skills = content.sections.find((s) => s.id === "skills")!;
    expect(
      skills.id === "skills" &&
        skills.groups.map((g) => [g.category, g.skills.map((s) => s.name)]),
    ).toEqual([
      ["Design", ["Figma", "CSS"]],
      ["Code", ["TS"]],
    ]);
    expect(content.sections.find((s) => s.id === "social")).toMatchObject({
      items: [{ label: "GitHub", url: "https://github.com/jane" }],
    });
  });

  it("honours intro toggles and requires a name to publish", () => {
    const config = {
      ...defaultConfig(),
      intro: {
        showImage: false,
        showCover: false,
        showLocation: false,
        showShortBio: false,
      },
    };
    const content = buildPublishedContent(source(), config);
    expect(content.person).not.toHaveProperty("imageUrl");
    expect(content.person).not.toHaveProperty("location");
    expect(content.person).not.toHaveProperty("shortBio");
    const empty = buildPublishedContent(
      {
        profile: { ...source().profile, displayName: null, fullName: null },
        entries: {},
      },
      defaultConfig(),
    );
    expect(publishProblems(empty)).toContain("no_name");
    expect(
      defaultSeo(buildPublishedContent(source(), defaultConfig())).title,
    ).toBe("Jane — Designer");
  });

  it("drops non-http(s) URLs", () => {
    const s = source();
    s.profile.profileImageUrl = "javascript:alert(1)";
    expect(buildPublishedContent(s, defaultConfig()).person).not.toHaveProperty(
      "imageUrl",
    );
    expect(
      publishedContentSchema.safeParse({
        version: 1,
        person: { name: "x", imageUrl: "javascript:alert(1)" },
        sections: [],
      }).success,
    ).toBe(false);
  });
});

describe("helpers", () => {
  it("truncates a short biography at a sentence or word", () => {
    expect(shortBio("One. Two.")).toBe("One. Two.");
    const long = "Word ".repeat(100);
    expect(shortBio(long)!.length).toBeLessThanOrEqual(241);
    expect(shortBio(null)).toBeUndefined();
  });

  it("compares content independent of key order (jsonb reorders keys)", () => {
    expect(
      stableStringify({ b: 1, a: { d: [1, { y: 1, x: 2 }], c: undefined } }),
    ).toBe(
      stableStringify({ a: { c: undefined, d: [1, { x: 2, y: 1 }] }, b: 1 }),
    );
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }));
  });
});
