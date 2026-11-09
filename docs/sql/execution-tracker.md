# Database DDL Execution Tracker

All active SQL is intended for manual execution by the developer as `postgres`
through Supabase SQL Editor. Codex does not connect or execute SQL. The
developer reported that `folioone_migrator` and `folioone_runtime` were removed
and have no database-level privileges. The developer has now confirmed manual
execution and catalog verification of both active Milestone 2 identity DDL
files. No execution date was provided.

## Active DDL

| DDL filename                                                   | Migration/version ID     | Dependencies                                                                                                                                                                  | Execution status | Execution date | Verification status / evidence                                                                                                                                                                                                                               |
| -------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [001-identity-tables.sql](milestone-2/001-identity-tables.sql) | `M2-IDENTITY-TABLES-001` | Approved development project; Supabase `auth.users`; `postgres` preflight confirms `public CREATE`, `auth USAGE`, and `REFERENCES` on `auth.users`; both target tables absent | executed         | Not provided   | verified — developer reports both tables exist, are owned by `postgres`, have RLS enabled and forced, and contain the expected primary keys, foreign keys, and check constraints. Catalog verification only; no runtime RLS enforcement claim.               |
| [002-identity-rls.sql](milestone-2/002-identity-rls.sql)       | `M2-IDENTITY-RLS-001`    | 001 executed and verified; Supabase `anon`, `authenticated`, `service_role` roles and authenticated access to `auth.uid()`/`public`                                           | executed         | Not provided   | verified — developer reports exact authenticated grants, no table privileges for `anon`, `service_role`, or `PUBLIC`, and exactly five ownership policies using `auth.uid()`. No DELETE policy. Catalog verification only; no runtime RLS enforcement claim. |

The catalog results above remain catalog verification, distinct from runtime
enforcement. Hosted two-user Auth/PostgREST isolation results are recorded in
[Milestone 2C](../architecture/milestone-2c-rls-isolation-verification.md).
That validation executed no SQL and changed no database objects; the two
designated users' account/profile rows were initialized through authenticated
PostgREST requests. DDL execution statuses and dates above are unchanged.

## Milestone 3A Persona proposals

The following numbered files are architecture proposals only. The developer has
not approved or executed them. Their status is `pending`; no Persona tables,
indexes, grants or policies are claimed to exist. Execute in the listed order
only after explicit review, checking every file's preflight against live state.

| DDL filename                                                                  | Migration/version ID | Dependencies                                                                                                                          | Execution status | Execution date | Verification status / evidence                                                                                                              |
| ----------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| [001-persona-tables.sql](milestone-3a/001-persona-tables.sql)                 | `M3A-PERSONA-001`    | Approved design; M2 `accounts` exists; target absent                                                                                  | pending          | Not executed   | Not verified; proposal only                                                                                                                 |
| [002-persona-configuration.sql](milestone-3a/002-persona-configuration.sql)   | `M3A-PERSONA-002`    | 001 executed and reviewed; M2 `identity_profiles` exists; targets absent                                                              | pending          | Not executed   | Not verified; proposal only                                                                                                                 |
| [003-persona-revisions.sql](milestone-3a/003-persona-revisions.sql)           | `M3A-PERSONA-003`    | 001-002 executed and reviewed; retention decision accepted; target absent                                                             | pending          | Not executed   | Not verified; proposal only                                                                                                                 |
| [004-persona-rls-and-grants.sql](milestone-3a/004-persona-rls-and-grants.sql) | `M3A-PERSONA-004`    | 001-003 executed; hosted request-path diagnostic passed; Supabase roles and auth.uid ACL preflight pass; no existing Persona policies | pending          | Not executed   | Not verified; proposal only (revision R1: gated policies, column grants); catalog checks and separately approved runtime RLS tests required |
| [005-persona-mutation-rpcs.sql](milestone-3a/005-persona-mutation-rpcs.sql)   | `M3A-PERSONA-005`    | 001-004 executed and verified; diagnostic passed                                                                                      | pending          | Not executed   | Not verified; new proposal (R1); statically syntax-parsed only                                                                              |

## Milestone 3C Persona persistence proposals

Architectural decisions are approved. The developer **reported on 2026-11-09 that `001`-`003` were executed in the development project and that catalog verification was performed**; this tracker records that report. The assistant has not seen the execution or verification output, and has not executed any SQL. `004` is a forward fix authored after the first hosted integration run; the developer also **reported it reviewed, executed and catalog-verified** (also unseen by the assistant). They supersede the
milestone-3a Persona files above as a unit (do not run both sets). See the
[decision record](../architecture/milestone-3c-persona-persistence.md). The
application keeps running on the in-memory fixture (`PERSONA_STORAGE=fixture`)
until these are approved, executed and verified.

