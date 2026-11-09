import type { FolioneClient } from "@/lib/db-schema";
import { z, ZodError } from "zod";
import { PROFILE_FIELD_KEYS } from "@/domains/personas/persona-constants";
import {
  PersonaPersistenceError,
  mapPersonaDbError,
} from "@/domains/personas/persona-db-errors";
import { personaErrors } from "@/domains/personas/persona-errors";
import type { PersonaRepository } from "@/domains/personas/persona-repository";
import type {
  NormalizedPersonaCreate,
  PersonaDetail,
  PersonaMetadataInput,
  PersonaStatus,
  ProfileFieldChange,
  SectionInput,
} from "@/domains/personas/persona-types";

/**
 * SUPABASE-BACKED PERSONA REPOSITORY (not enabled by default).
 *
 * Every read is a PostgREST SELECT and every mutation is exactly ONE call to a
 * Persona RPC, so each user action is one database transaction. Each RPC RETURNS
 * the resulting Persona state (children, revision count and the new version),
 * built inside that same transaction, so a mutation costs ONE request: there is
 * no second read, and the returned state is exactly what committed. It runs through
 * the authenticated Supabase client: the user's JWT supplies auth.uid(), RLS
 * isolates tenants, and the request-path gate rejects any write that is not an
 * approved RPC. There is no service-role key, no direct PostgreSQL connection and
 * no custom role.
 *
 * Defence in depth: the account id is NEVER taken from the caller. The session
 * supplies the verified user id; an `accountId` argument that differs from it is
 * treated as "not found", and reads also filter on `account_id` explicitly in
 * addition to RLS.
 *
 * It must not be enabled until docs/sql/milestone-3c has been approved, executed
 * and verified (see docs/architecture/milestone-3c-persona-persistence.md).
 */

/** Names of the RPCs this adapter calls. Must equal the gate allowlist in 002. */
export const PERSONA_RPC = {
  createWithConfiguration: "persona_create_with_configuration",
  updateMetadata: "persona_update_metadata",
  applyProfileFieldChanges: "persona_apply_profile_field_changes",
  upsertSection: "persona_upsert_section",
  reorderSections: "persona_reorder_sections",
  setDefault: "persona_set_default",
  setLifecycle: "persona_set_lifecycle",
  duplicate: "persona_duplicate",
  delete: "persona_delete",
} as const;

/**
 * The read-only state builder (not a mutation, deliberately NOT on the gate
 * allowlist). `get` uses it so a single Persona is read as one server-built,
 * owner-scoped snapshot; it returns NULL for a missing or foreign Persona.
 */
export const PERSONA_READ_RPC = { detail: "persona_detail_json" } as const;

export type PersonaDbClient = Pick<FolioneClient, "from" | "rpc">;
export type PersonaDbSession = { client: PersonaDbClient; userId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One request = one consistent snapshot: the Persona and all its children are
// embedded in a single PostgREST SELECT.
const DETAIL_SELECT =
  "id,name,description,audience,purpose,status,is_default,position,version," +
  "created_at,updated_at,archived_at," +
  "persona_sections(section_key,label_override,is_visible,position)," +
  "persona_profile_field_selections(field_key,is_included,is_highlighted,position)," +
  "persona_profile_overrides(field_key,override_value,override_version)," +
  "persona_revisions(count)";

const fieldKey = z.enum(PROFILE_FIELD_KEYS);
const rowSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  audience: z.string().nullable(),
  purpose: z.string().nullable(),
  status: z.enum(["active", "archived"]),
  is_default: z.boolean(),
  position: z.number(),
  version: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  archived_at: z.string().nullable(),
  persona_sections: z.array(
    z.object({
      section_key: z.string(),
      label_override: z.string().nullable(),
      is_visible: z.boolean(),
      position: z.number(),
    }),
  ),
  persona_profile_field_selections: z.array(
    z.object({
      field_key: fieldKey,
      is_included: z.boolean(),
      is_highlighted: z.boolean(),
      position: z.number(),
    }),
  ),
  persona_profile_overrides: z.array(
    z.object({
      field_key: fieldKey,
      override_value: z.string().nullable(),
      override_version: z.number(),
    }),
  ),
  persona_revisions: z.array(z.object({ count: z.number() })),
});
type DbRow = z.infer<typeof rowSchema>;

