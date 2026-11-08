# Database DDL workflow

All SQL is authored and reviewed in this repository, then manually executed by
the developer through Supabase SQL Editor using the authorized `postgres`
connection. Codex must never connect to Supabase, execute SQL, or apply a
Drizzle migration. `postgres` is an administrative DDL identity only; it must
never be used by application runtime or user-facing queries.

## File organization and execution

- `milestone-2/` contains the manually deployed account/profile table and RLS SQL.
- `milestone-3a/` contains proposed Persona foundation SQL only. These files
  are pending architecture review and must not be executed until explicitly
  approved by the developer.
- Numbered files state prerequisites and exact execution order in
  [execution-tracker.md](execution-tracker.md).
- Keep object creation, grants, RLS, routines/triggers, and later schema
  changes in purpose-specific files. Execute as `postgres` only when the
  preflight checks pass.
- Every active SQL file documents purpose, prerequisites, execution order,
  repeatability, expected outcome, verification SQL, and rollback limitations.
- `custom-ddls.sql` and files under `retired/` are marked RETIRED. Never run
  them; they are retained for audit context only.

Postgres owns tables created by the manual DDL. Since the inspected project has
Postgres default ACLs that may grant new `public` tables to Supabase roles, each
new object file must explicitly remove unintended grants before committing.
Only the authenticated PostgREST role receives the narrow privileges needed by
that feature. `anon`, `service_role`, `PUBLIC`, and other unexpected roles must
not receive access unless a separately approved feature requires it.

## Drizzle

Drizzle remains the schema definition and local migration SQL authoring tool.
`drizzle.config.ts` has no database URL and does not apply changes. Generate or
review SQL locally, place the executable statements in the numbered
`docs/sql/` milestone files, and stop for manual execution. SQL Editor execution
does not advance Drizzle's migration ledger; do not run the stock migration
command or claim a migration recorded/applied without an explicitly approved
manual ledger plan. Hosted migration execution is not part of the current
workflow.

## Execution tracking

The [execution tracker](execution-tracker.md) records files as
`pending`, `executed`, `verified`, or `failed`. Do not infer execution from file
existence. Only the developer may report SQL Editor execution, date, and
verification results; update status only from that confirmation.

## Current state

Milestone 2 identity DDL was manually executed and catalog-verified; hosted
two-user Auth/PostgREST isolation is recorded in the Milestone 2C verification
document. Milestone 3A Persona SQL is a design proposal and remains pending
review. No Persona DDL has been executed or verified. Application runtime uses
the authenticated Supabase server client for user-owned requests. Persona
mock/plan documentation is not hosted RLS evidence.
