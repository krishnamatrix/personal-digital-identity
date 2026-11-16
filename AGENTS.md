# Repository Guidelines

Folioone is a personal digital identity workspace: one canonical Master Identity per account, with Personas, Portfolios, Identity Cards and CVs derived from it. Read `docs/architecture/architecture-decisions.md` (AD-001 to AD-007) before changing architecture.

## Project Structure

- `src/app/` — Next.js App Router routes (`login`, `profile`, dashboard) with colocated server actions.
- `src/domains/<domain>/` — domain logic split into `*-schema.ts` (Zod), `*-repository.ts` (PostgREST access) and `*-service.ts`. `src/domains/personas/` is fixture-backed (in-memory adapter) until the Persona SQL is approved and executed; do not add live Persona persistence without that approval. `SupabasePersonaRepository` exists but is off by default (`PERSONA_STORAGE`); enabling it requires the M3C SQL (`docs/sql/milestone-3c/`) to be approved, executed and verified.
- `src/db/schema/` — Drizzle schema definitions (for SQL authoring only, never runtime queries).
- `src/lib/` — env validation and Supabase clients (`supabase/server.ts`, `client.ts`).
- `src/components/` — `ui/` (shadcn), `auth/`, `workspace/`.
- `tests/` — Vitest unit tests; `tests/hosted/` — opt-in hosted RLS tests; `e2e/` — Playwright.
- `docs/architecture/` — design and verification docs; `docs/sql/` — numbered DDL plus `execution-tracker.md`.

## Build, Test, and Development

pnpm 10, Node 20.9+. Commands: `pnpm dev`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`. Hosted/browser suites: `pnpm test:rls` (needs two test users in `.env.local`) and `pnpm test:e2e`. Run those only when the developer asks; they touch the hosted Supabase project.

## Database and Security Rules (non-negotiable)

- Never connect to the database or execute SQL. Author numbered SQL under `docs/sql/<milestone>/`; the developer runs it manually as `postgres` in the Supabase SQL Editor.
- Update `docs/sql/execution-tracker.md` only on the developer's explicit report. A file's presence is never evidence of execution.
- Runtime user data access goes through the authenticated Supabase server client after `auth.getUser()`. Never take a user ID from request input, and never use a service-role key or a Postgres connection string in the app.
- Every private table: RLS enabled and forced, minimal grants to `authenticated`, owner predicates on `auth.uid()`.
- Everything is private by default; public output only via versioned, allowlisted snapshots (AD-005).
- Do not read or print `.env.local`. Keep credentials and personal data out of source control.

## Coding Style and Naming

Prettier and ESLint are configured; run `pnpm format:check` and `pnpm lint`. Use `PascalCase` for components, `kebab-case` for filenames, descriptive names, and no new dependencies without clear need. Follow the approved visual direction in `docs/architecture/design-system.md`.

## Testing

Add tests with new behavior. Name them after the module (for example, `identity-profile-service.test.ts`). `pnpm test` must stay green before finishing work.

## Database access rule

All Supabase database operations (`.from()`, `.rpc()`) live in `src/lib/db/` only, with explicit column lists (never `select('*')`).
Pages, components, actions, route handlers and middleware must not query; services call `@/lib/db/query`. Client components must never
import the database layer. `pnpm check:db-boundary` (part of `pnpm validate`) enforces this. See `docs/architecture/database-access-layer.md`.

## Commits and Pull Requests

Concise, imperative commit subjects (for example, `Add profile validation`). PRs summarize the change and design choices, link issues, include screenshots for visual changes, and list tests run and follow-ups.
