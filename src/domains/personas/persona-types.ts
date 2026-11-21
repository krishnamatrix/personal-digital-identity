import type { ProfileFieldKey } from "@/domains/personas/persona-constants";
import type { PersonaSectionContentMap } from "@/domains/personas/persona-extraction-schema";

export type PersonaStatus = "active" | "archived";

/** Read-only copy of the canonical Master Identity profile. Never written here. */
export type CanonicalProfile = {
  displayName: string | null;
  headline: string | null;
  summary: string | null;
  location: string | null;
  websiteUrl: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
};

export type FieldSelection = {
  fieldKey: ProfileFieldKey;
  isIncluded: boolean;
  isHighlighted: boolean;
  position: number;
};

/** A row's presence is an explicit override; `value: null` is an intentional blank. */
export type FieldOverride = {
  fieldKey: ProfileFieldKey;
  value: string | null;
  version: number;
};

export type SectionConfig = {
  sectionKey: string;
  /** Persona-specific label, or null to use the default label. */
  label: string | null;
  isVisible: boolean;
  position: number;
};

export type PersonaDetail = {
  id: string;
  name: string;
  description: string | null;
  audience: string | null;
  purpose: string | null;
  status: PersonaStatus;
  isDefault: boolean;
  position: number;
  /** Optimistic-concurrency version (personas.version in the proposed SQL). */
  version: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  selections: FieldSelection[];
  overrides: FieldOverride[];
  sections: SectionConfig[];
  sectionContent?: PersonaSectionContentMap;
  revisionCount: number;
};

export type PersonaMetadataInput = {
  name: string;
  description: string | null;
  audience: string | null;
  purpose: string | null;
};

export type OverrideAction =
  | { action: "keep" }
  | { action: "reset" }
  | { action: "set"; value: string | null };

/**
 * One field's requested change. Omitted selection properties are left as
 * stored (mirrors persona_update_profile_field).
 */
export type ProfileFieldChange = {
  fieldKey: ProfileFieldKey;
  isIncluded?: boolean;
  isHighlighted?: boolean;
  position?: number;
  override?: OverrideAction;
};

export type SectionInput = {
  sectionKey: string;
  label: string | null;
  isVisible: boolean;
};

/** Fully normalized configuration saved atomically by `createWithConfiguration`. */
export type NormalizedPersonaCreate = {
  metadata: PersonaMetadataInput;
  selections: FieldSelection[];
  overrides: { fieldKey: ProfileFieldKey; value: string | null }[];
  sections: SectionConfig[];
  sectionContent?: PersonaSectionContentMap;
  makeDefault: boolean;
};

export type PersonaSummary = {
  id: string;
  name: string;
  description: string | null;
  audience: string | null;
  purpose: string | null;
  status: PersonaStatus;
  isDefault: boolean;
  version: number;
  updatedAt: string;
  includedFieldCount: number;
  visibleSectionLabels: string[];
};

export type PersonaListResult = {
  personas: PersonaSummary[];
  counts: { active: number; archived: number };
};

export type FieldProvenance = "identity" | "persona" | "blank" | "empty";

export type ResolvedField = {
  fieldKey: ProfileFieldKey;
  label: string;
  value: string | null;
  provenance: FieldProvenance;
  isHighlighted: boolean;
  position: number;
};

export type ResolvedSection = {
  sectionKey: string;
  label: string;
  defaultLabel: string;
  isVisible: boolean;
  position: number;
  /** Profile fields that render inside this section (only "profile" today). */
  fields: ResolvedField[];
  /** False for categories whose records do not exist yet. */
  hasSource: boolean;
};

export type ResolvedPersona = {
  fields: ResolvedField[];
  excludedFields: { fieldKey: ProfileFieldKey; label: string }[];
  sections: ResolvedSection[];
  counts: {
    included: number;
    excluded: number;
    highlighted: number;
    overridden: number;
    visibleSections: number;
    hiddenSections: number;
  };
  notices: string[];
};

export type PersonaEditorData = {
  persona: PersonaDetail;
  preview: ResolvedPersona;
  canonical: CanonicalProfile;
  /** False when My Identity could not be read; values then appear empty. */
  canonicalAvailable: boolean;
};

export type BulkActionKind =
  | "include_all"
  | "exclude_all"
  | "clear_highlights"
  | "reset_overrides";

export type BulkAction = { category: "profile"; kind: BulkActionKind };

export type BulkSummary = {
  action: BulkAction;
  title: string;
  description: string;
  affected: { fieldKey: ProfileFieldKey; label: string; effect: string }[];
  unchangedCount: number;
  isNoop: boolean;
};

export type BulkPlan = { changes: ProfileFieldChange[]; summary: BulkSummary };

/** Untrusted create-flow payload as it arrives from the client. */
export type CreatePersonaInputLike = {
  metadata: {
    name: string;
    audience?: string | null;
    purpose?: string | null;
    description?: string | null;
  };
  fields: {
    fieldKey: ProfileFieldKey;
    isIncluded: boolean;
    isHighlighted: boolean;
    position: number;
    override: { mode: "identity" } | { mode: "custom"; value: string | null };
  }[];
  sections: { sectionKey: string; label: string | null; isVisible: boolean }[];
  sectionContent?: PersonaSectionContentMap;
  makeDefault: boolean;
};
