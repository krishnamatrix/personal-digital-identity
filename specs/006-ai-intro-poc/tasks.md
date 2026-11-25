# Tasks: AI intro POC

- [x] T001 Resolve scope and AD-014 isolation in spec.md and plan.md (NFR-008/009).
- [x] T002 Add failing acceptance tests in tests/video-studio.test.ts and tests/video-studio-jobs.test.ts (FR-001–006).
- [x] T003 Implement validators and provider/job services in src/domains/video-studio/ (FR-001–006; depends T002).
- [x] T004 Implement authenticated route in src/app/api/poc/video-studio/route.ts (FR-005/006; depends T003).
- [x] T005 Implement browser demo and studio in src/components/video-studio/ and src/app/poc/video-studio/page.tsx (FR-001–008; depends T003).
- [x] T006 Add UI acceptance coverage in tests/video-studio-ui.test.tsx (FR-003/007/008; depends T005).
- [x] T007 Run unit tests, typecheck, lint, formatting and database boundary checks; document real outcomes.
- [x] T008 Document launch, optional live configuration and limitations in quickstart.md; update all evidence.

## Analysis before implementation

2026-11-21: reviewed spec/plan/tasks against constitution. No critical inconsistency. Resolved provider persistence conflict by excluding database/storage/publishing; explicitly label local silent demo and stock voice preview. PDF/DOCX, durable jobs, billing, and production publishing excluded. All FRs have tasks and planned evidence.

## Verification

- `pnpm exec vitest run tests/video-studio*.test.*`: PASS, 17 tests across five files (domain, jobs, provider, routes, UI).
- `pnpm test`: 880 passing tests, 7 failing tests; 70 passing files, 3 failing files. Existing untouched failures: missing `@mediapipe/tasks-vision` in video-intro-background; Persona boundary assertion expecting findProfile; six résumé-import profile tests failing on `window.localStorage.clear`. The POC's 17 tests all pass.
- `pnpm typecheck`: blocked by two missing `@mediapipe/tasks-vision` declarations in existing `src/app/website/intro/background-fx.ts`; no POC type errors reported.
- `pnpm lint`: PASS.
- `pnpm check:db-boundary`: PASS, 226 source files scanned.
- `pnpm format:check`: PASS across the repository after formatting all authored POC files and the feature pointer.
- `git diff --check`: PASS.
- Local dev server on 127.0.0.1:3005: started after sandbox port binding escalation. HTTP GET `/poc/video-studio`: 200; rendered HTML contains studio title and controls. This is HTTP/compile evidence, not interactive browser evidence.
- Browser/hosted suites, actual Canvas export/playback and live provider execution: NOT RUN. No live provider credentials or private environment contents read. No SQL/database changes.

Implementation includes local demo export, optional D-ID adapter and owner-only in-memory jobs, input/consent flow, extractive résumé text drafting, and setup documentation. Production publication/persistence remain excluded.

### Dependency repair follow-up

2026-11-21: The user reported the recorder's missing `@mediapipe/tasks-vision` module. The package and lockfile already declared version 1.2.2, but its node_modules link was absent. Restored with `pnpm install --frozen-lockfile --ignore-scripts` using registry access; no package manifest or lockfile change. Node module resolution and `pnpm typecheck` now PASS. `pnpm test`: 895 passing, seven failing tests in two existing unrelated files (Persona boundary and résumé-import profile); the 15 background-video tests now PASS. This supersedes the missing-dependency blockers above.
