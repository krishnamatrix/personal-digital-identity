# Milestone 3A — Persona Security Design

**Status:** Proposed only. No policies have been changed or tested against Supabase. See the [foundation](milestone-3a-persona-foundation.md) and [test plan](milestone-3a-persona-test-plan.md).

## Trust and tenancy model

The Supabase Auth user verified by the server is the authority. The authenticated Supabase server client forwards that user's JWT through PostgREST, and policies derive ownership from `(SELECT auth.uid())`. A route may accept a Persona UUID as a resource selector, but must never accept a browser-supplied account/user ID as authorization identity. `postgres` and service-role credentials are not application runtime credentials. SQL Editor catalog checks run as `postgres` prove only object configuration, not RLS enforcement.

Every Persona-owned table has a non-null `account_id`, direct owner RLS predicates, and composite foreign keys tying child rows to `(persona_id, account_id)`. Future source-record joins must also include `account_id`; a UUID alone is insufficient. Enable and FORCE RLS on each table. The normal authenticated role receives narrow object grants only. `anon` and `PUBLIC` receive no Persona table or RPC access. Do not grant `service_role` for user-facing operations.

## Policy matrix

| Table                              | SELECT      | INSERT                                 | UPDATE                         | DELETE                         | Ownership/integrity                                                          |
| ---------------------------------- | ----------- | -------------------------------------- | ------------------------------ | ------------------------------ | ---------------------------------------------------------------------------- |
| `personas`                         | Own rows    | Owner + approved POST RPC path         | Owner + approved POST RPC path | Owner + approved POST RPC path | Owner predicate, RPC-path gate, FK to `accounts`                             |
| `persona_sections`                 | Own rows    | Owner + approved POST RPC path         | Owner + approved POST RPC path | Owner + approved POST RPC path | Direct account predicate + composite FK to Persona                           |
| `persona_profile_field_selections` | Own rows    | Owner + approved POST RPC path         | Owner + approved POST RPC path | Owner + approved POST RPC path | Direct account predicate + composite FK to Persona and profile               |
| `persona_profile_overrides`        | Own rows    | Owner + approved POST RPC path         | Owner + approved POST RPC path | Owner + approved POST RPC path | Direct account predicate + composite FK to Persona                           |
| `persona_revisions`                | Own history | Owner + actor + approved POST RPC path | None                           | None                           | Direct account predicate; actor must equal auth.uid; composite FK to Persona |

Policy form for the first four tables:

```sql
USING (account_id = (SELECT auth.uid()))
WITH CHECK (account_id = (SELECT auth.uid()) AND public.persona_write_rpc_context())
```

For UPDATE, include owner and request-path predicates in both `USING` and `WITH CHECK`; for DELETE, include both in `USING`. SELECT remains owner-only. Revision INSERT also requires `actor_id = (SELECT auth.uid())`.

Use command-specific policies (SELECT, INSERT, UPDATE, DELETE), not a permissive `FOR ALL` policy. For INSERT only `WITH CHECK` applies. The composite FK remains necessary even with RLS because it prevents a same-user row from pairing a Persona with inconsistent ownership metadata and provides referential guarantees for future joins.

For configuration-table INSERT/UPDATE/DELETE and revision INSERT, the proposed owner predicate is combined with `public.persona_write_rpc_context()`. The helper returns true only when PostgREST's transaction-scoped `request.method` is `POST` and `request.path` matches one of the exact approved `persona_*` RPC paths. SELECT remains owner-only without the path condition. Direct REST table mutations therefore fail RLS even though table DML ACLs are needed by SECURITY INVOKER RPC bodies. The helper is SECURITY INVOKER, schema-qualified, and only executable by authenticated; its own RPC path is not on the mutation allowlist.

## Atomic mutation functions and privileges

File 005 proposes these public PostgREST endpoints, all `VOLATILE SECURITY INVOKER SET search_path = ''`, with no account/user ID parameter:

| RPC endpoint                                        | Allowed mutation                                                         | Required table operations                                                                                                              | Revision behavior                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `persona_create`                                    | Create private active non-default Persona                                | INSERT personas, INSERT revisions                                                                                                      | Creates revision 1 in same transaction                                                  |
| `persona_update_metadata`                           | Update name/description/audience/purpose                                 | SELECT/UPDATE personas, INSERT revisions                                                                                               | Expected-version compare; increment + revision                                          |
| `persona_update_profile_field`                      | Set include/highlight and optional profile override/reset                | SELECT/UPDATE personas; SELECT/INSERT/UPDATE selections and overrides; DELETE override on reset; INSERT revision                       | Strict field-key allowlist; one revision per change                                     |
| `persona_upsert_section` / `persona_delete_section` | Edit layout metadata                                                     | SELECT/UPDATE personas; SELECT/INSERT/UPDATE/DELETE sections; INSERT revision                                                          | Same transaction; FK blocks removal when future selected items depend on section        |
| `persona_set_default`                               | Switch active default                                                    | SELECT/UPDATE personas, INSERT revisions                                                                                               | Advisory transaction lock by `auth.uid()`; old and new default changes/revisions atomic |
| `persona_set_lifecycle`                             | Archive or restore                                                       | SELECT/UPDATE personas, INSERT revisions                                                                                               | Archive clears default; restore stays non-default                                       |
| `persona_duplicate`                                 | Copy Persona configuration into a new active private non-default Persona | SELECT/INSERT personas; SELECT/INSERT sections, selections, overrides; INSERT revision                                                 | Copies configuration/overrides only; no canonical values; new Persona revision 1        |
| `persona_delete`                                    | Permanently delete an archived Persona                                   | SELECT/DELETE personas; child DELETE caused by FK cascade; INSERT revision is not retained because permanent deletion cascades history | Requires expected version; future Portfolio/Card RESTRICT FKs abort deletion atomically |

