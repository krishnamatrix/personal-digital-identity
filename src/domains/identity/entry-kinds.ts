import { z } from "zod";

/**
 * Registry of list-type Master Identity sections. Every kind is described once, as data:
 * the editor renders its form from `fields`, the server validates with the schema built
 * from the same `fields`, and the preview reads `titleKey`/`subtitleKeys`. Adding a section
 * means adding a kind here (and to the CHECK in the SQL), not building a new editor.
 */

export type FieldType =
  | "text"
  | "textarea"
  | "url"
  | "month"
  | "checkbox"
  | "tags"
  | "urls"
  | "select"
  | "email"
  | "tel";

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  options?: readonly { value: string; label: string }[];
  /** Max characters (text) or max items (tags/urls). */
  max?: number;
  help?: string;
};

export const SOCIAL_PLATFORMS = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "github", label: "GitHub" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "x", label: "X" },
  { value: "youtube", label: "YouTube" },
  { value: "behance", label: "Behance" },
  { value: "dribbble", label: "Dribbble" },
  { value: "medium", label: "Medium" },
  { value: "personal_website", label: "Personal website" },
  { value: "company_website", label: "Company website" },
  { value: "custom", label: "Custom URL" },
] as const;

export const ENTRY_KINDS = [
  "employment",
  "education",
  "skill",
  "project",
  "social_link",
  "achievement",
  "certification",
  "language",
  "interest",
] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

export type EntryKindDef = {
  kind: EntryKind;
  label: string;
  singular: string;
  fields: readonly FieldDef[];
  titleKey: string;
  subtitleKeys: readonly string[];
  maxItems: number;
  emptyTitle: string;
  emptyHint: string;
  /** Supports hiding an item from the preview / published presentation. */
  visibility: boolean;
};

const dates = (current?: boolean): FieldDef[] => [
  { key: "startDate", label: "Start", type: "month" },
  {
    key: "endDate",
    label: "End",
    type: "month",
    help: "Leave empty if current.",
  },
  ...(current
    ? [
        {
          key: "isCurrent",
          label: "I currently do this",
          type: "checkbox",
        } as FieldDef,
      ]
    : []),
];

