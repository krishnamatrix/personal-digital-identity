# Database schema `folioone`

Status: local implementation complete and validated. Hosted: the developer **reported all files executed** (2026-11-09); that is REPORTED, not verified: the `007` catalog output, the before/after `public-snapshot.sql` output and confirmation of the Dashboard "Exposed schemas" step are still outstanding. Decision: [AD-008](architecture-decisions.md#ad-008-canonical-application-schema-folioone).

## 1. Dependency audit: what targeted `public`

Syntactic classification of every occurrence of `public` in the approved SQL (counts are from the generator's pinned rules):

| File (approved source)                                   | Schema qualifiers `public.x` | Schema-name literals `'public'` | Phrase "schema public" | Notes                                                               |
| -------------------------------------------------------- | ---------------------------- | ------------------------------- | ---------------------- | ------------------------------------------------------------------- |
| `milestone-2/001-identity-tables.sql`                    | 13                           | 2                               | 0                      | preflights: `to_regclass`, `has_schema_privilege(... 'public' ...)` |
| `milestone-2/002-identity-rls.sql`                       | 24                           | 6                               | 0                      | `REVOKE ... FROM PUBLIC` is the **role** keyword and is not changed |
| `milestone-3c/001-persona-schema-secured.sql`            | 41                           | 6                               | 4                      |                                                                     |
| `milestone-3c/002-persona-gate-policies-grants.sql`      | 54                           | 10                              | 0                      | gate helper + 16 policies                                           |
| `milestone-3c/003-persona-mutation-rpcs.sql`             | 134                          | 8                               | 1                      | plus 1 escaped qualifier inside a `prosrc ~*` regex                 |
| `milestone-3c/004-persona-version-conflict-sqlstate.sql` | (folded into 006)            |                                 |                        | its 7 function bodies equal the PT409 definitions in 006 (tested)   |
| `milestone-3c/verify-catalog.sql`                        | 20                           | 13                              | 0                      | plus 1 escaped qualifier                                            |
| `milestone-3c/rollback.sql`                              | 22 (comments)                | 0                               | 0                      |                                                                     |

Five comment lines mention `public` in prose and are rewritten individually. Nothing in the approved SQL depends on `public` for anything except the app's own objects: `gen_random_uuid()` is `pg_catalog`, every function has an empty `search_path`, and the only cross-schema reference is `auth.users(id)` / `auth.uid()`.

Application code that relied on the default schema (every PostgREST call without a schema selects the first exposed schema, `public`):

| Place                                                              | Before                                      | Now                                                            |
| ------------------------------------------------------------------ | ------------------------------------------- | -------------------------------------------------------------- |
| `src/lib/supabase/server.ts`                                       | `createServerClient(url, key, { cookies })` | adds `db: folioneDbOptions`                                    |
| `src/lib/supabase/client.ts`                                       | `createBrowserClient(url, key)`             | adds `{ db: folioneDbOptions }`                                |
| `src/middleware.ts`                                                | auth refresh client                         | adds `db: folioneDbOptions` (consistency; it queries nothing)  |
| `profile-repository.ts` (`accounts`, `identity_profiles`, 4 calls) | default schema                              | typed `FolioneClient`                                          |
| `persona-supabase-repository.ts` (`personas` read, 11 RPCs)        | default schema                              | typed `FolioneClient`                                          |
| Hosted/E2E test helpers (5 files, 9 clients)                       | default schema                              | pass `folioneDbOptions`                                        |
| `persona-request-gate-diagnostic.hosted.ts`                        | `public`                                    | unchanged on purpose (M3A temporary objects lived in `public`) |

No Supabase Storage is used, so the schema name is not involved with bucket names.

## 2. Canonical object inventory (schema `folioone`)

- Schema `folioone` owned by `postgres`; `USAGE` to `authenticated` only; no default privileges.
- Tables (7, RLS enabled and forced): `accounts`, `identity_profiles`, `personas`, `persona_sections`, `persona_profile_field_selections`, `persona_profile_overrides`, `persona_revisions`, with their constraints, composite owner foreign keys and indexes.
- Policies: 5 (identity) + 16 (Persona) = 21.
- Functions (11, all `SECURITY INVOKER`, `search_path=''`): `persona_write_rpc_context()`, `persona_detail_json(uuid)`, and the nine mutation RPCs (`persona_create_with_configuration`, `persona_apply_profile_field_changes`, `persona_update_metadata`, `persona_upsert_section`, `persona_reorder_sections`, `persona_set_default`, `persona_set_lifecycle`, `persona_duplicate`, `persona_delete`). `EXECUTE` only for `authenticated`.
- Only cross-schema dependency: `accounts.id → auth.users(id)`.

## 3. Differences from the originally approved SQL

1. Schema retargeting only, by the generator's rules (qualifiers, literals, phrase, one regex).
2. New `001-create-schema.sql` (schema, owner, `USAGE` to `authenticated`), because `public` pre-exists in Supabase and `folioone` does not.
3. Migration 004 is **folded** into `006-persona-functions.sql`: the schema is born with the final PT409 definitions, never with 40001. Tested: the seven bodies equal 004's retargeted bodies. There is no separate 007 correction file.
4. Section 11 of the verification file and `public-snapshot.sql` are new (non-interference evidence).
5. Provenance headers (prerequisites, one-time/read-only, expected result, status) are added to each file.
6. Behavioural differences to know about: the diagnostic-object preflight in the gate file now looks in `folioone` (trivially satisfied). In Supabase, new tables in `public` receive default API grants; `folioone` has none, and the files still revoke and re-grant explicitly, so the resulting privileges are identical to the approved model.
   Nothing in the data model, constraints, policies' predicates, RPC contracts, locking or error codes changed.

## 4. Local implementation

`supabase/config.toml` exposes `["public", "graphql_public", "folioone"]` (mirrors the hosted setup after the Dashboard step). `pnpm validate` always starts a fresh stack, applies the generated package, asserts the catalog and runs every suite against `folioone`. See [local-validation.md](local-validation.md).

## 5. Public non-interference: how it is shown

| Claim                                                  | Evidence                                                                                                                                                                                 |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The hosted SQL does not modify `public`                | Generated executable SQL contains no `public` reference (test); `public-snapshot.sql` before/after must be identical on hosted                                                           |
| Nothing falls back to `public`                         | Clients are typed to `folioone` (compile-time); one constant (test); a request with no schema header finds no application tables locally; `public` row counts stay 0 after the whole run |
| Local works without `public` application tables        | Default `pnpm validate` has none in `public`                                                                                                                                             |
| Existing public records are neither copied nor deleted | No statement reads or writes `public`; `--public-decoy` mirrors the hosted state and proves the legacy objects are byte-identical afterwards                                             |
| Auth users untouched                                   | Package only references `auth.users(id)` in one foreign key                                                                                                                              |

## 6. Hosted: executed per developer report; verification outstanding

Execution order, Dashboard steps and expected results: `docs/sql/folioone-schema/README.md`. Until the developer runs it and supplies `007-verify-catalog.sql` and `public-snapshot.sql` output, the hosted project does not have `folioone`, and the **hosted opt-in test scripts (`pnpm test:persona-db`, `test:rls`, ...) now target `folioone`** and will fail against the hosted project until then. The application must keep `PERSONA_STORAGE=fixture` on any deployment whose database has not been migrated; the profile page (Master Identity) also reads `folioone`, so against an un-migrated hosted project its requests fail (PostgREST rejects a schema that is not exposed; what the UI then displays has not been checked). **Deploy order matters: migrate and expose `folioone` on the target Supabase project before deploying this code to it.**

### Hosted evidence received (developer-supplied, 2026-11-09)

| Item                                      | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                       | Status                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `007` section 11c (functions)             | 11 rows: all `security_definer = false`, `search_path_empty = true`                                                                                                                                                                                                                                                                                                                                                            | **VERIFIED (developer output)**                                   |
| `public-snapshot.sql` before vs after 006 | A complete 55-row output (identical to the "after 006" output, `TOTAL` `ade84de2544122e678912637f408f501`) arrived unlabelled after the truncated "before" output, whose 51 rows it matches. **Assumed to be the full "before 001" run; the developer should confirm.** If so: every fingerprint, all 7 row counts (4, 3, 119, 14, 34, 153, 17) and the TOTAL are identical before and after, i.e. nothing in `public` changed | **VERIFIED (developer output), conditional on that confirmation** |
| `007` section 9 (schema ACL)              | owner `postgres`; `authenticated`: USAGE true, CREATE false; `anon` USAGE false; `service_role` USAGE false; no PUBLIC ACL; 0 default ACLs                                                                                                                                                                                                                                                                                     | **VERIFIED (developer output)**                                   |
| `007` section 10 (inventory)              | tables 7, functions 11, views/sequences/other 0                                                                                                                                                                                                                                                                                                                                                                                | **VERIFIED (developer output)**                                   |
| `007` sections 1-8, 11a, 11b              | not supplied (tables' RLS and privileges, policies, function privileges, exposure paths, cross-schema foreign keys, `public.` references)                                                                                                                                                                                                                                                                                      | **OPEN**                                                          |
| Dashboard "Exposed schemas" step          | not confirmed                                                                                                                                                                                                                                                                                                                                                                                                                  | **OPEN**                                                          |

On the stated assumption the `public` comparison is complete and identical. The remaining open items are `007` sections 1-8, 11a, 11b and the Dashboard exposure confirmation.

## 7. Classification of remaining `public` references

No reference means "the application stores or reads data in `public`". Every remaining mention is one of:

| Kind                        | Where                                                                                                                                                           | Why it stays                                                                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase infrastructure     | `supabase/config.toml` exposed schemas (`public`, `graphql_public`), `extra_search_path = ["public", "extensions"]`; Dashboard "Exposed schemas" keeps `public` | Supabase defaults and extension lookup; the app never relies on them (every client selects `folioone`, functions use an empty `search_path`) |
| Role keyword                | `REVOKE ... FROM PUBLIC` in the SQL                                                                                                                             | the PostgreSQL pseudo-role `PUBLIC`, not a schema                                                                                            |
| Legacy hosted objects       | existing development tables/functions/policies/data in `public`                                                                                                 | accepted decision: left untouched and unused; retiring them is a separate, later decision                                                    |
| Non-interference evidence   | `public-snapshot.sql`, the validate step "schema public is unchanged", `--public-decoy` mode                                                                    | read-only proof that `public` is not changed                                                                                                 |
| Historical SQL              | `docs/sql/milestone-2`, `milestone-3a`, `milestone-3c`, `retired/`                                                                                              | the originally approved sources the generator reads, and the record of what ran on hosted; do not edit                                       |
| M3A request-path diagnostic | `tests/hosted/persona-request-gate-diagnostic.hosted.ts`                                                                                                        | its temporary `zz_diag_*` objects lived in `public` and were cleaned up                                                                      |
| Comments/prose              | `src/lib/db-schema.ts`, docs                                                                                                                                    | explaining that the app never falls back to `public`                                                                                         |

`folioone_staging` and `folioone_prod` appear only in statements that they are not used, and in a test that forbids them.
