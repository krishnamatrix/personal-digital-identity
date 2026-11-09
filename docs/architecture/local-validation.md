# Local-first validation (`pnpm validate`)

Everything that must pass before code is pushed runs on the developer's machine against a **local** Supabase stack. The normal workflow never contacts a hosted Supabase project. All application data is in the canonical schema **`folioone`** ([AD-008](architecture-decisions.md), [database-schema-folioone.md](database-schema-folioone.md)).

## Prerequisites

- Node 20.9+, pnpm 10, the Supabase CLI (tested with 2.23.4) and a container runtime (Docker Desktop, Colima or OrbStack).
- The first run pulls the Supabase images (about 1–2 GB). Playwright's Chromium must already be installed (`pnpm exec playwright install chromium`).
- Do not run `pnpm dev` at the same time: validation rebuilds `.next`.
- If the container daemon is not reachable the run **fails with a diagnostic**; it never skips the database or browser tests.

## Commands

| Command                                          | What it does                                                                                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm validate`                                  | The full workflow below. Exit code 0 only if every step passed.                                                                                 |
| `pnpm validate --keep`                           | Same, but leaves local Supabase running afterwards for debugging.                                                                               |
| `pnpm validate --no-e2e`                         | Stops after the production build (the `public` check still runs).                                                                               |
| `pnpm validate --public-decoy`                   | Also installs the ORIGINAL `public`-schema package first, to mirror the hosted development project, and proves it is byte-identical afterwards. |
| `pnpm schema:generate` / `pnpm schema:check`     | Regenerate / verify `docs/sql/folioone-schema/` from the approved sources.                                                                      |
| `pnpm supabase:local:start` / `:stop` / `:reset` | Manage the local stack by hand (`stop` discards data; `reset` recreates an empty database; `reset` leaves `folioone` uncreated).                |

## What `pnpm validate` runs, in order

1. Preflight (container runtime, Supabase CLI).
2. `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` (unit tests, fixture adapter, no database; includes the schema-package and guard tests).
3. **Stop and start local Supabase** (`supabase/config.toml`, project id `folioone-local`: Postgres, Auth, PostgREST; exposed schemas `public`, `graphql_public`, `folioone`). A running stack is never reused, because it may carry an older configuration.
4. Read the local API URL and anon key from `supabase status` (the service-role key, JWT secret and database URL are never read).
5. Prove that env-file loading cannot redirect the run: the effective `NEXT_PUBLIC_SUPABASE_URL` after loading `.env*` must be loopback.
6. Check that `docs/sql/folioone-schema/` equals the generator's output (no drift from the approved sources).
7. `supabase db reset --local --no-seed`: a clean database. _(With `--public-decoy`: install the original public package.)_
8. Fingerprint schema `public` (before).
9. Apply the canonical package **verbatim** as `postgres`: `001-create-schema` … `006-persona-functions`, reload the PostgREST schema cache, run `007-verify-catalog.sql` (output kept in `.validate/verify-catalog.local.txt`).
10. Assert the catalog: 11 functions, 7 with `PT409`, none with `40001`, none SECURITY DEFINER, none mentioning `public.`, 7 tables with RLS enabled and forced, 21 policies; `public` holds 0 application tables (7 with `--public-decoy`).
11. Create five dedicated users (`local-{a,b,c,d,dev}@folioone.test`, random passwords held in memory) through **Auth sign-up with the anon key**. No service role.
12. Prove `folioone` is served by the Data API and that a request with **no schema header** cannot reach application tables (404, relation does not exist).
13. Database/RLS suites with real local Auth and PostgREST, no mocks, all through `db.schema = folioone`: `rls-isolation` (M2 tables), `persona-persistence` (34 tests), `persona-anchor-absent`, `persona-anchor-concurrent`.
14. `pnpm build` with the local configuration and `PERSONA_STORAGE=supabase`; then scan the build for `.supabase.co`.
15. Headless Playwright against `next start` of that build: all of `e2e/` (sign-in, account initialisation, Persona journeys, isolation, stale version, health check, and the post-deployment smoke suite `staging-smoke.spec.ts`, so that suite is verified before it is pointed at staging).
16. **Schema `public` unchanged**: the fingerprint (relations, function definitions, policies, columns, ACLs, row counts) must equal step 8, and every `public` table must have 0 rows.
17. Cleanup in a `finally` block (also on Ctrl-C): `supabase stop --no-backup`, unless `--keep`.

## Environment separation

| Environment                        | Supabase project                                   | Schema     | Settings come from                                                 |
| ---------------------------------- | -------------------------------------------------- | ---------- | ------------------------------------------------------------------ |
| Local development (`pnpm dev`)     | developer's choice; the local stack is recommended | `folioone` | `.env.local` (developer-owned)                                     |
| Local validation (`pnpm validate`) | local Docker stack, recreated every run            | `folioone` | the orchestrator's process environment only                        |
| Railway staging                    | the hosted Supabase project                        | `folioone` | Railway variables ([railway-deployment.md](railway-deployment.md)) |
| Production (future)                | a **separate** Supabase project                    | `folioone` | its own variables; never shared with staging                       |

## Safeguards against hosted connections (layered)

1. Child processes get an explicit environment: inherited `FOLIOONE_*`, `SUPABASE_*`, `NEXT_PUBLIC_SUPABASE*`, `PERSONA_STORAGE`, `DATABASE_URL` values are removed first; process-environment values take precedence over `.env.local`.
2. `NEXT_PUBLIC_SUPABASE_URL` is asserted loopback before use and again after env-file loading.
3. `vitest.local.config.ts` and `playwright.local.config.ts` refuse to start without `FOLIOONE_VALIDATE=1` and refuse a non-loopback Supabase URL.
4. The Vitest setup file wraps `fetch` so any request to a non-loopback host fails immediately.
5. The Playwright config never loads `.env.local`.
6. After the build, `.next/static` and `.next/server` are scanned for `.supabase.co`.
7. `tests/local-validation-workflow.test.ts` (part of `pnpm test`) pins these properties, including that the scripts never reference the service-role key, JWT secret or a database URL.

The hosted opt-in scripts (`pnpm test:persona-db`, `test:rls`, `test:e2e`, `test:persona-anchor`, `test:persona-concurrency`, `playwright.supabase.config.ts`) are not part of `pnpm validate`. They now target `folioone` and therefore **require the hosted schema package to have been executed** (see [database-schema-folioone.md](database-schema-folioone.md)).

## How local differs from hosted (read before trusting a pass)

- `pg_graphql` is installed locally; on the hosted development project it is not enabled.
- Postgres major version is 15 (CLI default); the hosted version has not been checked.
- Auth rate limits are raised locally so repeated sign-ins are not throttled.
- Storage, Realtime, Studio, mail capture and edge functions are off because the app uses none of them.
- Local keys are the standard public local-development keys.
- Locally `folioone` is created by the package on an empty database. Hosted additionally has pre-existing `public` objects and data (mirrored by `--public-decoy`) and the Dashboard "Exposed schemas" step, which is a manual action that local configuration only imitates.
- **Local validation says nothing about the hosted project until the package has been executed there and its verification supplied.**
