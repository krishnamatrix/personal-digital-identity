import type { CanonicalProfile } from "@/domains/personas/persona-types";

/** Closed allowlist; matches the CHECK constraints in the proposed SQL. */
export const PROFILE_FIELD_KEYS = [
  "display_name",
  "headline",
  "summary",
  "location",
  "website_url",
  "linkedin_url",
  "github_url",
] as const;

export type ProfileFieldKey = (typeof PROFILE_FIELD_KEYS)[number];

export const PROFILE_FIELDS: Record<
  ProfileFieldKey,
  {
    label: string;
    canonical: keyof CanonicalProfile;
    maxLength: number;
    url: boolean;
    multiline: boolean;
  }
> = {
  display_name: {
    label: "Name",
    canonical: "displayName",
    maxLength: 120,
    url: false,
    multiline: false,
  },
  headline: {
    label: "Professional headline",
    canonical: "headline",
    maxLength: 180,
    url: false,
    multiline: false,
  },
  summary: {
    label: "Summary",
    canonical: "summary",
    maxLength: 2000,
    url: false,
    multiline: true,
  },
  location: {
    label: "Location",
    canonical: "location",
    maxLength: 160,
    url: false,
    multiline: false,
  },
  website_url: {
    label: "Website",
    canonical: "websiteUrl",
    maxLength: 2048,
    url: true,
    multiline: false,
  },
  linkedin_url: {
    label: "LinkedIn profile",
    canonical: "linkedinUrl",
    maxLength: 2048,
    url: true,
    multiline: false,
  },
  github_url: {
    label: "GitHub profile",
    canonical: "githubUrl",
    maxLength: 2048,
    url: true,
    multiline: false,
  },
};

/**
 * Layout sections named by the approved Persona UX. Only "profile" has
 * selectable content today; the others are layout placeholders until their
 * canonical categories exist. The proposed SQL stores any 1-80 character key;
 * restricting to this set is an application rule.
 */
export const STARTER_SECTIONS = [
  { key: "profile", label: "Profile", hasSource: true },
  { key: "experience", label: "Experience", hasSource: false },
  { key: "education", label: "Education", hasSource: false },
  { key: "skills", label: "Skills", hasSource: false },
  { key: "projects", label: "Projects", hasSource: false },
  { key: "highlights", label: "Highlights", hasSource: false },
  { key: "timeline", label: "Timeline", hasSource: false },
  { key: "publications", label: "Publications", hasSource: false },
  { key: "articles", label: "Articles & Thoughts", hasSource: false },
] as const;

export const STARTER_SECTION_KEYS = STARTER_SECTIONS.map((s) => s.key) as [
  (typeof STARTER_SECTIONS)[number]["key"],
  ...(typeof STARTER_SECTIONS)[number]["key"][],
];

/** Optional naming suggestions only; never required types. */
export const STARTER_PERSONA_NAMES = [
  "Professional",
  "Founder",
  "Academic",
  "Creative",
  "Speaker",
] as const;

export const PERSONA_LIMITS = {
  name: 100,
  description: 500,
  audience: 200,
  purpose: 200,
  sectionLabel: 100,
} as const;

/** Returns an error message, or null when the override value is acceptable. */
export function validateOverrideValue(
  fieldKey: ProfileFieldKey,
  value: string | null,
): string | null {
  if (value === null) return null;
  const meta = PROFILE_FIELDS[fieldKey];
  if (value.length > meta.maxLength) {
    return `${meta.label} must be ${meta.maxLength} characters or fewer.`;
  }
  if (meta.url && !/^https?:\/\//.test(value)) {
    return `${meta.label} must start with http:// or https://.`;
  }
  return null;
}

export function defaultSectionLabel(sectionKey: string): string {
  return (
    STARTER_SECTIONS.find((s) => s.key === sectionKey)?.label ?? sectionKey
  );
}
