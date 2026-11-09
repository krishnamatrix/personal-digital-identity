import { z } from "zod";
import {
  PROFILE_FIELD_KEYS,
  STARTER_SECTIONS,
  defaultSectionLabel,
  type ProfileFieldKey,
} from "@/domains/personas/persona-constants";
import { personaErrors } from "@/domains/personas/persona-errors";
import { planBulkAction } from "@/domains/personas/persona-bulk";
import type { PersonaRepository } from "@/domains/personas/persona-repository";
import {
  completeSelections,
  completeSections,
  resolvePersona,
} from "@/domains/personas/persona-resolver";
import {
  bulkActionSchema,
  createPersonaInputSchema,
  directionSchema,
  fieldKeySchema,
  idSchema,
  lifecycleSchema,
  normalizeOverrideText,
  personaMetadataSchema,
  profileFieldChangesSchema,
  sectionInputSchema,
  versionSchema,
} from "@/domains/personas/persona-schema";
import type {
  BulkAction,
  BulkSummary,
  CanonicalProfile,
  NormalizedPersonaCreate,
  PersonaDetail,
  PersonaEditorData,
  PersonaListResult,
  PersonaSummary,
  ProfileFieldChange,
} from "@/domains/personas/persona-types";

export type PersonaContext = {
  /** Always the verified authenticated user id; never client input. */
  accountId: string;
  /** Read-only access to the canonical profile. Must not create or update it. */
  loadCanonicalProfile: () => Promise<CanonicalProfile>;
};

export type PersonaServiceDeps = {
  repository: PersonaRepository;
  getContext: () => Promise<PersonaContext>;
};

const EMPTY_CANONICAL: CanonicalProfile = {
  displayName: null,
  headline: null,
  summary: null,
  location: null,
  websiteUrl: null,
  linkedinUrl: null,
  githubUrl: null,
};

export type ListFilter = "active" | "archived" | "all";

/**
 * Application service for Personas. Validates input with Zod, resolves the
 * verified account, delegates each mutation to exactly one repository call
 * (so each user action is atomic), and returns the server-computed preview.
 * It reads the canonical profile but has no way to write to it.
 */
