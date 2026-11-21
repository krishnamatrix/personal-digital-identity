# Implementation Plan: LLM and Agent Discovery (`llms.txt`)

**Branch**: `feat/llms.txt` | **Date**: 2026-11-20 | **Spec**: [spec.md](spec.md)

## Summary

Deliver concise, standards-aligned `llms.txt` plain-text Markdown endpoints at `/llms.txt` (Folioone platform overview) and `/<slug>/llms.txt` (automatic per-published-website summary), plus HTML discovery `<link rel="alternate" type="text/markdown">` metadata on `/` and live `/<slug>` pages. All per-website output is generated purely from existing validated public website snapshots (`getPublicSite`) and live published article snapshots (`getPublicArticles` + `applyLiveArticles`), requiring zero database schema changes, zero new dependencies, and zero new database queries.

## Technical Context

**Language/Version**: TypeScript 5.9.2; Node `>=20.9.0` (verified in `package.json`).  
**Primary Dependencies**: Next.js 15.5.29 App Router, React 19.1.1, Zod 4.1.8, pnpm 10.33.0. No new packages required.  
**Storage**: Read-only consumption of existing public snapshot services (`getPublicSite`, `getPublicArticles`), which call `src/lib/db/query` through the anonymous Supabase client for live published rows only. No database DDL or schema changes.  
**Testing**: Vitest 3.2.4 for unit, sanitization, privacy, lifecycle, and route-handler tests; `pnpm typecheck`, `pnpm lint`, `pnpm check:db-boundary`, and `pnpm exec prettier --check` on changed files. Hosted/browser suites are not run without explicit authorization.  
**Target Platform**: Web (Next.js Route Handlers and Metadata API).  
**Project Type**: Next.js modular monolith.  
**Performance Goals**: Platform `/llms.txt` under 500 ms (pure in-memory formatting); per-website `/<slug>/llms.txt` bounded under 100 KB per document with a single parallel fetch of live website + live article snapshots (same read cost as `/<slug>`).  
**Constraints**: Strict AD-005 / AD-010 snapshot-only read boundary, AD-009 centralized DB boundary (route handlers never import `@/lib/db/*`), immediate unpublish/withdrawal via `force-dynamic` + `Cache-Control: no-store`, no user enumeration in `/llms.txt`, and strict Markdown/URL sanitization.  
**Scale/Scope**: Two public Route Handlers (`/llms.txt`, `/<slug>/llms.txt`), one pure domain module (`src/domains/llms/llms-txt.ts`), metadata link updates on `src/app/page.tsx` and `src/app/[slug]/page.tsx`, and comprehensive Vitest unit/route tests.

## Constitution Check

_Evaluated pre-design and rechecked post-design against `.specify/memory/constitution.md` (v1.1.0):_

- [x] **I (Specify outcomes before implementation)**: PASS — `specs/004-llms-txt/spec.md` defines scope, exclusions, 4 prioritized user journeys, FR-001–FR-010, SC-001–SC-005, and resolved all 3 clarifications (`checklists/requirements.md`: 16/16 passing).
- [x] **II (Preserve canonical identity and domain boundaries)**: PASS — Pure formatting lives in `src/domains/llms/llms-txt.ts`; route handlers call existing domain services (`website-service`, `article-service`) and never import `src/lib/db/`. No new dependencies; no changes to Master Identity, Personas, or visual design.
- [x] **III (Private by default, explicit publishing)**: PASS — `/llms.txt` contains only curated static platform text (zero user data, zero user enumeration). `/<slug>/llms.txt` reads only `getPublicSite` (validated live snapshot) and `getPublicArticles` (live article snapshots), uses `force-dynamic` + `Cache-Control: no-store`, and returns 404 with `X-Robots-Tag: noindex` for unknown/unpublished/reserved/malformed slugs. Private workspace routes do not advertise `llms.txt`.
- [x] **IV (Separate authored changes from execution evidence)**: PASS — Zero SQL changes required (`SLUG_PATTERN` already rejects dots so `llms.txt` can never be claimed as a slug, and static route `src/app/llms.txt/route.ts` takes precedence over `src/app/[slug]/page.tsx`; no edits to historical `docs/sql/milestone-8/001-digital-cards.sql`). Hosted verification remains distinct from mocked/unit tests.
- [x] **V (Verify behavior and keep evidence honest)**: PASS — Every FR and SC maps to concrete Vitest tests covering formatting, sanitization, privacy allowlisting, immediate revocation, 404 handling, metadata discovery links, and route handler responses, plus `pnpm typecheck`, `pnpm lint`, `pnpm check:db-boundary`, `pnpm test`, and Prettier checks.
- [x] **VI (Trace product requirements and distinguish delivery scope)**: PASS — Explicitly linked to `FUT-004`, `WEB-002/004/005/007/008/009`, `ART-007`, `NFR-002/004/007/010`, `D-001`, and `D-005`. Planned capabilities outside this spec (`llms-full.txt`, JSON/JSON-LD, digital card `llms.txt`, indexing toggles) remain explicitly out of scope.

