# Milestone 3C SQL package — Persona persistence

**Status: PROPOSAL, prepared for independent review. Nothing here has been executed, applied or approved for execution; the execution tracker is entirely `pending`.** Architectural decisions D-1 to D-8 are approved (with conditions); see Start with [REVIEW.md](REVIEW.md) (RPC contract, mutation-to-RPC mapping, every privilege and policy, every function and execution grant, atomicity evidence, reviewer questions). It supersedes the milestone-3a Persona files (`001`-`005`) as a unit. Those files were never executed; **do not run both sets.** See [the decision record](../../architecture/milestone-3c-persona-persistence.md) for the findings, the proposed resolutions (D-1 to D-8, P-2 to P-6) and their impact.

## Files and order

| Order | File                                                                         | Kind         | Purpose                                                                                                                                      |
| ----- | ---------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | [001-persona-schema-secured.sql](001-persona-schema-secured.sql)             | DDL          | Five tables, created with RLS enabled and forced and every API privilege revoked **in the same transaction**                                 |
| 2     | [002-persona-gate-policies-grants.sql](002-persona-gate-policies-grants.sql) | DDL          | Request-path gate, 16 policies, column-level grants                                                                                          |
| 3     | [003-persona-mutation-rpcs.sql](003-persona-mutation-rpcs.sql)               | DDL          | The nine mutation RPCs, each returning the resulting Persona state from inside its own transaction, plus the read-only `persona_detail_json` |
| —     | [REVIEW.md](REVIEW.md)                                                       | Review guide | For the independent reviewer                                                                                                                 |
| —     | [verify-catalog.sql](verify-catalog.sql)                                     | Read-only    | Catalog verification and post-test integrity queries                                                                                         |
| —     | [rollback.sql](rollback.sql)                                                 | Guidance     | Recovery options; every statement commented out                                                                                              |

Run 001, 002 and 003 in one SQL Editor session, as `postgres`, in the **development** project. Run `verify-catalog.sql` one numbered section at a time (the editor shows only the last result).

## Properties of every DDL file

- One transaction. A failure rolls the whole file back; nothing is left half-applied.
- **Enforced** preconditions: a `DO` block aborts the transaction if any is false.
- **One-time:** plain `CREATE`, no `IF NOT EXISTS` or `OR REPLACE`, so a second run aborts in the precondition block rather than hiding a partial deployment.
- An **asserted outcome** before `COMMIT`.
- Never `SECURITY DEFINER`. Every function is `SECURITY INVOKER` with `SET search_path = ''`.

## What the SQL cannot show

The catalog queries run as `postgres`, which bypasses RLS. They cannot show tenant isolation, the request-path gate, version conflicts, atomicity or unauthorized-write rejection. Those need the hosted two-user suite (`pnpm test:persona-db`), which needs an explicit stage approval. Syntax has been checked with the PostgreSQL grammar; behaviour has not been run.
