# Folioone

Personal identity workspace. Auth and the identity profile (`/profile`) are persisted in Supabase under RLS; Personas (`/personas`) are implemented against an in-memory fixture adapter only (not saved to the database); the dashboard still uses static presentation data.

## Requirements

- Node.js 20.9 or newer and pnpm 10.
- Hosted Supabase project for future backend work. Static UI development does not need credentials.

## Setup

```sh
pnpm install
cp .env.example .env.local
pnpm dev
```

Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` for checks. See [development setup](docs/architecture/development-setup.md), [environment variables](docs/architecture/environment-variables.md), and [design system](docs/architecture/design-system.md).

## Spec-driven development

GitHub Spec Kit is configured for Codex with project-local skills, a Folioone constitution, and feature templates. Start with `$speckit-specify <feature description>` in Codex chat, then clarify, plan, generate tasks, analyze, and implement. See [the workflow guide](specs/README.md) for commands, feature selection, and validation requirements.

The [product requirements](specs/product-requirements.md) consolidate identity, Personas, publishing, articles, cards, media, import, and PRO behavior with acceptance scenarios, future scope, and unresolved decisions. This draft distinguishes product requirements from verified deployment status.

## Environment

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` configure the browser-safe Supabase project and Auth client. User-owned requests use a verified server-side Supabase session and its authenticated PostgREST client. The application does not require a PostgreSQL connection string. Administrative `postgres` credentials are only for developer-controlled SQL Editor DDL and must never enter application environment or runtime code. No service-role key is used.

## RLS prerequisite

User-owned operations now use the authenticated Supabase server client, which forwards the verified user's session to PostgREST for RLS evaluation. The Milestone 2 identity DDL has been manually executed and catalog-verified, and two-user RLS isolation passed on 2026-11-08 (see [Milestone 2C](docs/architecture/milestone-2c-rls-isolation-verification.md) and the [execution tracker](docs/sql/execution-tracker.md)). Milestone 3A Persona SQL is proposal-only and unexecuted; Milestone 3B Persona screens do not use it (see [Milestone 3B](docs/architecture/milestone-3b-persona-application.md)). Milestone 3C authors the persistence SQL and a Supabase-backed repository, both unexecuted and off by default (`PERSONA_STORAGE=fixture`); see [Milestone 3C](docs/architecture/milestone-3c-persona-persistence.md).

## Tool versions

Pinned dependency versions are recorded in `package.json`; see [development setup](docs/architecture/development-setup.md) for the stack inventory.
