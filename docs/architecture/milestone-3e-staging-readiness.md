# Milestone 3E — Concurrency Validation and Staging Readiness

Date: 2026-11-09. Development Supabase project only. No SQL executed by the assistant; no database object changed; no commit; `PERSONA_STORAGE` default remains `fixture`.

Evidence labels: **VERIFIED** (observed by the assistant), **REPORTED** (developer statement, output unseen), **AUTHORED** (written, not run), **OPEN**.

## Current staging-readiness tracker (updated after the `folioone` cutover; supersedes the checklist in §4 and the blocker list in §5)

Decisions now fixed: schema `folioone` in every environment; the **existing hosted Supabase project is reused for staging**; production will be a separate project with the same schema name.

| #   | Item                                                   | Status                                                     | Detail                                                                                                                                                          |
| --- | ------------------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Application uses `folioone`                            | **Implemented, locally verified**                          | one constant, all clients typed and configured, no fallback to `public`; local `pnpm validate` (clean and `--public-decoy`)                                     |
| 2   | Hosted `folioone` package executed                     | **Reported by developer; partly verified**                 | sections 9, 10, 11c and the `public` before/after snapshot supplied; `007` sections 1-8, 11a, 11b and confirmation of the snapshot's "before" label outstanding |
| 3   | Hosted exposed-schema configuration (Dashboard)        | **Prepared, awaiting manual action**                       | [hosted-supabase-staging-setup.md](hosted-supabase-staging-setup.md); no confirmation received                                                                  |
| 4   | Railway environment configuration                      | **Prepared, not applied**                                  | [railway-deployment.md](railway-deployment.md); no live change made                                                                                             |
| 5   | Post-deployment smoke suite                            | **Implemented, locally verified; not run against staging** | `pnpm smoke:staging`; also part of `pnpm validate`                                                                                                              |
| 6   | Health endpoint                                        | **Implemented, locally verified**                          | `/api/health` (liveness only)                                                                                                                                   |
| 7   | Logging                                                | **Implemented (stdout JSON)**                              | `src/instrumentation.ts`; sanitized, no PII/headers/bodies                                                                                                      |
| 8   | Error-monitoring service                               | **Not implemented**                                        | logging only; no alerting/grouping                                                                                                                              |
| 9   | Security headers and CSP                               | **Not implemented**                                        | `next.config.ts` sets none                                                                                                                                      |
| 10  | Backup and recovery verification                       | **Not verified**                                           | plan tier, PITR and a restore drill unknown                                                                                                                     |
| 11  | Quota enforcement                                      | **Not implemented**                                        | proposal in §3 only; `persona_upsert_section` has no section cap                                                                                                |
| 12  | GraphQL catalog evidence                               | **Open**                                                   | runtime verified (disabled in dev); `verify-graphql-evidence.sql` output not received                                                                           |
| 13  | Auth redirect/email settings on the hosted project     | **Open**                                                   | Site URL, redirects, confirmation, dedicated smoke users                                                                                                        |
| 14  | Concurrency, RLS, RPCs on hosted `folioone` at runtime | **Not run**                                                | the opt-in hosted suites now target `folioone`; run only on the developer's go-ahead                                                                            |

**Staging deployment is not yet authorized** by this tracker: items 2 (rest), 3, 4, 13 are the developer's manual steps; items 8-12 are not done. Nothing above is claimed complete beyond what is stated.

> Sections 4 and 5 below are the earlier (pre-cutover) checklist, kept as history.

## 1. Concurrent first-time creation (Task 1)

### Contract (from `003`, `persona_create_with_configuration`)

Established by reading the function, not assumed:

- After validation, each create takes `pg_advisory_xact_lock(hashtextextended('folioone.persona:' || uid, 0))` **before** the account-anchor insert. Concurrent creates for one account therefore **serialise**; none fails because of the race.
- Anchor: `INSERT INTO accounts … ON CONFLICT (id) DO NOTHING`, inside the lock. One anchor results regardless of order.
- Position: `MAX(position)+1` read under the lock → distinct creates get distinct positions (0, 1, …).
- Names: unique index `personas_account_active_name_unique`. Two creates with the **same** name: the second, after the first commits, hits 23505 → `duplicate` and rolls back whole.
- Default: `p_make_default` clears the previous active default (its version +1 and a `default_changed` revision) then sets the new one **without** a version bump. `personas_one_active_default_per_account` is the backstop.
- Atomicity: one transaction per call; one `created` revision numbered 1 per new Persona.

### Expected outcomes the test asserts

