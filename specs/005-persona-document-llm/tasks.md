# Tasks: LLM Persona Document Extraction & Classification Service

**Input**: `specs/005-persona-document-llm/spec.md`, `specs/005-persona-document-llm/plan.md`, `specs/005-persona-document-llm/research.md`, `specs/005-persona-document-llm/contracts/persona-document-api.md`, `specs/005-persona-document-llm/quickstart.md`

**Product traceability**: Carries `PER-002`, `FUT-006`, `AUTH-006`, `IMP-001`–`IMP-003`, `NFR-001`, `NFR-006`, `NFR-007`, `NFR-008`, `NFR-009`, `NFR-010`, `D-003`, and `AD-002` through three minimal, logically split tasks per user request. No SQL migrations or hosted tests are authorized by this task list.

## Implementation & Verification Tasks

- [x] T001 [US1] [US2] [US3] Implement local MarkItDown CLI converter (`execFile`, ephemeral `mkdtemp` cleanup, 30 s timeout, 100k char bound, `MARKITDOWN_BIN` override, honest unavailable error) and update Persona file validation, extraction schema (`personaType` allowlist + `personaTypeReason` + allowlisted `suggestedSections` + field clamping), LLM extractor (passing normalized Markdown text), and `.env.example` documentation (`PER-002`, `FUT-006`, `AUTH-006`, `IMP-001`–`IMP-003`, `NFR-007`, `FR-003`–`FR-007`, `FR-009`, `SC-002`, `SC-004`, `SC-005`) in `src/lib/ai/markitdown.ts`, `src/domains/personas/persona-document.ts`, `src/domains/personas/persona-extraction-schema.ts`, `src/lib/ai/persona-extractor.ts`, and `.env.example`
- [x] T002 [US1] [US2] [US3] Build authenticated `POST /api/llm/persona-document` Route Handler (`runtime = "nodejs"`, `force-dynamic`, `Cache-Control: no-store`, `401`/`400`/`503`/`422`/`200`, zero `@/lib/db/*` imports), remove redundant `extractPersonaDocumentAction`, and update `PersonaCreateFlow` to call the API service, display the detected Persona type & rationale, and prefill Steps 1–3 (metadata, suggested visible sections, custom headline/summary) for review without auto-saving (`PER-002`, `FUT-006`, `NFR-001`, `NFR-006`, `FR-001`, `FR-002`, `FR-008`, `FR-010`, `SC-001`–`SC-003`) in `src/app/api/llm/persona-document/route.ts`, `src/app/personas/actions.ts`, and `src/app/personas/persona-create-flow.tsx`
- [x] T003 [US1] [US2] [US3] Add and update Vitest unit, API-route, and UI tests covering MarkItDown conversion/cleanup/unavailable/timeout, file validation, Persona type & section clamping, `POST /api/llm/persona-document` (`401`/`400`/`503`/`422`/`200`), and `PersonaCreateFlow` badge/prefill/error preservation in `tests/markitdown.test.ts`, `tests/persona-document.test.ts`, `tests/persona-document-api.test.ts`, and `tests/persona-document-upload.test.tsx`, then run all persona/AI tests, `pnpm lint`, `pnpm check:db-boundary`, and Prettier checks (`NFR-008`, `NFR-009`, `SC-001`–`SC-005`)

## Dependencies and evidence

- **Execution order**: `T001` → `T002` → `T003` (3 minimal logical increments: MarkItDown + schema/LLM → API service + UI integration → tests & verification gates).
- **Independent test criteria**:
  - **US1 (Convert, classify, prefill)**: Valid document → MarkItDown Markdown → LLM classification & extraction → `200` with `personaType`, `personaTypeReason`, metadata, `suggestedSections`, `headline`, `summary`; UI displays detected type and prefills Steps 1–3 without auto-saving.
  - **US2 (Auth & validation)**: Unauthenticated returns `401` before conversion/LLM; empty/oversize/unsupported returns `400`; temp dirs are always cleaned up; malformed/empty LLM output returns `422` safely.
  - **US3 (Unavailable & failure recovery)**: Missing `markitdown` CLI or unconfigured LLM returns `503`; UI keeps manual creation usable and preserves previously typed fields on failure.
- **Recorded verification results (2026-11-20)**:
  - `pnpm exec vitest run tests/markitdown.test.ts tests/persona-document.test.ts tests/persona-document-api.test.ts tests/persona-document-upload.test.tsx tests/persona-ui.test.tsx tests/persona-actions.test.ts tests/persona-acceptance-states.test.tsx tests/persona-acceptance-fixes.test.tsx tests/persona-reapply-and-preview.test.tsx tests/resume-extractor.test.ts`: **PASS** (10 test files, 116/116 tests passed).
  - `pnpm lint`: **PASS** (0 errors, 0 warnings).
  - `pnpm check:db-boundary`: **PASS** (`database boundary OK: 213 source files scanned, no violations.`).
  - `pnpm exec prettier --check` on all changed source and test files: **PASS**.
- **Out-of-band / separately authorized checks**: Live `markitdown` CLI + live LLM gateway upload test in local dev server (`quickstart.md`) was not run (`markitdown` is not currently on local `PATH`).
