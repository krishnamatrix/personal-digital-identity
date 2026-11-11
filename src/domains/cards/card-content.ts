import { z } from "zod";
import {
  CARD_TYPE_IDS,
  initialsOf,
  type CardConfig,
  type CardField,
} from "./card-config";
import { cardDesign } from "./card-designs";

/**
 * The PUBLISHED card: the only thing /social/<slug> reads. Built from My Identity + the card
 * config, stored as jsonb, and re-validated (untrusted) on every public render. It holds only
 * the fields the owner switched on.
 */

const httpUrl = z
  .string()
  .max(500)
  .refine((v) => /^https?:\/\/[^\s]+$/i.test(v), "http(s) URL required");

export const CARD_LINK_KINDS = [
  "linkedin",
  "x",
  "github",
  "website",
  "custom",
] as const;
export type CardLinkKind = (typeof CARD_LINK_KINDS)[number];

export const cardContentSchema = z.object({
  type: z.enum(CARD_TYPE_IDS),
  name: z.string().min(1).max(80),
  initials: z.string().max(3),
  role: z.string().max(160).optional(),
  photoUrl: httpUrl.optional(),
  email: z.string().max(254).optional(),
  phone: z.string().max(40).optional(),
  location: z.string().max(120).optional(),
  links: z
    .array(
      z.object({
        kind: z.enum(CARD_LINK_KINDS),
        label: z.string().max(60),
        url: httpUrl,
      }),
    )
    .max(CARD_LINK_KINDS.length),
});

export type CardContent = z.infer<typeof cardContentSchema>;

/** What a card can draw from: the Master Identity profile and its social links. */
export type CardSource = {
  profile: {
    fullName: string | null;
    displayName: string | null;
    headline: string | null;
    currentDesignation: string | null;
    currentOrganization: string | null;
    contactEmail: string | null;
    phone: string | null;
    location: string | null;
    websiteUrl: string | null;
    linkedinUrl: string | null;
    githubUrl: string | null;
    profileImageUrl: string | null;
  };
  /** social_link entries: { platform, url, label? } */
  socialLinks: { platform: string; url: string; label?: string }[];
};

const clean = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t ? t : null;
};
const isHttp = (v: string | null): v is string =>
  Boolean(v && /^https?:\/\/[^\s]+$/i.test(v));
const social = (s: CardSource, platform: string) =>
  clean(s.socialLinks.find((l) => l.platform === platform)?.url);

/** The value each field would show, or null when My Identity does not hold it. */
export function fieldValues(
  source: CardSource,
): Record<CardField, string | null> {
  const p = source.profile;
  const designation = clean(p.currentDesignation);
  const org = clean(p.currentOrganization);
  const role =
    designation && org
      ? `${designation}, ${org}`
      : (designation ?? org ?? clean(p.headline));
  const http = (v: string | null) => (isHttp(v) ? v : null);
  return {
    role,
    email: clean(p.contactEmail),
    phone: clean(p.phone),
    location: clean(p.location),
    linkedin: http(clean(p.linkedinUrl) ?? social(source, "linkedin")),
    x: http(social(source, "x")),
    github: http(clean(p.githubUrl) ?? social(source, "github")),
    website: http(
      clean(p.websiteUrl) ??
        social(source, "personal_website") ??
        social(source, "company_website"),
    ),
    // The custom link lives on the card itself, not in My Identity.
    custom: null,
  };
}

export function cardName(source: CardSource, config: CardConfig): string {
  return (
    clean(config.displayName) ??
    clean(source.profile.displayName) ??
    clean(source.profile.fullName) ??
    ""
  );
}

