# Feature Specification: Workspace viewer profile compatibility

**Feature ID**: 001-workspace-viewer-profile  
**Branch**: feat/llms.txt  
**Created**: 2026-11-15  
**Status**: Scoped bug fix requested by the user

## Problem and scope

The user reports a `workspace-viewer` page-load log with `ProfilePersistenceError` code `42703`
while opening `/personas/new`. `getViewer` calls `findProfile`, which selects the complete M4
profile including onboarding, contact, and media columns even though the header only needs names
and headline. PostgreSQL documents `42703` as undefined_column. The specific missing column and
actual database state are not available from this sanitized report and have not been inspected.

**Product references**: ID-001, PER-007, NFR-001, NFR-006, NFR-008, NFR-009.
**Classification**: Baseline compatibility correction, not a new persistence mode or schema migration.
**Decision boundary**: D-006 remains open for environment readiness. This fix does not claim M4
SQL has run or make full profile editing work against an incomplete schema.

In scope: a read-only viewer projection; compatibility with missing expanded profile columns;
regression tests; clear development troubleshooting. Preserve display name → full name → signup
metadata → email-local-part → neutral-label precedence when available. Keep diagnostics for real
failures and Next.js control-flow rethrows.

Out of scope: SQL execution, remote database inspection, schema resets, changing RLS, hiding all
console errors, changing billing behavior, enabling Persona persistence, and auto-creating profiles.

## User Scenarios & Testing

### User Story 1 — Open workspace with a partially upgraded profile schema (P1)

As a signed-in owner, I can see my saved name/headline in workspace navigation without depending
on unrelated expanded identity fields.

**Independent test**: Run mocked query and viewer-loader tests, with regression tests explicitly
required for this bug fix.

1. Given the modern viewer columns exist, when the header loads, then only names/headline are
   selected and the normal identity precedence is preserved.
2. Given full_name is missing, when the viewer select returns `42703` or PostgREST `PGRST204`,
   then retry once with baseline display_name/headline, scope both reads to the verified owner,
   and use signup metadata when no saved display name is available. No recovered failure is logged.
3. Given an unrelated profile expansion column is absent, then it is not selected by the viewer.
4. Given no profile row exists, then use the existing authenticated-user fallback without writes.

### User Story 2 — Keep genuine failures diagnosable and profile editing honest (P2)

As a maintainer, I can distinguish a recovered viewer compatibility case from a database,
authorization, authentication, or framework control-flow failure.

**Independent test**: Simulate permission/network failures and failed compatibility retries; verify
that the error reaches existing sanitized logging and no broader fallback/retry occurs.

1. Given permission/network/table errors, then do not retry the profile query and retain sanitized
   diagnostics; fallback naming must never expose another account's data.
2. Given the baseline compatibility select also fails, then surface its error through the existing
   mapping/logger. Do not downgrade errors globally or suppress profile editor schema failures.
3. Given a Next.js redirect/dynamic signal, then `unstable_rethrow` preserves that signal.
4. Given missing M4 columns on a full profile page, then troubleshooting points to the existing
   developer-controlled migration process without executing or marking SQL as applied.

## Requirements

- **FR-001**: Add an explicit, owner-scoped, read-only viewer projection in the database layer.
- **FR-002**: Read display_name, full_name, headline normally; retry display_name, headline only
  once on a missing-column error. Never issue wildcard reads or writes.
- **FR-003**: Preserve null/missing-row and identity precedence semantics, normal error mapping,
  viewer authentication, plan handling, and sanitized logs for unrecovered failures.
- **FR-004**: Leave full findProfile/create/update semantics strict and unchanged.
- **FR-005**: Add mocked regression coverage and document migration-dependent limitations.
- **FR-006**: For workspace display only, treat typed BillingPersistenceError codes PGRST205
  and 42P01 as unavailable optional billing and retain Free chrome without a page-load error.
  Keep all other error diagnostics, Next.js signals, paid-state behavior, and billing enforcement
  unchanged. This extends US2 with the user's subsequent workspace-viewer:plan report.

## Success criteria

- **SC-001**: Mocked modern/legacy/missing-profile cases render the appropriate owner identity
  with no spurious `workspace-viewer` error after successful profile retrieval.
- **SC-002**: Both projection attempts are scoped to the same verified owner; generic errors make
  one attempt, and a missing-column compatibility path makes at most two attempts.
- **SC-003**: Full unit tests and applicable type/lint/database-boundary/formatting checks pass.
  No live database, hosted browser, or SQL execution is required or claimed.

## Sources

- `src/domains/identity/viewer.ts`, `src/lib/db/queries/identity.ts`, `src/lib/server-log.ts`.
- `docs/architecture/m4-auth-onboarding.md`, `docs/sql/milestone-4/001-identity-profile-expansion.sql`.
- PostgreSQL error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
- PostgREST error codes: https://docs.postgrest.org/en/stable/references/errors.html