## Existing evidence and decisions

- **Snapshot & public read path**: `src/app/[slug]/page.tsx` already implements the exact live-snapshot read pattern (`export const dynamic = "force-dynamic"`, `getPublicSite(slug)`, `getPublicArticles(site.slug)`, `applyLiveArticles(site.content, site.slug, live)`). `src/app/[slug]/links/page.tsx` already implements `linksLiveOn(site.content.links.items, today)` for scheduled link filtering.
- **Origin resolution**: `src/lib/site-url.ts` exports `getSiteUrl()` (`NEXT_PUBLIC_SITE_URL` → forwarded host/proto → `VERCEL_URL` → `http://localhost:3000`). Both endpoints will use `getSiteUrl()` for absolute canonical URLs (FR-003).
- **Slug collision safety (FR-010)**: `src/domains/website/slug.ts` enforces `SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/`, which rejects any slug containing `.` (so `llms.txt` and `llms-full.txt` fail validation with `"format"`). In addition, `tests/website-domain.test.ts` asserts strict equality between `RESERVED_SLUGS` and the four `ARRAY[...]` CHECK constraints in `docs/sql/milestone-8/001-digital-cards.sql`. Keeping `RESERVED_SLUGS` unchanged avoids mutating historical SQL or introducing an unnecessary DDL migration, while static route precedence (`src/app/llms.txt/route.ts`) and `SLUG_PATTERN` guarantee zero collision. See [research.md](research.md).
- **Metadata discovery (FR-008)**: Next.js App Router `Metadata.alternates.types` renders `<link rel="alternate" type="text/markdown" href="..." />`. Setting this on `src/app/page.tsx` (for `/llms.txt`) and inside `generateMetadata` of `src/app/[slug]/page.tsx` (only when `site` is live) ensures private routes (`/profile`, `/website`, `/website/preview`, `/articles`, `/personas`, `/cards`, `/insights`) and 404 pages never emit `llms.txt` discovery links.

## Project Structure

Only the paths below are created or modified:

```text
src/
├── domains/
│   └── llms/
│       └── llms-txt.ts                  # Pure Markdown builders, sanitization, size bounding
└── app/
    ├── llms.txt/
    │   └── route.ts                     # GET /llms.txt (platform summary)
    ├── [slug]/
    │   ├── llms.txt/
    │   │   └── route.ts                 # GET /<slug>/llms.txt (published website summary)
    │   └── page.tsx                     # Add alternates.types["text/markdown"] when live
    └── page.tsx                         # Add alternates.types["text/markdown"] for /llms.txt

tests/
├── llms-txt.test.ts                     # Unit tests: platform/site builders, sanitization, privacy, bounds, slug rejection
└── llms-txt-routes.test.ts              # Route handler & metadata tests: 200/404, headers, revocation, discovery links

specs/004-llms-txt/
├── spec.md
├── plan.md
├── research.md
├── quickstart.md
├── contracts/
│   └── llms-txt-endpoints.md
└── checklists/
    └── requirements.md
```

## Contracts and data changes

- **HTTP & Metadata Contracts**: Documented in [contracts/llms-txt-endpoints.md](contracts/llms-txt-endpoints.md).
  - `GET /llms.txt` → `200 OK`, `Content-Type: text/markdown; charset=utf-8`, `Cache-Control: public, max-age=300, stale-while-revalidate=3600`.
  - `GET /<slug>/llms.txt` → `200 OK`, `Content-Type: text/markdown; charset=utf-8`, `Cache-Control: no-store` when live; `404 Not Found`, `Content-Type: text/plain; charset=utf-8`, `Cache-Control: no-store`, `X-Robots-Tag: noindex` when unknown, reserved, malformed, or unpublished.
  - HTML discovery `<link rel="alternate" type="text/markdown" href="...">` on `/` and live `/<slug>` only.
- **Database / Schema Changes**: None. No SQL authored, no migrations needed.

## Validation and requirement mapping

