# Tasks: Workspace viewer profile compatibility

**Input**: [spec.md](spec.md), [plan.md](plan.md). No optional design artifacts are needed.
**Product references**: ID-001, PER-007, NFR-001/006/008/009. **Branch**: feat/llms.txt.

## Phase 1 — Setup

- [x] T001 Trace the reported load through src/domains/identity/viewer.ts and src/lib/db/queries/identity.ts; record the missing-column diagnosis and limits in specs/001-workspace-viewer-profile/spec.md.

## Phase 2 — Foundational

- [x] T002 Confirm explicit columns, auth/error mapping, and M4 prerequisites in src/lib/db/queries/identity.ts and docs/architecture/m4-auth-onboarding.md; finalize the bounded compatibility contract in specs/001-workspace-viewer-profile/plan.md.

## Phase 3 — US1: Load workspace identity on modern and older schemas (P1 / MVP)

**Goal**: Header identity must not require unrelated expanded profile fields.
**Independent acceptance**: Modern columns, absent full_name, missing profile, and owner-scoping cases pass without writes or recovered page-load logging (FR-001/002/003).

- [x] T003 [P] [US1] Add failing modern projection, missing-column retry, nullable fullName, missing-profile, and owner-filter cases in tests/identity-profile-repository.test.ts (FR-001/002).
- [x] T004 [P] [US1] Add failing viewer orchestration tests for modern identity, signup fallback, missing profile, and recovered missing-column behavior in tests/workspace-viewer-loader.test.ts (FR-003).
- [x] T005 [US1] Implement validated findViewerProfile with explicit modern/baseline selects, the same owner filter, and one missing-column-only retry in src/lib/db/queries/identity.ts (FR-001/002).
- [x] T006 [US1] Switch getViewer to the projection through the existing query barrel while preserving session/plan/name behavior in src/domains/identity/viewer.ts (FR-003).

## Phase 4 — US2: Preserve real failures and migration requirements (P2)

**Goal**: Compatibility recovery must not hide failed authorization, service failure, or profile-editor schema drift.
**Independent acceptance**: Non-column errors do not retry; a failed retry remains an error; framework signals propagate; full-profile reads retain strict semantics (FR-003/004/005).

- [x] T007 [P] [US2] Add permission/network/missing-table, failed-baseline-retry, and strict full-profile missing-column cases in tests/identity-profile-repository.test.ts (FR-003/004).
- [x] T008 [P] [US2] Add signed-out, unexpected auth/profile failure, billing independence, and Next.js control-flow tests in tests/workspace-viewer-loader.test.ts; retain src/lib/server-log.ts error logging unchanged (FR-003).
- [x] T009 [US2] Document the 42703 diagnosis, viewer-only compatibility, and developer-controlled M4 migration requirement in docs/architecture/development-setup.md (FR-004/005).

## Phase 5 — Polish and verification

- [x] T010 Run focused and full unit tests plus typecheck/lint/database-boundary/changed-file formatting checks; record actual commands/results and unrun hosted reproduction in specs/001-workspace-viewer-profile/tasks.md (FR-005).
- [x] T011 Validate task format, requirement coverage and spec/plan consistency; record completion and schema-repair limitations in specs/001-workspace-viewer-profile/tasks.md.

## Dependencies and parallel opportunities

T001 → T002 → T003/T004 → T005 → T006 → T007/T008/T009 → T010 → T011.
US2 depends on the US1 query contract but its negative cases can be specified before implementation.
After T002, T003 and T004 can be written independently because they target different test files.
After US1, T007, T008 and T009 can proceed independently. These are opportunities for independent
work, not instructions to spawn agents. Execution in this request is sequential.

## Implementation strategy

Deliver US1 first: prove the excessive profile projection and legacy-column regression, implement
the bounded query, and wire the header. Then complete US2 so success cannot be achieved by global
error suppression. Run all unit tests only after focused regressions pass. No SQL/database/hosted
workflow is part of these tasks. No implementation task changes canonical profile writes.

