# Database access layer (`src/lib/db/`)

**Rule:** every Supabase database operation (`.from()`, `.rpc()`, and the select/insert/update/upsert/delete chained on them)
lives in `src/lib/db/`. No page, component, layout, Server Action, Route Handler, middleware or service issues a query.
Enforced by `pnpm check:db-boundary` (a step of `pnpm validate`) and `tests/db-boundary.test.ts`.

```
src/lib/db/
  schema.ts        canonical schema constant + typed client (not server-only: the middleware/browser client need the NAME)
  client.ts        server-only. getAuthenticatedDb() / getAnonymousDb(): the only way to obtain a database client
  query.ts         server-only. Central entry: re-exports client accessors and the domain query modules
  queries/
    identity.ts    accounts + Master Identity profile
    entries.ts     Master Identity list entries
    website.ts     website draft, published snapshot, publish / unpublish / change slug RPCs, public reads
    personas.ts    Persona repository (PostgREST + RPC) used when PERSONA_STORAGE=supabase
    media.ts       Supabase Storage (M10): private profile photo, its public copies (owner session only)
```

Dependencies point one way: `app/*` → `domains/*-service` → `lib/db/query` → `lib/supabase/server` (cookie client) → Supabase.
Services orchestrate and validate; they hold the client handle only to pass it into query functions.

## What did not change

- Authentication, RLS, grants, SQL, RPC names and signatures, the fixture adapter, `PERSONA_STORAGE=fixture` default.
- Every authenticated query still carries the user's JWT (anon key + session cookie). No service-role key, no direct
  Postgres connection, no SECURITY DEFINER (one reviewed exception, `billing_activate_pro`; see AD-011). `getAnonymousDb()` ignores cookies, so it is always the `anon` role.
- `supabase.auth.*` calls (sign-in, sign-up, reset, callback) remain in the auth actions: they talk to Supabase Auth, not the database.

## Rules the check enforces (fails with `file:line`)

| Rule            | Meaning                                                                                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `db-from`       | `.from()` outside `src/lib/db/` (builtins such as `Array.from` are ignored)                                                                                                                                         |
| `db-rpc`        | `.rpc()` outside `src/lib/db/`                                                                                                                                                                                      |
| `wildcard`      | `.select()`, `.select("*")`, or a column-list constant containing `*`, anywhere in `src/`                                                                                                                           |
| `client-init`   | `createServerClient` / `createBrowserClient` / runtime `@supabase/supabase-js` import outside the approved client modules (`lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/db/client.ts`, `middleware.ts`) |
| `client-import` | a `"use client"` module importing `@/lib/db/*` (except `schema`), `@/lib/supabase/server` or `server-only`                                                                                                          |

Comments are ignored. Tests (`tests/`, `e2e/`) are not scanned and may build clients for isolated setup. There are no exemptions;
the `EXEMPT` list in the script is empty and any future entry needs a written reason.

## Adding a feature

1. Add queries to the matching `src/lib/db/queries/<domain>.ts` (or a new module re-exported from `query.ts`). Import `server-only`,
   list columns explicitly, normalise errors, return typed data.
2. Call them from a service in `src/domains/<domain>/` that gets its handle from `getAuthenticatedDb()` (or `getAnonymousDb()` for
   public reads).
3. Call the service from Server Components / Actions. Never import `@/lib/db/*` from a Client Component.

## Public website

`findLiveBySlug` selects exactly `PUBLIC_PUBLISHED_COLUMNS` (`slug, theme, title, description, content, is_live, published_at,
updated_at`) from `website_published` only, via the anonymous client; `account_id` is never requested. The availability probe selects
only `slug` from the same table. Neither touches `website_sites`. Publish, unpublish and change slug use the existing
`website_publish`, `website_unpublish`, `website_change_slug` RPCs.
