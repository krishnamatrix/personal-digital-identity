# Hosted Supabase: expose `folioone` and point staging at it

**Manual steps for the developer.** Nothing here has been done by the assistant, and the assistant never connects to the hosted project. The existing hosted Supabase project is reused for staging; a separate project will be used for production, with the same schema name.

## 0. Prerequisites

- `docs/sql/folioone-schema/` has been executed (reported done) and verified with `007-verify-catalog.sql` and the before/after `public-snapshot.sql` comparison. Outstanding evidence is listed in [database-schema-folioone.md](database-schema-folioone.md#6-hosted-executed-per-developer-report-verification-outstanding).
- The schema package already grants everything the Data API role needs: `USAGE` on schema `folioone`, and the table, column and function privileges for `authenticated` only. **Do not add grants** for `anon` or `service_role`, and do not grant anything on `public` objects.

## 1. Expose the schema through the Data API

1. Dashboard → **Project Settings → Data API** (older UI: _API Settings_) → **Exposed schemas**.
2. **Add `folioone`.** Keep `public` and `graphql_public` as they are (existing development data stays reachable and untouched).
3. Do **not** add `folioone` to _Extra search path_; the application selects the schema per request and every function uses an empty `search_path`.
4. Save. If the schema is not served immediately, run `NOTIFY pgrst, 'reload schema';` in the SQL Editor (PostgREST schema-cache reload).
5. Leave `pg_graphql` disabled.

## 2. Application schema selection

The application sends `Accept-Profile: folioone` (reads) and `Content-Profile: folioone` (RPC and writes) on every Supabase request, because every client is created with `db: { schema: "folioone" }` from the single constant in `src/lib/db-schema.ts`. There is no environment variable for it and no fallback to `public`; staging needs only:

| Variable                        | Value                                       |
| ------------------------------- | ------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | the hosted project's URL                    |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the hosted project's anon (publishable) key |
| `PERSONA_STORAGE`               | `supabase`                                  |

## 3. Auth settings for staging (same project)

- **Site URL** and **Redirect URLs**: the staging origin only.
- Decide email confirmation and SMTP. The application has a sign-in page only: create the two dedicated smoke-test users in the Dashboard (Authentication → Users). Do not reuse real users.

## 4. Verify that the application is using `folioone`

Run these after the first staging sign-in and smoke run; none writes anything.

1. **Deploy order:** the Data API must serve `folioone` _before_ the new build handles traffic. Otherwise PostgREST answers `406 PGRST106 "The schema must be one of the following…"` and signed-in pages fail.
2. **Smoke suite** ([staging-smoke-tests.md](staging-smoke-tests.md)): creates the account anchor and a tagged Persona through the application and removes it.
3. **Where the rows land** (SQL Editor, read-only):
   ```sql
   SELECT (SELECT count(*) FROM folioone.accounts)  AS folioone_accounts,
          (SELECT count(*) FROM folioone.personas)  AS folioone_personas;
   ```
   After the first smoke run `folioone.accounts` has one row per smoke user that signed in and created a Persona; `folioone.personas` is back to its previous count after cleanup.
4. **`public` stayed untouched:** run `docs/sql/folioone-schema/public-snapshot.sql` again. The `TOTAL` must still equal the value recorded before the migration (`ade84de2544122e678912637f408f501` in the output supplied on 2026-11-09), including the row counts (accounts 4, identity_profiles 3, selections 119, overrides 14, revisions 34, sections 153, personas 17).
5. **API logs:** Dashboard → Logs → API Edge Logs: requests to `/rest/v1/personas` and `/rest/v1/rpc/persona_*` appear with the `content-profile`/`accept-profile` header `folioone`. A request without it would hit `public`; there should be none from the application.
6. **Health:** `GET <staging>/api/health` → `{"status":"ok"}` (liveness only; it does not prove database access).

## 5. If something is wrong

- `PGRST106` → `folioone` not exposed (step 1).
- `permission denied for schema folioone` (42501) while signed in → the package's `USAGE` grant to `authenticated` is missing; re-run the verification, do not add broad grants.
- Rollback: `docs/sql/folioone-schema/rollback.sql` (guidance, all commented). Set `PERSONA_STORAGE=fixture` first.
