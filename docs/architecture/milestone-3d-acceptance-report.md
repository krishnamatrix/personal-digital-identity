# Milestone 3D — Final Acceptance Report

Date: 2026-11-09. Development Supabase project only. Dedicated test accounts only.
No SQL was executed by the assistant; no database object, grant, policy or GraphQL setting was changed.

Evidence labels: **VERIFIED** (observed by the assistant this session), **REPORTED** (stated by the developer; output not seen), **INFERRED**, **UNVERIFIED**.

## 1. SQL deployment and catalog evidence

| Item                                                                | Status                                                                                                    |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 001, 002, 003 executed                                              | REPORTED. Runtime behaviour consistent with them is VERIFIED by the hosted suite.                         |
| 004 (PT409) reviewed, executed, catalog-verified                    | REPORTED. VERIFIED at runtime: a stale version now returns promptly with PT409 through the real RPC path. |
| `verify-catalog.sql` output                                         | REPORTED performed; output not seen. Section 6b (pg_graphql) is still worth sending.                      |
| Gate allowlist, grants, no SECURITY DEFINER, no `identity_profiles` | VERIFIED by the static guard against the files; REPORTED against the catalog.                             |

## 2. Hosted Persona persistence/security suite

`FOLIOONE_PERSONA_SQL_EXECUTED=1 FOLIOONE_PERSONA_004_EXECUTED=1 pnpm test:persona-db` → **34 passed, 1 skipped, 0 failed** (50 s). The skipped test is the "suite is skipped without the env flag" guard, not a behaviour test. Covers: direct table writes rejected, two-user isolation (tables and RPCs), anon refused, rollback of failed create and failed batch, 7/9/1 creation shape, concurrent default switches, purge scope, real PostgREST paths (one `POST /rest/v1/rpc/<name>` each), one revision per mutation, stale-version PT409, Master Identity unchanged.

## 3. Task 1 — Account-anchor absent branch: **VERIFIED** (2026-11-09, user C)

- Dedicated user C (not A, B or the dev test user). Precondition enforced by the test: C has no `public.accounts` row and no Personas before the run. The developer ran the reviewed `anchor-test-cleanup.sql` (REPORTED) to reach that state.
- `FOLIOONE_PERSONA_ANCHOR_TEST=1 pnpm test:persona-anchor` → **1 passed** (VERIFIED, run by the assistant). Asserted through C's real session and the actual `persona_create_with_configuration` RPC:
  - a failed create (invalid override) leaves no anchor and no Persona;
  - a real create then creates the anchor (id = C) together with the Persona, 7 selections, 9 sections and exactly 1 revision (revision 1, actor = C);
  - user A cannot read C's account row, Persona or Persona rows; C's adapter refuses another account id with `not_found` before any request.
- Earlier runs failed for test defects only, not database behaviour: a count helper selected a nonexistent `id` column (HTTP 400, error discarded) and a final assertion expected `null` where the adapter deliberately rejects. Both were corrected in the test; no expected value or precondition was weakened, and no SQL, grant or application code changed.
- Cleanup: the test archives and deletes C's Persona. The anchor remains by design (the app role cannot delete it); remove it with the reviewed cleanup if the test is to be rerun. State after this run: C has an anchor and no Personas. The Auth user C remains.
- Limits: one dedicated user, one run; concurrency of two simultaneous first-creates for the same new user was not tested.

## 4. Task 2 — GraphQL: **VERIFIED SAFE (current runtime state); catalog confirmation recommended**

- VERIFIED: `POST /graphql/v1` as **anon** and as **authenticated** (user A) returns `pg_graphql extension is not enabled.` for schema, `Query`, `Mutation` and `personasCollection` requests. There is no GraphQL schema, hence no GraphQL mutation or write-capable function, for either role.
- This is not inferred from an invisible Mutation type: the endpoint states the cause. The hosted test now reports this classification explicitly and otherwise falls back to the previous STOP-AND-REPORT invariant checks.
- Other routes: direct table INSERT/UPDATE/DELETE are rejected for the owner and for the other user; anon cannot read tables or call RPCs; writes are possible only through the nine approved RPCs (all VERIFIED by the suite). The PostgREST OpenAPI document needs a service role key and was not read.
- Limits: this describes today's state. Enabling `pg_graphql` later would expose whatever the roles are granted; `verify-catalog.sql` 6b/6c (extension list, default privileges) should be run and kept in the evidence, and re-checked before staging. Default-privilege/grant exposure was not independently inspected by the assistant (no catalog access): UNVERIFIED by the assistant, REPORTED by developer verification.

