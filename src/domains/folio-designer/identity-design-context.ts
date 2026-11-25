import type { FolioneClient } from "@/lib/db/schema";
import type { IdentityProfile } from "@/domains/identity/profile-schema";
import { ENTRY_KINDS, type EntryKind } from "@/domains/identity/entry-kinds";
import { listEntries, listPublishedArticles } from "@/lib/db/query";
import { displayExcerpt } from "@/domains/articles/article-schema";
import type { IdentityFieldKey } from "@/domains/folio-designer/folio-designer-schema";

const BIO_EXCERPT_MAX = 1_500;
const SUMMARY_MAX = 1_500;
const ITEM_DESC_MAX = 600;
const MAX_ITEMS_PER_KIND = 15;
const CONTEXT_CHAR_CAP = 20_000;

export type IdentityEntrySummary = {
  title: string;
  subtitle?: string;
  period?: string;
  description?: string;
  url?: string;
};

export type IdentityDesignContext = {
  name: string | null;
  headline: string | null;
  professionalSummary: string | null;
  biographyExcerpt: string | null;
  location: string | null;
  industry: string | null;
  purpose: string | null;
  designation: string | null;
  organization: string | null;
  websiteUrl: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  visibleEntryCounts: Partial<Record<EntryKind, number>>;
  highlights: Partial<Record<EntryKind, IdentityEntrySummary[]>>;
  articles: { title: string; excerpt: string; category?: string | null }[];
  populatedFields: IdentityFieldKey[];
};