| DDL filename                                                                              | Migration/version ID | Dependencies                                                | Execution status            | Execution date                                  | Verification status / evidence                                                                                                              |
| ----------------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------- | --------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| [001-persona-schema-secured.sql](milestone-3c/001-persona-schema-secured.sql)             | `M3C-PERSONA-001`    | M2 `accounts` exists; diagnostic cleaned up; targets absent | executed (developer report) | Reported 2026-11-09 (execution date not stated) | Developer-reported; execution output not seen by the assistant. Runtime behaviour partly shown by the hosted suite: see the decision record |
| [002-persona-gate-policies-grants.sql](milestone-3c/002-persona-gate-policies-grants.sql) | `M3C-PERSONA-002`    | 001 executed; request-path diagnostic evidence recorded     | executed (developer report) | Reported 2026-11-09 (execution date not stated) | Developer-reported; execution output not seen by the assistant. Runtime behaviour partly shown by the hosted suite: see the decision record |
| [003-persona-mutation-rpcs.sql](milestone-3c/003-persona-mutation-rpcs.sql)               | `M3C-PERSONA-003`    | 001 and 002 executed                                        | executed (developer report) | Reported 2026-11-09 (execution date not stated) | Developer-reported; execution output not seen by the assistant. Runtime behaviour partly shown by the hosted suite: see the decision record |
| [verify-catalog.sql](milestone-3c/verify-catalog.sql) (read-only)                         | `M3C-VERIFY-001`     | 001-003 executed                                            | executed (developer report) | Reported 2026-11-09                             | Developer-reported performed; output not reviewed by the assistant                                                                          |
| [rollback.sql](milestone-3c/rollback.sql) (guidance, all commented)                       | `M3C-ROLLBACK-001`   | Developer approval                                          | not applicable              | Not executed                                    | Not run                                                                                                                                     |

Hosted two-user persistence tests (`pnpm test:persona-db`) are authored and **not run**.
| [004-persona-version-conflict-sqlstate.sql](milestone-3c/004-persona-version-conflict-sqlstate.sql) | `M3C-PERSONA-004` | 001-003 executed | executed (developer report) | Reported 2026-11-09 (execution date not stated) | Developer-reported reviewed, executed and catalog-verified; output not seen by the assistant. Runtime evidence: stale versions return PT409 promptly through PostgREST (hosted suite, 2026-11-09) |

Hosted two-user persistence tests (`pnpm test:persona-db`), run after `004` on 2026-11-09: **34 passed, 1 skipped (the env-guard test), 0 failed**. The stale-version tests pass through the real RPC path. See the [M3D acceptance report](../architecture/milestone-3d-acceptance-report.md).

Read-only evidence script, not a migration: [verify-graphql-evidence.sql](milestone-3c/verify-graphql-evidence.sql) (`M3E-GRAPHQL-EVIDENCE`) is **authored, not executed**; results unseen. See the [M3E report](../architecture/milestone-3e-staging-readiness.md).

Not a numbered migration: [anchor-test-cleanup.sql](milestone-3c/anchor-test-cleanup.sql) (`M3D-ANCHOR-CLEANUP`) is a developer-run, reviewed cleanup for the dedicated account-anchor test user C. Reviewed and approved by the developer with two safety changes; the developer reported running it twice (2026-11-09). Its destructive step stays commented out in the repository.

## Milestone 3A request-path diagnostic (temporary objects)

Executed by the developer on 2026-11-09 (development project) and reported in chat. Run order: `diag-001-setup.sql`, the hosted test in
[the diagnostics README](milestone-3a/diagnostics/README.md), and
`diag-002-results.sql`, then `diag-003-cleanup.sql`. 004 and 005 must not be
executed until the diagnostic passes and its cleanup is verified.

| DDL filename                                                                      | Migration/version ID | Dependencies                 | Execution status | Execution date | Verification status / evidence                                                                       |
| --------------------------------------------------------------------------------- | -------------------- | ---------------------------- | ---------------- | -------------- | ---------------------------------------------------------------------------------------------------- |
| [diag-001-setup.sql](milestone-3a/diagnostics/diag-001-setup.sql)                 | `M3A-DIAG-001`       | Approved development project | executed         | 2026-11-09     | Setup run by developer; hosted test 8/8 passed                                                       |
| [diag-002-results.sql](milestone-3a/diagnostics/diag-002-results.sql) (read-only) | `M3A-DIAG-002`       | 001 executed and test run    | executed         | 2026-11-09     | Q1 32 rows (10 RPC + 20 interleaved + 2 path variants), all POST/gate true/path exact; Q2, Q3 0 rows |
| [diag-003-cleanup.sql](milestone-3a/diagnostics/diag-003-cleanup.sql)             | `M3A-DIAG-003`       | Evidence recorded            | executed         | 2026-11-09     | Developer reported 0 rows from verification; no zz*diag_m3a*\* objects remain                        |

