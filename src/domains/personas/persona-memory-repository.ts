import {
  PERSONA_LIMITS,
  PROFILE_FIELD_KEYS,
  PROFILE_FIELDS,
  validateOverrideValue,
} from "@/domains/personas/persona-constants";
import { PersonaError, personaErrors } from "@/domains/personas/persona-errors";
import type { PersonaRepository } from "@/domains/personas/persona-repository";
import type {
  FieldOverride,
  FieldSelection,
  NormalizedPersonaCreate,
  PersonaDetail,
  PersonaMetadataInput,
  PersonaStatus,
  ProfileFieldChange,
  SectionConfig,
  SectionInput,
} from "@/domains/personas/persona-types";

/**
 * DETERMINISTIC IN-MEMORY FIXTURE ADAPTER.
 *
 * This is NOT persistence. State lives in process memory and is lost on
 * restart. It reproduces the behaviour the proposed SQL RPCs are designed to
 * have (version checks, one revision per mutation, no-ops, single default,
 * archive-before-delete, cascade on delete) so the application layer can be
 * built and tested against the contract. Passing tests here says nothing
 * about the hosted database, RLS or the request-path gate; those need the
 * separately approved hosted tests once the SQL is executed.
 *
 * Atomicity: every mutation runs against a deep copy of the account's state
 * and replaces the stored state only if the whole operation succeeds. Any
 * thrown error (including a failing revision insert) therefore leaves the
 * stored state untouched.
 */

type RevisionEvent =
  | "created"
  | "updated"
  | "duplicated"
  | "archived"
  | "restored"
  | "default_changed";

type StoredRevision = {
  revisionNumber: number;
  eventType: RevisionEvent;
  payload: unknown;
  createdAt: string;
};

type Stored = Omit<PersonaDetail, "revisionCount"> & {
  revisions: StoredRevision[];
};

