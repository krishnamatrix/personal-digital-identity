import { linksLiveOn } from "@/domains/website/build-published";
import type {
  PublishedContent,
  PublishedLinks,
} from "@/domains/website/published-content";

/** Hard UTF-8 byte ceiling (strictly under the 100 KB budget in SC-005). */
export const LLMS_MAX_BYTES = 96 * 1024;

const TRUNCATION_NOTICE = "\n\n_Content truncated for brevity._\n";
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

function normalizeOrigin(origin: string): string {
  try {
    const parsed = new URL(origin);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.origin;
    }
  } catch {
    // Fall through to safe default.
  }
  return "http://localhost:3000";
}

export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.replace(CONTROL_CHARS, "").trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function cleanInline(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(CONTROL_CHARS, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function escapeLinkLabel(value: string): string {
  return cleanInline(value)
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function escapeLinkUrl(url: string): string {
  return url.replace(/\s+/g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29");
}

function mdLink(label: string, url: string): string {
  return `[${escapeLinkLabel(label)}](${escapeLinkUrl(url)})`;
}

function cleanParagraph(value: string): string {
  const cleaned = value.replace(CONTROL_CHARS, "").replace(/\r\n?/g, "\n");
  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^(#{1,6}|>|[-*+]|```+)\s*/g, ""));
  return lines
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function formatDateRange(
  start?: string,
  end?: string,
  current?: boolean,
): string {
  const s = cleanInline(start);
  const e = current ? "Present" : cleanInline(end);
  if (s && e) return `${s} – ${e}`;
  if (s) return s;
  if (e) return e;
  return "";
}

function truncateUtf8(markdown: string, maxBytes: number): string {
  if (Buffer.byteLength(markdown, "utf8") <= maxBytes) {
    return markdown;
  }
  const noticeBytes = Buffer.byteLength(TRUNCATION_NOTICE, "utf8");
  const budget = Math.max(0, maxBytes - noticeBytes);
  const buf = Buffer.from(markdown, "utf8").subarray(0, budget);
  let cut = buf.toString("utf8");
  // Drop any trailing replacement character from splitting a multi-byte sequence.
  cut = cut.replace(/\uFFFD+$/, "");
  const lastNewline = cut.lastIndexOf("\n");
  if (lastNewline > 0) {
    cut = cut.slice(0, lastNewline);
  }
  return `${cut.trimEnd()}${TRUNCATION_NOTICE}`;
}

export function buildPlatformLlmsTxt(origin: string): string {
  const base = normalizeOrigin(origin);
  const lines = [
    "# Folioone",
    "",
    "> Personal digital identity workspace: maintain one canonical private profile and publish curated personal websites, articles, and digital cards.",
    "",
    "## Public Pages",
    "",
    `- ${mdLink("Home", `${base}/`)}: Overview of Folioone and how personal digital identity publishing works.`,
    `- ${mdLink("Pricing", `${base}/pricing`)}: Free and PRO plan details.`,
    "",
    "## Published Websites",
    "",
    `Each explicitly published Folioone personal website provides its own machine-readable summary at \`${base}/<slug>/llms.txt\`.`,
    "",
  ];
  return lines.join("\n");
}

export type WebsiteLlmsInput = {
  origin: string;
  slug: string;
  title: string;
  description?: string | null;
  content: PublishedContent;
  /** YYYY-MM-DD (UTC) used to filter scheduled links. Defaults to current UTC date. */
  today?: string;
  /** Live published article slugs, used to omit withdrawn articles from links items. */
  liveArticleSlugs?: ReadonlySet<string>;
};

function renderActiveLinks(
  links: PublishedLinks,
  origin: string,
  slug: string,
  today: string,
  liveArticleSlugs?: ReadonlySet<string>,
): string[] {
  const active = linksLiveOn(links.items, today);
  const bullets: string[] = [];
  for (const item of active) {
    if (item.kind === "website") continue;
    const title = cleanInline(item.title);
    if (!title) continue;
    if (item.kind === "article") {
      const articleSlug = cleanInline(item.articleSlug);
      if (!articleSlug) continue;
      if (liveArticleSlugs && !liveArticleSlugs.has(articleSlug)) continue;
      bullets.push(
        `- ${mdLink(title, `${origin}/${encodeURIComponent(slug)}/articles/${encodeURIComponent(articleSlug)}`)}`,
      );
      continue;
    }
    const href = safeHttpUrl(item.url);
    if (!href) continue;
    bullets.push(`- ${mdLink(title, href)}`);
  }
  return bullets;
}

export function buildWebsiteLlmsTxt(input: WebsiteLlmsInput): string {
  const base = normalizeOrigin(input.origin);
  const slug = cleanInline(input.slug);
  const siteUrl = `${base}/${encodeURIComponent(slug)}`;
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const { person, sections, links } = input.content;

  const name = cleanInline(person.name) || cleanInline(input.title) || slug;
  const summaryParts = [
    cleanInline(person.headline),
    cleanInline(person.role),
    cleanInline(person.location),
  ].filter(Boolean);
  const shortBio = cleanParagraph(person.shortBio ?? "");
  const fallbackDesc = cleanParagraph(input.description ?? "");
  const summary =
    [summaryParts.join(" · "), shortBio].filter(Boolean).join(" — ") ||
    fallbackDesc ||
    `${name}'s published personal website on Folioone.`;

  const blocks: string[] = [];
  blocks.push(`# ${name}`);
  blocks.push(`> ${summary}`);

  const activeLinkBullets = links
    ? renderActiveLinks(links, base, slug, today, input.liveArticleSlugs)
    : [];

  const canonicalLinks = [
    `- ${mdLink("Website", siteUrl)}: ${cleanInline(input.title) || name}`,
  ];
  if (links) {
    canonicalLinks.push(
      `- ${mdLink("Links", `${siteUrl}/links`)}: Curated links page`,
    );
  }
  blocks.push(canonicalLinks.join("\n"));

  for (const section of sections) {
    const heading = cleanInline(section.heading);
    if (!heading) continue;

    switch (section.id) {
      case "about": {
        const paras = section.paragraphs.map(cleanParagraph).filter(Boolean);
        if (paras.length > 0) {
          blocks.push(`## ${heading}\n\n${paras.join("\n\n")}`);
        }
        break;
      }
      case "featured": {
        const items = section.items.flatMap((item) => {
          const href = safeHttpUrl(item.url);
          const title = cleanInline(item.title);
          if (!href || !title) return [];
          const meta = [
            cleanInline(item.platformLabel),
            cleanInline(item.mediaType),
            cleanInline(item.date),
          ]
            .filter(Boolean)
            .join(", ");
          const summaryText = cleanParagraph(item.summary ?? "");
          const suffix = [meta ? `(${meta})` : "", summaryText]
            .filter(Boolean)
            .join(" — ");
          return [`- ${mdLink(title, href)}${suffix ? `: ${suffix}` : ""}`];
        });
        if (items.length > 0) {
          blocks.push(`## ${heading}\n\n${items.join("\n")}`);
        }
        break;
      }
      case "experience": {
        const items = section.items.flatMap((item) => {
          const title = cleanInline(item.title);
          const org = cleanInline(item.organization);
          if (!title && !org) return [];
          const header = [title ? `**${title}**` : "", org]
            .filter(Boolean)
            .join(", ");
          const meta = [
            formatDateRange(item.start, item.end, item.current),
            cleanInline(item.location),
          ]
            .filter(Boolean)
            .join(", ");
          const desc = cleanParagraph(item.description ?? "");
          return [
            `- ${header}${meta ? ` (${meta})` : ""}${desc ? `: ${desc}` : ""}`,
          ];
        });
        if (items.length > 0) {
          blocks.push(`## ${heading}\n\n${items.join("\n")}`);
        }
        break;
      }
      case "education": {
        const items = section.items.flatMap((item) => {
          const inst = cleanInline(item.institution);
          if (!inst) return [];
          const degree = [
            cleanInline(item.qualification),
            cleanInline(item.specialization),
          ]
            .filter(Boolean)
            .join(", ");
          const dates = formatDateRange(item.start, item.end);
          const desc = cleanParagraph(item.description ?? "");
          return [
            `- **${inst}**${degree ? ` — ${degree}` : ""}${dates ? ` (${dates})` : ""}${desc ? `: ${desc}` : ""}`,
          ];
        });
        if (items.length > 0) {
          blocks.push(`## ${heading}\n\n${items.join("\n")}`);
        }
        break;
      }
      case "skills": {
        const items = section.groups.flatMap((group) => {
          const names = group.skills
            .map((s) => cleanInline(s.name))
            .filter(Boolean);
          if (names.length === 0) return [];
          const category = cleanInline(group.category);
          return [
            category
              ? `- **${category}**: ${names.join(", ")}`
              : `- ${names.join(", ")}`,
          ];
        });
        if (items.length > 0) {
          blocks.push(`## ${heading}\n\n${items.join("\n")}`);
        }
        break;
      }
      case "projects": {
        const items = section.items.flatMap((item) => {
          const projName = cleanInline(item.name);
          if (!projName) return [];
          const href = safeHttpUrl(item.url);
          const label = href ? mdLink(projName, href) : `**${projName}**`;
          const role = cleanInline(item.role);
          const desc = cleanParagraph(item.description ?? "");
          const tech = (item.technologies ?? [])
            .map(cleanInline)
            .filter(Boolean)
            .join(", ");
          const details = [desc, tech ? `Technologies: ${tech}` : ""]
            .filter(Boolean)
            .join(" ");
          return [
            `- ${label}${role ? ` — ${role}` : ""}${details ? `: ${details}` : ""}`,
          ];
        });
        if (items.length > 0) {
          blocks.push(`## ${heading}\n\n${items.join("\n")}`);
        }
        break;
      }
      case "articles": {
        const items = section.items.flatMap((item) => {
          const articleTitle = cleanInline(item.title);
          const articleSlug = cleanInline(item.slug);
          if (!articleTitle || !articleSlug) return [];
          const href = `${siteUrl}/articles/${encodeURIComponent(articleSlug)}`;
          const excerpt = cleanParagraph(item.excerpt ?? "");
          const readTime =
            item.readingMinutes > 0 ? `${item.readingMinutes} min read` : "";
          const suffix = [excerpt, readTime ? `(${readTime})` : ""]
            .filter(Boolean)
            .join(" ");
          return [
            `- ${mdLink(articleTitle, href)}${suffix ? `: ${suffix}` : ""}`,
          ];
        });
        if (items.length > 0) {
          blocks.push(`## ${heading}\n\n${items.join("\n")}`);
        }
        break;
      }
      case "achievements": {
        const items = section.items.flatMap((item) => {
          const title = cleanInline(item.title);
          if (!title) return [];
          const date = cleanInline(item.date);
          const desc = cleanParagraph(item.description ?? "");
          return [
            `- **${title}**${date ? ` (${date})` : ""}${desc ? `: ${desc}` : ""}`,
          ];
        });
        if (items.length > 0) {
          blocks.push(`## ${heading}\n\n${items.join("\n")}`);
        }
        break;
      }
      case "certifications": {
        const items = section.items.flatMap((item) => {
          const certName = cleanInline(item.name);
          if (!certName) return [];
          const href = safeHttpUrl(item.url);
          const label = href ? mdLink(certName, href) : `**${certName}**`;
          const issuer = cleanInline(item.issuer);
          const date = cleanInline(item.date);
          return [
            `- ${label}${issuer ? ` — ${issuer}` : ""}${date ? ` (${date})` : ""}`,
          ];
        });
        if (items.length > 0) {
          blocks.push(`## ${heading}\n\n${items.join("\n")}`);
        }
        break;
      }
      case "social": {
        const items = section.items.flatMap((item) => {
          const href = safeHttpUrl(item.url);
          const label = cleanInline(item.label) || cleanInline(item.platform);
          if (!href || !label) return [];
          return [`- ${mdLink(label, href)}`];
        });
        if (items.length > 0) {
          blocks.push(`## ${heading}\n\n${items.join("\n")}`);
        }
        break;
      }
      case "booking": {
        const href = safeHttpUrl(section.url);
        const title = cleanInline(section.title);
        if (href && title) {
          const provider = cleanInline(section.providerLabel);
          const desc = cleanParagraph(section.description ?? "");
          const suffix = [provider, desc].filter(Boolean).join(" — ");
          blocks.push(
            `## ${heading}\n\n- ${mdLink(title, href)}${suffix ? `: ${suffix}` : ""}`,
          );
        }
        break;
      }
      case "contact": {
        const contactItems: string[] = [];
        const email = cleanInline(section.email);
        const phone = cleanInline(section.phone);
        const website = safeHttpUrl(section.website);
        if (email) contactItems.push(`- Email: ${email}`);
        if (phone) contactItems.push(`- Phone: ${phone}`);
        if (website)
          contactItems.push(`- Website: ${mdLink(website, website)}`);
        if (contactItems.length > 0) {
          blocks.push(`## ${heading}\n\n${contactItems.join("\n")}`);
        }
        break;
      }
    }
  }

  if (activeLinkBullets.length > 0) {
    blocks.push(`## Active Links\n\n${activeLinkBullets.join("\n")}`);
  }

  const raw = `${blocks.join("\n\n")}\n`;
  return truncateUtf8(raw, LLMS_MAX_BYTES);
}