Each function explicitly checks `auth.uid()`, its expected version, status and all input constraints; owner identity is never an argument. Stale version raises SQLSTATE `40001`; absent or cross-owner Persona is returned as not found (no ownership leak); invalid field/status input raises `22023`; FK dependencies raise `23503`. Any exception, including failed revision insert, rolls back all work in that PostgREST request.

The `authenticated` role receives the table SELECT/INSERT/UPDATE/DELETE ACLs needed by invoker functions, plus SELECT/INSERT on revisions. RLS allows reads only for `account_id=auth.uid()`. RLS allows writes only when that owner predicate holds **and** the request-context helper confirms POST to an approved mutation RPC. Revisions have no UPDATE or DELETE policy or ACL. Direct table writes cannot pass the request-path RLS gate. Exact function signatures have EXECUTE revoked from PUBLIC, anon and service_role, then granted only to authenticated. The helper's EXECUTE is granted to authenticated because RLS invokes it; it cannot mutate and its own request path is rejected by the mutation path test. No sequences are needed (UUID keys use `gen_random_uuid()`).

This guard assumes API access occurs through Supabase PostgREST and that its documented `request.path` and `request.method` settings are transaction-scoped and not client-assignable. That runtime property must be confirmed by a later approved hosted test before DDL execution. A direct PostgreSQL login as `authenticated` is not part of the approved runtime architecture. Do not replace the path guard with a caller-set GUC or a Drizzle claim. If Supabase's deployed PostgREST behavior differs, stop and return for design review.

## Grants proposed

- `authenticated`: SELECT, INSERT, UPDATE, DELETE on Personas and editable configuration tables; SELECT and INSERT on revisions. DML is usable only from the allowlisted SECURITY INVOKER RPC request paths through RLS.
- `authenticated`: EXECUTE on the context helper and each exact mutation RPC signature; no wildcard function grant.
- No `anon`, `PUBLIC`, or service-role object grants. Revoke inherited/default ACL entries before adding these narrow grants; inspect actual ACLs at execution time rather than assuming Supabase defaults.
- `authenticated`: no access to absent/future selection tables until their source schema and security rules are proposed.
- No direct revision UPDATE/DELETE and no service_role grants. Function EXECUTE defaults are revoked from PUBLIC in the same transaction before the authenticated grants.

## Persona privacy and future publishing

Persona rows have no public visibility mode in this initial design: active and archived are lifecycle states, not audience states. No anonymous policy exists. A later publishing feature must build an allowlisted immutable projection following AD-005. Persona selection does not publish a record; public requests must never query these tables. Cached snapshots, media derivatives, cards and portfolios require explicit invalidation and source provenance.

## Lifecycle and threat handling

- Archived Personas stay visible only to their owner. They cannot be a default or publication input until restored. Restore does not restore default automatically.
- Archive is reversible and retains revisions. Restore returns active/non-default. Permanent deletion requires prior archive and expected version; current child configuration and revisions cascade. Future Portfolio/Card FK references use RESTRICT, so the delete RPC fails atomically until dependencies are detached. Hard deletion never cascades toward canonical source data. Account deletion removes all Persona data under AD-006.
- Cross-user references are rejected by RLS WITH CHECK plus composite FKs. A forged `account_id` cannot authorize access because it must equal `auth.uid()`.
- Profile override is a Persona-owned value; its field key is allowlisted and it does not write the canonical table. Cross-account source selection is impossible through the current typed profile relation and future typed FKs.
- Changing `is_default` must preserve the partial unique constraint and active-only check. Switch defaults atomically in a transaction; the schema constraint prevents two winners. Archive must clear default in the same transaction. Do not implement a multi-request “unset then set” flow without transaction protection.
- Version conflict is a domain conflict, not an authorization bypass. Do not silently overwrite a newer version.
- There may be zero default Personas. The partial unique index allows at most one active default; account-scoped advisory locking serializes simultaneous set-default RPCs. Archive clears default; restore does not set it; deleting the default leaves no default and never auto-promotes another Persona.
- RLS tests run through separate Auth sessions and PostgREST, not SQL Editor and not simulated JWT claims.

## Expected denial semantics

- SELECT of another user's row: usually HTTP 200 with an empty array/object; zero rows is expected denial, not an exception.
- UPDATE/DELETE filtered by another user's row: may return success with zero affected rows; independently read as the owner to verify unchanged state.
- INSERT/UPDATE that violates WITH CHECK: Postgres SQLSTATE `42501` (`insufficient_privilege`) is expected, commonly surfaced as PostgREST error; FK violations are `23503`, check violations `23514`, unique violations `23505`. Interpret constraint errors as protection only when the attempted cross-tenant row was not persisted and the exact failure is understood.
- Anonymous table access: expected SQLSTATE `42501`/PostgREST permission failure or no relation privilege; must not return records. Anonymous SELECT empty alone is insufficient if the test never confirmed the table grants/path.
- Archived own Persona: owner may read it; default selection and publish operations must reject it. Exact API result should be a domain validation error; policy need not hide owner data.
- Persona delete: owner only. Verify canonical source rows still exist and are unchanged after child cascade.

## SQL review notes

The proposed DDL is separated into tables/configuration and RLS/grants. `FORCE ROW LEVEL SECURITY` is included for consistency, but does not constrain the `postgres` table owner with BYPASSRLS. RLS predicates use `auth.uid()` in the authenticated PostgREST path, matching the deployed Identity policy convention. Exact catalog state must be checked before manual execution; no broad default-privilege changes to Supabase-managed schemas are proposed.
