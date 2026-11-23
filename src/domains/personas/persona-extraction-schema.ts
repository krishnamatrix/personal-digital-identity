import { z } from "zod";
import {
  PERSONA_LIMITS,
  PROFILE_FIELDS,
  STARTER_PERSONA_NAMES,
  STARTER_SECTION_KEYS,
  validateOverrideValue,
  type ProfileFieldKey,
} from "@/domains/personas/persona-constants";

export const PERSONA_TYPES = [...STARTER_PERSONA_NAMES, "Other"] as const;
export type PersonaType = (typeof PERSONA_TYPES)[number];

export type StarterSectionKey = (typeof STARTER_SECTION_KEYS)[number];

export const PERSONA_TYPE_REASON_MAX = 200;
export const SECTION_ITEM_LIMITS = {
  title: 160,
  subtitle: 160,
  period: 80,
  description: 600,
  maxItemsPerSection: 15,
} as const;

const optionalNullableString = z
  .string()
  .nullish()
  .transform((v) => v ?? null);

const extractedSectionItemObjectSchema = z.object({
  title: z.string(),
  subtitle: optionalNullableString,
  period: optionalNullableString,
  description: optionalNullableString,
});

export const extractedSectionItemSchema = z.union([
  extractedSectionItemObjectSchema,
  z.string().transform((title) => ({
    title,
    subtitle: null,
    period: null,
    description: null,
  })),
]);

export const extractedSectionSchema = z.object({
  sectionKey: z.string(),
  items: z.array(extractedSectionItemSchema).default([]),
});

const sectionContentInputSchema = z.union([
  z.array(extractedSectionSchema),
  z
    .record(z.string(), z.array(extractedSectionItemSchema))
    .transform((record) =>
      Object.entries(record).map(([sectionKey, items]) => ({
        sectionKey,
        items,
      })),
    ),
]);

/**
 * Resilient parser for untrusted structured output returned by the configured
 * LLM provider (works across strict json_schema and json_object gateways).
 */
export const personaExtractionSchema = z.object({
  personaType: z.string().nullish(),
  personaTypeReason: optionalNullableString,
  name: optionalNullableString,
  audience: optionalNullableString,
  purpose: optionalNullableString,
  description: optionalNullableString,
  displayName: optionalNullableString,
  headline: optionalNullableString,
  summary: optionalNullableString,
  location: optionalNullableString,
  websiteUrl: optionalNullableString,
  linkedinUrl: optionalNullableString,
  githubUrl: optionalNullableString,
  suggestedSections: z.array(z.string()).nullish(),
  sectionContent: sectionContentInputSchema.nullish(),
});

/**
 * Strict JSON Schema sent to OpenAI-compatible (`strict: true`) and Gemini
 * structured-output endpoints. Every object sets `additionalProperties: false`
 * and lists all properties as `required`.
 */
export const PERSONA_EXTRACTION_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "personaType",
    "personaTypeReason",
    "name",
    "audience",
    "purpose",
    "description",
    "displayName",
    "headline",
    "summary",
    "location",
    "websiteUrl",
    "linkedinUrl",
    "githubUrl",
    "suggestedSections",
    "sectionContent",
  ],
  properties: {
    personaType: {
      type: "string",
      enum: [...PERSONA_TYPES],
    },
    personaTypeReason: { type: ["string", "null"] },
    name: { type: ["string", "null"] },
    audience: { type: ["string", "null"] },
    purpose: { type: ["string", "null"] },
    description: { type: ["string", "null"] },
    displayName: { type: ["string", "null"] },
    headline: { type: ["string", "null"] },
    summary: { type: ["string", "null"] },
    location: { type: ["string", "null"] },
    websiteUrl: { type: ["string", "null"] },
    linkedinUrl: { type: ["string", "null"] },
    githubUrl: { type: ["string", "null"] },
    suggestedSections: {
      type: "array",
      items: { type: "string" },
    },
    sectionContent: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sectionKey", "items"],
        properties: {
          sectionKey: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "subtitle", "period", "description"],
              properties: {
                title: { type: "string" },
                subtitle: { type: ["string", "null"] },
                period: { type: ["string", "null"] },
                description: { type: ["string", "null"] },
              },
            },
          },
        },
      },
    },
  },
};

export type PersonaExtraction = z.output<typeof personaExtractionSchema>;

export type ExtractedSectionItem = {
  title: string;
  subtitle: string | null;
  period: string | null;
  description: string | null;
};

export type PersonaSectionContentMap = Partial<
  Record<StarterSectionKey, ExtractedSectionItem[]>
>;

export type PersonaUploadDraft = {
  personaType: PersonaType;
  personaTypeReason: string | null;
  name: string | null;
  audience: string | null;
  purpose: string | null;
  description: string | null;
  displayName: string | null;
  headline: string | null;
  summary: string | null;
  location: string | null;
  websiteUrl: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  suggestedSections: StarterSectionKey[];
  sectionContent: PersonaSectionContentMap;
};

