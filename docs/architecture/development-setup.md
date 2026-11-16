# Development Setup

## Local UI

Install Node.js 20.9+ and pnpm 10, then run `pnpm install`. For local development
with private settings, copy `.env.example` to `.env.local`, fill in the values
needed for your setup, and run `npm run dev:local` (or `pnpm dev:local`). The
command requires a readable `.env.local` at the repository root and starts the
Next.js development server from that root. Next.js loads its environment files;
the launcher does not display or parse their values. Existing process-level
variables retain precedence according to Next.js conventions. If `.env.local` is
missing or unreadable, the command prints setup guidance pointing to
`.env.example` and exits. `.env.local` is ignored by Git and must not be committed.

`npm run dev` / `pnpm dev` remain available and do not require the local-file
preflight. The static workspace runs without backend credentials. Either command
starts the application only; neither starts or resets Supabase, applies migrations,
or guarantees configured services are reachable. Use `pnpm typecheck`,
`pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build`, and
`pnpm test:e2e` for local checks. Playwright browser binaries may require
`pnpm exec playwright install chromium` once dependencies are available.

## Authenticated database requests

### Troubleshooting workspace profile errors

#### Local Supabase: profile editor reports 42703

The local CLI migration set must include M4. The base `001`–`007` migration files
create only the earlier identity/Persona schema; they do not create expanded
profile columns or `identity_entries`. The prepared
`supabase/migrations/008_identity_profile_expansion.sql` packages the canonical
`docs/sql/milestone-4/001-identity-profile-expansion.sql` verbatim, then requests a
PostgREST schema-cache reload. Its presence does not mean it has been executed.

Developer steps for the existing local stack:

1. Check local migration history with `supabase migration list --local`. Confirm
   the base migrations are applied and `008` is pending. Do not reset the database.
2. Review the canonical M4 read-only preflight in the local SQL Editor. Every
   result must be true. If M4 was applied manually or the schema is partially
   upgraded, reconcile that state before running this one-time migration.
3. Apply pending migrations deliberately with `supabase migration up --local`.
   Review the pending list first; this command applies all pending local files.
4. Review M4's included post-execution verification: twelve new profile columns,
   the `identity_entries` table, four owner policies, forced/enabled RLS and the
   expected grants. Then reload `/profile` and verify load/save on the local app.

This prepares profile/onboarding only. It does not provision website, article,
card, billing or Storage milestones, run tests against a database, or migrate
the hosted project. Keep the local package synchronized if canonical M4 changes.

A `workspace-viewer` log with `ProfilePersistenceError` code `42703` means a
referenced profile column is absent. The log points at `console.error` because
that is where the caught failure is reported; the failing operation is the
profile query. A common cause is application code ahead of the M4 profile schema.
The sanitized log alone does not identify which column is missing.

Workspace chrome reads only `display_name`, `full_name`, and `headline`. If the
expanded name column is absent (`42703` or schema-cache code `PGRST204`), it makes
one read-only compatibility attempt with baseline `display_name` and `headline`.
Both attempts retain the verified account filter and authenticated RLS client.
Successful compatibility reads do not generate a page-load error. Other failures
and unsuccessful compatibility attempts still use the existing error logger.

This does not migrate the database or make full profile editing compatible with
an older schema. For `/profile` or onboarding errors, the developer must review
the prerequisite/run order and verification instructions in
[M4](m4-auth-onboarding.md) and
[`001-identity-profile-expansion.sql`](../sql/milestone-4/001-identity-profile-expansion.sql).
Only the developer executes reviewed SQL against the intended project and reports
verification. Do not reset a database, execute SQL automatically, switch to an
administrative client, or suppress logging to clear the console.

The workspace plan badge is optional before M9 billing is provisioned. A typed
`BillingPersistenceError` with `PGRST205` (table unavailable in PostgREST's schema
cache) or `42P01` (missing relation) uses the Free display without a page-load error.
Other billing errors remain logged. This display fallback never grants PRO and
does not change pricing, checkout, payment verification, or entitlement queries.
Before using billing, the developer must review the SQL prerequisites in
[M9](m9-pro-plans.md) and verify the intended project's schema/cache. A missing-table
code alone does not establish whether SQL is unapplied or the schema cache is stale.

User-owned application requests use the server-only Supabase client from
`@supabase/ssr`. It reads the signed-in user's cookie session, calls
`auth.getUser()` to verify the user, then uses the same client for PostgREST
reads/writes. Supabase forwards the user's JWT; PostgreSQL evaluates
`auth.uid()` in RLS policies. The application never takes a user ID from form
or request input as the authorization identity, and it does not open a direct
PostgreSQL connection for user-facing operations.

Never configure a service-role key or administrative Postgres credential in
the application runtime. Supabase `service_role` and administrative Postgres
connections bypass RLS. The developer uses the authorized `postgres`
connection only through Supabase SQL Editor to execute reviewed DDL manually.
Codex authors/reviews SQL but does not connect, execute it, or apply Drizzle
migrations.

Drizzle remains the schema-definition and local SQL-authoring tool. Its config
has no database credentials; generated/edited SQL must be copied into a
numbered file in `docs/sql/` and manually reviewed/executed by the developer.
Manual SQL Editor execution does not automatically update Drizzle's migration
ledger. Do not use `drizzle-kit migrate` without a separately approved and
documented execution plan.

## Identity and RLS status

Identity account/profile schema and RLS DDL are in
[`docs/sql/milestone-2/`](../sql/milestone-2/). They were executed manually and
catalog-verified, and hosted two-user isolation passed (see
[Milestone 2C](milestone-2c-rls-isolation-verification.md) and the
[execution tracker](../sql/execution-tracker.md)). Mocked unit and UI tests
validate code paths only; each new domain needs its own hosted verification.

Do not claim live database access or RLS isolation until actual hosted tests
have been run. Two-user isolation, including cross-user read/write denial,
requires separate approval. No local Docker PostgreSQL is used.
