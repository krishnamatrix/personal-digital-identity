# Development Setup

## Local UI

Install Node.js 20.9+ and pnpm 10, run `pnpm install`, then `pnpm dev`. The
static workspace runs without backend credentials. Use `pnpm typecheck`,
`pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build`, and
`pnpm test:e2e` for local checks. Playwright browser binaries may require
`pnpm exec playwright install chromium` once dependencies are available.

## Authenticated database requests

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
