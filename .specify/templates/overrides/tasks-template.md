# Tasks: [FEATURE NAME]

**Input**: This feature's spec.md and plan.md; research, contracts, and data-model only when relevant.

**Product traceability**: Carry applicable stable IDs from `specs/product-requirements.md` through each story's tasks and acceptance evidence. Resolve affected source conflicts and decisions before dependent work. Keep planned capabilities and unverified environment claims explicit.

Use `- [ ] T001 [US1] Description (FR-001) in exact/path`. `[P]` indicates independent work only; it does not authorize spawning agents. Use sequential task IDs, real repository paths, explicit dependencies, and requirement/scenario references. Replace all examples and placeholders with actual work.

## Setup and dependencies

- [ ] T001 Read the feature spec, plan, constitution, and relevant architecture records; resolve blocking uncertainty.
- [ ] T002 [Only the feature's real prerequisites, with paths; omit unnecessary scaffolding.]

## User Story 1 - [Title] (Priority: P1)

**Goal**: [Independently useful user outcome]

**Acceptance**: [Scenarios and requirement IDs]

### Tests

Include meaningful coverage for changed behavior, invalid/unauthorized cases, and privacy boundaries as applicable. Establish the failing case before the fix where practical. Do not add tests that only mirror implementation or artificial tests for documentation edits.

- [ ] T003 [US1] [Acceptance coverage, FR/scenario IDs, exact test path]

### Implementation

- [ ] T004 [US1] [Concrete implementation, FR IDs, exact source path; depends on relevant prerequisite]

[Repeat for additional stories. Do not include unrelated setup, SQL execution, or hosted tests as implicitly authorized tasks.]

## Verification and completion

- [ ] T005 Run applicable `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm check:db-boundary`, and formatting checks; record results.
- [ ] T006 Verify remaining acceptance scenarios and record any separately authorized checks, blockers, and unrun checks.
- [ ] T007 Update this spec, plan, tasks, and affected documentation to match delivered behavior.

## Dependencies and evidence

[Ordering, independently executable work, commands and actual results. Leave a task unchecked until its work is complete.]
