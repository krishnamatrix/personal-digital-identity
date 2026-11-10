import {
  entryTitle,
  type EntryData,
  type EntryItem,
  type EntryKind,
} from "@/domains/identity/entry-kinds";
import type { IdentityProfile } from "@/domains/identity/profile-schema";
import {
  SECTION_DEFS,
  type SectionId,
  type WebsiteConfig,
} from "@/domains/website/config";
import type {
  PublishedContent,
  PublishedSection,
} from "@/domains/website/published-content";

/** The slice of My Identity the website may read. Nothing else can reach the public site. */
export type IdentitySource = {
  profile: Pick<
    IdentityProfile,
    | "fullName"
    | "displayName"
    | "headline"
    | "summary"
    | "location"
    | "websiteUrl"
    | "profileImageUrl"
    | "coverImageUrl"
    | "contactEmail"
    | "phone"
    | "currentDesignation"
    | "currentOrganization"
    | "professionalSummary"
  >;
  entries: Partial<Record<EntryKind, EntryItem[]>>;
  /** The owner's PUBLISHED articles only (draft and archived ones are never passed in). */
  articles?: ArticleSource[];
};

export type ArticleSource = {
  id: string;
  slug: string | null;
  title: string;
  excerpt: string;
  coverImageUrl: string | null;
  category: string | null;
  publishedAt: Date | null;
  readingMinutes: number;
  version: number;
};

/** Articles that may be published: published, with an address, explicitly selected, in the chosen order. */
export function selectedArticles(
  source: IdentitySource,
  config: WebsiteConfig,
): ArticleSource[] {
  const byId = new Map((source.articles ?? []).map((a) => [a.id, a]));
  const seen = new Set<string>();
  return config.articles.selectedIds.flatMap((id) => {
    const a = byId.get(id);
    if (!a || !a.slug || !a.publishedAt || seen.has(id)) return [];
    seen.add(id);
    return [a];
  });
}

const HTTP = /^https?:\/\/[^\s]+$/;
const str = (d: EntryData, key: string): string | undefined => {
  const v = d[key];
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
};
const url = (v: string | null | undefined) =>
  v && HTTP.test(v) ? v : undefined;
const nonEmpty = (v: string | null | undefined) =>
  v && v.trim() !== "" ? v.trim() : undefined;
const compact = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

export function shortBio(summary: string | null | undefined, max = 240) {
  const s = nonEmpty(summary)?.replace(/\s+/g, " ");
  if (!s) return undefined;
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sentence = cut.lastIndexOf(". ");
  if (sentence > max * 0.5) return cut.slice(0, sentence + 1);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:\s]+$/, "") + "…";
}

/** Entries that may be published: visible in My Identity AND not excluded on the website. */
function included(
  entries: IdentitySource["entries"],
  kind: EntryKind,
  config: WebsiteConfig,
): EntryItem[] {
  const excluded = new Set(config.excludedEntryIds);
  return (entries[kind] ?? []).filter(
    (e) => e.isVisible && !excluded.has(e.id),
  );
}

