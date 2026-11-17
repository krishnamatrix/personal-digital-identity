import { z } from "zod";
import {
  TEMPLATES,
  type TemplateCategory,
  type TemplateId,
  templateSpec,
} from "@/domains/website/templates";

/** The original three hand-built themes (src/components/website/site-view.tsx). */
const BUILT_IN_THEMES = [
  {
    id: "professional",
    label: "Professional",
    category: "Classic",
    blurb:
      "Editorial and restrained. A clear experience timeline for consultants, executives and founders.",
  },
  {
    id: "creative",
    label: "Creative",
    category: "Creative",
    blurb:
      "Image-rich and expressive. Large type and visual project cards for designers, makers and developers.",
  },
  {
    id: "minimal",
    label: "Minimal",
    category: "Minimal",
    blurb:
      "Quiet and compact. Generous whitespace and strong typography for a simple identity page.",
  },
] as const;

/** Every theme a person can choose: the built-in three, then the template collection. */
export const THEMES = [
  ...BUILT_IN_THEMES,
  ...TEMPLATES.map(({ id, label, category, blurb }) => ({
    id,
    label,
    category,
    blurb,
  })),
] as const satisfies readonly {
  id: string;
  label: string;
  category: TemplateCategory;
  blurb: string;
}[];
export type ThemeId = (typeof BUILT_IN_THEMES)[number]["id"] | TemplateId;
export const THEME_IDS = THEMES.map((t) => t.id) as [ThemeId, ...ThemeId[]];
export const THEME_CATEGORIES: readonly TemplateCategory[] = [
  "Editorial",
  "Classic",
  "Minimal",
  "Bold",
  "Creative",
  "Technical",
];

const BUILT_IN_COLORS = {
  professional: { bg: "#faf8f4", fg: "#1f2328", accent: "#2f4a5a" },
  creative: { bg: "#12101a", fg: "#ffffff", accent: "#ff7a59" },
  minimal: { bg: "#ffffff", fg: "#171717", accent: "#737373" },
} as const;

/** Background, text and accent colour of any theme (share image, article pages). */
export function themeColors(id: ThemeId): {
  bg: string;
  fg: string;
  accent: string;
} {
  if (id in BUILT_IN_COLORS) {
    return BUILT_IN_COLORS[id as keyof typeof BUILT_IN_COLORS];
  }
  const spec = templateSpec(id);
  return spec
    ? { bg: spec.palette.bg, fg: spec.palette.ink, accent: spec.palette.accent }
    : BUILT_IN_COLORS.professional;
}

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEME_IDS.includes(value as ThemeId);
}

/** Website sections. `intro` is the hero and always comes first; the rest can be reordered. */
export const SECTION_IDS = [
  "intro",
  "about",
  "featured",
  "experience",
  "education",
  "skills",
  "projects",
  "articles",
  "achievements",
  "certifications",
  "social",
  "contact",
] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export const SECTION_DEFS: Record<
  SectionId,
  { label: string; defaultHeading: string; hint: string; reorderable: boolean }
> = {
  intro: {
    label: "Introduction",
    defaultHeading: "Introduction",
    hint: "Name, images, headline, short biography, location.",
    reorderable: false,
  },
  about: {
    label: "About",
    defaultHeading: "About",
    hint: "Your full biography and professional summary.",
    reorderable: true,
  },
  featured: {
    label: "Featured posts & media",
    defaultHeading: "Featured",
    hint: "Posts, videos, articles and talks you tick below, from My Identity → Featured.",
    reorderable: true,
  },
  experience: {
    label: "Professional experience",
    defaultHeading: "Experience",
    hint: "Employment history from My Identity.",
    reorderable: true,
  },
  education: {
    label: "Education",
    defaultHeading: "Education",
    hint: "Institutions, qualifications and dates.",
    reorderable: true,
  },
  skills: {
    label: "Skills and expertise",
    defaultHeading: "Skills",
    hint: "Skills grouped by category.",
    reorderable: true,
  },
  projects: {
    label: "Projects",
    defaultHeading: "Projects",
    hint: "Work with roles, technologies and links.",
    reorderable: true,
  },
  articles: {
    label: "Articles & thoughts",
    defaultHeading: "Writing",
    hint: "Published articles you choose to feature, in the order you set.",
    reorderable: true,
  },
  achievements: {
    label: "Achievements",
    defaultHeading: "Achievements",
    hint: "Awards, recognition and accomplishments.",
    reorderable: true,
  },
  certifications: {
    label: "Certifications",
    defaultHeading: "Certifications",
    hint: "Certifications with issuer, date and credential link.",
    reorderable: true,
  },
  social: {
    label: "Social and web presence",
    defaultHeading: "Elsewhere",
    hint: "Your saved social and web profiles.",
    reorderable: true,
  },
  contact: {
    label: "Contact",
    defaultHeading: "Get in touch",
    hint: "Only the contact details you choose below.",
    reorderable: true,
  },
};

