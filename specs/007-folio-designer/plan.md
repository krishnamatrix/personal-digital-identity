# Implementation Plan: Folio Designer

**Branch**: `feat/llms.txt` | **Date**: 2026-11-22 | **Spec**: [spec.md](spec.md)

## Summary

Add a **Folio Designer** workspace module (`/designer`) under **My Presence** where authenticated owners submit a bounded natural-language prompt. A server-only LLM service (`POST /api/llm/folio-designer`) combines the prompt with a bounded **IdentityDesignContext** snapshot and returns a catalog-valid **FolioDesignerProposal** (`theme` + normalized `WebsiteConfig` + rationale). The UI shows a faithful preview via `buildDraftPreview` / `SiteView`, then applies the proposal to the **website draft only** through `applyFolioDesignerProposalAction` → `saveWebsiteDraft`. No new database schema, no publish path, no Master Identity writes.

## Technical Context

**Language/Version**: TypeScript 5.9.x; Node `>=20.9.0` (`package.json`).  
**Primary Dependencies**: Next.js 15.5.x App Router, React 19.x, Zod 4.x, Tailwind/shadcn, existing `src/lib/ai/openai-compatible.ts` + `config.ts` (`002-local-ai-gateway`). Zero new npm packages expected.  
**Storage**: Existing `websites` draft (`theme`, `config` jsonb) via `src/lib/db/queries/website.ts` → `saveDraft`; no new tables.  
**Testing**: Vitest for schema, API route, identity context builder, extractor (mocked LLM), apply action (mocked draft save), workspace nav + designer UI; `pnpm lint`, `pnpm check:db-boundary`, `pnpm typecheck`. Live LLM verification environment-dependent.  
**Target Platform**: Web (RSC page + client designer panel + route handlers).  
**Project Type**: Next.js modular monolith.  
**Performance Goals**: Prompt ≤ 2,000 chars; identity context bounded (~4 KB text); LLM timeout 120s (`no-store`); target p95 generate < 30s in configured env (SC-002).  
**Constraints**: `auth.getUser()` ownership; DB only in `src/lib/db/`; `saveWebsiteDraft` PRO rules; review-before-apply (`FUT-006`); no prompt/PII in logs (`NFR-007`); proposals ephemeral (`AD-007`).  
**Scale/Scope**: One nav link, one app route, two API routes (generate + optional preview), one domain folder, one LLM extractor module, one server apply action, Vitest suites.

## Constitution Check

Evaluated pre-design and rechecked post-design against `.specify/memory/constitution.md` (v1.1.0):

- [x] **I**: Spec defines FR-001–FR-010, three user stories, SC-001–SC-005; checklist 16/16 on spec; research resolves technical choices.
- [x] **II**: Domain logic under `src/domains/folio-designer/`; website persistence via `website-service`; HTTP in `src/app/api/llm/`; UI in `src/app/designer/`; nav in `workspace-frame.tsx`. No new frameworks.
- [x] **III**: All routes require session; identity context server-built; apply never publishes; public snapshots untouched; identity disclosure in UI before generate.
- [x] **IV**: **No SQL** authored; draft writes use existing verified `saveDraft` path; live LLM distinguished from mocked tests.
- [x] **V**: Requirement mapping table below; Vitest for auth, validation, entitlement, stale proposal, apply-without-publish.
- [x] **VI**: Traces `DES-001`–`DES-003`, `WEB-001`–`WEB-004`, `WEB-010`, `ID-006`, `FUT-006`, `BILL-001`–`BILL-005`, `NFR-001/006/007/009`; classified as planned capability.

## Existing evidence and decisions

- **Navigation**: `src/components/workspace/workspace-frame.tsx` defines `MY PRESENCE`; add `Folio Designer` → `/designer`.
- **Website draft**: `saveWebsiteDraft` in `src/domains/website/website-service.ts` accepts `{ theme, config }` with PRO gating (`isProWebsiteTheme`, `ProRequiredError`).
- **Preview pipeline**: `getPreview()` + `buildPublishedContent`; extend with `buildDraftPreview(theme, config)` sharing `loadSource()` (see [research.md](research.md) §4).
- **Catalog**: `THEME_IDS`, `websiteConfigSchema`, `SECTION_IDS` in `src/domains/website/config.ts`; LLM prompt includes condensed catalog list.
- **LLM patterns**: `src/lib/ai/persona-extractor.ts`, `POST /api/llm/persona-document` for auth + structured JSON extraction.
- **Billing edge**: PRO lock at apply via existing `saveWebsiteDraft` (research §6).
- **Site prerequisite**: If no `websites` row, apply surfaces “set your website address on My Website first” rather than auto-creating slug (narrower than spec “initialize draft” without slug policy—documented in [data-model.md](data-model.md)).

