# Tasks: LLM and Agent Discovery (`llms.txt`)

**Input**: `specs/004-llms-txt/spec.md`, `specs/004-llms-txt/plan.md`, `specs/004-llms-txt/research.md`, `specs/004-llms-txt/contracts/llms-txt-endpoints.md`, `specs/004-llms-txt/quickstart.md`

**Product traceability**: Carries `FUT-004`, `WEB-002`, `WEB-004`, `WEB-005`, `WEB-007`, `WEB-008`, `WEB-009`, `ART-007`, `NFR-002`, `NFR-004`, `NFR-007`, `NFR-008`, `NFR-009`, `NFR-010`, and decisions `D-001`/`D-005` through three cohesive, dependency-ordered tasks per user request. No SQL migrations or hosted tests are authorized by this task list.

## Implementation & Verification Tasks

- [x] T001 [US1] [US2] Build pure `llms.txt` Markdown formatters, sanitization, URL filtering, scheduled-links filtering, and `< 100 KB` UTF-8 size bounding (`buildPlatformLlmsTxt`, `buildWebsiteLlmsTxt`) (`FUT-004`, `WEB-002`, `WEB-004`, `NFR-002`, `NFR-007`, `NFR-010`, `FR-001`–`FR-005`, `FR-009`, `SC-001`, `SC-002`, `SC-005`) in `src/domains/llms/llms-txt.ts`
- [x] T002 [US1] [US2] [US3] [US4] Integrate `GET /llms.txt` and `GET /<slug>/llms.txt` Route Handlers (snapshot-only reads via `getPublicSite`/`getPublicArticles`/`applyLiveArticles`/`linksLiveOn`, `force-dynamic`, `no-store` revocation, safe `404`/`503` with `X-Robots-Tag: noindex`, zero `@/lib/db/*` imports) and add `alternates.types["text/markdown"]` discovery metadata on `/` and live `/<slug>` only (`FUT-004`, `WEB-005`, `WEB-007`, `WEB-008`, `WEB-009`, `ART-007`, `NFR-002`, `NFR-004`, `FR-001`–`FR-008`, `FR-010`, `SC-001`–`SC-004`) in `src/app/llms.txt/route.ts`, `src/app/[slug]/llms.txt/route.ts`, `src/app/page.tsx`, and `src/app/[slug]/page.tsx`
- [x] T003 [US1] [US2] [US3] [US4] Add Vitest unit, privacy/allowlist, sanitization, payload-bound, dotted-slug rejection, route-handler lifecycle (`200`/`404`/`503`, headers, immediate article/site withdrawal and slug rename), and HTML discovery metadata tests in `tests/llms-txt.test.ts` and `tests/llms-txt-routes.test.ts`, then run `pnpm typecheck`, `pnpm lint`, `pnpm check:db-boundary`, `pnpm test`, and Prettier check on changed files (`NFR-008`, `NFR-009`, `SC-001`–`SC-005`)

## Dependencies and evidence

- **Execution order**: `T001` → `T002` → `T003` (linear, 3 logical increments: domain formatter → routes & metadata integration → tests & verification gates).
- **Independent test criteria**:
  - **US1 (`/llms.txt`)**: Anonymous `GET /llms.txt` returns `200`, `text/markdown; charset=utf-8`, valid `#`/`>`/`##` Markdown with absolute public links and zero user data.
  - **US2 (`/<slug>/llms.txt`)**: Anonymous `GET /<slug>/llms.txt` returns approved snapshot sections and live articles only; excludes hidden/unselected entries and excluded contact fields; unknown/unpublished/reserved/dotted slugs return `404`.
  - **US3 (Revocation)**: Article withdrawal, slug rename, and website unpublish take effect on the immediately following request with `Cache-Control: no-store`.
  - **US4 (Discovery)**: `/` and live `/<slug>` emit `alternates.types["text/markdown"]`; 404 `/<slug>` and private workspace routes do not.
- **Recorded verification results (2026-11-20)**:
  - `pnpm exec vitest run tests/llms-txt.test.ts tests/llms-txt-routes.test.ts`: **PASS** (2 test files, 13/13 tests passed).
  - `pnpm lint`: **PASS** (0 errors, 0 warnings).
  - `pnpm check:db-boundary`: **PASS** (`database boundary OK: 208 source files scanned, no violations.`).
  - `pnpm exec prettier --check src/domains/llms/llms-txt.ts src/app/llms.txt/route.ts "src/app/[slug]/llms.txt/route.ts" src/app/page.tsx "src/app/[slug]/page.tsx" tests/llms-txt.test.ts tests/llms-txt-routes.test.ts`: **PASS**.
  - `pnpm typecheck`: **0 errors in feature files**; 2 pre-existing unrelated errors in `src/app/website/intro/background-fx.ts` (`Cannot find module '@mediapipe/tasks-vision'`, missing from local `node_modules`).
  - `pnpm test` (full suite): **61/63 suites green** after fixing the `tests/llms-txt-routes.test.ts` font mock; 2 pre-existing unrelated failures (`tests/video-intro-background.test.ts` due to missing `@mediapipe/tasks-vision`, and `tests/resume-import-profile.test.tsx` due to local Node runtime `--localstorage-file` warning).
- **Out-of-band / separately authorized checks**: Local dev server `curl` spot-check (`quickstart.md`) and any hosted/browser E2E suites remain developer-triggered (not run).
