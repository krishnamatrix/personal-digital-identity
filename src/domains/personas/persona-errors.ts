/**
 * Domain error codes. Each maps to the SQLSTATE the proposed mutation RPCs
 * (docs/sql/milestone-3a/005) raise, so a future PostgREST adapter can
 * translate `error.code` to the same values the in-memory adapter throws.
 */
export type PersonaErrorCode =
  | "unauthenticated"
  | "not_found"
  | "version_conflict"
  | "invalid_state"
  | "invalid_input"
  | "duplicate"
  | "dependency"
  | "constraint";

export const PERSONA_ERROR_SQLSTATE: Record<PersonaErrorCode, string> = {
  unauthenticated: "28000",
  not_found: "P0002",
  // PT409, not 40001: PostgREST/Supabase never returns a request that fails with
  // 40001 (serialization_failure), so deployed SQL (004) signals a stale version
  // with this non-retryable code. See docs/sql/milestone-3c/004-*.sql.
  version_conflict: "PT409",
  invalid_state: "55000",
  invalid_input: "22023",
  duplicate: "23505",
  dependency: "23503",
  constraint: "23514",
};

export class PersonaError extends Error {
  readonly code: PersonaErrorCode;
  readonly fieldErrors?: Record<string, string[]>;

  constructor(
    code: PersonaErrorCode,
    message: string,
    fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "PersonaError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

/**
 * Recognises a PersonaError by shape as well as by class. The in-memory fixture
 * outlives hot reloads (it lives on globalThis), so an error thrown by an older
 * module instance is not `instanceof` the reloaded class. Matching on name and
 * code keeps error mapping (conflicts, duplicates, archived state) reliable.
 */
export function isPersonaError(error: unknown): error is PersonaError {
  if (error instanceof PersonaError) return true;
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "PersonaError" &&
    typeof (error as { code?: unknown }).code === "string"
  );
}

export const personaErrors = {
  notFound: () => new PersonaError("not_found", "That Persona was not found."),
  versionConflict: () =>
    new PersonaError(
      "version_conflict",
      "This Persona was changed in another tab or session.",
    ),
  archived: () =>
    new PersonaError(
      "invalid_state",
      "Archived Personas are read-only. Restore it to make changes.",
    ),
  notArchived: () =>
    new PersonaError(
      "invalid_state",
      "Archive this Persona before deleting it permanently.",
    ),
  invalid: (message: string, fieldErrors?: Record<string, string[]>) =>
    new PersonaError("invalid_input", message, fieldErrors),
  constraint: (message: string, fieldErrors?: Record<string, string[]>) =>
    new PersonaError("constraint", message, fieldErrors),
  duplicateName: () =>
    new PersonaError(
      "duplicate",
      "An active Persona already uses that name. Choose a different name.",
      { name: ["An active Persona already uses that name."] },
    ),
};
