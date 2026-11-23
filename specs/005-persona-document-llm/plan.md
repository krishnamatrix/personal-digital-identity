# Implementation Plan: LLM Persona Document Extraction & Classification Service

**Branch**: `feat/llms.txt` | **Date**: 2026-11-20 | **Spec**: [spec.md](spec.md)

## Summary

Build an authenticated server-side API service at `POST /api/llm/persona-document` that validates an uploaded document (`<= 5 MB`, PDF/DOCX/TXT/MD), converts it to normalized Markdown (`.md`) using the local `markitdown` CLI with guaranteed ephemeral temp-file cleanup, passes that Markdown to the configured server-only LLM provider (`002-local-ai-gateway`), classifies the document's `personaType` (`Professional | Founder | Academic | Creative | Speaker | Other`), and returns a validated, clamped Persona screen-model object (`name`, `audience`, `purpose`, `description`, `headline`, `summary`, `suggestedSections`, `personaType`, `personaTypeReason`). Update `PersonaCreateFlow` to call this API service, display the detected Persona type and rationale, and prefill Steps 1–3 for user review before saving.

## Technical Context

**Language/Version**: TypeScript 5.9.2; Node `>=20.9.0` (verified in `package.json`).  
**Primary Dependencies**: Next.js 15.5.29 App Router (`nodejs` runtime for `child_process.execFile` + `fs/promises`), React 19.1.1, Zod 4.1.8, pnpm 10.33.0. External local CLI dependency: `markitdown` (Python package, configurable via server-only `MARKITDOWN_BIN`, honest `503` when absent). Zero new npm packages required.  
**Storage**: None. Ephemeral temp directory under `os.tmpdir()` cleaned up in `finally` on both success and failure; zero database tables, zero Storage buckets, zero SQL migrations.  
**Testing**: Vitest 3.2.4 for unit tests (MarkItDown adapter with injected runner, schema clamping & allowlists, LLM extractor, API route auth/validation/error codes, and `PersonaCreateFlow` UI prefill/badge/error tests); `pnpm lint`, `pnpm check:db-boundary`, and Prettier checks. Live MarkItDown + live LLM verification remains environment-dependent.  
**Target Platform**: Web (Next.js Route Handler + React client component).  
**Project Type**: Next.js modular monolith.  
**Performance Goals**: Upload bounded to `<= 5 MB`; MarkItDown CLI bounded to 30 s timeout and 2 MB stdout buffer; converted Markdown bounded to `<= 100,000` characters; LLM request bounded to 120 s timeout (`no-store`).  
**Constraints**: Strict server-side auth (`AD-004`), zero shell interpolation (`execFile` only), guaranteed temp cleanup, no credentials/document content in logs (`NFR-007`), review-before-save (`AD-002`, `AD-007`, `FUT-006`), no DB queries in route handlers (`AD-009`).  
**Scale/Scope**: One API route (`POST /api/llm/persona-document`), one MarkItDown converter module (`src/lib/ai/markitdown.ts`), updated Persona extraction schema & LLM extractor, updated `PersonaCreateFlow`, `.env.example` documentation, and Vitest test suites.

## Constitution Check

_Evaluated pre-design and rechecked post-design against `.specify/memory/constitution.md` (v1.1.0):_