| Product requirement / feature scenario                                                                     | Implementation paths                                                 | Test or manual check                                                                                                                                                                                   | Command and authorization needed                                                                                   |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `FUT-004`, `NFR-002` / FR-001, FR-003 / US1 scenarios 1–2, SC-001                                          | `src/domains/llms/llms-txt.ts`, `src/app/llms.txt/route.ts`          | Assert `/llms.txt` returns 200, `text/markdown; charset=utf-8`, valid `#`/`>`/`##` structure, absolute canonical links, zero user data                                                                 | `pnpm test` (local, no extra auth)                                                                                 |
| `FUT-004`, `WEB-002`, `WEB-004`, `WEB-005`, `NFR-002` / FR-002, FR-004, FR-005 / US2 scenarios 1–2, SC-002 | `src/domains/llms/llms-txt.ts`, `src/app/[slug]/llms.txt/route.ts`   | Assert `/<slug>/llms.txt` includes all approved sections in published order, active scheduled links only, live articles only; omits empty sections, hidden/unselected entries, excluded contact fields | `pnpm test` (local, no extra auth)                                                                                 |
| `WEB-005`, `WEB-006`, `NFR-002` / FR-006, FR-010 / US2 scenario 3, SC-004                                  | `src/app/[slug]/llms.txt/route.ts`, `src/domains/website/slug.ts`    | Assert unknown, unpublished, reserved (`admin`, `login`), and dotted (`llms.txt`, `llms-full.txt`) slugs return 404 with `Cache-Control: no-store` and `X-Robots-Tag: noindex`                         | `pnpm test` (local, no extra auth)                                                                                 |
| `WEB-007`, `WEB-008`, `ART-007`, `NFR-004` / FR-005, FR-007 / US3 scenarios 1–3, SC-003                    | `src/app/[slug]/llms.txt/route.ts`, `src/domains/articles/public.ts` | Mock lifecycle transitions (publish → private edit → article withdraw → slug rename → unpublish) and assert immediate reflection on next request                                                       | `pnpm test` (local, no extra auth)                                                                                 |
| `WEB-009` / FR-008 / US4 scenarios 1–2                                                                     | `src/app/page.tsx`, `src/app/[slug]/page.tsx`                        | Assert `generateMetadata` / `metadata` emits `alternates.types["text/markdown"]` on `/` and live `/<slug>`, and omits it when `/<slug>` is not found                                                   | `pnpm test` (local, no extra auth)                                                                                 |
| `NFR-007`, `NFR-010` / FR-009 / Edge cases, SC-005                                                         | `src/domains/llms/llms-txt.ts`                                       | Assert Markdown control/injection escaping, `http(s)`-only URL filtering, and output byte size `< 100 KB` even under max-cap fixtures                                                                  | `pnpm test` (local, no extra auth)                                                                                 |
| `AD-009`, `NFR-008`, `NFR-009` / Repository gates                                                          | All changed files                                                    | TypeScript, ESLint, DB boundary, Prettier formatting                                                                                                                                                   | `pnpm typecheck && pnpm lint && pnpm check:db-boundary && pnpm exec prettier --check <changed>`                    |
| Hosted / live browser verification                                                                         | Deployed or local running server                                     | Manual `curl` / browser inspection per `quickstart.md`                                                                                                                                                 | Local dev server (`pnpm dev` / `pnpm dev:local`) — developer-triggered; hosted E2E requires explicit authorization |

## Rollout and risks

- **Compatibility**: Purely additive endpoints and metadata links; zero impact on existing pages, APIs, or database schema.
- **Caching & revocation risk**: `/<slug>/llms.txt` sets `export const dynamic = "force-dynamic"` and `Cache-Control: no-store` so unpublishing or withdrawing an article takes effect on the very next request. Third-party LLM/search caches outside Folioone cannot be recalled (documented under `NFR-004`).
- **Snapshot error handling**: If `getPublicSite` throws (transient DB/network failure), `/<slug>/llms.txt` catches the error cleanly and returns `503 Service Unavailable` (or `404` when `null`) without leaking stack traces; if `getPublicArticles` throws, it degrades safely to omitting the articles section (matching `src/app/[slug]/page.tsx`).
- **Rollback**: Remove `src/app/llms.txt/route.ts`, `src/app/[slug]/llms.txt/route.ts`, `src/domains/llms/llms-txt.ts`, and the two `alternates.types` additions.

## Complexity Tracking

None. All six constitution gates pass without exceptions or additional dependencies.