export type InMemoryPersonaRepositoryOptions = {
  now?: () => Date;
  newId?: () => string;
  /** Test seam: throw here to simulate a failing revision insert. */
  beforeRevisionInsert?: (event: RevisionEvent, personaId: string) => void;
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class InMemoryPersonaRepository implements PersonaRepository {
  readonly kind = "in-memory-fixture" as const;

  private readonly accounts = new Map<string, Stored[]>();
  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly beforeRevisionInsert?: InMemoryPersonaRepositoryOptions["beforeRevisionInsert"];

  constructor(options: InMemoryPersonaRepositoryOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.newId = options.newId ?? (() => globalThis.crypto.randomUUID());
    this.beforeRevisionInsert = options.beforeRevisionInsert;
  }

  async list(accountId: string): Promise<PersonaDetail[]> {
    return [...(this.accounts.get(accountId) ?? [])]
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
      .map(toDetail);
  }

  async get(accountId: string, personaId: string) {
    const found = (this.accounts.get(accountId) ?? []).find(
      (persona) => persona.id === personaId,
    );
    return found ? toDetail(found) : null;
  }

  async createWithConfiguration(
    accountId: string,
    input: NormalizedPersonaCreate,
  ): Promise<PersonaDetail> {
    return this.transact(accountId, (draft) => {
      assertMetadata(input.metadata);
      assertUniqueActiveName(draft, input.metadata.name);
      assertSelections(input.selections);
      for (const override of input.overrides) {
        assertOverride(override.fieldKey, override.value);
      }
      const at = this.timestamp();
      const created: Stored = {
        id: this.newId(),
        ...input.metadata,
        status: "active",
        isDefault: false,
        position: nextPosition(draft),
        version: 1,
        createdAt: at,
        updatedAt: at,
        archivedAt: null,
        selections: input.selections.map((s) => ({ ...s })),
        overrides: input.overrides.map((o) => ({ ...o, version: 1 })),
        sections: input.sections.map((s) => ({ ...s })),
        ...(input.sectionContent
          ? { sectionContent: clone(input.sectionContent) }
          : {}),
        revisions: [],
      };
      draft.push(created);
      if (input.makeDefault) {
        this.clearOtherDefault(draft, created.id, created.id);
        created.isDefault = true;
      }
      this.addRevision(created, "created", {
        metadata: input.metadata,
        isDefault: created.isDefault,
        profileFields: created.selections.map((s) => ({ ...s })),
        overrides: input.overrides.map((o) => ({ ...o })),
        sections: created.sections.map((s) => ({ ...s })),
      });
      return toDetail(created);
    });
  }

  async updateMetadata(
    accountId: string,
    personaId: string,
    expectedVersion: number,
    input: PersonaMetadataInput,
  ): Promise<PersonaDetail> {
    return this.transact(accountId, (draft) => {
      assertMetadata(input);
      const persona = this.lockActive(draft, personaId, expectedVersion);
      const before = metadataOf(persona);
      if (sameMetadata(before, input)) {
        return toDetail(persona);
      }
      assertUniqueActiveName(draft, input.name, persona.id);
      Object.assign(persona, input);
      this.bump(persona, "updated", {
        change: "metadata",
        before,
        after: { ...input },
      });
      return toDetail(persona);
    });
  }

  async applyProfileFieldChanges(
    accountId: string,
    personaId: string,
    expectedVersion: number,
    changes: ProfileFieldChange[],
  ): Promise<PersonaDetail> {
    return this.transact(accountId, (draft) => {
      if (changes.length === 0) {
        throw personaErrors.invalid("No change requested.");
      }
      const persona = this.lockActive(draft, personaId, expectedVersion);
      const seen = new Set<string>();
      const audit: unknown[] = [];
      let changed = false;

      for (const change of changes) {
        if (seen.has(change.fieldKey)) {
          throw personaErrors.invalid(
            "Each field may appear only once per request.",
          );
        }
        seen.add(change.fieldKey);
        const override = change.override ?? { action: "keep" as const };
        const touchesSelection =
          change.isIncluded !== undefined ||
          change.isHighlighted !== undefined ||
          change.position !== undefined;
        if (!touchesSelection && override.action === "keep") {
          throw personaErrors.invalid("No change requested.");
        }
        if (change.position !== undefined && change.position < 0) {
          throw personaErrors.invalid("Position must be non-negative.");
        }

        let selectionAudit: unknown = null;
        if (touchesSelection) {
          const existing = persona.selections.find(
            (s) => s.fieldKey === change.fieldKey,
          );
          const nextIncluded =
            change.isIncluded ?? existing?.isIncluded ?? false;
          let nextHighlighted =
            change.isHighlighted ?? existing?.isHighlighted ?? false;
          const nextPosition = change.position ?? existing?.position ?? 0;
          if (!nextIncluded) {
            if (change.isHighlighted === true) {
              throw personaErrors.invalid(
                "An excluded field cannot be highlighted.",
              );
            }
            nextHighlighted = false;
          }
          const after = {
            included: nextIncluded,
            highlighted: nextHighlighted,
            position: nextPosition,
          };
          const before = existing
            ? {
                included: existing.isIncluded,
                highlighted: existing.isHighlighted,
                position: existing.position,
              }
            : null;
          if (JSON.stringify(before) !== JSON.stringify(after)) {
            if (existing) {
              existing.isIncluded = nextIncluded;
              existing.isHighlighted = nextHighlighted;
              existing.position = nextPosition;
            } else {
              persona.selections.push({
                fieldKey: change.fieldKey,
                isIncluded: nextIncluded,
                isHighlighted: nextHighlighted,
                position: nextPosition,
              });
            }
            changed = true;
            selectionAudit = { before, after };
          }
        }

        let overrideAudit: unknown = null;
        if (override.action !== "keep") {
          const index = persona.overrides.findIndex(
            (o) => o.fieldKey === change.fieldKey,
          );
          const existing = index >= 0 ? persona.overrides[index] : undefined;
          const beforeState = existing
            ? { present: true, value: existing.value }
            : { present: false };
          if (override.action === "set") {
            assertOverride(change.fieldKey, override.value);
            if (existing && existing.value === override.value) {
              // identical: no change
            } else {
              if (existing) {
                existing.value = override.value;
                existing.version += 1;
              } else {
                persona.overrides.push({
                  fieldKey: change.fieldKey,
                  value: override.value,
                  version: 1,
                });
              }
              changed = true;
              overrideAudit = {
                before: beforeState,
                after: { present: true, value: override.value },
              };
            }
          } else if (existing) {
            persona.overrides.splice(index, 1);
            changed = true;
            overrideAudit = {
              before: beforeState,
              after: { present: false },
            };
          }
        }

        if (selectionAudit || overrideAudit) {
          audit.push({
            fieldKey: change.fieldKey,
            selection: selectionAudit,
            override: overrideAudit,
          });
        }
      }

      if (!changed) return toDetail(persona);
      this.bump(persona, "updated", {
        change: "profile_fields",
        fields: audit,
      });
      return toDetail(persona);
    });
  }

  async upsertSection(
    accountId: string,
    personaId: string,
    expectedVersion: number,
    section: SectionInput,
  ): Promise<PersonaDetail> {
    return this.transact(accountId, (draft) => {
      const key = section.sectionKey.trim();
      if (key.length < 1 || key.length > 80) {
        throw personaErrors.invalid("Section key must be 1-80 characters.");
      }
      if (
        section.label !== null &&
        section.label.length > PERSONA_LIMITS.sectionLabel
      ) {
        throw personaErrors.constraint(
          `Section label must be ${PERSONA_LIMITS.sectionLabel} characters or fewer.`,
        );
      }
      const persona = this.lockActive(draft, personaId, expectedVersion);
      const existing = persona.sections.find((s) => s.sectionKey === key);
      const after = { label: section.label, isVisible: section.isVisible };
      let before: unknown = null;
      if (existing) {
        before = { label: existing.label, isVisible: existing.isVisible };
        if (JSON.stringify(before) === JSON.stringify(after)) {
          return toDetail(persona);
        }
        existing.label = section.label;
        existing.isVisible = section.isVisible;
      } else {
        persona.sections.push({
          sectionKey: key,
          label: section.label,
          isVisible: section.isVisible,
          position:
            persona.sections.reduce((max, s) => Math.max(max, s.position), -1) +
            1,
        });
      }
      this.bump(persona, "updated", {
        change: "section",
        sectionKey: key,
        before,
        after,
      });
      return toDetail(persona);
    });
  }

  async reorderSections(
    accountId: string,
    personaId: string,
    expectedVersion: number,
    sectionKeys: string[],
  ): Promise<PersonaDetail> {
    return this.transact(accountId, (draft) => {
      if (new Set(sectionKeys).size !== sectionKeys.length) {
        throw personaErrors.invalid("Section keys must be unique.");
      }
      const persona = this.lockActive(draft, personaId, expectedVersion);
      const existing = sortedSections(persona.sections).map(
        (s) => s.sectionKey,
      );
      const sameSet =
        existing.length === sectionKeys.length &&
        sectionKeys.every((key) => existing.includes(key));
      if (!sameSet) {
        throw personaErrors.invalid(
          "Section keys must match the Persona's existing sections exactly.",
        );
      }
      if (existing.every((key, index) => key === sectionKeys[index])) {
        return toDetail(persona);
      }
      sectionKeys.forEach((key, index) => {
        const section = persona.sections.find((s) => s.sectionKey === key);
        if (section) section.position = index;
      });
      this.bump(persona, "updated", {
        change: "section_order",
        before: existing,
        after: [...sectionKeys],
      });
      return toDetail(persona);
    });
  }

  async setDefault(
    accountId: string,
    personaId: string,
    expectedVersion: number,
    isDefault: boolean,
  ): Promise<PersonaDetail> {
    return this.transact(accountId, (draft) => {
      const persona = this.lockActive(draft, personaId, expectedVersion);
      if (persona.isDefault === isDefault) return toDetail(persona);
      let replaced: string | null = null;
      if (isDefault) {
        replaced = this.clearOtherDefault(draft, persona.id, persona.id);
      }
      persona.isDefault = isDefault;
      this.bump(persona, "default_changed", {
        isDefault: { before: !isDefault, after: isDefault },
        replaced,
      });
      return toDetail(persona);
    });
  }

  async setLifecycle(
    accountId: string,
    personaId: string,
    expectedVersion: number,
    status: PersonaStatus,
  ): Promise<PersonaDetail> {
    return this.transact(accountId, (draft) => {
      const persona = this.lock(draft, personaId, expectedVersion);
      if (persona.status === status) return toDetail(persona);
      const wasDefault = persona.isDefault;
      const beforeStatus = persona.status;
      if (status === "archived") {
        persona.status = "archived";
        persona.archivedAt = this.timestamp();
        persona.isDefault = false;
      } else {
        assertUniqueActiveName(draft, persona.name, persona.id);
        persona.status = "active";
        persona.archivedAt = null;
        persona.isDefault = false;
      }
      this.bump(persona, status === "archived" ? "archived" : "restored", {
        status: { before: beforeStatus, after: status },
        isDefault: { before: wasDefault, after: false },
      });
      return toDetail(persona);
    });
  }

  async duplicate(
    accountId: string,
    sourcePersonaId: string,
    newName: string,
  ): Promise<PersonaDetail> {
    return this.transact(accountId, (draft) => {
      const name = newName.trim();
      if (name.length < 1)
        throw personaErrors.invalid("Persona name is required.");
      if (name.length > PERSONA_LIMITS.name) {
        throw personaErrors.constraint(
          `Name must be ${PERSONA_LIMITS.name} characters or fewer.`,
          {
            name: [`Name must be ${PERSONA_LIMITS.name} characters or fewer.`],
          },
        );
      }
      const source = draft.find((p) => p.id === sourcePersonaId);
      if (!source) throw personaErrors.notFound();
      assertUniqueActiveName(draft, name);
      const at = this.timestamp();
      const copy: Stored = {
        id: this.newId(),
        name,
        description: source.description,
        audience: source.audience,
        purpose: source.purpose,
        status: "active",
        isDefault: false,
        position: nextPosition(draft),
        version: 1,
        createdAt: at,
        updatedAt: at,
        archivedAt: null,
        selections: clone(source.selections),
        overrides: source.overrides.map((o) => ({ ...o, version: 1 })),
        sections: clone(source.sections),
        revisions: [],
      };
      draft.push(copy);
      this.addRevision(copy, "duplicated", {
        sourcePersonaId: source.id,
        copied: {
          sections: copy.sections.length,
          profileFieldSelections: copy.selections.length,
          profileFieldOverrides: copy.overrides.length,
        },
      });
      return toDetail(copy);
    });
  }

  async delete(
    accountId: string,
    personaId: string,
    expectedVersion: number,
  ): Promise<string> {
    return this.transact(accountId, (draft) => {
      const persona = this.lock(draft, personaId, expectedVersion);
      if (persona.status !== "archived") throw personaErrors.notArchived();
      // Cascade: sections, selections, overrides and revisions live inside the
      // Persona record, so removing it removes them (as ON DELETE CASCADE does).
      draft.splice(draft.indexOf(persona), 1);
      return persona.id;
    });
  }

  // --- internals ---------------------------------------------------------

  private transact<T>(accountId: string, operation: (draft: Stored[]) => T): T {
    const draft = clone(this.accounts.get(accountId) ?? []);
    const result = operation(draft);
    this.accounts.set(accountId, draft);
    return result;
  }

  private timestamp() {
    return this.now().toISOString();
  }

  private lock(draft: Stored[], personaId: string, expectedVersion: number) {
    const persona = draft.find((p) => p.id === personaId);
    if (!persona) throw personaErrors.notFound();
    if (persona.version !== expectedVersion)
      throw personaErrors.versionConflict();
    return persona;
  }

  private lockActive(
    draft: Stored[],
    personaId: string,
    expectedVersion: number,
  ) {
    const persona = this.lock(draft, personaId, expectedVersion);
    if (persona.status !== "active") throw personaErrors.archived();
    return persona;
  }

  /** Clears the single active default (if another Persona holds it). */
  private clearOtherDefault(
    draft: Stored[],
    keepId: string,
    replacedBy: string,
  ) {
    const previous = draft.find(
      (p) => p.isDefault && p.status === "active" && p.id !== keepId,
    );
    if (!previous) return null;
    previous.isDefault = false;
    this.bump(previous, "default_changed", {
      isDefault: { before: true, after: false },
      replacedBy,
    });
    return previous.id;
  }

  private bump(persona: Stored, event: RevisionEvent, payload: unknown) {
    persona.version += 1;
    persona.updatedAt = this.timestamp();
    this.addRevision(persona, event, payload);
  }

  private addRevision(persona: Stored, event: RevisionEvent, payload: unknown) {
    this.beforeRevisionInsert?.(event, persona.id);
    if (persona.revisions.some((r) => r.revisionNumber === persona.version)) {
      throw new PersonaError("duplicate", "Revision already exists.");
    }
    persona.revisions.push({
      revisionNumber: persona.version,
      eventType: event,
      payload: clone(payload),
      createdAt: this.timestamp(),
    });
  }
}

function toDetail(persona: Stored): PersonaDetail {
  const { revisions, ...rest } = clone(persona);
  return {
    ...rest,
    selections: [...rest.selections].sort(
      (a, b) => a.position - b.position || a.fieldKey.localeCompare(b.fieldKey),
    ),
    sections: sortedSections(rest.sections),
    revisionCount: revisions.length,
  };
}

function sortedSections(sections: SectionConfig[]) {
  return [...sections].sort(
    (a, b) =>
      a.position - b.position || a.sectionKey.localeCompare(b.sectionKey),
  );
}

function metadataOf(persona: Stored): PersonaMetadataInput {
  return {
    name: persona.name,
    description: persona.description,
    audience: persona.audience,
    purpose: persona.purpose,
  };
}

function sameMetadata(a: PersonaMetadataInput, b: PersonaMetadataInput) {
  return (
    a.name === b.name &&
    a.description === b.description &&
    a.audience === b.audience &&
    a.purpose === b.purpose
  );
}

function nextPosition(draft: Stored[]) {
  return draft.reduce((max, p) => Math.max(max, p.position), -1) + 1;
}

function assertUniqueActiveName(
  draft: Stored[],
  name: string,
  exceptId?: string,
) {
  const folded = name.trim().toLowerCase();
  const clash = draft.some(
    (p) =>
      p.status === "active" &&
      p.id !== exceptId &&
      p.name.trim().toLowerCase() === folded,
  );
  if (clash) throw personaErrors.duplicateName();
}

function assertMetadata(input: PersonaMetadataInput) {
  const errors: Record<string, string[]> = {};
  if (input.name.trim() !== input.name || input.name.length < 1) {
    errors.name = ["Enter a name for this Persona."];
  } else if (input.name.length > PERSONA_LIMITS.name) {
    errors.name = [`Name must be ${PERSONA_LIMITS.name} characters or fewer.`];
  }
  for (const key of ["description", "audience", "purpose"] as const) {
    const value = input[key];
    if (value !== null && value.length > PERSONA_LIMITS[key]) {
      errors[key] = [`Must be ${PERSONA_LIMITS[key]} characters or fewer.`];
    }
  }
  if (Object.keys(errors).length > 0) {
    throw personaErrors.constraint("Review the highlighted fields.", errors);
  }
}

function assertSelections(selections: FieldSelection[]) {
  const seen = new Set<string>();
  for (const selection of selections) {
    if (!PROFILE_FIELD_KEYS.includes(selection.fieldKey)) {
      throw personaErrors.constraint("Unknown profile field.");
    }
    if (seen.has(selection.fieldKey)) {
      throw personaErrors.invalid("Each field may appear only once.");
    }
    seen.add(selection.fieldKey);
    if (selection.position < 0) {
      throw personaErrors.constraint("Position must be non-negative.");
    }
    if (selection.isHighlighted && !selection.isIncluded) {
      throw personaErrors.constraint(
        `${PROFILE_FIELDS[selection.fieldKey].label} must be included before it can be highlighted.`,
      );
    }
  }
}

function assertOverride(
  fieldKey: FieldOverride["fieldKey"],
  value: string | null,
) {
  const message = validateOverrideValue(fieldKey, value);
  if (message) throw personaErrors.constraint(message);
}
