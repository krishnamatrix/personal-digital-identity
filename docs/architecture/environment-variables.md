# Environment Variables

Copy `.env.example` to `.env.local`. Values are placeholders only. Static UI
startup needs no Supabase configuration.

| Variable                        | Exposure                     | Required when              | Purpose                                                                         |
| ------------------------------- | ---------------------------- | -------------------------- | ------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Browser-safe                 | Creating a Supabase client | Folioone Supabase project endpoint.                                             |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser-safe publishable key | Creating a Supabase client | Identifies the project client; database access remains subject to Auth and RLS. |

The application has no PostgreSQL connection string and no service-role key.
The server verifies the cookie-backed Supabase session with `auth.getUser()`;
user-owned PostgREST requests then use that authenticated client. The user's
JWT, not a browser-supplied user ID, supplies `auth.uid()` for RLS.

The optional authenticated Playwright integration flow reads
`FOLIOONE_DEV_TEST_EMAIL` and `FOLIOONE_DEV_TEST_PASSWORD` from the test runner
process only. Configure them only for a dedicated, confirmed development test
account in a local secret manager or CI secret store. They are not application
variables, must never use a `NEXT_PUBLIC_` prefix, and must not be committed.
The test restores the original profile headline before signing out. Without
these values, the authenticated hosted flow is skipped; the unauthenticated
route check can still run.

The developer's administrative `postgres` connection is used only in Supabase
SQL Editor for manually executing reviewed DDL. It is not an application
variable, must not be added to `.env.local`, deployment settings, browser code,
or tests, and is never used for user-facing queries. Drizzle Kit configuration
contains no database credentials and does not execute migrations.

Never define `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, or
`MIGRATION_DATABASE_URL` for application runtime. The service-role key bypasses
RLS; the administrative connection bypasses RLS as well.