## Canonical schema `folioone` package (executed on the hosted development project per developer report; output not seen)

The canonical application schema is `folioone` in every environment ([AD-008](../architecture/architecture-decisions.md)). The package in [folioone-schema/](folioone-schema/README.md) is **generated** from the approved sources by `scripts/schema/generate-folioone-sql.mjs`, validated locally by `pnpm validate` (clean and `--public-decoy` modes), and the developer **reported on 2026-11-09 that all of it was executed** on the hosted development project (no per-file detail or output provided; the assistant has not seen any output and executed nothing). It does not touch `public` or Auth users and copies no data. The existing `public` objects in the development project (rows above) stay as they are.

| File                                                                             | Kind                    | Status on hosted              | Note                                                      |
| -------------------------------------------------------------------------------- | ----------------------- | ----------------------------- | --------------------------------------------------------- |
| [public-snapshot.sql](folioone-schema/public-snapshot.sql)                       | read-only               | reported run; output not seen | run before 001 and after 006; must be identical           |
| [001-create-schema.sql](folioone-schema/001-create-schema.sql)                   | one-time                | executed (developer report)   | creates schema, `USAGE` to `authenticated`                |
| [002-identity-tables.sql](folioone-schema/002-identity-tables.sql)               | one-time                | executed (developer report)   | from M2 001                                               |
| [003-identity-rls.sql](folioone-schema/003-identity-rls.sql)                     | one-time                | executed (developer report)   | from M2 002                                               |
| [004-persona-tables.sql](folioone-schema/004-persona-tables.sql)                 | one-time                | executed (developer report)   | from M3C 001                                              |
| [005-persona-rls-and-grants.sql](folioone-schema/005-persona-rls-and-grants.sql) | one-time                | executed (developer report)   | from M3C 002                                              |
| [006-persona-functions.sql](folioone-schema/006-persona-functions.sql)           | one-time                | executed (developer report)   | from M3C 003 with the 004 PT409 definitions built in      |
| [007-verify-catalog.sql](folioone-schema/007-verify-catalog.sql)                 | read-only               | reported run; output not seen | catalog evidence incl. non-interference addendum          |
| [rollback.sql](folioone-schema/rollback.sql)                                     | guidance, all commented | not applicable                | `DROP SCHEMA folioone CASCADE` is the clean full rollback |

Staging uses this hosted project with schema `folioone`; hosted setup steps: [hosted-supabase-staging-setup.md](../architecture/hosted-supabase-staging-setup.md). Locally these ran against a clean Supabase stack; that is **local evidence only**. Evidence received so far: `007` sections 9 (schema ACL), 10 (7 tables, 11 functions) and 11c (all 11 functions SECURITY INVOKER with an empty `search_path`) and a `public` snapshot comparison (all 55 rows incl. TOTAL identical, assuming the unlabelled complete paste is the "before" run; developer to confirm); details in [database-schema-folioone.md](../architecture/database-schema-folioone.md). Hosted status is **REPORTED, not VERIFIED**: still needed are the `007-verify-catalog.sql` output, the before/after `public-snapshot.sql` output, and confirmation that `folioone` was added to Exposed schemas in the Dashboard.

## Retired SQL archive

These files are marked RETIRED and must not be executed. The developer's role
cleanup report confirms the custom roles were removed, but does not identify
which historical SQL files were used. Their file-specific execution statuses
remain unrecorded; no status is inferred.

| Retired file                                                                                                                              | Reason                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [custom-ddls.sql.retired](retired/custom-ddls.sql.retired)                                                                                | Historical aggregate role provisioning.                    |
| [001-runtime-auth-schema-usage.sql.retired](retired/milestone-2a/001-runtime-auth-schema-usage.sql.retired)                               | Grant targeted to removed `folioone_runtime`.              |
| [002-migrator-default-privileges.sql.retired](retired/milestone-2a/002-migrator-default-privileges.sql.retired)                           | Custom-role default ACLs and temporary membership changes. |
| [003-temporary-drizzle-database-create-grant.sql.retired](retired/milestone-2a/003-temporary-drizzle-database-create-grant.sql.retired)   | Temporary database CREATE grant to removed migrator.       |
| [004-temporary-drizzle-database-create-revoke.sql.retired](retired/milestone-2a/004-temporary-drizzle-database-create-revoke.sql.retired) | Revoke paired with the retired temporary grant.            |

## Reporting execution

After the developer executes an active file, record the filename/ID, date,
completion result, and read-only verification output. Mark it `executed` only
on explicit developer confirmation; mark `verified` only after confirmation
that its post-execution checks passed. Record `failed` if reported, and inspect
actual state before retrying. A file's presence is never evidence of execution.
