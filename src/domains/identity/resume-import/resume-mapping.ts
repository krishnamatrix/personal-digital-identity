import {
  ENTRY_KIND_DEFS,
  ENTRY_KINDS,
  entryDataSchema,
  entrySubtitle,
  entryTitle,
  type EntryData,
  type EntryItem,
  type EntryKind,
} from "@/domains/identity/entry-kinds";
import {
  profileInputSchema,
  type IdentityProfile,
  type ProfileInput,
} from "@/domains/identity/profile-schema";
import type { ResumeExtraction } from "@/domains/identity/resume-import/resume-extraction-schema";

/** Profile columns a resume may fill. Anything the person already entered is kept. */
export const RESUME_PROFILE_FIELDS = [
  "fullName",
  "headline",
  "professionalSummary",
  "currentDesignation",
  "currentOrganization",
  "industry",
  "location",
  "contactEmail",
  "phone",
  "websiteUrl",
] as const;
type ResumeProfileField = (typeof RESUME_PROFILE_FIELDS)[number];

export type ResumeImportPlan = {
  /** Only previously empty profile fields, each individually validated. */
  profilePatch: ProfileInput;
  /** Full replacement lists (existing items first) for the kinds that gained items. */
  entries: Partial<Record<EntryKind, EntryItem[]>>;
  summary: {
    profileFields: ResumeProfileField[];
    added: Partial<Record<EntryKind, number>>;
    /** Items dropped because they failed validation or the section was full. */
    skipped: number;
  };
};

const fieldLimit = (kind: EntryKind, key: string) =>
  ENTRY_KIND_DEFS[kind].fields.find((f) => f.key === key)?.max;

/** Trims strings and cuts them to the field's maximum, so long text is kept rather than dropped. */
function fitToKind(kind: EntryKind, raw: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const def = ENTRY_KIND_DEFS[kind].fields.find((f) => f.key === key);
    if (!def) continue;
    if (typeof value === "string") {
      const trimmed = value.trim();
      const max = def.type === "url" ? 2000 : fieldLimit(kind, key);
      out[key] = max ? trimmed.slice(0, max) : trimmed;
    } else if (Array.isArray(value)) {
      out[key] = value
        .filter((v): v is string => typeof v === "string" && v.trim() !== "")
        .map((v) => v.trim().slice(0, 60))
        .slice(0, def.max ?? 20);
    } else {
      out[key] = value;
    }
  }
  // A current role has no end date; the editor treats the pair the same way.
  if (out.isCurrent === true) delete out.endDate;
  return out;
}

const dedupeKey = (kind: EntryKind, data: EntryData) =>
  `${entryTitle(kind, data)}|${entrySubtitle(kind, data)}`
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * Turns the model's (untrusted) extraction into a safe import plan:
 * - profile fields are applied only where the profile is empty, and only if they pass the
 *   profile schema on their own (an invalid email never blocks the name);
 * - entries are validated with the editor's own per-kind schema, appended after existing
 *   items, de-duplicated by title + subtitle and capped at the section's maximum;
 * - imported items are visible by default, like items added by hand.
 */
export function mapResumeToIdentity(
  extraction: ResumeExtraction,
  current: IdentityProfile,
  existing: Partial<Record<EntryKind, EntryItem[]>>,
  newId: () => string = () => crypto.randomUUID(),
): ResumeImportPlan {
  const profilePatch: Record<string, string> = {};
  const profileFields: ResumeProfileField[] = [];
  for (const key of RESUME_PROFILE_FIELDS) {
    const value = extraction.profile[key]?.trim();
    if (!value || current[key]) continue;
    const single = profileInputSchema.safeParse({ [key]: value });
    if (single.success) {
      profilePatch[key] = value;
      profileFields.push(key);
    }
  }

  const entries: Partial<Record<EntryKind, EntryItem[]>> = {};
  const added: Partial<Record<EntryKind, number>> = {};
  let skipped = 0;
  for (const kind of ENTRY_KINDS) {
    const incoming = (extraction[kind] ?? []) as Record<string, unknown>[];
    if (incoming.length === 0) continue;
    const list = [...(existing[kind] ?? [])];
    const seen = new Set(list.map((item) => dedupeKey(kind, item.data)));
    const schema = entryDataSchema(kind);
    let count = 0;
    for (const raw of incoming) {
      const parsed = schema.safeParse(fitToKind(kind, raw));
      if (!parsed.success) {
        skipped++;
        continue;
      }
      const data = parsed.data as EntryData;
      const key = dedupeKey(kind, data);
      if (seen.has(key)) continue;
      if (list.length >= ENTRY_KIND_DEFS[kind].maxItems) {
        skipped++;
        continue;
      }
      seen.add(key);
      list.push({ id: newId(), isVisible: true, data });
      count++;
    }
    if (count > 0) {
      entries[kind] = list;
      added[kind] = count;
    }
  }

  return {
    profilePatch: profileInputSchema.parse(profilePatch),
    entries,
    summary: { profileFields, added, skipped },
  };
}
