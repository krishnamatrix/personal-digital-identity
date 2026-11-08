# Milestone 3A — Persona Test Plan

**Status:** Planned; no hosted tests run. See the [security design](milestone-3a-persona-security.md).

## Test tiers

1. **Unit:** schemas, selection rules, override/reset resolution, lifecycle transitions, ordering and expected-version conflict behavior with fixtures.
2. **Mock-based application integration:** authenticated service calls use a mocked Supabase server client and verified `auth.getUser()` identity; assert no browser account ID is trusted, atomic mutation contract is invoked, and errors are mapped safely.
3. **Hosted security integration:** opt-in tests with two confirmed development Auth users and separate anon-key Supabase clients; actual user JWTs go through Auth and PostgREST. No direct PostgreSQL, `postgres`, or service-role credentials.
4. **Hosted end-to-end:** browser user flow using dedicated test accounts, only after test data/cleanup is approved. This is distinct from direct hosted PostgREST isolation.

Unit and mock results are not hosted RLS evidence. Hosted RLS validation requires an explicit stage approval and real results. This design milestone ran no hosted tests.

## Security and behavior matrix

| Case                         | Action                                                                                         | Expected result/evidence                                                                                                                                                                                                |
| ---------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Own create/read              | A creates and lists own active Persona                                                         | Exactly A-owned result; owner from verified session; no user ID input authorizes it                                                                                                                                     |
| Cross-user read              | A queries B Persona by UUID                                                                    | Empty PostgREST result; no B metadata returned                                                                                                                                                                          |
| Cross-user update            | A patches B Persona                                                                            | Zero affected rows or denied; B independently confirms all fields/version unchanged                                                                                                                                     |
| Cross-user delete/archive    | A deletes or archives B Persona                                                                | Zero affected rows or denied; B confirms active/archive state unchanged                                                                                                                                                 |
| Cross-user profile select    | A creates a selection against B profile/account                                                | WITH CHECK / FK rejects; no selection exists after B reads own Persona or after A list                                                                                                                                  |
| Cross-user override          | A submits B account/persona/source key                                                         | RLS or composite FK rejects; no record persisted                                                                                                                                                                        |
| Cross-user default           | A attempts to set B as default or mutate B `is_default`                                        | Target not found under owner scope or denied; B default remains unchanged                                                                                                                                               |
| Anonymous reads/writes       | anon SELECT all Persona tables and INSERT Persona/selection/override                           | No private rows; writes denied for privilege or RLS; check actual privilege path, not just empty results                                                                                                                |
| Archived state               | Owner archives and restores own Persona                                                        | Archived remains owner-readable, not default; restore active/non-default; anon and other user still denied                                                                                                              |
| Canonical deletion isolation | Owner deletes a Persona with selected profile fields                                           | Persona config cascades; canonical `identity_profiles` row and values remain unchanged                                                                                                                                  |
| ID/account tampering         | A sends own Persona ID with B account ID; B Persona ID with A account ID; cross-account FK IDs | RLS WITH CHECK and composite FK prevent persistence; canonical rows unchanged                                                                                                                                           |
| Session separation           | A and B clients authenticate independently; sign out A                                         | `auth.getUser()` identifies each expected user; A sign-out leaves B session valid                                                                                                                                       |
| Selection behavior           | New canonical fixture is added after Persona setup                                             | Not included unless explicitly selected; no automatic exposure                                                                                                                                                          |
| Canonical update             | Update selected canonical field without override, then with override                           | No override resolves new canonical value; explicit override remains; reset resumes canonical value                                                                                                                      |
| Source archival/deletion     | Archive selected source, then restore; attempt hard delete while selected                      | Archived item excluded with recoverable state; restore resolves again; hard delete is restricted until explicit deselection                                                                                             |
| Revision and concurrency     | Apply accepted override while racing stale versions                                            | Accepted mutation and revision are atomic; stale expected version conflicts; no fabricated/direct revisions. AI-originated accepted changes include suggestion ID/source and explicit user actor in revision provenance |

## SQLSTATE and result interpretation

RLS-filtered SELECT often returns zero rows with HTTP 200. That is the expected read denial only after the test establishes the record exists to its owner. UPDATE/DELETE may similarly return zero rows; verify with the independent owning session. INSERT/UPDATE `WITH CHECK` failures should be SQLSTATE `42501` or a surfaced equivalent. FK, CHECK, UNIQUE failures (`23503`, `23514`, `23505`) are only acceptable where they demonstrate a documented constraint and independent reads prove no write occurred. Never count a mock, a `postgres` query, or a service-role request as an RLS pass.

## Safe test data and cleanup

- Use two separate, confirmed development users; no production account.
- Snapshot only the test Personas/fields the test may touch; do not log profile text or credentials.
- Prefer newly created Persona fixtures under the two test accounts. Avoid overwriting established Master Identity fields.
- Cleanup in `finally`: restore changed Persona configuration/default; independently verify restoration using each user's session. Do not delete accounts or canonical identity records.
- If cleanup fails, stop, identify the affected test account by safe non-secret test label and field, and do not proceed to another scenario.
- Tests are opt-in. Credentials are supplied to the test process only, never to Next.js web server, source, generated files or output.

## Preconditions for later hosted execution

1. Persona SQL has been manually applied and separately catalog-verified by the developer.
2. A mutating transaction path exists for default changes, revisions and any multi-table write; its security model has passed code review.
3. The two-user test runner is configured with public project URL/anon key and dedicated users only.
4. Test cleanup and the exact table grants/policies have been reviewed. Stage approval is explicit.

No test result is implied by this plan or by pending SQL files.