- [x] **I (Specify outcomes before implementation)**: PASS — `specs/005-persona-document-llm/spec.md` defines scope, exclusions, 3 user stories, FR-001–FR-010, SC-001–SC-005, and resolved all 3 clarifications (`checklists/requirements.md`: 16/16 passing).
- [x] **II (Preserve canonical identity and domain boundaries)**: PASS — Conversion and LLM logic live in `src/lib/ai/`, schema/validation in `src/domains/personas/`, HTTP contract in `src/app/api/llm/persona-document/route.ts`, and UI in `src/app/personas/persona-create-flow.tsx`. Route handler never imports `@/lib/db/*`. Master Identity is never mutated. Zero new npm dependencies.
- [x] **III (Private by default, explicit publishing)**: PASS — Endpoint requires authenticated session via `getPersonaService().loadCanonicalForCreate()` before any file reading, conversion, or LLM call. All responses set `Cache-Control: no-store`. Never saves a Persona or publishes anything. Never reads `.env.local` or exposes server secrets to the browser.
- [x] **IV (Separate authored changes from execution evidence)**: PASS — Zero SQL changes required. Live `markitdown` CLI (currently absent from local PATH) and live LLM gateway behavior are explicitly distinguished from mocked unit/route test evidence.
- [x] **V (Verify behavior and keep evidence honest)**: PASS — Every FR/SC maps to Vitest unit/route/UI tests covering auth rejection, file validation, MarkItDown conversion & temp cleanup, Persona type classification, schema clamping, failure states, and UI prefilling, plus `pnpm lint`, `pnpm check:db-boundary`, and Prettier checks.
- [x] **VI (Trace product requirements and distinguish delivery scope)**: PASS — Linked to `PER-002`, `FUT-006`, `AUTH-006`, `IMP-001`–`IMP-003`, `NFR-001/006/007/008/009/010`, `D-003`, and `AD-002`.

## Existing evidence and decisions

- **Unified AI provider config (`002-local-ai-gateway`)**: `src/lib/ai/config.ts` resolves `llm_provider=google|openai|local`, `llm_endpoint`, `llm_api_key`, `llm_model`, and `llm_response_format` (plus legacy aliases). `src/lib/ai/openai-compatible.ts` already supports `extractStructuredDocument` with text payloads and `json_schema`/`json_object` modes.
- **Current Persona upload implementation**: Earlier work added `src/domains/personas/persona-document.ts`, `src/domains/personas/persona-extraction-schema.ts`, `src/lib/ai/persona-extractor.ts`, and `extractPersonaDocumentAction` in `src/app/personas/actions.ts`. This feature upgrades that pipeline to:
  1. Convert all uploaded documents to Markdown via local `markitdown` (`src/lib/ai/markitdown.ts`), eliminating direct binary PDF dependencies on text-only local LLMs.
  2. Expose a dedicated authenticated HTTP API service (`POST /api/llm/persona-document`) instead of a Server Action-only path.
  3. Add `personaType` classification (`Professional | Founder | Academic | Creative | Speaker | Other`), `personaTypeReason`, and `suggestedSections` (allowlisted `STARTER_SECTION_KEYS`) to the extraction schema, LLM prompt, and `PersonaCreateFlow` UI.
- **Local environment observation**: `command -v markitdown` returned not found on the current machine's `PATH`, confirming that honest `503` unavailable handling when `markitdown` is missing is essential.

## Project Structure

Only the paths below are created or modified:

```text
src/
├── domains/
│   └── personas/
│       ├── persona-document.ts             # File validation (size, extension, magic bytes) + MarkItDown call
│       └── persona-extraction-schema.ts    # Add personaType, personaTypeReason, suggestedSections + clamping
├── lib/
│   └── ai/
│       ├── markitdown.ts                   # Local markitdown CLI runner (execFile, temp dir cleanup, timeout, bounds)
│       └── persona-extractor.ts            # Pass converted Markdown to configured LLM; classify Persona type + screen model
└── app/
    ├── api/
    │   └── llm/
    │       └── persona-document/
    │           └── route.ts                # POST /api/llm/persona-document (auth, validate, MarkItDown, LLM, JSON response)
    └── personas/
        ├── actions.ts                      # Remove redundant extractPersonaDocumentAction (replaced by API service)
        └── persona-create-flow.tsx         # Call POST /api/llm/persona-document, show detected Persona type, prefill Steps 1–3

.env.example                                # Document optional server-only MARKITDOWN_BIN

tests/
├── markitdown.test.ts                      # Unit tests: CLI invocation, ENOENT/timeout/empty/oversize, temp cleanup
├── persona-document.test.ts                # Update: file validation, Persona type + suggestedSections clamping
├── persona-document-api.test.ts            # Route handler tests: 401, 400, 503, 422, 200, no-store, no leaks
└── persona-document-upload.test.tsx        # UI tests: fetch API, detected Persona type badge, section prefill, error preservation

specs/005-persona-document-llm/
├── spec.md
├── plan.md
├── research.md
├── quickstart.md
├── contracts/
│   └── persona-document-api.md
└── checklists/
    └── requirements.md
```

