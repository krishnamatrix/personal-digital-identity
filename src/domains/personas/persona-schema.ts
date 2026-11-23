import { z, type ZodError } from "zod";
import {
  PERSONA_LIMITS,
  PROFILE_FIELD_KEYS,
  PROFILE_FIELDS,
  STARTER_SECTION_KEYS,
  validateOverrideValue,
} from "@/domains/personas/persona-constants";
import {
  SECTION_ITEM_LIMITS,
  type PersonaSectionContentMap,
  type StarterSectionKey,
} from "@/domains/personas/persona-extraction-schema";

// Isomorphic: imported by client forms for immediate validation and by the
// service for authoritative validation. Limits match the proposed SQL CHECKs.

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer.`)
    .nullish()
    .transform((value) => (value ? value : null));

export const personaMetadataSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a name for this Persona.")
    .max(
      PERSONA_LIMITS.name,
      `Name must be ${PERSONA_LIMITS.name} characters or fewer.`,
    ),
  audience: optionalText(PERSONA_LIMITS.audience, "Audience"),
  purpose: optionalText(PERSONA_LIMITS.purpose, "Purpose"),
  description: optionalText(PERSONA_LIMITS.description, "Description"),
});

export const idSchema = z.string().min(1).max(64);
export const versionSchema = z.number().int().min(1);
export const fieldKeySchema = z.enum(PROFILE_FIELD_KEYS);

const overrideActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("keep") }),
  z.object({ action: z.literal("reset") }),
  z.object({ action: z.literal("set"), value: z.string().nullable() }),
]);

export const profileFieldChangeSchema = z.object({
  fieldKey: fieldKeySchema,
  isIncluded: z.boolean().optional(),
  isHighlighted: z.boolean().optional(),
  position: z.number().int().min(0).max(1000).optional(),
  override: overrideActionSchema.optional(),
});

export const profileFieldChangesSchema = z
  .array(profileFieldChangeSchema)
  .min(1, "Choose at least one change.")
  .max(PROFILE_FIELD_KEYS.length);

export const sectionInputSchema = z.object({
  sectionKey: z.enum(STARTER_SECTION_KEYS),
  label: optionalText(PERSONA_LIMITS.sectionLabel, "Section label"),
  isVisible: z.boolean(),
});

export const bulkActionSchema = z.object({
  category: z.literal("profile"),
  kind: z.enum([
    "include_all",
    "exclude_all",
    "clear_highlights",
    "reset_overrides",
  ]),
});

export const lifecycleSchema = z.enum(["active", "archived"]);
export const directionSchema = z.enum(["up", "down"]);

const overrideSettingSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("identity") }),
  z.object({ mode: z.literal("custom"), value: z.string().nullable() }),
]);

const storedSectionItemSchema = z.object({
  title: z.string().trim().min(1).max(SECTION_ITEM_LIMITS.title),
  subtitle: z
    .string()
    .trim()
    .max(SECTION_ITEM_LIMITS.subtitle)
    .nullable()
    .transform((v) => v || null),
  period: z
    .string()
    .trim()
    .max(SECTION_ITEM_LIMITS.period)
    .nullable()
    .transform((v) => v || null),
  description: z
    .string()
    .trim()
    .max(SECTION_ITEM_LIMITS.description)
    .nullable()
    .transform((v) => v || null),
});

const VALID_SECTION_SET = new Set<string>(STARTER_SECTION_KEYS);

const sectionContentMapSchema = z
  .record(
    z.string(),
    z
      .array(storedSectionItemSchema)
      .max(SECTION_ITEM_LIMITS.maxItemsPerSection),
  )
  .transform((record): PersonaSectionContentMap => {
    const out: PersonaSectionContentMap = {};
    for (const [key, items] of Object.entries(record)) {
      if (
        VALID_SECTION_SET.has(key) &&
        key !== "profile" &&
        items &&
        items.length > 0
      ) {
        out[key as StarterSectionKey] = items;
      }
    }
    return out;
  });

/** The complete four-step create flow, saved in one service operation. */
export const createPersonaInputSchema = z
  .object({
    metadata: personaMetadataSchema,
    fields: z
      .array(
        z.object({
          fieldKey: fieldKeySchema,
          isIncluded: z.boolean(),
          isHighlighted: z.boolean(),
          position: z.number().int().min(0).max(1000),
          override: overrideSettingSchema,
        }),
      )
      .max(PROFILE_FIELD_KEYS.length),
    sections: z.array(sectionInputSchema).max(STARTER_SECTION_KEYS.length),
    sectionContent: sectionContentMapSchema.optional(),
    makeDefault: z.boolean(),
  })
  .superRefine((input, ctx) => {
    const seenFields = new Set<string>();
    input.fields.forEach((field, index) => {
      if (seenFields.has(field.fieldKey)) {
        ctx.addIssue({
          code: "custom",
          path: ["fields", index, "fieldKey"],
          message: "Each field may appear only once.",
        });
      }
      seenFields.add(field.fieldKey);
      if (field.isHighlighted && !field.isIncluded) {
        ctx.addIssue({
          code: "custom",
          path: ["fields", index, "isHighlighted"],
          message: `${PROFILE_FIELDS[field.fieldKey].label} must be included before it can be highlighted.`,
        });
      }
      if (field.override.mode === "custom") {
        const message = validateOverrideValue(
          field.fieldKey,
          normalizeOverrideText(field.override.value),
        );
        if (message) {
          ctx.addIssue({
            code: "custom",
            path: ["fields", index, "override", "value"],
            message,
          });
        }
      }
    });
    const seenSections = new Set<string>();
    input.sections.forEach((section, index) => {
      if (seenSections.has(section.sectionKey)) {
        ctx.addIssue({
          code: "custom",
          path: ["sections", index, "sectionKey"],
          message: "Each section may appear only once.",
        });
      }
      seenSections.add(section.sectionKey);
    });
  });

/** Trimmed blank text becomes an intentional blank (NULL override). */
export function normalizeOverrideText(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Flattens Zod issues into `{ "name": ["message"] }` for field-level display. */
export function zodFieldErrors(error: ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path
      .map(String)
      .join(".")
      .replace(/^metadata\./, "");
    (result[key] ??= []).push(issue.message);
  }
  return result;
}

export type CreatePersonaInput = z.input<typeof createPersonaInputSchema>;
export type CreatePersonaParsed = z.output<typeof createPersonaInputSchema>;