| Scenario                                                         | Expected                                                                                                                                                                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. First-time race (anchor absent), distinct names, same session | both fulfilled; exactly 1 anchor (id = C); 2 Personas at positions 0 and 1, each version 1, not default, 7 selections, 9 sections, exactly one revision `{1, created, actor C}`; each call returned its own Persona |
| 2. Same name (anchor now present)                                | exactly one fulfilled, one rejected with `duplicate`; 1 Persona with that name, 1 revision; still 1 anchor                                                                                                          |
| 3. Both `makeDefault` (anchor present)                           | both fulfilled; exactly one active default; winner version 1 (`created`); displaced version 2 with revisions `[1 created, 2 default_changed]`                                                                       |
| Isolation / cleanup                                              | user A cannot see C's Personas; cleanup touches only C's Personas carrying this run's tag, then asserts none remain                                                                                                 |

Only scenario 1 is a _first-time_ race; scenarios 2 and 3 run on the existing anchor and are labelled so.

### Status: **VERIFIED** (2026-11-09, user C; run by the assistant after the developer-run cleanup)

`FOLIOONE_PERSONA_CONCURRENCY_TEST=1 pnpm test:persona-concurrency` → **1 passed** (8.6 s). The precondition (C has no `accounts` row, no Personas) was checked by the test and confirmed by a read beforehand.

| Scenario                                         | Result                                                                                                                                                                                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. First-time race, distinct names, same session | both fulfilled; one anchor (id = C); positions 0 and 1; each version 1, 7 selections, 9 sections, one revision `{1, created, actor C}`; each call returned its own Persona. The two RPC requests **overlapped in time** (measured) |
| 2. Same name (anchor present)                    | one fulfilled, one `duplicate`; one Persona, one revision; one anchor. Requests overlapped                                                                                                                                         |
| 3. Both `makeDefault` (anchor present)           | both fulfilled; exactly one default; winner version 1; displaced version 2 with revisions `[1 created, 2 default_changed]`. Requests overlapped                                                                                    |
| Isolation, cleanup                               | A cannot see C's Personas; C's tagged Personas deleted and none remain. State afterwards: C has an anchor and no Personas                                                                                                          |

Limits: one run, one user, two racing requests at a time, with a single session; scenarios 2 and 3 are not first-time races. Overlap was observed, not forced; a pass does not prove every interleaving. Sustained or higher-fan-out contention is untested. The anchor remains by design; rerunning needs the cleanup again.

## 2. GraphQL catalog evidence (Task 2)

What the existing sections verify (`verify-catalog.sql`):

- **6b**: whether `pg_graphql`/`pg_net` are installed. Informational; the file itself says it must not be reported as a pass.
- **6c**: default privileges for _future_ objects in `public`. Does not examine existing objects.

Prepared: `docs/sql/milestone-3c/verify-graphql-evidence.sql` (4 read-only statements; parses). G1/G2 are 6b/6c verbatim. G3/G4 are supplementary lookups I drafted and flag as such: GraphQL schemas present, and whether `anon`/`authenticated` can EXECUTE `graphql_public.graphql`. Nothing in it changes privileges.

| Evidence                                                                                                                                           | Status                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Runtime: anon and authenticated → `pg_graphql extension is not enabled.`; no mutation reachable; direct writes rejected; writes only via nine RPCs | **VERIFIED** (M3D)                        |
| Catalog: 6b/6c output                                                                                                                              | **OPEN** — developer-run, output not seen |
| Catalog: G3/G4                                                                                                                                     | **OPEN** — not yet run                    |

Runtime and catalog evidence are kept separate; the runtime result does not substitute for the catalog result, and describes only today's state.

## 3. Proposed quota and rate-limit policy (Task 3) — PROPOSAL ONLY, nothing implemented

### Current enforced constraints (VERIFIED in `001`/`003` source)

| Area                 | Today                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Persona text         | name 1–100, description ≤500, audience ≤200, purpose ≤200 chars                                                        |
| Sections             | key 1–80, label ≤100; **create** accepts ≤50 sections; **`persona_upsert_section` has NO cap on sections per Persona** |
| Fields               | exactly 7 field keys; ≤7 overrides; override values limited per field (≤120/180/2000/160/2048)                         |
| Personas per account | **no cap** (active or archived)                                                                                        |
| Revisions            | one per mutation, **never pruned** while the Persona exists; purged only when the Persona is permanently deleted       |
| Rate                 | **none** at the application or database layer; Supabase platform/Auth limits only                                      |
| Request size         | Next.js Server Action default body limit (1 MB; `next.config.ts` sets none); PostgREST platform limits                 |

**Finding (not changed):** the 50-section limit exists only at creation; repeated `persona_upsert_section` calls with new keys can grow a Persona without bound (each also adds a revision). Closing it needs an SQL change, which was not made.

### Proposed initial staging policy (product policy, not yet true)