/** "https://www.linkedin.com/in/jane/" -> "linkedin.com/in/jane" */
export function shortUrl(url: string): string {
  return url
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/[/?#]+$/, "");
}

const LINK_LABEL: Record<Exclude<CardLinkKind, "custom">, string> = {
  linkedin: "LinkedIn",
  x: "X",
  github: "GitHub",
  website: "Website",
};

export function buildCardContent(
  source: CardSource,
  config: CardConfig,
): CardContent {
  // The photo is published only when the chosen design actually shows it (photo emboss).
  const showsPhoto = cardDesign(config.design).emboss === "photo";
  return composeCardContent(
    {
      values: fieldValues(source),
      profileName: cardName(source, { ...config, displayName: "" }),
      photoUrl: showsPhoto ? source.profile.profileImageUrl : null,
    },
    config,
  );
}

/**
 * The card from already-resolved field values (the workspace preview uses this in the
 * browser; the server uses it through buildCardContent, so both produce the same card).
 */
export function composeCardContent(
  input: {
    values: Record<CardField, string | null>;
    profileName: string;
    photoUrl: string | null;
  },
  config: CardConfig,
): CardContent {
  const { values } = input;
  const on = (f: CardField) => config.fields.includes(f);
  const name = (
    clean(config.displayName) ??
    clean(input.profileName) ??
    ""
  ).slice(0, 80);
  const links: CardContent["links"] = [];
  for (const kind of ["linkedin", "x", "github", "website"] as const) {
    const url = values[kind];
    if (on(kind) && isHttp(url))
      links.push({ kind, label: LINK_LABEL[kind], url });
  }
  const custom = clean(config.customLink.url);
  if (on("custom") && isHttp(custom))
    links.push({
      kind: "custom",
      label: clean(config.customLink.label) ?? shortUrl(custom).slice(0, 60),
      url: custom,
    });
  const opt = (f: CardField, max: number) =>
    on(f) && values[f] ? values[f]!.slice(0, max) : undefined;
  const photo = clean(input.photoUrl);
  return {
    type: config.type,
    name,
    initials: (clean(config.initials) ?? initialsOf(name)).slice(0, 3),
    role: opt("role", 160),
    photoUrl: config.usePhoto && isHttp(photo) ? photo : undefined,
    email: opt("email", 254),
    phone: opt("phone", 40),
    location: opt("location", 120),
    links,
  };
}

export type CardProblem = "no_name" | "no_details";

export function cardProblems(content: CardContent): CardProblem[] {
  const problems: CardProblem[] = [];
  if (!content.name) problems.push("no_name");
  if (
    !content.email &&
    !content.phone &&
    !content.links.length &&
    !content.role &&
    !content.location
  )
    problems.push("no_details");
  return problems;
}

/* --------------------------------- vCard --------------------------------- */

const esc = (v: string) =>
  v
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");

/**
 * vCard 3.0 for the QR code and "Save contact": phones offer to add the person directly.
 * Contains exactly what the card shows, plus the card's own address.
 */
export function cardVCard(content: CardContent, cardUrl?: string): string {
  const parts = content.name.trim().split(/\s+/);
  const family = parts.length > 1 ? parts[parts.length - 1]! : "";
  const given = parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0]!;
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${esc(family)};${esc(given)};;;`,
    `FN:${esc(content.name)}`,
  ];
  if (content.role) lines.push(`TITLE:${esc(content.role)}`);
  if (content.email) lines.push(`EMAIL;TYPE=INTERNET:${esc(content.email)}`);
  if (content.phone) lines.push(`TEL;TYPE=CELL:${esc(content.phone)}`);
  if (content.location) lines.push(`ADR:;;;${esc(content.location)};;;`);
  for (const link of content.links) lines.push(`URL:${esc(link.url)}`);
  if (cardUrl) lines.push(`URL:${esc(cardUrl)}`);
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

/** Sample person for design thumbnails (fictional; never a real account). */
export const SAMPLE_CARD: CardContent = {
  type: "professional",
  name: "Jordan Avery",
  initials: "JA",
  role: "Product Designer, Northwind",
  email: "jordan@example.com",
  phone: "+1 555 0142",
  location: "Lisbon",
  links: [
    {
      kind: "linkedin",
      label: "LinkedIn",
      url: "https://linkedin.com/in/jordan",
    },
    { kind: "website", label: "Website", url: "https://jordan.example" },
  ],
};