export function createPersonaService({
  repository,
  getContext,
}: PersonaServiceDeps) {
  async function editorData(
    context: PersonaContext,
    persona: PersonaDetail,
  ): Promise<PersonaEditorData> {
    // A successful mutation must never be reported as failed just because the
    // read-only My Identity lookup failed afterwards.
    let canonical = EMPTY_CANONICAL;
    let canonicalAvailable = true;
    try {
      canonical = await context.loadCanonicalProfile();
    } catch {
      canonicalAvailable = false;
    }
    return {
      persona,
      canonical,
      canonicalAvailable,
      preview: resolvePersona(persona, canonical),
    };
  }

  async function requirePersona(context: PersonaContext, personaId: string) {
    const persona = await repository.get(context.accountId, personaId);
    if (!persona) throw personaErrors.notFound();
    return persona;
  }

  /** Re-checks the version the user saw before planning from current state. */
  async function requireVersion(
    context: PersonaContext,
    personaId: string,
    expectedVersion: number,
  ) {
    const persona = await requirePersona(context, personaId);
    if (persona.version !== expectedVersion)
      throw personaErrors.versionConflict();
    return persona;
  }

  return {
    storageKind: repository.kind,

    async list(filter: ListFilter = "active"): Promise<PersonaListResult> {
      const context = await getContext();
      const all = await repository.list(context.accountId);
      const shown = all.filter(
        (persona) => filter === "all" || persona.status === filter,
      );
      return {
        personas: shown.map(summarize),
        counts: {
          active: all.filter((p) => p.status === "active").length,
          archived: all.filter((p) => p.status === "archived").length,
        },
      };
    },

    async getEditorData(personaId: string): Promise<PersonaEditorData> {
      const id = idSchema.parse(personaId);
      const context = await getContext();
      return editorData(context, await requirePersona(context, id));
    },

    /** Read-only My Identity values for the create flow. */
    async loadCanonicalForCreate(): Promise<{
      canonical: CanonicalProfile;
      canonicalAvailable: boolean;
    }> {
      const context = await getContext();
      try {
        return {
          canonical: await context.loadCanonicalProfile(),
          canonicalAvailable: true,
        };
      } catch {
        return { canonical: EMPTY_CANONICAL, canonicalAvailable: false };
      }
    },

    /** Four-step create flow, persisted as ONE atomic repository operation. */
    async create(input: unknown): Promise<PersonaEditorData> {
      const parsed = createPersonaInputSchema.parse(input);
      const context = await getContext();
      const normalized = normalizeCreate(parsed);
      const created = await repository.createWithConfiguration(
        context.accountId,
        normalized,
      );
      return editorData(context, created);
    },

    async updateDetails(
      personaId: string,
      expectedVersion: number,
      input: unknown,
    ): Promise<PersonaEditorData> {
      const id = idSchema.parse(personaId);
      const version = versionSchema.parse(expectedVersion);
      const metadata = personaMetadataSchema.parse(input);
      const context = await getContext();
      return editorData(
        context,
        await repository.updateMetadata(
          context.accountId,
          id,
          version,
          metadata,
        ),
      );
    },

    /** One atomic batch: a single field toggle, a presentation save, or a reorder. */
    async applyFieldChanges(
      personaId: string,
      expectedVersion: number,
      changes: unknown,
    ): Promise<PersonaEditorData> {
      const id = idSchema.parse(personaId);
      const version = versionSchema.parse(expectedVersion);
      const parsed = profileFieldChangesSchema.parse(changes);
      const normalized: ProfileFieldChange[] = parsed.map((change) => ({
        ...change,
        override:
          change.override?.action === "set"
            ? {
                action: "set",
                value: normalizeOverrideText(change.override.value),
              }
            : change.override,
      }));
      const context = await getContext();
      return editorData(
        context,
        await repository.applyProfileFieldChanges(
          context.accountId,
          id,
          version,
          normalized,
        ),
      );
    },

    async moveField(
      personaId: string,
      expectedVersion: number,
      fieldKey: unknown,
      direction: unknown,
    ): Promise<PersonaEditorData> {
      const id = idSchema.parse(personaId);
      const version = versionSchema.parse(expectedVersion);
      const key = fieldKeySchema.parse(fieldKey);
      const dir = directionSchema.parse(direction);
      const context = await getContext();
      const persona = await requireVersion(context, id, version);

      const ordered = completeSelections(persona.selections);
      const from = ordered.findIndex((row) => row.fieldKey === key);
      const to = dir === "up" ? from - 1 : from + 1;
      if (to < 0 || to >= ordered.length) return editorData(context, persona);

      const next = [...ordered];
      [next[from], next[to]] = [next[to], next[from]];
      const changes: ProfileFieldChange[] = [];
      next.forEach((row, index) => {
        const stored = persona.selections.find(
          (s) => s.fieldKey === row.fieldKey,
        );
        if (!stored || stored.position !== index) {
          changes.push({ fieldKey: row.fieldKey, position: index });
        }
      });
      return editorData(
        context,
        await repository.applyProfileFieldChanges(
          context.accountId,
          id,
          version,
          changes,
        ),
      );
    },

    /** Confirmation summary for a bulk action. Performs no mutation. */
    async previewBulkAction(
      personaId: string,
      expectedVersion: number,
      action: unknown,
    ): Promise<BulkSummary> {
      const id = idSchema.parse(personaId);
      const version = versionSchema.parse(expectedVersion);
      const parsed: BulkAction = bulkActionSchema.parse(action);
      const context = await getContext();
      const persona = await requireVersion(context, id, version);
      return planBulkAction(persona, parsed).summary;
    },

    /** Applies a bulk action as ONE atomic repository operation. */
    async applyBulkAction(
      personaId: string,
      expectedVersion: number,
      action: unknown,
    ): Promise<PersonaEditorData> {
      const id = idSchema.parse(personaId);
      const version = versionSchema.parse(expectedVersion);
      const parsed: BulkAction = bulkActionSchema.parse(action);
      const context = await getContext();
      const persona = await requireVersion(context, id, version);
      const plan = planBulkAction(persona, parsed);
      if (plan.summary.isNoop) return editorData(context, persona);
      return editorData(
        context,
        await repository.applyProfileFieldChanges(
          context.accountId,
          id,
          version,
          plan.changes,
        ),
      );
    },

    async saveSection(
      personaId: string,
      expectedVersion: number,
      section: unknown,
    ): Promise<PersonaEditorData> {
      const id = idSchema.parse(personaId);
      const version = versionSchema.parse(expectedVersion);
      const parsed = sectionInputSchema.parse(section);
      const context = await getContext();
      // A label equal to the default is stored as "no override".
      const label =
        parsed.label === defaultSectionLabel(parsed.sectionKey)
          ? null
          : parsed.label;
      return editorData(
        context,
        await repository.upsertSection(context.accountId, id, version, {
          ...parsed,
          label,
        }),
      );
    },

    async moveSection(
      personaId: string,
      expectedVersion: number,
      sectionKey: unknown,
      direction: unknown,
    ): Promise<PersonaEditorData> {
      const id = idSchema.parse(personaId);
      const version = versionSchema.parse(expectedVersion);
      const key = z.string().min(1).max(80).parse(sectionKey);
      const dir = directionSchema.parse(direction);
      const context = await getContext();
      const persona = await requireVersion(context, id, version);
      // Use the stored set exactly: the repository rejects any other key set.
      const keys = persona.sections.map((s) => s.sectionKey);
      const from = keys.indexOf(key);
      if (from < 0) throw personaErrors.invalid("Unknown section.");
      const to = dir === "up" ? from - 1 : from + 1;
      if (to < 0 || to >= keys.length) return editorData(context, persona);
      [keys[from], keys[to]] = [keys[to], keys[from]];
      return editorData(
        context,
        await repository.reorderSections(context.accountId, id, version, keys),
      );
    },

    async setDefault(
      personaId: string,
      expectedVersion: number,
      isDefault: boolean,
    ): Promise<PersonaEditorData> {
      const id = idSchema.parse(personaId);
      const version = versionSchema.parse(expectedVersion);
      const flag = z.boolean().parse(isDefault);
      const context = await getContext();
      return editorData(
        context,
        await repository.setDefault(context.accountId, id, version, flag),
      );
    },

    async setLifecycle(
      personaId: string,
      expectedVersion: number,
      status: unknown,
    ): Promise<PersonaEditorData> {
      const id = idSchema.parse(personaId);
      const version = versionSchema.parse(expectedVersion);
      const parsed = lifecycleSchema.parse(status);
      const context = await getContext();
      return editorData(
        context,
        await repository.setLifecycle(context.accountId, id, version, parsed),
      );
    },

    async duplicate(
      personaId: string,
      newName: unknown,
    ): Promise<PersonaEditorData> {
      const id = idSchema.parse(personaId);
      const { name } = personaMetadataSchema.pick({ name: true }).parse({
        name: newName,
      });
      const context = await getContext();
      return editorData(
        context,
        await repository.duplicate(context.accountId, id, name),
      );
    },

    /** Permanent deletion. The repository refuses anything but an archived Persona. */
    async remove(personaId: string, expectedVersion: number): Promise<string> {
      const id = idSchema.parse(personaId);
      const version = versionSchema.parse(expectedVersion);
      const context = await getContext();
      return repository.delete(context.accountId, id, version);
    },
  };
}

