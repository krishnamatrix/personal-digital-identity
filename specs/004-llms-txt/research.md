# Research & Design Decisions: LLM and Agent Discovery (`llms.txt`)

**Feature**: `004-llms-txt` | **Date**: 2026-11-20

## 1. Route Structure and Next.js App Router Precedence

- **Decision**: Implement `GET /llms.txt` as `src/app/llms.txt/route.ts` and `GET /<slug>/llms.txt` as `src/app/[slug]/llms.txt/route.ts`.
- **Rationale**: Next.js App Router supports dotted route segment folder names (`llms.txt/route.ts`) and always prioritizes static segments (`llms.txt`) ahead of dynamic segments (`[slug]`). This cleanly serves both `/llms.txt` and `/<slug>/llms.txt` as first-class Route Handlers with full control over `Content-Type`, `Cache-Control`, and `404`/`503` status codes.
- **Alternatives considered**:
  - Static file in `public/llms.txt`: Rejected because `public/llms.txt` cannot dynamically inject the configured site origin (`getSiteUrl()`), breaking canonical absolute URLs across local, preview, and production deployments (FR-003).
  - Middleware rewrite: Rejected because Route Handlers are simpler, directly testable in Vitest, and avoid adding logic to middleware.

## 2. Reserved Slug Protection Without Unnecessary SQL Migrations

- **Decision**: Do not modify `RESERVED_SLUGS` or historical SQL in `docs/sql/milestone-8/001-digital-cards.sql`. Rely on `SLUG_PATTERN` (`^[a-z0-9]+(-[a-z0-9]+)*$`) rejecting any dot-containing input (`llms.txt`, `llms-full.txt`) plus static route precedence for `src/app/llms.txt/route.ts`. Add explicit unit test assertions verifying `validateSlug("llms.txt")` and `validateSlug("llms-full.txt")` return `"format"`.
- **Rationale**: `tests/website-domain.test.ts` enforces strict parity between `RESERVED_SLUGS` and the 4 PostgreSQL CHECK constraints in `docs/sql/milestone-8/001-digital-cards.sql`. Modifying `RESERVED_SLUGS` would require authoring a new SQL migration for manual developer execution solely to block `/llms` (which does not collide with `/llms.txt`). Keeping the feature zero-SQL preserves Constitution IV and simplifies rollout.
- **Alternatives considered**:
  - Adding `"llms"` to `RESERVED_SLUGS` and authoring a new `docs/sql/` migration: Deferred unless a future `/llms` HTML route is introduced.

## 3. Content-Type, Caching, and Immediate Revocation

- **Decision**:
  - Serve `text/markdown; charset=utf-8` on `200 OK` responses (per llmstxt.org convention).
  - `/llms.txt`: `export const dynamic = "force-dynamic"` (needed for `getSiteUrl()`), `Cache-Control: public, max-age=300, stale-while-revalidate=3600`.
  - `/<slug>/llms.txt`: `export const dynamic = "force-dynamic"`, `Cache-Control: no-store`.
  - `404 Not Found` responses: `text/plain; charset=utf-8`, `Cache-Control: no-store`, `X-Robots-Tag: noindex`.
- **Rationale**: Matches `src/app/[slug]/page.tsx`'s immediate-unpublish guarantee (`WEB-008`, `ART-007`, `NFR-004`). Using `no-store` prevents shared/edge caches from serving withdrawn personal data after unpublish, slug change, or article deletion.
- **Alternatives considered**:
  - `text/plain; charset=utf-8`: Acceptable fallback, but `text/markdown; charset=utf-8` is the preferred MIME type for `llms.txt` and aligns with `<link rel="alternate" type="text/markdown">`.
  - ISR / `revalidate`: Rejected because stale cached personal websites after unpublish violate AD-005 and `WEB-008`.

## 4. HTML Discovery Signals

- **Decision**: Expose `<link rel="alternate" type="text/markdown" href="..." />` via Next.js Metadata API `alternates.types["text/markdown"]`:
  - In `src/app/page.tsx`: point to `/llms.txt` (resolved with `metadataBase` or relative path).
  - In `src/app/[slug]/page.tsx` (`generateMetadata`): point to `${origin}/${site.slug}/llms.txt` only when `site` is live; omit on 404.
- **Rationale**: Standard, zero-JSX mechanism supported natively by Next.js 15 Metadata API. Because it is scoped to `src/app/page.tsx` and live `src/app/[slug]/page.tsx` (not `src/app/layout.tsx`), private workspace routes (`/profile`, `/website`, `/website/preview`, `/articles`, `/personas`, `/cards`, `/insights`) never advertise `llms.txt`.
- **Alternatives considered**:
  - Putting `alternates.types` in `src/app/layout.tsx`: Rejected because it would leak onto every private workspace route and 404 page.

## 5. Markdown Sanitization and Payload Budgeting

- **Decision**: Build a pure formatter in `src/domains/llms/llms-txt.ts` with:
  - Single-line normalization for inline fields (collapse newlines/tabs/control chars, escape leading Markdown heading/blockquote/list syntax or link brackets `[` `]` where used inside link labels).
  - Multi-line block normalization for descriptions/about paragraphs (strip control characters, neutralize raw `#` heading injection inside body lines by demoting/prefixing or flattening to plain paragraphs).
  - Strict `http:` / `https:` URL validation (reusing URL parsing) before emitting any Markdown link, plus `mailto:` / plain text only for explicitly opted-in `contact` fields.
  - Deterministic UTF-8 byte budget enforcement (hard cap below 100 KB, e.g., 90 KB soft/96 KB hard cap with clean truncation marker if an extreme max-cap profile ever approaches the limit).
- **Rationale**: Satisfies `FR-009`, `NFR-007`, and `SC-005` while keeping output clean, deterministic, and easy for LLMs and agents to parse.
- **Alternatives considered**:
  - Adding an external Markdown AST/serialization library: Rejected as unnecessary dependency bloat (Constitution II) for a bounded, structured output format.
