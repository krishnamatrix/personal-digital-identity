# Staging smoke tests

A small post-deployment suite, `e2e/staging-smoke.spec.ts`, run with `playwright.staging.config.ts`. It checks that a deployed Folioone is wired to the right Supabase project and schema, using only dedicated test accounts.

## What it checks (8 steps, run in order)

1. `GET /api/health` → 200 `{"status":"ok"}`.
2. A dedicated staging test user can sign in through the real login form.
3. Account/profile read path works: the profile form renders from the database (no "unavailable" state).
4. The Persona list loads, with Supabase-backed storage (the fixture notice is absent).
5. A Persona named `SMOKE <run tag>` can be created; this also creates the account anchor when it is absent.
6. An update (description) persists across a reload and the Persona appears in the list.
7. A second dedicated user cannot open or list that Persona.
8. Signing out closes `/personas`, `/profile` and the Persona URL.

## Safety rules (enforced by tests in `pnpm test`)

- Needs two **dedicated** accounts; skipped otherwise. It never uses `.env.local`: only `SMOKE_*` variables in the process environment, and `https://` is required for a deployed URL.
- Creates exactly one tagged Persona. Cleanup archives and permanently deletes only that Persona, found through the URL captured at creation; no pattern deletion, no other user's data.
- Does not edit either account's profile.
- Stateless otherwise: no seed data, no service-role key, no database connection.

## Running it

```
SMOKE_BASE_URL=https://<staging-host> \
SMOKE_USER_A_EMAIL=... SMOKE_USER_A_PASSWORD=... \
SMOKE_USER_B_EMAIL=... SMOKE_USER_B_PASSWORD=... \
pnpm smoke:staging
```

Traces and screenshots are kept on failure (`test-results/staging`, `playwright-report/staging`). If a run dies between steps 5 and cleanup, a Persona named `SMOKE …` may remain in user A's account; archive and delete it from the UI (it is the only thing the suite creates).

## Where it is verified

`pnpm validate` runs this same spec against the local stack (local dev server, local Supabase, schema `folioone`), so the suite is exercised on every release gate. **It has not been run against staging**; that needs the deployed service and the hosted configuration in [hosted-supabase-staging-setup.md](hosted-supabase-staging-setup.md).
