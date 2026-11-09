import type {
  NormalizedPersonaCreate,
  PersonaDetail,
  PersonaMetadataInput,
  PersonaStatus,
  ProfileFieldChange,
  SectionInput,
} from "@/domains/personas/persona-types";

/**
 * Persistence boundary for Personas.
 *
 * Every method is one atomic mutation (configuration change + one revision),
 * mirroring the proposed SQL RPCs in docs/sql/milestone-3a/005. Errors are
 * `PersonaError`s whose codes correspond to the RPC SQLSTATEs.
 *
 * Mapping to the proposed backend:
 *
 *   updateMetadata        -> persona_update_metadata
 *   upsertSection         -> persona_upsert_section
 *   reorderSections       -> persona_reorder_sections
 *   setDefault            -> persona_set_default
 *   setLifecycle          -> persona_set_lifecycle
 *   duplicate             -> persona_duplicate
 *   delete                -> persona_delete
 *   list / get            -> owner-scoped SELECTs (RLS)
 *
 * BACKED BY NEW RPCs in the M3C proposal (docs/sql/milestone-3c; not executed),
 * which replace the milestone-3a set:
 *
 *   createWithConfiguration  The four-step create flow must persist metadata,
 *     field selections, overrides, section layout and the optional default
 *     flag atomically, as one revision with revision_number 1. Composing
 *     persona_create + N x persona_update_profile_field + section RPCs would
 *     be non-atomic and bumps the version once per call, so it is NOT an
 *     acceptable substitute. A new RPC is required.
 *
 *   applyProfileFieldChanges  Category-scoped bulk actions and field
 *     reordering change several fields in one step. persona_update_profile_field
 *     changes one field per call. A batch RPC taking an array of field changes
 *     and producing exactly one version bump and one revision is required.
 */
export interface PersonaRepository {
  /** Identifies the adapter in the UI so fixture data is never mistaken for saved data. */
  readonly kind: "in-memory-fixture" | "postgrest";

  list(accountId: string): Promise<PersonaDetail[]>;
  get(accountId: string, personaId: string): Promise<PersonaDetail | null>;

  createWithConfiguration(
    accountId: string,
    input: NormalizedPersonaCreate,
  ): Promise<PersonaDetail>;

  updateMetadata(
    accountId: string,
    personaId: string,
    expectedVersion: number,
    input: PersonaMetadataInput,
  ): Promise<PersonaDetail>;

  applyProfileFieldChanges(
    accountId: string,
    personaId: string,
    expectedVersion: number,
    changes: ProfileFieldChange[],
  ): Promise<PersonaDetail>;

  upsertSection(
    accountId: string,
    personaId: string,
    expectedVersion: number,
    section: SectionInput,
  ): Promise<PersonaDetail>;

  reorderSections(
    accountId: string,
    personaId: string,
    expectedVersion: number,
    sectionKeys: string[],
  ): Promise<PersonaDetail>;

  setDefault(
    accountId: string,
    personaId: string,
    expectedVersion: number,
    isDefault: boolean,
  ): Promise<PersonaDetail>;

  setLifecycle(
    accountId: string,
    personaId: string,
    expectedVersion: number,
    status: PersonaStatus,
  ): Promise<PersonaDetail>;

  duplicate(
    accountId: string,
    sourcePersonaId: string,
    newName: string,
  ): Promise<PersonaDetail>;

  /** Permanently deletes an ARCHIVED Persona; returns its id. */
  delete(
    accountId: string,
    personaId: string,
    expectedVersion: number,
  ): Promise<string>;
}
