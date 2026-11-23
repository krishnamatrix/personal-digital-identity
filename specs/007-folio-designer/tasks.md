# Tasks: Folio Designer

**Input**: `specs/007-folio-designer/spec.md`, `specs/007-folio-designer/plan.md`, `specs/007-folio-designer/research.md`, `specs/007-folio-designer/data-model.md`, `specs/007-folio-designer/contracts/folio-designer-api.md`, `specs/007-folio-designer/quickstart.md`

**Product traceability**: Carries `DES-001`–`DES-003`, `WEB-001`–`WEB-004`, `WEB-010`, `ID-006`, `FUT-006`, `BILL-001`–`BILL-005`, `AUTH-004`/`AUTH-006`, `NFR-001`, `NFR-006`, `NFR-007`, `NFR-009` through three minimal tasks per owner request. No SQL migrations or hosted/browser tests are authorized by this task list.

## Implementation & verification tasks

- [x] T001 [US2] Implement Folio Designer domain and LLM extraction: prompt/proposal Zod schemas (20–2,000 chars, `THEME_IDS`, `normalizeConfig`), bounded `IdentityDesignContext` builder, `folio-designer-extractor.ts` (structured JSON via `extractStructuredDocument`), and `buildDraftPreview(theme, config)` for owner preview without publish (`DES-002`, `FR-002`–`FR-006`, `FR-009`, `NFR-007`, `SC-002`) in `src/domains/folio-designer/folio-designer-schema.ts`, `src/domains/folio-designer/identity-design-context.ts`, `src/domains/folio-designer/folio-designer-service.ts`, `src/lib/ai/folio-designer-extractor.ts`, and `src/domains/website/website-service.ts`
- [x] T002 [US1] [US2] [US3] Add workspace entry and flows: **Folio Designer** under My Presence in `src/components/workspace/workspace-frame.tsx`, authenticated `/designer` page + client workspace (prompt, identity-use disclosure, generate via `POST /api/llm/folio-designer`, stale proposal on regen, `SiteView` preview via `POST /api/llm/folio-designer/preview` or equivalent server path), and `applyFolioDesignerProposalAction` → `saveWebsiteDraft` with confirm step, PRO error surfacing, and link to My Website (`DES-001`, `DES-003`, `FR-001`, `FR-007`–`FR-010`, `FR-008`, `ID-006`, `FUT-006`, `SC-001`, `SC-004`) in `src/app/designer/page.tsx`, `src/app/designer/designer-workspace.tsx`, `src/app/designer/actions.ts`, `src/app/api/llm/folio-designer/route.ts`, and `src/app/api/llm/folio-designer/preview/route.ts`
- [x] T003 [US1] [US2] [US3] Add Vitest coverage and run repository gates: schema/context clamping, API `401`/`400`/`503`/`422`/`200` + `no-store`, apply without `publishWebsite`, PRO apply lock, nav + UI prompt preservation and stale proposal; then run targeted vitest, `pnpm lint`, `pnpm check:db-boundary`, and `pnpm typecheck` per `specs/007-folio-designer/quickstart.md` (`NFR-001`, `NFR-009`, `SC-003`, `SC-005`) in `tests/folio-designer-schema.test.ts`, `tests/folio-designer-api.test.ts`, `tests/folio-designer-context.test.ts`, and `tests/folio-designer-ui.test.tsx`

## Dependencies and evidence

- **Execution order**: `T001` → `T002` → `T003` (domain + preview → routes/UI/nav/apply → tests and gates).
- **Parallel opportunities**: None between the three tasks (sequential by design); within `T002`, API routes and `workspace-frame.tsx` nav edit are `[P]` relative to each other only after `T001` schemas exist.
- **Independent test criteria**:
  - **US1 (Open from My Presence)**: Signed-in owner finds Folio Designer under My Presence; `/designer` shows prompt + generate; unsigned → login (`FR-001`, `DES-001`, `SC-001`).
  - **US2 (Generate proposal)**: Valid prompt → proposal + preview + rationale + `identityFieldsUsed`; empty prompt blocked; failures keep prompt; regen marks prior proposal stale (`DES-002`, `FR-002`–`FR-006`, `FR-008`–`FR-009`, `SC-002`).
  - **US3 (Apply draft)**: Confirm apply updates website draft only; dismiss/regen without apply leaves draft unchanged; published snapshot unchanged until existing publish (`DES-003`, `FR-007`, `ID-006`, `SC-004`).
- **MVP scope**: Complete **T001** + **T002** through generate + preview (US1 + US2); **T003** required before merge claim; apply (US3) ships in **T002** as part of the same increment.
- **Implementation strategy**: Mirror `005-persona-document-llm`—catalog-aligned structured LLM output, HTTP generate with session auth, review-before-apply, zero new DB tables.
- **Recorded verification results (2026-11-22)**:
  - `pnpm exec vitest run tests/folio-designer-schema.test.ts tests/folio-designer-api.test.ts tests/folio-designer-context.test.ts tests/folio-designer-ui.test.tsx tests/workspace-shell.test.tsx`: **PASS** (16 tests).
  - `pnpm typecheck`: **PASS**
  - `pnpm lint`: **PASS**
  - `pnpm check:db-boundary`: **PASS** (236 source files, no violations).
- **Out-of-band**: Live LLM end-to-end in local dev (`quickstart.md`); not required to check off **T003** unit/route/UI mocks.