| Limit                       | Proposal                                                                                                                                        | Where it would live                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Active Personas / account   | 25                                                                                                                                              | create/duplicate/restore RPCs (new SQL, count under the existing advisory lock); UI message |
| Archived Personas / account | 100                                                                                                                                             | archive RPC; or none, since archived rows are inert                                         |
| Sections / Persona          | 20 enforced on create **and** upsert (starter set is 9)                                                                                         | create + upsert RPCs                                                                        |
| Revisions / Persona         | keep the latest 200 (retain revision 1 `created`); prune in the same transaction that inserts the next revision                                 | RPC change; requires a decision because `verify-catalog.sql` 8a assumes revisions = version |
| Mutation rate               | 60 mutations/min/user, 10 creates/min/user, enforced at the edge/server action first (no new infra); database enforcement only if abuse appears | app layer (Server Actions) or platform WAF                                                  |
| Payload                     | keep field limits above; explicit `serverActions.bodySizeLimit` of 256 kB for Persona actions; reject unknown JSON keys at the Zod boundary     | `next.config.ts`, Zod schemas                                                               |

Open decisions for the developer: whether revision pruning is acceptable given the "history" promise; whether limits are per plan; whether to revisit before public launch (the standing M3C decision).

## 4. Staging checklist (Task 4)

Status key: PASS (evidence), FAIL (defect), OPEN (cannot be shown from the repository or dev project).

| #   | Area                              | Status                                           | Basis                                                                                                                                                                                     |
| --- | --------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Secrets in app/config             | **PASS**                                         | No service-role key, `DATABASE_URL` or postgres credential anywhere in `src`; `.env*` git-ignored except examples; `PERSONA_STORAGE` is server-only and validated (`src/lib/env.ts`)      |
| 2   | Secrets in staging host           | **OPEN**                                         | Host secret store not configured/inspected; test-account credentials must NOT exist in staging env                                                                                        |
| 3   | Separate staging Supabase project | **OPEN (critical)**                              | Only the development project has been used. A staging project must be created, and SQL 001–004 + `verify-catalog.sql` run there by the developer; no production project may be referenced |
| 4   | Auth redirect URLs / site URL     | **OPEN**                                         | App uses password sign-in only (no sign-up, no reset flow, no `redirectTo`); dashboard Site URL / redirect allow-list for the staging origin unverified                                   |
| 5   | Auth email / signup settings      | **OPEN**                                         | Email confirmation, SMTP, signup enablement, rate limits unverified; there is no password-reset path in the app (known gap)                                                               |
| 6   | Storage                           | **PASS (code) / OPEN (project)**                 | No Supabase Storage usage in `src`; confirm no buckets/policies in the staging project                                                                                                    |
| 7   | RLS                               | **PASS in dev (hosted suite) / OPEN in staging** | Re-run suite and catalog verification against staging                                                                                                                                     |
| 8   | GraphQL                           | **PASS at runtime in dev / catalog OPEN**        | See §2                                                                                                                                                                                    |
| 9   | Logging                           | **PARTIAL**                                      | One server-side `console.error` (name + message only, no payloads, not sent to the client). No structured logging or request correlation                                                  |
| 10  | Error monitoring                  | **FAIL (gap)**                                   | No error-tracking service configured                                                                                                                                                      |
| 11  | Backup / recovery                 | **OPEN**                                         | Plan tier, PITR and restore drill unknown; `rollback.sql` is commented guidance only; note 004's PT409 change must not be rolled back to 40001                                            |
| 12  | Build                             | **PASS**                                         | `pnpm build`, typecheck, lint, 348 unit tests (VERIFIED); Node ≥20.9, pnpm 10 pinned                                                                                                      |
| 13  | Deployment config                 | **OPEN**                                         | No CI workflow, host config or documented deploy procedure in the repository                                                                                                              |
| 14  | HTTP security headers             | **FAIL (gap)**                                   | `next.config.ts` sets none (no CSP, frame-ancestors, referrer, HSTS at the app layer)                                                                                                     |
| 15  | Session handling                  | **PASS (dev)**                                   | Middleware refreshes cookies for `/profile` and `/personas`; pages verify with `auth.getUser()`; lapsed session path tested                                                               |
| 16  | Production data protection        | **OPEN**                                         | Depends on #3; staging must hold only synthetic data and never share keys with production                                                                                                 |
| 17  | Quotas / abuse limits             | **OPEN**                                         | Proposal only (§3)                                                                                                                                                                        |
| 18  | Default storage                   | **PASS**                                         | `PERSONA_STORAGE` still `fixture`; staging must set `supabase` explicitly only after #3 and #7                                                                                            |
| 19  | Concurrency                       | **OPEN**                                         | §1 authored, not run                                                                                                                                                                      |

## 5. Remaining blockers

Critical for staging: #3 (no staging project), GraphQL catalog evidence (#8), #14/#10 (headers, monitoring) to be decided as accepted-risk or fixed, #11 (recovery).
Non-critical: auth settings (#4/#5), deployment config (#13), quotas (#17).

## 6. Is staging deployment authorized? **No.**

Critical checks remain open: no separate staging project, catalog GraphQL evidence not seen, and no error monitoring or security headers. Nothing here changes the M3D acceptance, which stands.

## Needed from the developer

1. Run `verify-graphql-evidence.sql` (and 6b/6c) in dev and send the results.
2. Decide the quota proposal, header/monitoring policy, and the staging project plan.
