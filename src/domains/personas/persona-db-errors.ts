import { PersonaError, personaErrors } from "@/domains/personas/persona-errors";

/** The subset of a PostgREST / supabase-js error this mapper reads. */
export type PersonaDbError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
};

/**
 * An unexpected persistence failure (permission denied, missing function,
 * unexpected response shape, integrity violation). It carries only a stable code
 * so logs can be correlated; it never carries SQL text, constraint details or
 * row data, and the server-action layer returns only a generic message to the
 * client.
 */
export class PersonaPersistenceError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(`Persona persistence failed (${code})`);
    this.name = "PersonaPersistenceError";
    this.code = code;
  }
}

const ACTIVE_NAME_CONSTRAINT = "personas_account_active_name_unique";
const SLUG_CONSTRAINT = "personas_account_slug_unique";

/**
 * Maps a PostgREST error to a stable domain error. PostgREST reports the
 * PostgreSQL SQLSTATE in `code`; the HTTP status is NOT used (observed against
 * the hosted project: P0002 and 55000 both arrive as HTTP 500 with the right
 * code). The same SQLSTATEs are what the RPCs in docs/sql/milestone-3c raise and
 * what the fixture adapter's PersonaError codes correspond to
 * (PERSONA_ERROR_SQLSTATE), so both adapters behave alike.
 *
 * Messages from the database are never forwarded: the user-facing text comes
 * from this table, and unmapped failures become a PersonaPersistenceError.
 */
export function mapPersonaDbError(error: PersonaDbError): Error {
  const code = error.code ?? "";
  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  switch (code) {
    case "28000":
    // PostgREST rejected the JWT itself (expired, invalid, or missing claims):
    // the session lapsed between verification and this request.
    case "PGRST301":
    case "PGRST302":
    case "PGRST303":
      return new PersonaError(
        "unauthenticated",
        "Sign in to manage your Personas.",
      );
    case "P0002":
      return personaErrors.notFound();
    case "PT409": // a stale expected version (docs/sql/milestone-3c/004)
    case "40001": // legacy; the 003 functions raised this and it hangs through PostgREST
      return personaErrors.versionConflict();
    case "55000":
      return /must be archived/i.test(text)
        ? personaErrors.notArchived()
        : personaErrors.archived();
    case "22023":
    case "22P02":
      return personaErrors.invalid("That request was not valid.");
    case "23505":
      if (text.includes(ACTIVE_NAME_CONSTRAINT)) {
        return personaErrors.duplicateName();
      }
      if (text.includes(SLUG_CONSTRAINT)) {
        return new PersonaError(
          "duplicate",
          "That change conflicts with an existing Persona.",
        );
      }
      // Revision-number or position uniqueness means concurrent writers got past
      // the row lock: an integrity problem to investigate, not a user error.
      return new PersonaPersistenceError("23505");
    case "23503":
      return new PersonaError(
        "dependency",
        "This Persona is still in use and cannot be changed that way.",
      );
    case "23514":
      return personaErrors.constraint("A value was not accepted.");
    default:
      return new PersonaPersistenceError(code || "unknown");
  }
}