function excerpt(text: string | null | undefined, max: number): string | null {
  if (!text?.trim()) return null;
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function str(value: unknown, max = 160): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

function resolvedName(profile: IdentityProfile): string | null {
  const name = profile.displayName?.trim() || profile.fullName?.trim();
  return name || null;
}

function summarizeEntry(
  kind: EntryKind,
  data: Record<string, unknown>,
): IdentityEntrySummary | null {
  switch (kind) {
    case "employment": {
      const title = str(data.title);
      if (!title) return null;
      const start = str(data.startDate, 20);
      const end = data.isCurrent ? "Present" : str(data.endDate, 20);
      return {
        title,
        subtitle: str(data.organization),
        period: [start, end].filter(Boolean).join(" – ") || undefined,
        description: str(data.description, ITEM_DESC_MAX),
      };
    }
    case "project": {
      const title = str(data.name);
      if (!title) return null;
      const techs = Array.isArray(data.technologies)
        ? data.technologies
            .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
            .slice(0, 12)
            .join(", ")
        : undefined;
      const desc = [str(data.description, ITEM_DESC_MAX), techs ? `Tech: ${techs}` : undefined]
        .filter(Boolean)
        .join(" | ");
      return {
        title,
        subtitle: str(data.role),
        url: str(data.url, 300),
        description: desc || undefined,
      };
    }
    case "education": {
      const title = str(data.institution);
      if (!title) return null;
      const start = str(data.startDate, 20);
      const end = str(data.endDate, 20);
      return {
        title,
        subtitle: [str(data.qualification), str(data.specialization)]
          .filter(Boolean)
          .join(" · "),
        period: [start, end].filter(Boolean).join(" – ") || undefined,
      };
    }
    case "skill": {
      const title = str(data.name, 80);
      if (!title) return null;
      return { title, subtitle: str(data.category, 60) };
    }
    case "achievement":
    case "certification": {
      const title = str(data.title ?? data.name);
      if (!title) return null;
      return {
        title,
        subtitle: str(data.issuer ?? data.organization),
        period: str(data.date ?? data.issuedDate, 20),
        description: str(data.description, ITEM_DESC_MAX),
      };
    }
    case "social_link": {
      const url = str(data.url, 300);
      const title = str(data.label ?? data.platform, 80);
      if (!title || !url) return null;
      return { title, url };
    }
    case "featured_post": {
      const title = str(data.title);
      if (!title) return null;
      return {
        title,
        subtitle: str(data.type, 40),
        url: str(data.url, 300),
        description: str(data.note ?? data.whyItMatters, ITEM_DESC_MAX),
      };
    }
    default: {
      const title = str(data.name ?? data.title, 80);
      return title ? { title } : null;
    }
  }
}

/** Bounded identity snapshot with concise visible highlights for Folio Designer. */
export async function buildIdentityDesignContext(
  client: FolioneClient,
  userId: string,
  profile: IdentityProfile,
): Promise<IdentityDesignContext> {
  const stored = await listEntries(client, userId);
  const visibleEntryCounts: Partial<Record<EntryKind, number>> = {};
  const highlights: Partial<Record<EntryKind, IdentityEntrySummary[]>> = {};

  for (const kind of ENTRY_KINDS) {
    visibleEntryCounts[kind] = 0;
  }

  for (const row of stored) {
    if (!row.isVisible) continue;
    visibleEntryCounts[row.kind] = (visibleEntryCounts[row.kind] ?? 0) + 1;
    const bucket = (highlights[row.kind] ??= []);
    const cap = row.kind === "skill" ? 40 : MAX_ITEMS_PER_KIND;
    if (bucket.length < cap) {
      const summary = summarizeEntry(
        row.kind,
        (row.data ?? {}) as Record<string, unknown>,
      );
      if (summary) bucket.push(summary);
    }
  }

  const publishedArticles = await listPublishedArticles(client, userId);
  const articles = publishedArticles.slice(0, MAX_ITEMS_PER_KIND).map((a) => ({
    title: a.title,
    excerpt: displayExcerpt(a).slice(0, ITEM_DESC_MAX),
    category: a.category,
  }));

  const populatedFields: IdentityFieldKey[] = [];
  const name = resolvedName(profile);
  if (name) populatedFields.push("displayName");
  if (profile.headline?.trim()) populatedFields.push("headline");
  if (profile.professionalSummary?.trim())
    populatedFields.push("professionalSummary");
  if (profile.summary?.trim()) populatedFields.push("summary");
  if (profile.location?.trim()) populatedFields.push("location");
  if (profile.industry?.trim()) populatedFields.push("industry");
  if (profile.primaryPurpose) populatedFields.push("primaryPurpose");
  if (profile.currentDesignation?.trim())
    populatedFields.push("currentDesignation");
  if (profile.currentOrganization?.trim())
    populatedFields.push("currentOrganization");
  if ((visibleEntryCounts.employment ?? 0) > 0)
    populatedFields.push("experience");
  if ((visibleEntryCounts.project ?? 0) > 0) populatedFields.push("projects");
  if ((visibleEntryCounts.skill ?? 0) > 0) populatedFields.push("skills");
  if ((visibleEntryCounts.education ?? 0) > 0)
    populatedFields.push("education");
  if ((visibleEntryCounts.achievement ?? 0) > 0)
    populatedFields.push("achievements");
  if ((visibleEntryCounts.social_link ?? 0) > 0) populatedFields.push("social");
  if (articles.length > 0) populatedFields.push("articles");

  return {
    name,
    headline: profile.headline?.trim() || null,
    professionalSummary: excerpt(profile.professionalSummary, SUMMARY_MAX),
    biographyExcerpt: excerpt(profile.summary, BIO_EXCERPT_MAX),
    location: profile.location?.trim() || null,
    industry: profile.industry?.trim() || null,
    purpose: profile.primaryPurpose ? String(profile.primaryPurpose) : null,
    designation: profile.currentDesignation?.trim() || null,
    organization: profile.currentOrganization?.trim() || null,
    websiteUrl: profile.websiteUrl?.trim() || null,
    linkedinUrl: profile.linkedinUrl?.trim() || null,
    githubUrl: profile.githubUrl?.trim() || null,
    visibleEntryCounts,
    highlights,
    articles,
    populatedFields,
  };
}

export function formatIdentityDesignContext(
  ctx: IdentityDesignContext,
): string {
  const sections: string[] = [];

  const profileLines = [
    ctx.name ? `Name: ${ctx.name}` : null,
    ctx.headline ? `Headline: ${ctx.headline}` : null,
    ctx.designation || ctx.organization
      ? `Current role: ${[ctx.designation, ctx.organization].filter(Boolean).join(" at ")}`
      : null,
    ctx.location ? `Location: ${ctx.location}` : null,
    ctx.industry ? `Industry: ${ctx.industry}` : null,
    ctx.purpose ? `Primary purpose: ${ctx.purpose}` : null,
    ctx.professionalSummary
      ? `Professional summary: ${ctx.professionalSummary}`
      : null,
    ctx.biographyExcerpt ? `Biography: ${ctx.biographyExcerpt}` : null,
    ctx.websiteUrl ? `Website: ${ctx.websiteUrl}` : null,
    ctx.linkedinUrl ? `LinkedIn: ${ctx.linkedinUrl}` : null,
    ctx.githubUrl ? `GitHub: ${ctx.githubUrl}` : null,
  ].filter(Boolean) as string[];

  if (profileLines.length) {
    sections.push(`Profile:\n${profileLines.join("\n")}`);
  }

  const formatList = (label: string, items?: IdentityEntrySummary[]) => {
    if (!items?.length) return;
    const rows = items.map((item) => {
      const head = [item.title, item.subtitle, item.period]
        .filter(Boolean)
        .join(" — ");
      const tail = [item.description, item.url].filter(Boolean).join(" | ");
      return tail ? `- ${head}: ${tail}` : `- ${head}`;
    });
    sections.push(`${label}:\n${rows.join("\n")}`);
  };

  formatList("Experience", ctx.highlights.employment);
  formatList("Projects", ctx.highlights.project);
  formatList("Education", ctx.highlights.education);
  formatList("Achievements", ctx.highlights.achievement);
  formatList("Certifications", ctx.highlights.certification);
  formatList("Featured posts", ctx.highlights.featured_post);
  formatList("Social & web links", ctx.highlights.social_link);

  if (ctx.highlights.skill?.length) {
    sections.push(
      `Skills: ${ctx.highlights.skill.map((s) => s.title).join(", ")}`,
    );
  }

  if (ctx.articles.length) {
    sections.push(
      `Published articles:\n${ctx.articles
        .map((a) => `- ${a.title}${a.excerpt ? `: ${a.excerpt}` : ""}`)
        .join("\n")}`,
    );
  }

  if (!sections.length) {
    return "No saved profile fields yet (use tasteful neutral placeholder copy clearly labeled for the owner).";
  }

  const joined = sections.join("\n\n");
  return joined.length <= CONTEXT_CHAR_CAP
    ? joined
    : `${joined.slice(0, CONTEXT_CHAR_CAP - 1)}…`;
}
