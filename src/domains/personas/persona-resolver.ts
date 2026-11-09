import {
  PROFILE_FIELD_KEYS,
  PROFILE_FIELDS,
  STARTER_SECTIONS,
  defaultSectionLabel,
  type ProfileFieldKey,
} from "@/domains/personas/persona-constants";
import type {
  CanonicalProfile,
  FieldOverride,
  FieldSelection,
  ResolvedField,
  ResolvedPersona,
  ResolvedSection,
  SectionConfig,
} from "@/domains/personas/persona-types";

export type ResolverConfiguration = {
  selections: FieldSelection[];
  overrides: FieldOverride[];
  sections: SectionConfig[];
};

/** A selection row for every allowlisted field, defaulting absent rows to excluded. */
export function completeSelections(
  selections: FieldSelection[],
): FieldSelection[] {
  return PROFILE_FIELD_KEYS.map((fieldKey, index) => {
    const row = selections.find((s) => s.fieldKey === fieldKey);
    return (
      row ?? {
        fieldKey,
        isIncluded: false,
        isHighlighted: false,
        position: index,
      }
    );
  }).sort((a, b) => a.position - b.position || fieldOrder(a) - fieldOrder(b));
}

/** A section row for every starter section, defaulting absent rows to hidden. */
export function completeSections(sections: SectionConfig[]): SectionConfig[] {
  const known = new Set(sections.map((s) => s.sectionKey));
  const maxPosition = sections.reduce(
    (max, s) => Math.max(max, s.position),
    -1,
  );
  const missing = STARTER_SECTIONS.filter((s) => !known.has(s.key)).map(
    (s, index) => ({
      sectionKey: s.key as string,
      label: null,
      isVisible: false,
      position: maxPosition + 1 + index,
    }),
  );
  return [...sections, ...missing].sort(
    (a, b) =>
      a.position - b.position || a.sectionKey.localeCompare(b.sectionKey),
  );
}

/**
 * The effective-content resolver: the single place that decides what a Persona
 * shows. Canonical values are read, never copied: with no override row the
 * current Master Identity value is used; an override row (including an
 * intentional blank) replaces it for this Persona only. Future consumers
 * (Portfolio, Cards, CV) may change layout but not these semantics.
 */
export function resolvePersona(
  configuration: ResolverConfiguration,
  canonical: CanonicalProfile,
): ResolvedPersona {
  const selections = completeSelections(configuration.selections);
  const fields: ResolvedField[] = [];
  const excludedFields: ResolvedPersona["excludedFields"] = [];

  for (const selection of selections) {
    const meta = PROFILE_FIELDS[selection.fieldKey];
    if (!selection.isIncluded) {
      excludedFields.push({ fieldKey: selection.fieldKey, label: meta.label });
      continue;
    }
    fields.push(resolveField(selection, configuration.overrides, canonical));
  }

  const sections: ResolvedSection[] = completeSections(
    configuration.sections,
  ).map((section) => {
    const starter = STARTER_SECTIONS.find((s) => s.key === section.sectionKey);
    return {
      sectionKey: section.sectionKey,
      label: section.label ?? defaultSectionLabel(section.sectionKey),
      defaultLabel: defaultSectionLabel(section.sectionKey),
      isVisible: section.isVisible,
      position: section.position,
      fields: section.sectionKey === "profile" ? fields : [],
      hasSource: starter?.hasSource ?? false,
    };
  });

  const visibleSections = sections.filter((s) => s.isVisible).length;
  const profileSection = sections.find((s) => s.sectionKey === "profile");
  const notices: string[] = [];
  if (fields.length === 0) {
    notices.push(
      "No My Identity fields are included yet, so this Persona shows nothing from your profile.",
    );
  } else if (profileSection && !profileSection.isVisible) {
    notices.push(
      "Profile fields are included, but the Profile section is hidden, so they do not appear in this preview.",
    );
  }

  return {
    fields,
    excludedFields,
    sections,
    counts: {
      included: fields.length,
      excluded: excludedFields.length,
      highlighted: fields.filter((f) => f.isHighlighted).length,
      overridden: fields.filter(
        (f) => f.provenance === "persona" || f.provenance === "blank",
      ).length,
      visibleSections,
      hiddenSections: sections.length - visibleSections,
    },
    notices,
  };
}

function resolveField(
  selection: FieldSelection,
  overrides: FieldOverride[],
  canonical: CanonicalProfile,
): ResolvedField {
  const meta = PROFILE_FIELDS[selection.fieldKey];
  const override = overrides.find((o) => o.fieldKey === selection.fieldKey);
  const base = {
    fieldKey: selection.fieldKey,
    label: meta.label,
    isHighlighted: selection.isHighlighted,
    position: selection.position,
  };
  if (override) {
    const value =
      override.value && override.value !== "" ? override.value : null;
    return { ...base, value, provenance: value === null ? "blank" : "persona" };
  }
  const canonicalValue = canonical[meta.canonical];
  return canonicalValue
    ? { ...base, value: canonicalValue, provenance: "identity" }
    : { ...base, value: null, provenance: "empty" };
}

function fieldOrder(selection: FieldSelection) {
  return PROFILE_FIELD_KEYS.indexOf(selection.fieldKey as ProfileFieldKey);
}