## Contracts and data changes

- **HTTP API Contract**: Documented in [contracts/persona-document-api.md](contracts/persona-document-api.md).
  - `POST /api/llm/persona-document` (`multipart/form-data`, field `file`).
  - `200 OK` (`Cache-Control: no-store`): `{ ok: true, data: PersonaUploadDraft }` including `personaType`, `personaTypeReason`, `name`, `audience`, `purpose`, `description`, `headline`, `summary`, `suggestedSections`.
  - Error statuses (`Cache-Control: no-store`): `401` (`unauthenticated`), `400` (`invalid_file`), `503` (`unavailable`), `422` (`extraction_failed`).
- **Database / Schema Changes**: None. No SQL authored or executed.

## Validation and requirement mapping

| Product requirement / feature scenario                                                       | Implementation paths                                                                                                | Test or manual check                                                                                                                                                                | Command and authorization needed                                              |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `PER-002`, `FUT-006` / FR-001, FR-004, FR-005 / US1 scenario 1, SC-002                       | `src/lib/ai/markitdown.ts`, `src/lib/ai/persona-extractor.ts`, `src/app/api/llm/persona-document/route.ts`          | Assert valid document → MarkItDown Markdown → LLM structured JSON → `200` with `personaType` + clamped screen model                                                                 | `pnpm exec vitest run` (local, no extra auth)                                 |
| `AD-002`, `AD-007`, `FUT-006` / FR-006, FR-007, FR-008 / US1 scenarios 1–2                   | `src/domains/personas/persona-extraction-schema.ts`, `src/app/personas/persona-create-flow.tsx`                     | Assert UI calls `POST /api/llm/persona-document`, renders detected Persona type & reason, prefills Steps 1–3 (metadata, suggested sections, headline/summary), and never auto-saves | `pnpm exec vitest run` (local, no extra auth)                                 |
| `NFR-001`, `IMP-001`, `NFR-007` / FR-002, FR-003, FR-009 / US2 scenarios 1–3, SC-001, SC-004 | `src/app/api/llm/persona-document/route.ts`, `src/domains/personas/persona-document.ts`, `src/lib/ai/markitdown.ts` | Assert 401 unauthenticated before conversion/LLM, 400 invalid/empty/oversize file, temp directory removed on success & error, zero document/credential leaks in error responses     | `pnpm exec vitest run` (local, no extra auth)                                 |
| `AUTH-006`, `NFR-006` / FR-010 / US3 scenarios 1–2, SC-003, SC-005                           | `src/lib/ai/markitdown.ts`, `src/app/api/llm/persona-document/route.ts`, `src/app/personas/persona-create-flow.tsx` | Assert `503` when `markitdown` binary or LLM config is missing; assert `422` on empty Markdown/malformed LLM; assert UI preserves previously typed values                           | `pnpm exec vitest run` (local, no extra auth)                                 |
| `AD-009`, `NFR-008`, `NFR-009` / Repository gates                                            | All changed files                                                                                                   | ESLint, DB boundary, Prettier formatting                                                                                                                                            | `pnpm lint && pnpm check:db-boundary && pnpm exec prettier --check <changed>` |
| Live MarkItDown + live LLM check                                                             | Local dev server                                                                                                    | Manual upload with `markitdown` installed and LLM configured per `quickstart.md`                                                                                                    | Developer-triggered local verification                                        |

## Rollout and risks

- **Local dependency risk**: `markitdown` must be installed in the server environment (`pip install 'markitdown[all]'` or `uv tool install markitdown`, or pointed to via `MARKITDOWN_BIN`). When missing, the API returns a clean `503` with setup guidance and manual Persona creation continues working uninterrupted.
- **Process safety**: `execFile` is called with an argument array (no shell), strict 30 s timeout, 2 MB stdout cap, and an isolated `mkdtemp` directory deleted in `finally`.
- **Rollback**: Revert the API route, MarkItDown module, schema extensions, and `PersonaCreateFlow` fetch call.

## Complexity Tracking

None. All six constitution gates pass without exceptions or new npm dependencies.