export function buildPublishedContent(
  source: IdentitySource,
  config: WebsiteConfig,
): PublishedContent {
  const { profile, entries } = source;
  const heading = (id: SectionId) =>
    config.sections.find((s) => s.id === id)?.heading?.trim() ||
    SECTION_DEFS[id].defaultHeading;

  const role = [
    nonEmpty(profile.currentDesignation),
    nonEmpty(profile.currentOrganization),
  ]
    .filter(Boolean)
    .join(" at ");
  const email = nonEmpty(profile.contactEmail);

  const person: PublishedContent["person"] = compact({
    name: nonEmpty(profile.displayName) ?? nonEmpty(profile.fullName) ?? "",
    headline: nonEmpty(profile.headline),
    role: role || undefined,
    location: config.intro.showLocation
      ? nonEmpty(profile.location)
      : undefined,
    shortBio: config.intro.showShortBio ? shortBio(profile.summary) : undefined,
    imageUrl: config.intro.showImage ? url(profile.profileImageUrl) : undefined,
    coverUrl: config.intro.showCover ? url(profile.coverImageUrl) : undefined,
    contactEmail: config.contact.showEmail ? email : undefined,
  });

  const build: Record<
    Exclude<SectionId, "intro">,
    () => PublishedSection | null
  > = {
    about: () => {
      const paragraphs = [
        ...(config.about.showBiography
          ? (nonEmpty(profile.summary)?.split(/\n{2,}/) ?? [])
          : []),
        ...(config.about.showProfessionalSummary
          ? [nonEmpty(profile.professionalSummary)]
          : []),
      ]
        .map((p) => p?.trim())
        .filter((p): p is string => !!p)
        .slice(0, 4);
      return paragraphs.length
        ? { id: "about", heading: heading("about"), paragraphs }
        : null;
    },
    experience: () => {
      const items = included(entries, "employment", config).map((e) =>
        compact({
          title: str(e.data, "title") ?? "",
          organization: str(e.data, "organization") ?? "",
          location: str(e.data, "location"),
          start: str(e.data, "startDate"),
          end: e.data.isCurrent === true ? undefined : str(e.data, "endDate"),
          current: e.data.isCurrent === true ? true : undefined,
          description: str(e.data, "description"),
        }),
      );
      return items.length
        ? { id: "experience", heading: heading("experience"), items }
        : null;
    },
    education: () => {
      const items = included(entries, "education", config).map((e) =>
        compact({
          institution: str(e.data, "institution") ?? "",
          qualification: str(e.data, "qualification"),
          specialization: str(e.data, "specialization"),
          start: str(e.data, "startDate"),
          end: str(e.data, "endDate"),
          description: str(e.data, "description"),
        }),
      );
      return items.length
        ? { id: "education", heading: heading("education"), items }
        : null;
    },
    skills: () => {
      const groups: {
        category?: string;
        skills: { name: string; description?: string }[];
      }[] = [];
      for (const e of included(entries, "skill", config)) {
        const category = str(e.data, "category");
        let g = groups.find((x) => x.category === category);
        if (!g) groups.push((g = compact({ category, skills: [] })));
        g.skills.push(
          compact({
            name: str(e.data, "name") ?? "",
            description: str(e.data, "description"),
          }),
        );
      }
      return groups.length
        ? { id: "skills", heading: heading("skills"), groups }
        : null;
    },
    projects: () => {
      const items = included(entries, "project", config).map((e) =>
        compact({
          name: str(e.data, "name") ?? "",
          role: str(e.data, "role"),
          description: str(e.data, "description"),
          technologies: Array.isArray(e.data.technologies)
            ? e.data.technologies.slice(0, 20)
            : undefined,
          url: url(str(e.data, "url")),
          images: Array.isArray(e.data.images)
            ? e.data.images.filter((i) => HTTP.test(i)).slice(0, 6)
            : undefined,
        }),
      );
      return items.length
        ? { id: "projects", heading: heading("projects"), items }
        : null;
    },
    articles: () => {
      const items = selectedArticles(source, config).map((a) =>
        compact({
          slug: a.slug ?? "",
          title: a.title,
          excerpt: nonEmpty(a.excerpt),
          coverUrl: url(a.coverImageUrl),
          category: nonEmpty(a.category),
          publishedAt: (a.publishedAt as Date).toISOString(),
          readingMinutes: a.readingMinutes,
          rev: a.version,
        }),
      );
      return items.length
        ? { id: "articles", heading: heading("articles"), items }
        : null;
    },
    achievements: () => {
      const items = included(entries, "achievement", config).map((e) =>
        compact({
          title: str(e.data, "title") ?? "",
          date: str(e.data, "date"),
          description: str(e.data, "description"),
        }),
      );
      return items.length
        ? { id: "achievements", heading: heading("achievements"), items }
        : null;
    },
    certifications: () => {
      const items = included(entries, "certification", config).map((e) =>
        compact({
          name: str(e.data, "name") ?? "",
          issuer: str(e.data, "issuer"),
          date: str(e.data, "date"),
          url: url(str(e.data, "url")),
        }),
      );
      return items.length
        ? { id: "certifications", heading: heading("certifications"), items }
        : null;
    },
    social: () => {
      const items = included(entries, "social_link", config).flatMap((e) => {
        const link = url(str(e.data, "url"));
        return link
          ? [
              {
                platform: str(e.data, "platform") ?? "custom",
                label: entryTitle("social_link", e.data),
                url: link,
              },
            ]
          : [];
      });
      return items.length
        ? { id: "social", heading: heading("social"), items }
        : null;
    },
    contact: () => {
      const c = compact({
        email: config.contact.showEmail ? email : undefined,
        phone: config.contact.showPhone ? nonEmpty(profile.phone) : undefined,
        website: config.contact.showWebsite
          ? url(profile.websiteUrl)
          : undefined,
      });
      return Object.keys(c).length
        ? { id: "contact", heading: heading("contact"), ...c }
        : null;
    },
  };

  const sections = config.sections
    .filter((s) => s.id !== "intro" && s.visible)
    .flatMap((s) => {
      const built = build[s.id as Exclude<SectionId, "intro">]();
      return built ? [built] : [];
    });

  return { version: 1, person, sections };
}

/** Sections that currently have content (drives the "empty" hints in the editor). */
export function sectionHasContent(
  source: IdentitySource,
  config: WebsiteConfig,
  id: SectionId,
): boolean {
  if (id === "intro") return true;
  const all = {
    ...config,
    sections: config.sections.map((s) => ({ ...s, visible: true })),
  };
  return buildPublishedContent(source, all).sections.some((s) => s.id === id);
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export type PublishProblem = "no_name" | "nothing_to_show";
export function publishProblems(content: PublishedContent): PublishProblem[] {
  const out: PublishProblem[] = [];
  if (!content.person.name) out.push("no_name");
  if (
    content.sections.length === 0 &&
    !content.person.shortBio &&
    !content.person.headline
  )
    out.push("nothing_to_show");
  return out;
}

export function defaultSeo(content: PublishedContent) {
  const p = content.person;
  return {
    title: p.headline ? `${p.name} — ${p.headline}` : p.name,
    description: p.shortBio ?? p.headline ?? `${p.name}'s personal website.`,
  };
}
