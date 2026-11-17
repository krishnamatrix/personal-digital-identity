# Folioone canonical schema package (`folioone`)

**Status: PREPARED, NOT EXECUTED on any hosted project.** Everything here is generated from the approved SQL (see "How this was produced"). Local validation passing does not mean the hosted project is migrated; hosted migration is complete only after the developer runs these files and supplies the catalog verification output.

`folioone` is the single application schema in every environment. Environments are separated by **Supabase project and credentials**, not by schema name. Staging and (future) production are different Supabase projects that both use `folioone`.

## What this package does and does not touch

- Creates schema `folioone` and everything the application owns inside it.
- **Does not** modify, rename, drop or grant on anything in `public`.
- **Does not** read or modify `auth.users` or any Auth user (the new `accounts` table references `auth.users(id)` as before).
- **Does not** copy existing development records. `folioone` starts empty; users initialise their account and profile through the application as before.
- No service-role key, no custom roles, no `SECURITY DEFINER`, every function `SECURITY INVOKER` with an empty `search_path`.

## Execution order (manual, Supabase SQL Editor, as `postgres`)

Run each file completely, in order. The editor shows only the last result set, so run the verification file one numbered section at a time.

| Step | File                             | Kind                  | Prerequisite | Expected result                                                                      |
| ---- | -------------------------------- | --------------------- | ------------ | ------------------------------------------------------------------------------------ |
| 0    | `public-snapshot.sql`            | read-only, repeatable | none         | A fingerprint table; **save it**                                                     |
| 1    | `001-create-schema.sql`          | one-time              | step 0 saved | `COMMIT`; schema `folioone` exists, owner `postgres`, `authenticated` has USAGE only |
| 2    | `002-identity-tables.sql`        | one-time              | 001          | `COMMIT`; tables `accounts`, `identity_profiles`                                     |
| 3    | `003-identity-rls.sql`           | one-time              | 002          | `COMMIT`; RLS enabled and forced, 5 policies, owner-only grants                      |
| 4    | `004-persona-tables.sql`         | one-time              | 003          | `COMMIT`; five Persona tables created locked down                                    |
| 5    | `005-persona-rls-and-grants.sql` | one-time              | 004          | `COMMIT`; write-context helper, 16 policies, column-level grants                     |
| 6    | `006-persona-functions.sql`      | one-time              | 005          | `COMMIT`; 9 mutation RPCs + `persona_detail_json`, PT409 version conflicts           |
| 7    | `public-snapshot.sql` again      | read-only             | 006          | **Identical** to step 0, row for row, including TOTAL                                |
| 8    | `007-verify-catalog.sql`         | read-only, repeatable | 006          | See the expectations written above each section                                      |

One-time files contain enforced preflights: running one twice, or out of order, raises an exception and changes nothing (each file is a single transaction). If a file fails, fix the cause and run that file again; do not rerun files that succeeded.

There is no `007-persona-pt409-correction`: the approved final definitions (migration 004, `PT409` instead of `40001` for a stale version) are built directly into `006-persona-functions.sql`, so the schema never contains the `40001` version. `scripts/schema` tests prove that these function bodies equal the approved 004 bodies apart from the schema name.

## Supabase Dashboard configuration (manual; not done by the assistant)

After step 6, expose the schema through the Data API:

1. Dashboard → **Project Settings → Data API** (older UI: _API Settings_) → **Exposed schemas**.
2. **Add** `folioone`. Leave `public` and `graphql_public` as they are (existing development data keeps working). Do **not** put `folioone` into _Extra search path_.
3. Save. Supabase restarts/reloads the API configuration. If the schema is not visible immediately, run `NOTIFY pgrst, 'reload schema';` in the SQL Editor.
4. The Data API role grants are already part of the package: `USAGE` on the schema, and the table/column/function privileges to `authenticated` only (no `anon`, no `service_role`). Do not add grants.
5. The application selects the schema through one constant, `FOLIOONE_SCHEMA` in `src/lib/db-schema.ts`, passed as the Supabase client `db.schema` for the server, browser and middleware clients. That makes PostgREST send `Accept-Profile: folioone` / `Content-Profile: folioone`. There is no environment variable and no fallback to `public`.
6. GraphQL: leave `pg_graphql` disabled (status unchanged by this package).

## Verifying

- `007-verify-catalog.sql`: tables (7), RLS enabled and forced, privileges, policies (21), functions (11, SECURITY INVOKER, empty search_path, `PT409` in 7 and `40001` in none), exposure paths, plus the folioone addendum (sections 9-11: schema ACL, inventory, no dependency on `public`).
- `public-snapshot.sql` before and after: identical.
- Runtime isolation, RPC authorisation, version conflicts and the request-path gate are **not** shown by catalog queries. They are shown by the opt-in hosted suites (`pnpm test:persona-db`, `pnpm test:rls`, ...), which now target `folioone`, and which the developer runs deliberately against the project.

## Rollback

See `rollback.sql`. Nothing runs automatically; every statement is commented out. Because `folioone` is a self-contained new schema, the cleanest rollback is dropping that schema alone, which cannot affect `public` or Auth.

## How this was produced

`scripts/schema/generate-folioone-sql.mjs` reads the approved sources (`docs/sql/milestone-2/001-002`, `docs/sql/milestone-3c/001-004`, `verify-catalog.sql`, `rollback.sql`) and applies a fixed, ordered list of syntax-aware rules: schema qualifiers (`public.x`), schema-name string literals (`'public'`), the phrase `schema public`, the escaped qualifier inside one regular expression, and the `40001`→`PT409` literal. Each rule has a pinned expected replacement count per file, the `PUBLIC` role keyword is never changed, and a final scan fails if any other lowercase `public` remains. Regenerate with `pnpm schema:generate`; `pnpm test` fails if the committed files differ from the generator's output. Do not edit generated files by hand.
