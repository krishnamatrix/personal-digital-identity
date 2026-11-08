# Project Structure

```text
src/app/                 Next.js App Router entry points and root layout
src/components/ui/       shadcn-style shared UI primitives
src/components/workspace/Workspace shell and static dashboard composition
src/domains/             Reserved domain boundaries; no business features yet
src/db/                  Drizzle connection and schema entry point (empty)
src/lib/                 Environment validation, Supabase clients, utilities
src/styles/              Global CSS and design tokens
tests/                   Vitest component smoke tests
e2e/                     Playwright browser smoke test
drizzle/                 Reserved migration output; no migrations created
docs/architecture/       Architecture and setup documentation
```

Dashboard values are presentation-only constants. There is no authentication flow, canonical data model, or persistence implementation in this milestone.