## 5. Task 3 — Real application acceptance with `PERSONA_STORAGE=supabase`

Command: `pnpm exec playwright test --config playwright.supabase.config.ts` (dev server on :3100 with `PERSONA_STORAGE=supabase`; user A signs in through the real login form; B only for isolation). **28 passed, 0 failed, 0 skipped.** The list scenario asserts the fixture notice is _absent_.

| Step                                                      | Result                                                                                                                                             |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–2 Sign in, Persona list                                 | PASS (real login; list from the database, no fixture notice)                                                                                       |
| 3 Create (four-step flow)                                 | PASS; database rows read back: version 1, 7 selections, 9 sections, 1 revision                                                                     |
| 4–5 Metadata, field selections, bulk action               | PASS                                                                                                                                               |
| 6 Set, intentionally blank, reset overrides               | PASS                                                                                                                                               |
| 7 Add/edit/hide/reorder sections                          | PASS                                                                                                                                               |
| 8 Preview                                                 | PASS                                                                                                                                               |
| 9–12 Duplicate, default, archive/restore, delete archived | PASS                                                                                                                                               |
| 13 Reload persistence                                     | PASS (UI and direct database read)                                                                                                                 |
| 14 Ownership isolation (A vs B)                           | PASS: B gets "Persona not found" for A's URL, A's Persona is absent from B's list, and B's database read returns nothing                           |
| 15 Stale edit                                             | PASS: clear "Out of date / nothing was overwritten" message; database still holds the newer description, version 2; reapply and reload-latest work |
| 16 Session expiry and signed-out                          | PASS: cleared cookies show "You have been signed out" with a Sign in link and change nothing; signed-out visits show no Persona data               |
| Layouts                                                   | PASS in the existing desktop, tablet (768×1024) and mobile (390×844) scenarios: nothing scrolls sideways; controls stay on one line                |

Cleanup: the new spec removes every `E2E …` Persona it or the shared scenarios created, through the approved RPCs, and asserts none remain for A or B. VERIFIED.

Not done: a human visual review of screenshots at the three sizes (assertions only); the Persona flows were not exercised with real concurrent users beyond the two-tab and concurrent-RPC tests.

## 6. Task 4 — Regression checks

| Command                                               | Result                                                                                                    |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `pnpm test:persona-db` (with both flags)              | 34 passed, 1 skipped, 0 failed                                                                            |
| `pnpm test:persona-anchor`                            | 1 skipped (user C not configured): **no result**                                                          |
| `pnpm test`                                           | 28 files, 348 tests passed                                                                                |
| `pnpm test:e2e` (default, fixture storage)            | 28 passed, 3 skipped (the new Supabase-only spec, by design)                                              |
| `playwright … --config playwright.supabase.config.ts` | 28 passed                                                                                                 |
| `pnpm typecheck`, `pnpm lint`, `pnpm build`           | clean                                                                                                     |
| `pnpm format:check`                                   | **1 warning: `CLAUDE.md`** (created 13:10 today, not by this work; left untouched). Everything else clean |

## 7. Remaining risks and limitations

1. Account-anchor absent branch: verified once with a single user; first-create concurrency for one new user untested.
2. GraphQL safe only while `pg_graphql` stays disabled; catalog confirmation (6b/6c) not seen.
3. No load or sustained-concurrency testing; no quotas (revisit before public launch).
4. Playwright suites run against a shared development project and a single browser engine (Chromium).
5. `PERSONA_STORAGE` default remains `fixture`; not changed.
6. Session-expiry was tested by clearing cookies, not by waiting for token expiry.

## 8. Conclusions

- **Ready for formal M3D acceptance?** Yes for Tasks 1-5, subject to the limits in section 7.
- **Ready for staging?** Not yet. Before staging: run `verify-catalog.sql` in the staging project and keep its output; confirm `pg_graphql` stays disabled (6b/6c); repeat the hosted suite against staging; decide the default-storage switch and a quota policy.
