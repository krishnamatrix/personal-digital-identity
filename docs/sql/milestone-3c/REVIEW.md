# M3C SQL package — independent review guide

**Status: PROPOSAL, pending independent SQL review. Nothing has been executed, applied or approved for execution.** The execution tracker is entirely `pending`. This guide is written for a reviewer who has not seen the project: it states what each file does, what contract it exposes, which privileges it needs, and where the evidence stops.

Files: [001](001-persona-schema-secured.sql) · [002](002-persona-gate-policies-grants.sql) · [003](003-persona-mutation-rpcs.sql) · [verify-catalog.sql](verify-catalog.sql) · [rollback.sql](rollback.sql) · [README](README.md) · [decision record](../../architecture/milestone-3c-persona-persistence.md).

## 1. Suggested reading order

1. `001`: five tables created **already locked down** (RLS enabled and forced, all API privileges revoked, same transaction).
2. `002`: the request-path gate, 16 policies, column-level grants.
3. `003`: `persona_detail_json` (read-only state builder) and the nine mutation RPCs.
4. `verify-catalog.sql` and `rollback.sql`.
5. Section 8 below (questions for the reviewer).

## 2. RPC contract

Every mutation is one PostgREST `POST /rpc/<name>` = one PostgreSQL transaction. All are `SECURITY INVOKER`, `VOLATILE`, `SET search_path = ''`, take **no account or user parameter** (the owner is `auth.uid()`), repeat the owner predicate in every `WHERE`, and write **exactly one revision per mutation** (two when a previous default is also changed).

**Return contract (approved change).** Every mutation except `persona_delete` returns `jsonb`: the **complete resulting Persona state**, built by `persona_detail_json` as the last step _inside the same transaction_, so the application needs no second request and the returned `version` and revision count are exactly what committed. A no-op returns the current state with no bump and no revision. `persona_delete` returns the deleted id (there is no resulting state).