const iso = (value: string) => new Date(value).toISOString();

function toDetail(row: DbRow): PersonaDetail {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    audience: row.audience,
    purpose: row.purpose,
    status: row.status,
    isDefault: row.is_default,
    position: row.position,
    version: row.version,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    archivedAt: row.archived_at ? iso(row.archived_at) : null,
    selections: row.persona_profile_field_selections
      .map((s) => ({
        fieldKey: s.field_key,
        isIncluded: s.is_included,
        isHighlighted: s.is_highlighted,
        position: s.position,
      }))
      .sort(
        (a, b) =>
          a.position - b.position || a.fieldKey.localeCompare(b.fieldKey),
      ),
    overrides: row.persona_profile_overrides.map((o) => ({
      fieldKey: o.field_key,
      value: o.override_value,
      version: o.override_version,
    })),
    sections: row.persona_sections
      .map((s) => ({
        sectionKey: s.section_key,
        label: s.label_override,
        isVisible: s.is_visible,
        position: s.position,
      }))
      .sort(
        (a, b) =>
          a.position - b.position || a.sectionKey.localeCompare(b.sectionKey),
      ),
    revisionCount: row.persona_revisions[0]?.count ?? 0,
  };
}

export class SupabasePersonaRepository implements PersonaRepository {
  readonly kind = "postgrest" as const;

  /** `getSession` must resolve the VERIFIED session user (auth.getUser()). */
  constructor(private readonly getSession: () => Promise<PersonaDbSession>) {}

  async list(accountId: string): Promise<PersonaDetail[]> {
    const { client, userId } = await this.session(accountId);
    const { data, error } = await client
      .from("personas")
      .select(DETAIL_SELECT)
      .eq("account_id", userId)
      .order("position", { ascending: true })
      .order("id", { ascending: true });
    if (error) throw mapPersonaDbError(error);
    return this.parseRows(data ?? []);
  }

  async get(accountId: string, personaId: string) {
    const { client } = await this.session(accountId);
    // A malformed id can never match a row; answer exactly as for a missing one.
    if (!UUID.test(personaId)) return null;
    const { data, error } = await client.rpc(PERSONA_READ_RPC.detail, {
      p_persona_id: personaId,
    });
    if (error) throw mapPersonaDbError(error);
    // NULL = missing or not the caller's (the function scopes by auth.uid()).
    if (data === null || data === undefined) return null;
    const parsed = rowSchema.safeParse(data);
    if (!parsed.success) throw new PersonaPersistenceError("response");
    return toDetail(parsed.data);
  }

  async createWithConfiguration(
    accountId: string,
    input: NormalizedPersonaCreate,
  ): Promise<PersonaDetail> {
    return this.mutate(accountId, PERSONA_RPC.createWithConfiguration, {
      p_name: input.metadata.name,
      p_description: input.metadata.description,
      p_audience: input.metadata.audience,
      p_purpose: input.metadata.purpose,
      p_fields: input.selections.map((s) => ({
        field_key: s.fieldKey,
        is_included: s.isIncluded,
        is_highlighted: s.isHighlighted,
        position: s.position,
      })),
      p_overrides: input.overrides.map((o) => ({
        field_key: o.fieldKey,
        value: o.value,
      })),
      p_sections: input.sections.map((s) => ({
        section_key: s.sectionKey,
        label: s.label,
        is_visible: s.isVisible,
        position: s.position,
      })),
      p_make_default: input.makeDefault,
    });
  }

  async updateMetadata(
    accountId: string,
    personaId: string,
    expectedVersion: number,
    input: PersonaMetadataInput,
  ): Promise<PersonaDetail> {
    this.requireUuid(personaId);
    return this.mutate(accountId, PERSONA_RPC.updateMetadata, {
      p_persona_id: personaId,
      p_expected_version: expectedVersion,
      p_name: input.name,
      // The application has no slug; the RPC replaces all five metadata fields.
      p_slug: null,
      p_description: input.description,
      p_audience: input.audience,
      p_purpose: input.purpose,
    });
  }

