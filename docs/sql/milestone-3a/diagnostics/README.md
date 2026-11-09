# Milestone 3A — Request-Path Gate Diagnostic

**Status:** Proposal for developer review. Nothing here has been executed, and no
hosted test has been run. The request-path gate in `004-persona-rls-and-grants.sql`
is **unverified** until this diagnostic passes against the hosted development
project and the result is reviewed.

## What this proves (and what it cannot)

The Persona write gate lets a table write through only when PostgREST reports
`request.method = 'POST'` and `request.path` is exactly one of ten
`/rpc/persona_*` endpoints. The real Persona tables do not exist yet, so the
diagnostic builds an isolated copy of the same pattern (gated RLS policies,
column-level grants, `SECURITY INVOKER` RPCs, same helper logic) on
`zz_diag_m3a_*` objects and probes it with real Supabase Auth + PostgREST
requests.

Limitation: the diagnostic RPCs are named `zz_diag_m3a_persona_*`, so their
observed paths are `/rpc/zz_diag_m3a_persona_*`, not `/rpc/persona_*`. The test
checks that the observed value is exactly `/rpc/<function name>`; that
transfers to the real names by construction. A schema other than `public`
cannot be used without changing the project's exposed schemas, which this
diagnostic deliberately avoids.

| Requirement                                                       | Test (`persona-request-gate-diagnostic.hosted.ts`) | Pass condition                                                                                                                                                         |
| ----------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. `request.path` for a normal direct table write                 | D1/D2                                              | Error message from the statement trigger reports the observed path for POST, PATCH and DELETE (recorded; expected `/zz_diag_m3a_direct`) and `gate=false`              |
| 2. `request.method` for a normal direct table write               | D1/D2                                              | Reports `POST`, `PATCH`, `DELETE` respectively                                                                                                                         |
| 3. Values inside a PostgREST RPC request                          | D3                                                 | GET probe reports `GET`, POST probe reports `POST`, path `/rpc/zz_diag_m3a_probe`, gate false                                                                          |
| 4. Values inside each intended Persona mutation RPC               | D4                                                 | All ten wrappers return 200, method `POST`, path exactly `/rpc/<name>`, gate true                                                                                      |
| 5. Transaction-scoped and reset between requests                  | D5                                                 | 20 scope probes: marker never found at start, 20 distinct transactions; 20 interleaved RPC/direct pairs: 0 direct writes accepted, 20 RPC writes accepted              |
| 6. Can the user manipulate the values?                            | D6, D6b                                            | Spoofed headers/query/path variants never change the observed path/method and never open the gate; GraphQL cannot insert; only the exact canonical path opens the gate |
| 7. Direct table write rejected by the gate                        | D7                                                 | Insert fails (>= 400); PATCH and DELETE affect zero rows; table content identical afterwards                                                                           |
| 8. Intended RPC write succeeds through the same authenticated JWT | D4 vs D7                                           | Same bearer token: RPC insert succeeds, direct insert fails                                                                                                            |
| Anonymous access (extra)                                          | D9                                                 | anon cannot call functions or read the table                                                                                                                           |

Not provable by this test: behavior of PostgREST versions or proxies other than
the hosted project's current one (re-run after a Supabase platform upgrade),
and `request.*` handling for a direct PostgreSQL login (not part of the approved
runtime architecture).

## Manual execution (you run every step)

1. **Review** `diag-001-setup.sql`, `diag-002-results.sql`,
   `diag-003-cleanup.sql` and the test file.
2. In Supabase SQL Editor (development project only, as `postgres`), run the
   preflight `SELECT` at the top of `diag-001-setup.sql`; every column must be
   `true`. Then run the whole file. Run its post-execution `SELECT`s: 2 tables
   with RLS enabled and forced, 14 functions with no SECURITY DEFINER.
3. In the repository, with `.env.local` containing the project URL, anon key
   and User A credentials (the same variables `pnpm test:rls` uses):

   ```sh
   pnpm exec vitest run --config vitest.persona-gate-diagnostic.config.ts
   ```

   The run prints a `PERSONA_GATE_DIAGNOSTIC_REPORT` table. Copy it. It
   contains observed paths/methods and statuses only. The test needs only the
   anon key and User A's sign-in; no service-role key or database URL.

4. Run `diag-002-results.sql` in SQL Editor; confirm query 2 and 3 return zero
   rows and query 1 shows 32 rows after a full run (10 wrapper RPCs, 20 interleaved
   RPC writes, 2 path-variant calls), all POST, gate true, path matching.
5. **Run `diag-003-cleanup.sql`**; its verification queries must return zero
   rows.
6. Send back: the report table, the `diag-002` output, and the cleanup
   confirmation.

## Decision rules

- **PASS** (all tests green, `diag-002` clean): the observed `request.method` and
  `request.path` match the allowlist form in `004` (`POST`, `/rpc/<fn>`). Record
  the observed values in the execution tracker, then 004/005 may be reviewed
  for approval. If observed paths differ only by a fixed, non-client-controllable
  prefix (for example `/rest/v1/rpc/<fn>`), update the exact strings in
  `persona_write_rpc_context()` and the diagnostic gate together and **re-run**.
- **FAIL / INCONCLUSIVE** (any spoof attempt opens the gate, the observed path is
  not stable or exact, scope probes leak, GraphQL inserts, or request settings
  are absent): stop. Do not weaken the match. The gate cannot be used and an
  alternative architecture is needed (see the final report's alternatives).
- The D6b GraphQL test is **inconclusive** (not failing) if the GraphQL type is
  not exposed; the report line says so.

## Cleanup and data handling

Diagnostic rows contain only the test user's id, labels, method/path strings,
backend pid and transaction id. `diag-003-cleanup.sql` removes every
`zz_diag_m3a_*` object and its policies/trigger. No Persona, identity,
accounts or auth rows are touched, and no session-level database setting is
written (only the transaction-local `zz_diag.local_marker`).