export const ENTRY_KIND_DEFS: Record<EntryKind, EntryKindDef> = {
  employment: {
    kind: "employment",
    label: "Employment history",
    singular: "position",
    titleKey: "title",
    subtitleKeys: ["organization", "location"],
    maxItems: 30,
    visibility: true,
    emptyTitle: "No positions yet",
    emptyHint: "Add the roles that tell your professional story.",
    fields: [
      { key: "title", label: "Title", type: "text", required: true, max: 160 },
      {
        key: "organization",
        label: "Organization",
        type: "text",
        required: true,
        max: 160,
      },
      { key: "location", label: "Location", type: "text", max: 160 },
      ...dates(true),
      { key: "description", label: "Description", type: "textarea", max: 2000 },
    ],
  },
  education: {
    kind: "education",
    label: "Education",
    singular: "education entry",
    titleKey: "institution",
    subtitleKeys: ["qualification", "specialization"],
    maxItems: 20,
    visibility: true,
    emptyTitle: "No education added",
    emptyHint: "Add schools, universities or programmes you completed.",
    fields: [
      {
        key: "institution",
        label: "Institution",
        type: "text",
        required: true,
        max: 200,
      },
      { key: "qualification", label: "Qualification", type: "text", max: 160 },
      {
        key: "specialization",
        label: "Specialization",
        type: "text",
        max: 160,
      },
      ...dates(),
      { key: "description", label: "Description", type: "textarea", max: 2000 },
    ],
  },
  skill: {
    kind: "skill",
    label: "Skills",
    singular: "skill",
    titleKey: "name",
    subtitleKeys: ["category"],
    maxItems: 100,
    visibility: true,
    emptyTitle: "No skills yet",
    emptyHint: "Add the skills you want to be known for.",
    fields: [
      { key: "name", label: "Skill", type: "text", required: true, max: 100 },
      {
        key: "category",
        label: "Category",
        type: "text",
        max: 100,
        placeholder: "e.g. Design, Engineering",
      },
      { key: "description", label: "Description", type: "textarea", max: 1000 },
    ],
  },
  project: {
    kind: "project",
    label: "Projects",
    singular: "project",
    titleKey: "name",
    subtitleKeys: ["role"],
    maxItems: 30,
    visibility: true,
    emptyTitle: "No projects yet",
    emptyHint: "Showcase work you are proud of.",
    fields: [
      {
        key: "name",
        label: "Project name",
        type: "text",
        required: true,
        max: 160,
      },
      { key: "role", label: "Your role", type: "text", max: 160 },
      { key: "url", label: "Project URL", type: "url" },
      { key: "description", label: "Description", type: "textarea", max: 2000 },
      {
        key: "technologies",
        label: "Technologies",
        type: "tags",
        max: 20,
        help: "Comma-separated.",
      },
      {
        key: "images",
        label: "Image URLs",
        type: "urls",
        max: 6,
        help: "One https URL per line.",
      },
    ],
  },
  social_link: {
    kind: "social_link",
    label: "Social & web profiles",
    singular: "link",
    titleKey: "platform",
    subtitleKeys: ["url"],
    maxItems: 30,
    visibility: true,
    emptyTitle: "No links yet",
    emptyHint: "Add your professional and social profiles by URL.",
    fields: [
      {
        key: "platform",
        label: "Platform",
        type: "select",
        required: true,
        options: SOCIAL_PLATFORMS,
      },
      {
        key: "label",
        label: "Label",
        type: "text",
        max: 80,
        help: "Shown for custom links.",
      },
      { key: "url", label: "URL", type: "url", required: true },
    ],
  },
  achievement: {
    kind: "achievement",
    label: "Achievements",
    singular: "achievement",
    titleKey: "title",
    subtitleKeys: ["date"],
    maxItems: 50,
    visibility: true,
    emptyTitle: "No achievements yet",
    emptyHint: "Awards, milestones and recognition.",
    fields: [
      { key: "title", label: "Title", type: "text", required: true, max: 160 },
      { key: "date", label: "Date", type: "month" },
      { key: "description", label: "Description", type: "textarea", max: 1000 },
    ],
  },
  certification: {
    kind: "certification",
    label: "Certifications",
    singular: "certification",
    titleKey: "name",
    subtitleKeys: ["issuer", "date"],
    maxItems: 50,
    visibility: true,
    emptyTitle: "No certifications yet",
    emptyHint: "Professional certifications and licences.",
    fields: [
      {
        key: "name",
        label: "Certification",
        type: "text",
        required: true,
        max: 160,
      },
      { key: "issuer", label: "Issuer", type: "text", max: 160 },
      { key: "date", label: "Date", type: "month" },
      { key: "url", label: "Credential URL", type: "url" },
    ],
  },
  language: {
    kind: "language",
    label: "Languages",
    singular: "language",
    titleKey: "name",
    subtitleKeys: ["proficiency"],
    maxItems: 30,
    visibility: true,
    emptyTitle: "No languages yet",
    emptyHint: "Languages you speak or write.",
    fields: [
      { key: "name", label: "Language", type: "text", required: true, max: 80 },
      {
        key: "proficiency",
        label: "Proficiency",
        type: "select",
        options: [
          { value: "Native", label: "Native" },
          { value: "Fluent", label: "Fluent" },
          { value: "Professional", label: "Professional" },
          { value: "Conversational", label: "Conversational" },
          { value: "Basic", label: "Basic" },
        ],
      },
    ],
  },
  interest: {
    kind: "interest",
    label: "Interests",
    singular: "interest",
    titleKey: "name",
    subtitleKeys: [],
    maxItems: 50,
    visibility: true,
    emptyTitle: "No interests yet",
    emptyHint: "Topics and hobbies that round out your profile.",
    fields: [
      {
        key: "name",
        label: "Interest",
        type: "text",
        required: true,
        max: 100,
      },
    ],
  },
};