Shape of the returned state (identical to the application's PostgREST select with embedded children):

```json
{
  "id": "uuid",
  "name": "text",
  "description": "text|null",
  "audience": "text|null",
  "purpose": "text|null",
  "status": "active|archived",
  "is_default": false,
  "position": 0,
  "version": 1,
  "created_at": "timestamptz",
  "updated_at": "timestamptz",
  "archived_at": "timestamptz|null",
  "persona_sections": [
    {
      "section_key": "",
      "label_override": null,
      "is_visible": true,
      "position": 0
    }
  ],
  "persona_profile_field_selections": [
    {
      "field_key": "",
      "is_included": false,
      "is_highlighted": false,
      "position": 0
    }
  ],
  "persona_profile_overrides": [
    { "field_key": "", "override_value": null, "override_version": 1 }
  ],
  "persona_revisions": [{ "count": 1 }]
}
```

| RPC                                   | Input                                                                                                          | Behaviour                                                                                                                                                                                                                                                                     | Errors (SQLSTATE)                               |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `persona_create_with_configuration`   | name, description, audience, purpose, `p_fields`, `p_overrides`, `p_sections` (jsonb arrays), `p_make_default` | Creates an active, private Persona with **all** configuration, 7 selection rows (absent fields excluded), overrides, sections and optionally the single default, in one transaction. Version 1, one `created` revision. Inserts the caller's own `accounts` anchor if absent. | 28000, 22023, 23505 (active name), 23503, 23514 |
| `persona_update_metadata`             | id, expected version, name, slug, description, audience, purpose                                               | Replaces the five metadata fields.                                                                                                                                                                                                                                            | 28000, 22023, P0002, 40001, 55000, 23505, 23514 |
| `persona_apply_profile_field_changes` | id, expected version, `p_changes` (1-7 field changes)                                                          | Applies several field changes (inclusion, highlight, position, override set/blank/reset) as **one** version bump and **one** revision; any invalid entry rolls back all. Backs bulk actions, field reordering and multi-field saves.                                          | 28000, 22023, P0002, 40001, 55000, 23514        |
| `persona_upsert_section`              | id, expected version, section key, label, visibility                                                           | Creates or edits one section.                                                                                                                                                                                                                                                 | 28000, 22023, P0002, 40001, 55000, 23514        |
| `persona_reorder_sections`            | id, expected version, ordered section keys                                                                     | Sets the complete order in one statement (deferrable position constraint, validated with `SET CONSTRAINTS ... IMMEDIATE`).                                                                                                                                                    | 28000, 22023, P0002, 40001, 55000               |
| `persona_set_default`                 | id, expected version, flag                                                                                     | Sets or clears the single default; a replaced default is cleared and revised first.                                                                                                                                                                                           | 28000, 22023, P0002, 40001, 55000, 23505        |
| `persona_set_lifecycle`               | id, expected version, `active`\|`archived`                                                                     | Archive clears the default; restore stays non-default.                                                                                                                                                                                                                        | 28000, 22023, P0002, 40001, 23505               |
| `persona_duplicate`                   | source id, new name                                                                                            | Copies configuration into a new non-default Persona; the source is unchanged.                                                                                                                                                                                                 | 28000, 22023, P0002, 23505, 23503, 23514        |
| `persona_delete`                      | id, expected version                                                                                           | Permanently deletes an **archived** Persona. Cascades (owner-run) purge **only that Persona's** sections, selections, overrides and revisions.                                                                                                                                | 28000, 22023, P0002, 40001, 55000, 23503        |

Error mapping in the application is by SQLSTATE (`persona-db-errors.ts`). `P0002` is raised for a missing **and** a foreign Persona (no ownership leak).

## 3. Application mutation → RPC

| Application operation (UI action)                                         | Service method      | Repository method          | RPC                                   |
| ------------------------------------------------------------------------- | ------------------- | -------------------------- | ------------------------------------- |
| Create Persona (step 4 of the flow)                                       | `create`            | `createWithConfiguration`  | `persona_create_with_configuration`   |
| Save details                                                              | `updateDetails`     | `updateMetadata`           | `persona_update_metadata`             |
| Include/exclude or highlight a field; save presentation                   | `applyFieldChanges` | `applyProfileFieldChanges` | `persona_apply_profile_field_changes` |
| Move a field up/down                                                      | `moveField`         | `applyProfileFieldChanges` | `persona_apply_profile_field_changes` |
| Bulk action (include all, exclude all, clear highlights, reset overrides) | `applyBulkAction`   | `applyProfileFieldChanges` | `persona_apply_profile_field_changes` |
| Show/hide or rename a section                                             | `saveSection`       | `upsertSection`            | `persona_upsert_section`              |
| Move a section up/down                                                    | `moveSection`       | `reorderSections`          | `persona_reorder_sections`            |
| Set or remove the default                                                 | `setDefault`        | `setDefault`               | `persona_set_default`                 |
| Archive or restore                                                        | `setLifecycle`      | `setLifecycle`             | `persona_set_lifecycle`               |
| Duplicate                                                                 | `duplicate`         | `duplicate`                | `persona_duplicate`                   |
| Permanently delete (archived only)                                        | `remove`            | `delete`                   | `persona_delete`                      |

Reads: the **list** is one PostgREST SELECT on `personas` with embedded children, filtered by `account_id` and RLS; a **single Persona** is read with `persona_detail_json` (owner-scoped, `NULL` for a missing or foreign Persona). Both were exercised against the real database in the first hosted run. The bulk _preview_ performs no mutation.

## 4. Required privileges and policies

Generated from `002` and `003`; a test fails if this section and the SQL disagree.

### Policies (16)

| Table                              | Command | Policy                                            | Role          | Predicate                                                                                   |
| ---------------------------------- | ------- | ------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------- |
| `personas`                         | SELECT  | `personas_select_own`                             | authenticated | owner (`account_id = auth.uid()`)                                                           |
| `personas`                         | INSERT  | `personas_insert_rpc_own`                         | authenticated | owner (`account_id = auth.uid()`) + **request-path gate**                                   |
| `personas`                         | UPDATE  | `personas_update_rpc_own`                         | authenticated | owner (`account_id = auth.uid()`) + **request-path gate**                                   |
| `personas`                         | DELETE  | `personas_delete_rpc_own`                         | authenticated | owner (`account_id = auth.uid()`) + **request-path gate**                                   |
| `persona_sections`                 | SELECT  | `persona_sections_select_own`                     | authenticated | owner (`account_id = auth.uid()`)                                                           |
| `persona_sections`                 | INSERT  | `persona_sections_insert_rpc_own`                 | authenticated | owner (`account_id = auth.uid()`) + **request-path gate**                                   |
| `persona_sections`                 | UPDATE  | `persona_sections_update_rpc_own`                 | authenticated | owner (`account_id = auth.uid()`) + **request-path gate**                                   |
| `persona_profile_field_selections` | SELECT  | `persona_profile_field_selections_select_own`     | authenticated | owner (`account_id = auth.uid()`)                                                           |
| `persona_profile_field_selections` | INSERT  | `persona_profile_field_selections_insert_rpc_own` | authenticated | owner (`account_id = auth.uid()`) + **request-path gate**                                   |
| `persona_profile_field_selections` | UPDATE  | `persona_profile_field_selections_update_rpc_own` | authenticated | owner (`account_id = auth.uid()`) + **request-path gate**                                   |
| `persona_profile_overrides`        | SELECT  | `persona_profile_overrides_select_own`            | authenticated | owner (`account_id = auth.uid()`)                                                           |
| `persona_profile_overrides`        | INSERT  | `persona_profile_overrides_insert_rpc_own`        | authenticated | owner (`account_id = auth.uid()`) + **request-path gate**                                   |
| `persona_profile_overrides`        | UPDATE  | `persona_profile_overrides_update_rpc_own`        | authenticated | owner (`account_id = auth.uid()`) + **request-path gate**                                   |
| `persona_profile_overrides`        | DELETE  | `persona_profile_overrides_delete_rpc_own`        | authenticated | owner (`account_id = auth.uid()`) + **request-path gate**                                   |
| `persona_revisions`                | SELECT  | `persona_revisions_select_own`                    | authenticated | owner (`account_id = auth.uid()`)                                                           |
| `persona_revisions`                | INSERT  | `persona_revisions_insert_rpc_own`                | authenticated | owner (`account_id = auth.uid()`) + actor (`actor_id = auth.uid()`) + **request-path gate** |

### Grants to `authenticated` (every other API role holds none)

| Table                              | Privilege (authenticated) | Columns                                                                                          |
| ---------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------ |
| `personas`                         | SELECT                    | all columns (table-level; RLS limits rows)                                                       |
| `personas`                         | INSERT                    | account_id, name, slug, description, audience, purpose, position                                 |
| `personas`                         | UPDATE                    | name, slug, description, audience, purpose, status, is_default, version, updated_at, archived_at |
| `personas`                         | DELETE                    | all columns (table-level; RLS limits rows)                                                       |
| `persona_sections`                 | SELECT                    | all columns (table-level; RLS limits rows)                                                       |
| `persona_sections`                 | INSERT                    | persona_id, account_id, section_key, label_override, is_visible, position                        |
| `persona_sections`                 | UPDATE                    | label_override, is_visible, position, updated_at                                                 |
| `persona_profile_field_selections` | SELECT                    | all columns (table-level; RLS limits rows)                                                       |
| `persona_profile_field_selections` | INSERT                    | persona_id, account_id, field_key, is_included, position, is_highlighted                         |
| `persona_profile_field_selections` | UPDATE                    | is_included, position, is_highlighted, updated_at                                                |
| `persona_profile_overrides`        | SELECT                    | all columns (table-level; RLS limits rows)                                                       |
| `persona_profile_overrides`        | INSERT                    | persona_id, account_id, field_key, override_value                                                |
| `persona_profile_overrides`        | UPDATE                    | override_value, override_version, updated_at                                                     |
| `persona_profile_overrides`        | DELETE                    | all columns (table-level; RLS limits rows)                                                       |
| `persona_revisions`                | SELECT                    | all columns (table-level; RLS limits rows)                                                       |
| `persona_revisions`                | INSERT                    | persona_id, account_id, actor_id, revision_number, event_type, configuration_payload             |

### Functions (11)

| Function                              | Arguments                                                                                                                                                     | Returns   | Language | Volatility | Security    | `search_path` | EXECUTE granted to   | Gate allowlist | File |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------- | ---------- | ----------- | ------------- | -------------------- | -------------- | ---- |
| `persona_apply_profile_field_changes` | `p_persona_id uuid, p_expected_version integer, p_changes jsonb`                                                                                              | `jsonb`   | plpgsql  | VOLATILE   | **INVOKER** | `''`          | `authenticated` only | yes            | 003  |
| `persona_create_with_configuration`   | `p_name text, p_description text, p_audience text, p_purpose text, p_fields jsonb, p_overrides jsonb, p_sections jsonb, p_make_default boolean DEFAULT false` | `jsonb`   | plpgsql  | VOLATILE   | **INVOKER** | `''`          | `authenticated` only | yes            | 003  |
| `persona_delete`                      | `p_persona_id uuid, p_expected_version integer`                                                                                                               | `uuid`    | plpgsql  | VOLATILE   | **INVOKER** | `''`          | `authenticated` only | yes            | 003  |
| `persona_detail_json`                 | `p_persona_id uuid`                                                                                                                                           | `jsonb`   | sql      | VOLATILE   | **INVOKER** | `''`          | `authenticated` only | no             | 003  |
| `persona_duplicate`                   | `p_source_persona_id uuid, p_new_name text`                                                                                                                   | `jsonb`   | plpgsql  | VOLATILE   | **INVOKER** | `''`          | `authenticated` only | yes            | 003  |
| `persona_reorder_sections`            | `p_persona_id uuid, p_expected_version integer, p_section_keys text[]`                                                                                        | `jsonb`   | plpgsql  | VOLATILE   | **INVOKER** | `''`          | `authenticated` only | yes            | 003  |
| `persona_set_default`                 | `p_persona_id uuid, p_expected_version integer, p_is_default boolean DEFAULT true`                                                                            | `jsonb`   | plpgsql  | VOLATILE   | **INVOKER** | `''`          | `authenticated` only | yes            | 003  |
| `persona_set_lifecycle`               | `p_persona_id uuid, p_expected_version integer, p_status text`                                                                                                | `jsonb`   | plpgsql  | VOLATILE   | **INVOKER** | `''`          | `authenticated` only | yes            | 003  |
| `persona_update_metadata`             | `p_persona_id uuid, p_expected_version integer, p_name text, p_slug text, p_description text, p_audience text, p_purpose text`                                | `jsonb`   | plpgsql  | VOLATILE   | **INVOKER** | `''`          | `authenticated` only | yes            | 003  |
| `persona_upsert_section`              | `p_persona_id uuid, p_expected_version integer, p_section_key text, p_label_override text, p_is_visible boolean`                                              | `jsonb`   | plpgsql  | VOLATILE   | **INVOKER** | `''`          | `authenticated` only | yes            | 003  |
| `persona_write_rpc_context`           | `—`                                                                                                                                                           | `boolean` | sql      | STABLE     | **INVOKER** | `''`          | `authenticated` only | no             | 002  |

Other required privileges (not granted by this package):

- `authenticated` needs `USAGE` on schema `public` and `EXECUTE` on `auth.uid()` (both checked by the preconditions).
- Milestone 2 already grants `authenticated` `SELECT, INSERT` on `public.accounts` with the `accounts_insert_own` policy (`id = auth.uid()`); the create RPC relies on it for its own-anchor insert.
- `anon`, `service_role` and `PUBLIC` hold **no** privilege on any Persona table or function.
- Cascades (`ON DELETE CASCADE`) run as the table owner and need no grant; this is why `persona_sections` and `persona_profile_field_selections` have no DELETE grant and `persona_revisions` has no UPDATE or DELETE at all.

## 5. Functions and execution grants

See the generated function table in section 4. Summary: **11** functions (nine mutations, the gate helper, and the read-only `persona_detail_json`), **all `SECURITY INVOKER`**, **none `SECURITY DEFINER`**, all with `search_path` set to the empty string, `EXECUTE` revoked from `PUBLIC`, `anon` and `service_role` and granted to `authenticated` only, on exact signatures. `persona_detail_json` is callable as an RPC; it is read-only, owner-scoped on every subquery and cannot return another user's data. It is deliberately **not** on the gate allowlist (it writes nothing).

## 6. Master Identity

**No Persona function modifies `identity_profiles`, and none reads it.**

- `identity_profiles` appears in **no executable statement** of `001`-`003` (enforced by a test and asserted again at deployment: `003` aborts if any Persona function body references it).
- The foreign key from field selections to `identity_profiles` was removed (P-2, approved).
- The only Master Identity-adjacent write in the whole package is the approved D-8 anchor: `INSERT INTO public.accounts (id) VALUES (v_uid) ON CONFLICT (id) DO NOTHING` in `persona_create_with_configuration`, where `v_uid` is `auth.uid()`. It creates only the caller's own anchor row, never touches another account, and never creates or modifies `identity_profiles`. `003` aborts if any other Persona function writes `public.accounts`.

## 7. Atomicity: what is established and by what

| Property                               | By construction (static, runs now)                                                                                                                                                                                                                               | Failure injection (fixture contract, runs now)                                                                          | Hosted runtime (authored, **not run**)                                                                                             |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Creation** is all-or-nothing         | One function = one transaction; validation (22023) precedes the first write; writes ordered Persona, selections, overrides, sections, default switch, revision; no `COMMIT`/`ROLLBACK`/`SAVEPOINT`/`EXCEPTION`/dblink; the `created` revision is the final write | A failed revision (also while revising the replaced default) leaves no Persona, no children and no default change       | A failed create (invalid override) leaves no Persona and no revision; a successful create has 7 selections, 9 sections, 1 revision |
| **Bulk operations** are all-or-nothing | One RPC, one loop, **one** version bump and **one** revision after the loop; nothing written after the revision; a no-op returns before any write                                                                                                                | A failed revision undoes every field change, override and the bump; an invalid entry rejects the whole batch            | A batch with one valid and one invalid entry changes nothing                                                                       |
| **Revisions** match versions           | Every mutation writes its revision with the new version (`v_row.version`), as its last write; none for no-ops; one `UPDATE ... version + 1` per Persona                                                                                                          | Revision count equals version after every mutation; no-ops and rejections add none                                      | Revision numbers are exactly `1..version` for every Persona                                                                        |
| **Default changes** are all-or-nothing | One function: advisory lock, clear and revise the previous default, then set and revise the new one; partial unique index is the final invariant                                                                                                                 | Failing either revision restores both Personas untouched; archiving the default with a failed revision keeps it default | Concurrent switches leave exactly one default and no torn revision                                                                 |

Honest limits: atomicity **inside PostgreSQL** is established by construction and has **not been executed**. The failure-injection tests exercise the fixture adapter's copy-on-write transactions, and they prove the contract the application depends on, not PostgreSQL. The hosted tests are the runtime evidence and have not been run. No test injects a failure _inside_ a PostgreSQL function, because doing so would need a database fixture written as `postgres` (decision D-7 declined that); the API-reachable failures (invalid override, invalid highlight, stale version) fail after earlier statements have run, which is the property that matters.

## 8. Questions for the independent reviewer

Please look hardest at these; each is a place where syntax parsing cannot help.

1. **Gate semantics.** Is the exact-equality `request.method`/`request.path` check sufficient as an integrity control, given owner RLS is the isolation control? The diagnostic observed `/rpc/<fn>` with no prefix on mirror objects only.
2. **`ON CONFLICT (id) DO NOTHING` on `public.accounts` under RLS** (`accounts_insert_own`, FORCE RLS): does it behave as intended for a user whose row already exists and for one whose row does not?
3. **`persona_detail_json` as a `VOLATILE` read-only function** called as the last statement of each RPC: does it see that transaction's writes (it should, being VOLATILE), and is its exposure as a callable RPC acceptable?
4. **`jsonb_to_recordset` typing.** A malformed element raises `22P02`/`22023`, mapped to a generic invalid-input error. Any path that could surface as an unmapped state?
5. **Deferred `UNIQUE (persona_id, position)`.** `create` pre-validates duplicate section positions (22023) so a violation cannot first appear at commit; `reorder` uses `SET CONSTRAINTS ... IMMEDIATE`. Any remaining commit-time failure path?
6. **Advisory lock** `hashtextextended('folioone.persona:' || uid, 0)`: taken by create, set_default, set_lifecycle and duplicate, not by the others (they take row locks). Lock ordering was reviewed as deadlock-free: advisory first, then one Persona row at a time, except `set_default` (target then previous default) which the advisory lock serializes.
7. **PostgREST embedding** of children through the composite foreign keys `(persona_id, account_id)` for the read path: does one select resolve all four relationships unambiguously?
8. **GraphQL.** pg_graphql may reflect the tables for `authenticated` (SELECT privilege). Writes through `/graphql/v1` carry `request.path = '/rpc/graphql'` and must fail the gate; this is unverified until the hosted test runs. Approved condition: fail closed, and **stop and report** if any unauthorized path appears.
9. **Revision purge on delete** (approved D-2): scope is only the deleted Persona's rows, via the composite `ON DELETE CASCADE`. Confirm no other Persona's history can be affected.
10. **No quotas** (approved D-5 for the MVP): to be revisited before public launch.

## 9. Validation status

| Evidence                                                                                                | Result                                             |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| PostgreSQL grammar parse of every statement and every PL/pgSQL / SQL function body                      | passes (98 statements, 18 bodies); **syntax only** |
| Static package guard (`tests/persona-sql-package.test.ts`)                                              | passes; mutation-checked                           |
| Application tests (adapter against a fake client, contract on the fixture, failure injection, boundary) | pass                                               |
| Catalog verification, hosted two-user tests                                                             | **authored, not run**                              |
| SQL executed anywhere                                                                                   | **no**                                             |

## 10. Post-deployment update (first hosted run)

`001`-`003` were reported executed by the developer. The first hosted integration run found that a **stale expected version (SQLSTATE `40001`) never returns through PostgREST**, while every other error class returns in under 250 ms. `004-persona-version-conflict-sqlstate.sql` is the proposed forward fix: it redeploys the seven version-checking functions with `PT409` instead of `40001` and changes nothing else. It is pending review and **not executed**; until it is, the error table in section 2 reads `40001` as deployed, and `PT409` after `004`. Everything else in the hosted run passed. See the decision record, section 10.
