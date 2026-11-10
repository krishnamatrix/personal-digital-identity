import { z } from "zod";
import { CARD_DESIGN_IDS, type CardDesignId } from "./card-designs";

/**
 * Digital card configuration: pure rules shared by the workspace UI, the server and tests.
 * A card is built ONLY from the owner's Master Identity (profile + social links) plus a few
 * card-owned values (display name/initials overrides and one custom link).
 */

export const CARD_TYPES = [
  {
    id: "professional",
    label: "Professional",
    blurb: "Role, work contact and LinkedIn: for meetings and events.",
  },
  {
    id: "personal",
    label: "Personal",
    blurb: "Phone, email and where you are: for friends and neighbours.",
  },
  {
    id: "social",
    label: "Social",
    blurb: "Your profiles first: for meet-ups and new connections.",
  },
  {
    id: "creative",
    label: "Creative",
    blurb: "Lead with your work: a portfolio or showreel link.",
  },
] as const;

export type CardType = (typeof CARD_TYPES)[number]["id"];
export const CARD_TYPE_IDS = CARD_TYPES.map((t) => t.id) as [
  CardType,
  ...CardType[],
];

/** Selectable fields, in the order they appear on a card. */
export const CARD_FIELDS = [
  { id: "role", label: "Title & organisation" },
  { id: "email", label: "Email" },
  { id: "phone", label: "Phone" },
  { id: "location", label: "Location" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "x", label: "X (Twitter)" },
  { id: "github", label: "GitHub" },
  { id: "website", label: "Website" },
  { id: "custom", label: "Custom link" },
] as const;

export type CardField = (typeof CARD_FIELDS)[number]["id"];
export const CARD_FIELD_IDS = CARD_FIELDS.map((f) => f.id) as [
  CardField,
  ...CardField[],
];

/** Sensible starting selection per card type (the owner can change every toggle). */
export const TYPE_DEFAULT_FIELDS: Record<CardType, CardField[]> = {
  professional: ["role", "email", "phone", "linkedin", "website", "location"],
  personal: ["email", "phone", "location", "custom"],
  social: ["x", "linkedin", "github", "custom", "website"],
  creative: ["role", "email", "website", "custom", "x"],
};

export const CARD_NAME_MAX = 80;
export const CARD_INITIALS_MAX = 3;
export const CUSTOM_LABEL_MAX = 40;

const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^https?:\/\/[^\s]+\.[^\s]+$/i.test(v), {
    message: "Enter a full link starting with https://",
  });

export const cardConfigSchema = z.object({
  type: z.enum(CARD_TYPE_IDS),
  design: z.enum(CARD_DESIGN_IDS),
  displayName: z.string().trim().max(CARD_NAME_MAX),
  initials: z
    .string()
    .trim()
    .max(CARD_INITIALS_MAX)
    .refine((v) => /^[\p{L}\p{N}&.]*$/u.test(v), {
      message: "Use letters or numbers only.",
    }),
  fields: z.array(z.enum(CARD_FIELD_IDS)).max(CARD_FIELDS.length),
  customLink: z.object({
    label: z.string().trim().max(CUSTOM_LABEL_MAX),
    url: httpsUrl,
  }),
  /** Designs with a photo emboss use the profile photo unless this is off. */
  usePhoto: z.boolean(),
});

export type CardConfig = z.infer<typeof cardConfigSchema>;

export function defaultCardConfig(type: CardType = "professional"): CardConfig {
  return {
    type,
    design: "ivory",
    displayName: "",
    initials: "",
    fields: [...TYPE_DEFAULT_FIELDS[type]],
    customLink: { label: "", url: "" },
    usePhoto: true,
  };
}

/** Repairs stored (untrusted) config field by field, keeping whatever is still valid. */
export function normalizeCardConfig(input: unknown): CardConfig {
  const base = defaultCardConfig();
  if (!input || typeof input !== "object") return base;
  const raw = input as Record<string, unknown>;
  const pick = <K extends keyof CardConfig>(key: K): CardConfig[K] => {
    const r = cardConfigSchema.shape[key].safeParse(raw[key]);
    return r.success ? (r.data as CardConfig[K]) : base[key];
  };
  // Keep every known field even if the stored list also holds unknown ones.
  const fields = Array.isArray(raw.fields)
    ? raw.fields.filter((f): f is CardField =>
        (CARD_FIELD_IDS as readonly unknown[]).includes(f),
      )
    : base.fields;
  return {
    type: pick("type"),
    design: pick("design"),
    displayName: pick("displayName"),
    initials: pick("initials"),
    // Unique and in card order.
    fields: CARD_FIELD_IDS.filter((f) => fields.includes(f)),
    customLink: pick("customLink"),
    usePhoto: pick("usePhoto"),
  };
}

export function isCardDesignId(v: unknown): v is CardDesignId {
  return (
    typeof v === "string" && (CARD_DESIGN_IDS as readonly string[]).includes(v)
  );
}

export type CardStatus = "not_created" | "draft" | "published" | "unpublished";

/** "Priya van der Berg" -> "PB"; one word -> its first letter. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}