/** UI sections. Profile-column groups ("personal", "professional") are defined in the editor. */
export const LIST_SECTIONS = {
  employment: ["employment"],
  education: ["education"],
  skills: ["skill"],
  projects: ["project"],
  social: ["social_link"],
  additional: ["achievement", "certification", "language", "interest"],
} as const satisfies Record<string, readonly EntryKind[]>;

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function fieldSchema(field: FieldDef): z.ZodType {
  const required = field.required === true;
  switch (field.type) {
    case "checkbox":
      return z.boolean();
    case "tags":
      return z.array(z.string().trim().min(1).max(60)).max(field.max ?? 20);
    case "urls":
      return z
        .array(
          z
            .url()
            .max(2000)
            .regex(/^https?:\/\//, "Use an http or https URL."),
        )
        .max(field.max ?? 10);
    case "month":
      return z.string().regex(MONTH, "Use YYYY-MM.");
    case "url":
      return z
        .url("Enter a valid URL.")
        .max(2000)
        .regex(/^https?:\/\//, "Use an http or https URL.");
    case "select":
      return z.enum(
        (field.options ?? []).map((o) => o.value) as [string, ...string[]],
      );
    default: {
      const text = z
        .string()
        .trim()
        .max(field.max ?? 500);
      return required ? text.min(1, `${field.label} is required.`) : text;
    }
  }
}

/** Empty values are dropped before validation so optional fields can simply be blank. */
export function cleanEntryData(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (value === false) continue;
    out[key] = value;
  }
  return out;
}

export function entryDataSchema(kind: EntryKind) {
  const def = ENTRY_KIND_DEFS[kind];
  const shape: Record<string, z.ZodType> = {};
  for (const field of def.fields) {
    const base = fieldSchema(field);
    shape[field.key] = field.required ? base : base.optional();
  }
  return z.preprocess(
    cleanEntryData,
    z.strictObject(shape).superRefine((data, ctx) => {
      const { startDate, endDate } = data as {
        startDate?: string;
        endDate?: string;
      };
      if (startDate && endDate && endDate < startDate) {
        ctx.addIssue({
          code: "custom",
          path: ["endDate"],
          message: "End must not be before start.",
        });
      }
    }),
  );
}

export const entryItemSchema = (kind: EntryKind) =>
  z.strictObject({
    id: z.uuid(),
    isVisible: z.boolean(),
    data: entryDataSchema(kind),
  });

export const entryListSchema = (kind: EntryKind) =>
  z.array(entryItemSchema(kind)).max(ENTRY_KIND_DEFS[kind].maxItems);

export type EntryData = Record<string, string | boolean | string[]>;
export type EntryItem = { id: string; isVisible: boolean; data: EntryData };

export function isEntryKind(value: unknown): value is EntryKind {
  return (
    typeof value === "string" &&
    (ENTRY_KINDS as readonly string[]).includes(value)
  );
}

/** Display title for an item (platform label for social links). */
export function entryTitle(kind: EntryKind, data: EntryData): string {
  const def = ENTRY_KIND_DEFS[kind];
  if (kind === "social_link") {
    const platform = SOCIAL_PLATFORMS.find((p) => p.value === data.platform);
    return (
      (data.platform === "custom" &&
        typeof data.label === "string" &&
        data.label) ||
      platform?.label ||
      "Link"
    );
  }
  const title = data[def.titleKey];
  return typeof title === "string" && title
    ? title
    : `Untitled ${def.singular}`;
}

export function entrySubtitle(kind: EntryKind, data: EntryData): string {
  return ENTRY_KIND_DEFS[kind].subtitleKeys
    .map((key) => data[key])
    .filter((v): v is string => typeof v === "string" && v !== "")
    .join(" · ");
}