export type PersonaService = ReturnType<typeof createPersonaService>;

function summarize(persona: PersonaDetail): PersonaSummary {
  return {
    id: persona.id,
    name: persona.name,
    description: persona.description,
    audience: persona.audience,
    purpose: persona.purpose,
    status: persona.status,
    isDefault: persona.isDefault,
    version: persona.version,
    updatedAt: persona.updatedAt,
    includedFieldCount: persona.selections.filter((s) => s.isIncluded).length,
    visibleSectionLabels: completeSections(persona.sections)
      .filter((s) => s.isVisible)
      .map((s) => s.label ?? defaultSectionLabel(s.sectionKey)),
  };
}

function normalizeCreate(
  parsed: z.output<typeof createPersonaInputSchema>,
): NormalizedPersonaCreate {
  const byKey = new Map(parsed.fields.map((f) => [f.fieldKey, f]));
  const selections = PROFILE_FIELD_KEYS.map(
    (fieldKey: ProfileFieldKey, index) => {
      const field = byKey.get(fieldKey);
      return {
        fieldKey,
        isIncluded: field?.isIncluded ?? false,
        isHighlighted: field?.isHighlighted ?? false,
        position: field?.position ?? index,
      };
    },
  );
  const overrides = parsed.fields.flatMap((field) =>
    field.override.mode === "custom"
      ? [
          {
            fieldKey: field.fieldKey,
            value: normalizeOverrideText(field.override.value),
          },
        ]
      : [],
  );

  const bySection = new Map(parsed.sections.map((s) => [s.sectionKey, s]));
  const given = parsed.sections.map((s) => s.sectionKey as string);
  const order = [
    ...given,
    ...STARTER_SECTIONS.map((s) => s.key as string).filter(
      (key) => !given.includes(key),
    ),
  ];
  const sections = order.map((sectionKey, position) => {
    const section = bySection.get(
      sectionKey as (typeof STARTER_SECTIONS)[number]["key"],
    );
    const label =
      section?.label && section.label !== defaultSectionLabel(sectionKey)
        ? section.label
        : null;
    return {
      sectionKey,
      label,
      // Sections start hidden unless the user chose otherwise.
      isVisible: section?.isVisible ?? false,
      position,
    };
  });

  return {
    metadata: parsed.metadata,
    selections,
    overrides,
    sections,
    makeDefault: parsed.makeDefault,
  };
}