  async applyProfileFieldChanges(
    accountId: string,
    personaId: string,
    expectedVersion: number,
    changes: ProfileFieldChange[],
  ): Promise<PersonaDetail> {
    this.requireUuid(personaId);
    return this.mutate(accountId, PERSONA_RPC.applyProfileFieldChanges, {
      p_persona_id: personaId,
      p_expected_version: expectedVersion,
      // Keys left undefined are omitted from the JSON, which the RPC reads as
      // "leave unchanged"; an explicit null override value is an intentional blank.
      p_changes: changes.map((c) => ({
        field_key: c.fieldKey,
        is_included: c.isIncluded,
        is_highlighted: c.isHighlighted,
        position: c.position,
        override_action: c.override?.action ?? "keep",
        ...(c.override?.action === "set"
          ? { override_value: c.override.value }
          : {}),
      })),
    });
  }

  async upsertSection(
    accountId: string,
    personaId: string,
    expectedVersion: number,
    section: SectionInput,
  ): Promise<PersonaDetail> {
    this.requireUuid(personaId);
    return this.mutate(accountId, PERSONA_RPC.upsertSection, {
      p_persona_id: personaId,
      p_expected_version: expectedVersion,
      p_section_key: section.sectionKey,
      p_label_override: section.label,
      p_is_visible: section.isVisible,
    });
  }

  async reorderSections(
    accountId: string,
    personaId: string,
    expectedVersion: number,
    sectionKeys: string[],
  ): Promise<PersonaDetail> {
    this.requireUuid(personaId);
    return this.mutate(accountId, PERSONA_RPC.reorderSections, {
      p_persona_id: personaId,
      p_expected_version: expectedVersion,
      p_section_keys: sectionKeys,
    });
  }

  async setDefault(
    accountId: string,
    personaId: string,
    expectedVersion: number,
    isDefault: boolean,
  ): Promise<PersonaDetail> {
    this.requireUuid(personaId);
    return this.mutate(accountId, PERSONA_RPC.setDefault, {
      p_persona_id: personaId,
      p_expected_version: expectedVersion,
      p_is_default: isDefault,
    });
  }

  async setLifecycle(
    accountId: string,
    personaId: string,
    expectedVersion: number,
    status: PersonaStatus,
  ): Promise<PersonaDetail> {
    this.requireUuid(personaId);
    return this.mutate(accountId, PERSONA_RPC.setLifecycle, {
      p_persona_id: personaId,
      p_expected_version: expectedVersion,
      p_status: status,
    });
  }

  async duplicate(
    accountId: string,
    sourcePersonaId: string,
    newName: string,
  ): Promise<PersonaDetail> {
    this.requireUuid(sourcePersonaId);
    return this.mutate(accountId, PERSONA_RPC.duplicate, {
      p_source_persona_id: sourcePersonaId,
      p_new_name: newName,
    });
  }

  async delete(
    accountId: string,
    personaId: string,
    expectedVersion: number,
  ): Promise<string> {
    this.requireUuid(personaId);
    const { client } = await this.session(accountId);
    const { data, error } = await client.rpc(PERSONA_RPC.delete, {
      p_persona_id: personaId,
      p_expected_version: expectedVersion,
    });
    if (error) throw mapPersonaDbError(error);
    const deleted = z.string().safeParse(data);
    if (!deleted.success) throw new PersonaPersistenceError("response");
    return deleted.data;
  }

  // --- internals ---------------------------------------------------------

  /** The verified session; a different account id is never honoured. */
  private async session(accountId: string): Promise<PersonaDbSession> {
    const session = await this.getSession();
    if (session.userId !== accountId) throw personaErrors.notFound();
    return session;
  }

  private requireUuid(id: string) {
    if (!UUID.test(id)) throw personaErrors.notFound();
  }

  /**
   * One RPC = one transaction = one request. The RPC returns the resulting
   * Persona state, read inside the same transaction after its last write.
   */
  private async mutate(
    accountId: string,
    rpc: string,
    params: Record<string, unknown>,
  ): Promise<PersonaDetail> {
    const { client } = await this.session(accountId);
    const { data, error } = await client.rpc(rpc, params);
    if (error) throw mapPersonaDbError(error);
    const parsed = rowSchema.safeParse(data);
    if (!parsed.success) throw new PersonaPersistenceError("response");
    return toDetail(parsed.data);
  }

  private parseRows(rows: unknown[]): PersonaDetail[] {
    try {
      return z.array(rowSchema).parse(rows).map(toDetail);
    } catch (error) {
      if (error instanceof ZodError) throw new PersonaPersistenceError("shape");
      throw error;
    }
  }
}