## Project Structure

```text
src/
├── domains/
│   └── folio-designer/
│       ├── folio-designer-schema.ts      # prompt + proposal Zod, clamp helpers
│       ├── identity-design-context.ts    # bounded snapshot from loadSource
│       └── folio-designer-service.ts     # orchestrate context + preview build (calls website helpers)
├── lib/
│   └── ai/
│       └── folio-designer-extractor.ts   # LLM structured proposal extraction
├── app/
│   ├── designer/
│   │   ├── page.tsx                      # RSC shell + auth redirect
│   │   ├── designer-workspace.tsx        # client: prompt, disclosure, generate, preview, apply
│   │   └── actions.ts                    # applyFolioDesignerProposalAction
│   └── api/
│       └── llm/
│           └── folio-designer/
│               ├── route.ts              # POST generate
│               └── preview/
│                   └── route.ts          # POST preview (optional)
└── components/
    └── workspace/
        └── workspace-frame.tsx             # nav link

tests/
├── folio-designer-schema.test.ts
├── folio-designer-api.test.ts
├── folio-designer-context.test.ts
└── folio-designer-ui.test.tsx

specs/007-folio-designer/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── folio-designer-api.md
└── checklists/
    └── requirements.md
```

## Contracts and data changes

- **HTTP**: [contracts/folio-designer-api.md](contracts/folio-designer-api.md) — `POST /api/llm/folio-designer`, optional `POST /api/llm/folio-designer/preview`.
- **Server action**: `applyFolioDesignerProposalAction` — validated proposal → `saveWebsiteDraft`.
- **Database**: None. No `docs/sql/` changes.

## Validation and requirement mapping

| Product requirement / feature scenario | Implementation paths | Test or manual check | Command and authorization needed |
| -------------------------------------- | -------------------- | -------------------- | -------------------------------- |
| `DES-001` / FR-001 / US1 | `workspace-frame.tsx`, `app/designer/page.tsx` | Nav visible; `/designer` loads prompt; unauthenticated → login | `vitest` `folio-designer-ui`; manual |
| `DES-002` / FR-002–FR-006, FR-009 / US2 | `identity-design-context.ts`, `folio-designer-extractor.ts`, `api/llm/folio-designer/route.ts`, `designer-workspace.tsx` | Valid prompt → proposal; empty → 400; 503 unconfigured; stale on regen; preview renders | `vitest` schema + api + ui |
| `DES-003` / FR-007 / US3 | `app/designer/actions.ts`, `saveWebsiteDraft` | Apply confirm → draft updated; dismiss → no save; publish not called | `vitest` action mocks |
| `FUT-006`, `ID-006` / FR-007 | Same + `website-service` | Apply without `publishWebsite`; identity repo not called on apply | Unit mocks |
| `BILL-001`–`005` / edge | `saveWebsiteDraft` | PRO theme apply throws surfaced message | `vitest` |
| `NFR-001`, `NFR-007` / FR-004 | API routes | No client user id; error bodies sanitized | `vitest` api |
| `NFR-006`, `AUTH-006` / FR-008–FR-010 | `designer-workspace.tsx` | Loading/error a11y; prompt preserved on failure | `vitest` ui + a11y smoke |
| Repo gates | All touched files | Lint, boundary, types | `pnpm lint && pnpm check:db-boundary && pnpm typecheck` |
| Live LLM | Local dev | End-to-end generate + apply | Developer; `quickstart.md` |

## Rollout and risks

- **LLM quality/mis-selection**: Mitigate with strict Zod + `THEME_IDS` allowlist and `normalizeConfig`; show rationale and emphasized sections for human judgment.
- **Missing website row on apply**: Clear CTA to My Website address step; avoids silent slug creation.
- **Payload size**: Cap identity excerpt lengths in context builder; reject oversize LLM JSON.
- **Rollback**: Remove nav link, routes, domain module, and tests; no migration to revert.

## Complexity Tracking

None. All constitution gates pass without exceptions or new dependencies.