const VALID_SECTION_SET = new Set<string>(STARTER_SECTION_KEYS);
const PERSONA_TYPE_BY_LOWER = new Map<string, PersonaType>(
  PERSONA_TYPES.map((t) => [t.toLowerCase(), t]),
);

function normalizePersonaType(raw: string | null | undefined): PersonaType {
  if (!raw) return "Other";
  const exact = PERSONA_TYPE_BY_LOWER.get(raw.trim().toLowerCase());
  return exact ?? "Other";
}

const NULL_PLACEHOLDERS = new Set(["null", "none", "n/a", "na", "undefined"]);

function clampText(
  value: string | null | undefined,
  maxLength: number,
  multiline = false,
): string | null {
  if (!value) return null;
  const cleaned = multiline
    ? value.replace(/\r\n?/g, "\n").trim()
    : value
        .replace(/[\r\n\t]+/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
  if (!cleaned || NULL_PLACEHOLDERS.has(cleaned.toLowerCase())) return null;
  return cleaned.slice(0, maxLength).trim() || null;
}

function normalizeUrlField(
  fieldKey: ProfileFieldKey,
  value: string | null | undefined,
): string | null {
  const cleaned = clampText(value, PROFILE_FIELDS[fieldKey].maxLength);
  if (!cleaned) return null;
  const candidate =
    /^https?:\/\//i.test(cleaned) || /^[a-z]+:/i.test(cleaned)
      ? cleaned
      : `https://${cleaned}`;
  try {
    const parsed = new URL(candidate);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      !parsed.hostname.includes(".")
    ) {
      return null;
    }
    const normalized = parsed.toString();
    return validateOverrideValue(fieldKey, normalized) === null
      ? normalized
      : null;
  } catch {
    return null;
  }
}

/** Clamps and allowlists extracted AI output to Persona screen-model limits. */
export function sanitizePersonaExtraction(
  raw: PersonaExtraction,
): PersonaUploadDraft {
  const seen = new Set<StarterSectionKey>();
  const suggestedSections: StarterSectionKey[] = [];
  const addSection = (rawKey: string) => {
    const normalized = rawKey.trim().toLowerCase();
    if (
      VALID_SECTION_SET.has(normalized) &&
      !seen.has(normalized as StarterSectionKey)
    ) {
      const valid = normalized as StarterSectionKey;
      seen.add(valid);
      suggestedSections.push(valid);
    }
  };

  for (const key of raw.suggestedSections ?? []) {
    addSection(key);
  }

  const sectionContent: PersonaSectionContentMap = {};
  for (const section of raw.sectionContent ?? []) {
    const normalized = section.sectionKey.trim().toLowerCase();
    if (!VALID_SECTION_SET.has(normalized) || normalized === "profile") {
      continue;
    }
    const key = normalized as StarterSectionKey;
    const existing = sectionContent[key] ?? [];
    for (const item of section.items ?? []) {
      if (existing.length >= SECTION_ITEM_LIMITS.maxItemsPerSection) break;
      const title = clampText(item.title, SECTION_ITEM_LIMITS.title);
      if (!title) continue;
      existing.push({
        title,
        subtitle: clampText(item.subtitle, SECTION_ITEM_LIMITS.subtitle),
        period: clampText(item.period, SECTION_ITEM_LIMITS.period),
        description: clampText(
          item.description,
          SECTION_ITEM_LIMITS.description,
          true,
        ),
      });
    }
    if (existing.length > 0) {
      sectionContent[key] = existing;
      addSection(key);
    }
  }

  return {
    personaType: normalizePersonaType(raw.personaType),
    personaTypeReason: clampText(
      raw.personaTypeReason,
      PERSONA_TYPE_REASON_MAX,
    ),
    name: clampText(raw.name, PERSONA_LIMITS.name),
    audience: clampText(raw.audience, PERSONA_LIMITS.audience),
    purpose: clampText(raw.purpose, PERSONA_LIMITS.purpose),
    description: clampText(raw.description, PERSONA_LIMITS.description, true),
    displayName: clampText(
      raw.displayName,
      PROFILE_FIELDS.display_name.maxLength,
    ),
    headline: clampText(raw.headline, PROFILE_FIELDS.headline.maxLength),
    summary: clampText(raw.summary, PROFILE_FIELDS.summary.maxLength, true),
    location: clampText(raw.location, PROFILE_FIELDS.location.maxLength),
    websiteUrl: normalizeUrlField("website_url", raw.websiteUrl),
    linkedinUrl: normalizeUrlField("linkedin_url", raw.linkedinUrl),
    githubUrl: normalizeUrlField("github_url", raw.githubUrl),
    suggestedSections,
    sectionContent,
  };
}

export function hasAnyPersonaDetail(draft: PersonaUploadDraft): boolean {
  return Boolean(
    draft.name ||
      draft.audience ||
      draft.purpose ||
      draft.description ||
      draft.displayName ||
      draft.headline ||
      draft.summary ||
      draft.location ||
      draft.websiteUrl ||
      draft.linkedinUrl ||
      draft.githubUrl ||
      draft.suggestedSections.length > 0 ||
      Object.keys(draft.sectionContent).length > 0,
  );
}
