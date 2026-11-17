# Tasks: Local development bootstrap

**Product traceability**: New developer workflow requirement from the user request; see FR-001–FR-008 and US1 in spec.md. No product baseline ID applies.

## Setup and dependencies

- [x] T001 Read spec, plan, constitution, package scripts, ignore rules, and development setup guidance; confirm no database or provider changes are in scope.

## User Story 1 - Start the locally configured app (Priority: P1)

**Goal**: Start Folioone with `.env.local` using one explicit local command.

**Acceptance**: `npm run dev:local` starts Next from repository root when `.env.local` is present, gives safe setup feedback when absent, and leaves `npm run dev` unchanged (FR-001–FR-007).

### Implementation

- [x] T002 [US1] Add a Node launcher that requires repository-root `.env.local`, prints no values, and starts Next with inherited process environment and repository-root cwd (FR-002–FR-005) in scripts/dev-local.mjs.
- [x] T003 [US1] Add `dev:local` npm script while preserving `dev` exactly (FR-001, FR-006) in package.json.
- [x] T004 [US1] Document creating `.env.local`, the command, missing-file feedback, environment ownership, and service boundary (FR-003, FR-008) in docs/architecture/development-setup.md.

## Verification and completion

- [x] T005 Review implementation against acceptance scenarios; runtime tests/checks were not run because they were not requested. Startup behavior, missing-file handling, process-variable precedence, and secret-free output remain unverified at runtime.
- [x] T006 Update spec, plan, tasks, quickstart, and docs to match the delivered behavior.

## Dependencies and evidence

T001 → T002 → T003/T004 → T005/T006. Runtime acceptance verification is intentionally deferred because tests/verification were not requested for this turn. Source review confirms the launcher checks file metadata only and passes the inherited environment to Next; this does not substitute for runtime verification.
