# Milestone 2C — Two-User RLS Isolation Verification

**Result: PASS**  
**Executed:** 2026-11-08  
**Environment:** Existing hosted Folioone development Supabase project configured
through ignored `.env.local`. The project endpoint, project reference, user
identifiers, credentials, and profile values are intentionally not recorded.

## Scope and repository design review

The reviewed identity SQL is
[`001-identity-tables.sql`](../sql/milestone-2/001-identity-tables.sql) and
[`002-identity-rls.sql`](../sql/milestone-2/002-identity-rls.sql). It matches
the approved design:

- `accounts`: authenticated SELECT and INSERT, with `id = auth.uid()` ownership
  predicates; no DELETE policy.
- `identity_profiles`: authenticated SELECT, INSERT, and UPDATE; both UPDATE
  predicates require `account_id = auth.uid()`; no DELETE policy.
- Both tables have RLS enabled and forced. The previously reported catalog
  grants exclude `anon` and `PUBLIC`.

The profile service obtains its Supabase client and user from
`createAuthenticatedClient()`, which verifies the cookie session with
`auth.getUser()`. Repository calls use that client and the verified user ID.
The RLS test below uses the Supabase JavaScript client directly so requests
travel through Auth and PostgREST with each user's JWT.

## Test architecture and safety

The opt-in hosted suite is run with `pnpm test:rls`, separate from ordinary
Vitest tests. It uses two independent Supabase clients configured with the
public project URL and anon/publishable key, distinct in-memory auth storage,
and no session persistence. Each user signs in through Supabase Auth; the test
verifies both identities with `auth.getUser()` before issuing PostgREST
requests. An unauthenticated client uses the same public key without a session.

Only these environment values are loaded into the hosted test runner:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`FOLIOONE_RLS_USER_A_EMAIL`, `FOLIOONE_RLS_USER_A_PASSWORD`,
`FOLIOONE_RLS_USER_B_EMAIL`, and `FOLIOONE_RLS_USER_B_PASSWORD`. The loader
does not print or persist their values. The Playwright web-server configuration
sets all four RLS credential variables to empty strings. For the required
Playwright suite, `FOLIOONE_RLS_E2E_USER=A` maps the existing profile smoke flow
to User A; the Next.js web server receives empty values for the mapped and raw
test credential variables.

No PostgreSQL connection, SQL Editor session, `postgres` credentials, or
service-role key was used. No SQL was executed and no database objects or RLS
policies were changed. The test only accessed the two designated development
users' identity records through their authenticated sessions.

## Hosted results

Command: `pnpm test:rls`  
Result: **1 test file passed; 7 tests passed; 0 skipped.** The hosted Auth and
PostgREST requests completed against the configured development project.

| Scenario                           | Actual result                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Initialization                     | Both users initially had no `accounts` or `identity_profiles` row. The suite created one own account row and one own profile row per user through authenticated PostgREST. It did not overwrite existing profile fields. These four initialization rows remain; they were not deleted. A subsequent run confirmed all four rows already existed. |
| Own-record access                  | Passed. Table-wide SELECTs returned exactly one account and one profile row to each authenticated user, and each returned row belonged to that session's `auth.getUser()` identity.                                                                                                                                                              |
| Cross-user reads                   | Passed. User A received zero rows when selecting User B's account and profile by ID.                                                                                                                                                                                                                                                             |
| Cross-user update                  | Passed. User A's UPDATE returned zero rows. User B independently read the full profile and confirmed it matched the pre-attempt snapshot. The cleanup `finally` path independently rechecked User B's original `headline` and `updated_at`; no restoration write was needed because neither changed.                                             |
| Cross-user inserts                 | Passed. User A's attempted account insert and profile insert for User B each returned SQLSTATE `42501` (RLS/privilege denial). User B's account and profile were re-read and remained unchanged.                                                                                                                                                 |
| Anonymous access                   | Passed. Account and profile SELECTs each returned SQLSTATE `42501`; account and profile INSERT attempts each returned SQLSTATE `42501`. Authenticated reads confirmed neither user's records changed.                                                                                                                                            |
| Session separation and altered IDs | Passed. Auth verified distinct User A and User B identities. A read using User B's ID in User A's client returned zero rows. Signing out User A left User B authenticated and able to read only User B's profile. Both client sessions were closed during cleanup.                                                                               |

The separate Playwright authenticated flow was run as User A to keep all
profile changes within the two designated test accounts:

Command: `FOLIOONE_RLS_E2E_USER=A pnpm test:e2e`  
Result: **3 tests passed.** The profile flow saved a temporary headline,
verified persistence after reload, restored User A's original headline,
verified the restoration after reload, signed out, and confirmed `/profile`
showed the unauthenticated state without profile fields. No test credentials or
profile values appeared in output.

## Cleanup and data changes

- No existing profile fields were changed by the cross-user update attempt.
- The Playwright profile probe restored User A's original headline and verified
  it after a fresh request before signing out.
- The two designated users lacked application account/profile rows at initial
  test setup. The test initialized those four rows through their respective
  authenticated sessions. They remain in the development database; no account,
  profile, Auth user, or other data was deleted.
- No data outside User A and User B was targeted.

## Tested guarantees and limitations

These results demonstrate the tested table-level behavior over actual
Supabase Auth JWTs and PostgREST: each user can access their own records,
cross-user reads are filtered, cross-user updates and inserts are denied, and
anonymous operations are denied. They also demonstrate session independence
for the tested local sessions.

The test did not use SQL to re-inspect catalogs; the policy/grant catalog state
is the developer-reported verification recorded in the
[DDL execution tracker](../sql/execution-tracker.md). It did not test other
tables, roles, database functions, storage, or authorization behavior outside
these two identity tables. It does not make claims about production. No
Supabase Auth users were created; only missing Folioone identity rows for the
two designated Auth users were initialized.

## Repository validation

| Command                                 | Result                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| `pnpm typecheck`                        | Passed                                                                         |
| `pnpm lint`                             | Passed                                                                         |
| `pnpm format:check`                     | Passed                                                                         |
| `pnpm test`                             | Passed — 10 files, 26 tests; unit and mock-based tests only                    |
| `pnpm build`                            | Passed                                                                         |
| `FOLIOONE_RLS_E2E_USER=A pnpm test:e2e` | Passed — 3 Playwright tests, including User A authenticated profile validation |
| `pnpm test:rls`                         | Passed — 7 hosted tests using Supabase Auth and PostgREST                      |