## Evidence

Completed 2026-11-15. All 11 tasks are complete: US1 has four tasks, US2 has three,
and setup/foundation/final verification have four. MVP is US1; US2 supplies diagnostic safeguards.
Parallel opportunities and independent acceptance criteria are documented above.

- Before implementation, the targeted repository suite failed on the absent viewer-query API
  (nine failing new cases, four existing/strict-read cases passing).
- `pnpm exec vitest run tests/identity-profile-repository.test.ts tests/workspace-viewer-loader.test.ts tests/workspace-viewer.test.tsx tests/server-log.test.ts`: 33 tests passed.
- `pnpm test`: 53 files, 692 tests passed.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- `pnpm check:db-boundary`: passed, 164 source files scanned.
- Prettier check for changed feature code, tests, troubleshooting and feature artifacts: passed.
- `git diff --check`: passed.
- Checklist IDs are sequential, story tasks have US labels, and every task includes a file path.
  FR-001/002 map to T003/T005, FR-003 to T004/T006/T007/T008, FR-004 to T007/T009,
  and FR-005 to T009/T010. Constitution checks remain satisfied after implementation.
- Real configured-database reproduction, hosted tests, SQL execution, and database migration state
  remain unverified. This fix changes workspace header reads only; full profile editing still
  requires the M4 columns. No database or unrelated Supabase/configuration files were modified.

## Follow-up — Optional billing schema in workspace chrome (FR-006 / US2)

- [x] T012 [US2] Reproduce PGRST205/42P01 error logging with failing regressions and cover other codes/types, active PRO and framework rethrows in tests/workspace-viewer-loader.test.ts (FR-006).
- [x] T013 [US2] Handle typed missing-table errors only in src/domains/identity/viewer.ts; document optional badge behavior and unchanged billing enforcement in docs/architecture/development-setup.md, specs/001-workspace-viewer-profile/spec.md and specs/001-workspace-viewer-profile/plan.md (FR-006).
- [x] T014 Record targeted/full unit and repository verification for FR-006 in specs/001-workspace-viewer-profile/tasks.md.

The follow-up extends US2 after T011. T012 → T013 → T014; no independent parallel
implementation tasks. Before the fix, two missing-table regressions failed and fifteen
viewer cases passed. After the fix, 37 targeted viewer/billing tests passed. This is a
workspace-display compatibility change, not database repair or a payment-readiness claim.

Follow-up verification: `pnpm test` passed (53 files, 699 tests); `pnpm typecheck`,
`pnpm lint`, `pnpm check:db-boundary`, and changed-file Prettier checks passed.
No database access or live reproduction was performed. All fourteen tasks are complete.

## Local profile-editor schema follow-up

The user confirmed local Supabase on 2026-11-15 after reporting `/profile` code 42703.
The local migration directory contained only base/Persona migrations 001–007. Full profile
editing deliberately remains strict; header compatibility cannot supply missing database columns.

- [x] T015 Package the existing reviewed docs/sql/milestone-4/001-identity-profile-expansion.sql as supabase/migrations/008_identity_profile_expansion.sql with a schema-cache reload; document manual local application in docs/architecture/development-setup.md.
- [ ] T016 Developer: verify local migration history/preflight, apply supabase/migrations/008_identity_profile_expansion.sql to the intended local stack, review its postchecks, and verify profile load/save; report actual execution before updating docs/sql/execution-tracker.md.

Packaging validation passed: canonical M4 body is unchanged, reload statement is present,
documentation formatting and git diff checks pass. T016 remains pending; no database connection,
SQL execution, or live profile validation was performed. No reset or rollback is part of the repair.
If the CLI is not installed on PATH, use `npx supabase@2 migration list --local` and
`npx supabase@2 migration up --local` as the developer, after reviewing pending migrations.