const heading = z.string().trim().max(60).optional();

export const websiteConfigSchema = z.object({
  /** Order of ALL sections (intro is forced first when building). */
  sections: z
    .array(z.object({ id: z.enum(SECTION_IDS), visible: z.boolean(), heading }))
    .max(SECTION_IDS.length),
  /** Entries hidden from the website only (they stay in My Identity). */
  excludedEntryIds: z.array(z.uuid()).max(500),
  intro: z.object({
    showImage: z.boolean(),
    showCover: z.boolean(),
    showLocation: z.boolean(),
    showShortBio: z.boolean(),
  }),
  about: z.object({
    showBiography: z.boolean(),
    showProfessionalSummary: z.boolean(),
  }),
  /** Articles are opt-in one by one; the order here is the order on the website. */
  articles: z.object({
    selectedIds: z.array(z.uuid()).max(50),
  }),
  /** Private by default: nothing is published unless it is switched on here. */
  contact: z.object({
    showEmail: z.boolean(),
    showPhone: z.boolean(),
    showWebsite: z.boolean(),
  }),
  seo: z.object({
    title: z.string().trim().max(120).optional(),
    description: z.string().trim().max(300).optional(),
  }),
});
export type WebsiteConfig = z.infer<typeof websiteConfigSchema>;

export function defaultConfig(): WebsiteConfig {
  return {
    sections: SECTION_IDS.map((id) => ({ id, visible: id !== "articles" })),
    articles: { selectedIds: [] },
    excludedEntryIds: [],
    intro: {
      showImage: true,
      showCover: true,
      showLocation: true,
      showShortBio: true,
    },
    about: { showBiography: true, showProfessionalSummary: true },
    contact: { showEmail: false, showPhone: false, showWebsite: false },
    seo: {},
  };
}

/** Parses stored config, repairing it: unknown/missing sections are added, duplicates dropped, intro first. */
export function normalizeConfig(raw: unknown): WebsiteConfig {
  const base = defaultConfig();
  const parsed = websiteConfigSchema.safeParse({
    ...base,
    ...(raw && typeof raw === "object" ? raw : {}),
  });
  const cfg = parsed.success ? parsed.data : base;
  const seen = new Set<string>();
  const deduped = cfg.sections.filter((s) =>
    seen.has(s.id) ? false : (seen.add(s.id), true),
  );
  // Intro first, then the stored order.
  const ordered = [
    deduped.find((s) => s.id === "intro") ?? {
      id: "intro" as const,
      visible: true,
    },
    ...deduped.filter((s) => s.id !== "intro"),
  ];
  seen.add("intro");
  // Sections added in a later release go to their default position (after the section that
  // precedes them in SECTION_IDS), not to the end.
  SECTION_IDS.forEach((id, index) => {
    if (seen.has(id)) return;
    const before = SECTION_IDS.slice(0, index)
      .reverse()
      .find((p) => seen.has(p))!;
    const at = ordered.findIndex((s) => s.id === before) + 1;
    ordered.splice(at, 0, { id, visible: id !== "articles" });
    seen.add(id);
  });
  return { ...cfg, sections: ordered };
}

export type WebsiteStatus =
  | "not_created"
  | "draft"
  | "published"
  | "unpublished";
