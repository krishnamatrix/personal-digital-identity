# Railway staging deployment

**Preparation only.** Nothing here has been applied to a live Railway service; no Railway configuration file was added to the repository, so nothing changes until the developer sets the service up. Staging uses the **existing hosted Supabase project** and the schema **`folioone`**. Future production is a separate Railway service and a **separate Supabase project**, also with schema `folioone`.

## Gates before any deploy

1. `pnpm validate` passes on the commit being pushed ([local-validation.md](local-validation.md)). It validates the application, the SQL package, and the browser journeys against **local** Supabase. It does not validate Railway or the hosted project.
2. The hosted project is migrated and exposes `folioone` ([hosted-supabase-staging-setup.md](hosted-supabase-staging-setup.md)). **Deploy order matters:** deploying this build before `folioone` is served makes signed-in pages fail with `PGRST106`.

## Build and start

| Setting           | Value                            | Notes                                                                  |
| ----------------- | -------------------------------- | ---------------------------------------------------------------------- |
| Node              | 20.9+                            | `engines` in `package.json`                                            |
| Package manager   | pnpm 10.33                       | pinned by `packageManager` (Corepack)                                  |
| Install           | `pnpm install --frozen-lockfile` |                                                                        |
| Build             | `pnpm build`                     | needs the two `NEXT_PUBLIC_*` variables **at build time**              |
| Start             | `pnpm start`                     | `next start`; Railway supplies `PORT`                                  |
| Health check path | `/api/health`                    | liveness only (`{"status":"ok"}`), touches no database or secret       |
| Region/instances  | one instance for staging         | no shared in-memory state is relied on when `PERSONA_STORAGE=supabase` |

Next.js production-build facts: `NEXT_PUBLIC_*` values are inlined into the client bundle at build time (changing them needs a rebuild); the server reads `PERSONA_STORAGE` at runtime; the middleware refreshes the Supabase session cookie on `/profile` and `/personas`.

## Environment variables (Railway service variables)

| Variable                        | Build   | Runtime | Staging value                               |
| ------------------------------- | ------- | ------- | ------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | **yes** | yes     | the hosted project's URL                    |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **yes** | yes     | the hosted project's anon (publishable) key |
| `PERSONA_STORAGE`               | no      | yes     | `supabase`                                  |

- The database schema is **not** a variable: `folioone` is a constant in the code ([database-schema-folioone.md](database-schema-folioone.md)).
- Never set on Railway: a service-role key, `DATABASE_URL`, `MIGRATION_DATABASE_URL`, any `FOLIOONE_*`/`SMOKE_*` test credential, or any value from another environment's Supabase project. Production must use its own project's values and never share keys with staging.
- Secrets live in Railway's variable store, never in the repository. The two Supabase values are publishable by design, but are still configured per service.

## Supabase configuration

See [hosted-supabase-staging-setup.md](hosted-supabase-staging-setup.md): expose `folioone` in the Data API, staging Site URL/redirects, dedicated smoke-test users, and how to verify the app is using `folioone`.

## Logging and error monitoring

- **Implemented:** `src/instrumentation.ts` logs every unhandled server error as one JSON line on stderr (`event: "request_error"`, route _pattern_, method, error name, Next.js digest, a sanitized and truncated message). It never logs headers, cookies, bodies, query strings or user content; e-mail addresses and long tokens are masked. Railway's log viewer is the sink. Server actions additionally log a one-line failure message.
- **Not implemented:** an external error-monitoring service (alerting, grouping, release tracking), uptime alerts, log retention policy. Recommended before production.
- Railway: enable the health check on `/api/health`; set restart policy "on failure"; add a deploy notification to a channel the team reads.

## Deployment smoke tests

After each staging deploy run `pnpm smoke:staging` ([staging-smoke-tests.md](staging-smoke-tests.md)) with two dedicated staging users: health, sign-in, profile read, Persona list, create, update and persistence, cross-user isolation, sign-out. Then run the read-only checks in step 4 of the hosted setup guide (`folioone` row counts, `public-snapshot.sql` TOTAL unchanged).

## What a green local build does not prove

Railway's build environment, the build-time variables being present, the hosted project's exposed-schema setting and Auth redirect settings, network egress to Supabase, and the hosted project's behaviour. Treat the first staging deploy as unverified until the smoke suite passes against it.

## Open items

Error-monitoring service, security headers/CSP, backup and recovery verification, quota enforcement, GraphQL catalog evidence, the hosted exposed-schema configuration and the Railway environment configuration remain open: see [milestone-3e-staging-readiness.md](milestone-3e-staging-readiness.md).
