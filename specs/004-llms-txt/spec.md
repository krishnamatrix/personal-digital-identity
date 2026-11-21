# Feature Specification: LLM and Agent Discovery (`llms.txt`)

**Feature ID**: 004-llms-txt  
**Feature Branch**: feat/llms.txt  
**Created**: 2026-11-20  
**Status**: Draft  
**Input**: User description: "add llms text to enable seo via llms and agents"

## Problem and scope

AI assistants, LLM-powered search engines, and autonomous agents increasingly discover and summarize people and products by reading structured plain-text Markdown summaries (`llms.txt`) rather than scraping complex visual layouts. Today, Folioone exposes human-readable public pages (the platform landing and pricing pages, published personal websites, published articles, and published digital cards) with standard HTML metadata, but provides no `llms.txt` entry points or discovery signals tailored for LLMs and agents. As a result, AI crawlers and agents lack a concise, authoritative, noise-free summary of Folioone and of published personal websites, reducing answer-engine visibility and increasing the risk of incomplete or inaccurate summaries.

**In scope**:

- Serve a concise, standards-aligned site-wide `/llms.txt` plain-text Markdown summary describing the Folioone platform and linking to its authoritative public platform pages.
- Serve a concise, standards-aligned per-website `/<slug>/llms.txt` plain-text Markdown summary automatically for every live published personal website, derived strictly from its already-approved active public snapshot and live published article snapshots (with no new owner toggle or configuration schema required).
- Enforce strict snapshot-only public allowlisting so that `llms.txt` outputs expose only active, explicitly published content and immediately reflect unpublishing, slug changes, and article withdrawal.
- Provide clear discovery signals (standard HTML link metadata on public platform pages and live published personal websites) so LLMs, agents, and search engines can locate `llms.txt` documents reliably.
- Reserve `llms.txt`-related address collision paths so user website addresses cannot conflict with LLM discovery routes.

**Out of scope**:

- Expanded `llms-full.txt` documents and per-article plain-text Markdown endpoints (deferred to a follow-up spec if needed).
- Structured JSON / JSON-LD profile endpoints (separate deliverables under `FUT-004`).
- Digital card `llms.txt` endpoints (`/social/<slug>/llms.txt`).
- Per-website LLM opt-in/opt-out toggles or broader search-indexing controls (may be revisited as part of a future indexing-controls feature under `D-005`).
- Public directory or cross-account listing of individual user websites in the site-wide `/llms.txt` (Folioone is not a social directory per `AD-007`, and accounts must not be enumerated without consent).
- Custom domain routing, `robots.txt`/`sitemap.xml` expansion, external search engine submission APIs, or paid SEO analytics dashboards.
- Any modification to canonical Master Identity editing, Personas, or private workspace workflows.

**Existing evidence**:

- `specs/product-requirements.md` records `FUT-004` ("Machine-readable public JSON, JSON-LD, and llms.txt") as a planned capability requiring a feature spec to resolve format, routes, discovery, and indexing.
- `docs/architecture/architecture-decisions.md` defines `AD-005` (private by default, snapshot-only publishing, immediate unpublish revocation), `AD-007` (not a social network/directory), and `AD-010` (published articles served only from live article snapshots).
- Current repository routes include public platform pages (`/`, `/pricing`), published personal websites (`/<slug>`, `/<slug>/links`), published articles (`/<slug>/articles/<article>`), and digital cards (`/social/<slug>`). No `llms.txt`, `llms-full.txt`, or `robots.txt` routes currently exist in the repository.
- No hosted environment deployment or live crawler indexing is verified by this specification.

**Product requirement references**:

- **Primary planned capability**: `FUT-004` (Machine-readable public JSON, JSON-LD, and `llms.txt`).
- **Related baseline & nonfunctional requirements**: `WEB-002` (visible and selected content only; explicit contact inclusion), `WEB-004` (publish/republish snapshot lifecycle), `WEB-005` (serve live snapshot only; not found when unpublished/unknown), `WEB-007` (atomic address changes), `WEB-008` (atomic unpublish), `WEB-009` (published metadata and canonical URL), `ART-007` (immediate withdrawal of unpublished/archived/deleted articles), `NFR-002` (public allowlists), `NFR-004` (revocation), `NFR-007` (sensitive processing/bounded output), `NFR-010` (performance/payload budgets).

**Scope classification**: Planned capability (`FUT-004`) scoped for concise `llms.txt` delivery across both the platform root and published personal websites. This specification does not claim that any endpoint is implemented or verified in a hosted environment.

**Decisions affected**:

- **D-005** (indexing defaults, slug lifecycle, and discovery behavior): Resolved for this feature as follows — any explicitly published personal website automatically exposes `/<slug>/llms.txt` from its active approved snapshot and withdraws it immediately on unpublish or address change. Old-slug redirects, custom domains, and granular indexing opt-out controls remain out of scope.
- **D-001** (single website per account vs. multiple portfolios): This feature follows the current baseline of one published website per account (`/<slug>`).

## User Scenarios & Testing (mandatory)

### User Story 1 - AI agent or LLM discovers and reads Folioone's platform overview (Priority: P1)

An LLM crawler, AI search engine, or autonomous agent visits Folioone at `/llms.txt` to understand what Folioone offers, who it is for, and which public platform pages provide authoritative information.

**Independent Test**: Request `/llms.txt` anonymously without authentication and verify it returns a valid, concise Markdown document following the `llms.txt` convention, containing only public platform information and canonical links, with zero user-account data.

**Acceptance Scenarios**:

1. **Given** Folioone is running with public platform pages available, **When** an anonymous visitor or AI agent requests `/llms.txt`, **Then** the system returns a plain-text Markdown document with a top-level title, a concise summary blockquote, and categorized links to authoritative public platform pages (such as home and pricing).
2. **Given** one or more users have private drafts or published personal websites, **When** an anonymous visitor or AI agent requests the site-wide `/llms.txt`, **Then** the document does not list, enumerate, or leak any private workspace routes, account identifiers, or unconsented user websites.

### User Story 2 - AI agent or LLM reads a published personal website's `llms.txt` (Priority: P1)

A recruiter, researcher, or prospective collaborator asks an AI assistant about a person who has published a Folioone website. The AI agent fetches `/<slug>/llms.txt` (or follows the discovery link from `/<slug>`) to obtain an accurate, structured summary of the person's approved public profile, sections, links, and published writing.

**Independent Test**: Publish a test website containing selected and unselected entries, an excluded contact email, and a mix of selected/unselected published articles. Fetch `/<slug>/llms.txt` anonymously and verify only approved, live snapshot content appears.

**Acceptance Scenarios**:

1. **Given** a published personal website at `/<slug>` with approved sections and live published articles, **When** an anonymous visitor or AI agent requests `/<slug>/llms.txt`, **Then** the system automatically returns a structured plain-text Markdown document containing the person's published name, headline/summary, approved sections, canonical website URL, and links to live published articles.
2. **Given** a website owner edits their Master Identity or website draft without republishing, **When** an AI agent requests `/<slug>/llms.txt`, **Then** the response reflects only the previously published snapshot and never includes unsaved edits, hidden entries, unselected sections, or excluded contact fields.
3. **Given** a website has never been published, has been unpublished, or has an unknown/reserved address, **When** an AI agent requests `/<slug>/llms.txt`, **Then** the system returns a Not Found response with no private profile data or existence disclosure.

### User Story 3 - Immediate revocation when content is withdrawn or moved (Priority: P1)

A website owner unpublishes their website, changes their website address, or unpublishes/archives/deletes a previously included article. Subsequent AI agent requests must immediately stop receiving the withdrawn content.

**Independent Test**: Publish a website with an article, confirm both appear in `/<slug>/llms.txt`, then withdraw the article and separately unpublish or rename the website; verify immediate removal on the next request.

**Acceptance Scenarios**:

1. **Given** a published website listing an approved article in `/<slug>/llms.txt`, **When** the owner unpublishes, archives, or deletes that article, **Then** subsequent requests to `/<slug>/llms.txt` immediately omit that article without requiring a full website republish.
2. **Given** a published website at `/<old-slug>`, **When** the owner changes the website address to `/<new-slug>`, **Then** `/<old-slug>/llms.txt` immediately returns Not Found and `/<new-slug>/llms.txt` serves the active snapshot with updated canonical URLs.
3. **Given** a published website at `/<slug>`, **When** the owner unpublishes the website, **Then** subsequent requests to `/<slug>/llms.txt` immediately return Not Found.

### User Story 4 - Discovery by LLMs, search engines, and agents (Priority: P2)

An AI crawler or browser-based agent visits a public page (the platform landing page or a published personal website) and looks for machine-readable discovery cues pointing to the corresponding `llms.txt` document.

**Independent Test**: Inspect the rendered HTML metadata of `/` and a published `/<slug>` page (and an unpublished/404 page or private workspace page) to verify discovery references are present only for live public surfaces.

**Acceptance Scenarios**:

1. **Given** the public platform landing page at `/` or a live published personal website at `/<slug>`, **When** an agent inspects the page metadata, **Then** it finds a clear discovery reference pointing to `/llms.txt` (for `/`) or `/<slug>/llms.txt` (for `/<slug>`).
2. **Given** an unpublished/unknown website address or a private workspace page (such as `/profile`, `/website`, `/website/preview`, `/articles`, or `/personas`), **When** inspected, **Then** no `llms.txt` discovery reference for private or non-existent content is advertised and private pages remain non-indexable.

### Edge Cases

- **Reserved slugs**: Requests to `/llms.txt` must never collide with user website addresses; reserved address rules must prevent users from claiming addresses that conflict with `llms` discovery paths.
- **Empty optional sections**: If a published website has only a name and minimal profile details (no bio, experience, projects, or articles), `/<slug>/llms.txt` still renders a valid, clean Markdown document without empty placeholder headings.
- **Special characters and Markdown injection**: User-authored text containing Markdown headings, brackets, backticks, newlines, or control characters must be safely normalized/escaped so it cannot break the `llms.txt` document structure or inject misleading links.
- **Unsafe or non-HTTP(S) URLs**: Only validated `http://` and `https://` links (and explicitly opted-in contact methods) from the published snapshot may appear; `javascript:`, `data:`, or private storage URLs must never appear.
- **Scheduled links page items**: If the links page is active and referenced, items outside their active schedule window must not be advertised as active links.
- **Unavailability / malformed snapshot**: If the backing snapshot cannot be loaded or fails validation, `/<slug>/llms.txt` fails safely (Not Found or service-unavailable error without stack traces or raw internal data).
- **Cache freshness**: Public `/<slug>/llms.txt` responses must not serve stale withdrawn content after unpublish, address change, or article removal (consistent with `WEB-008`, `ART-007`, and `NFR-004`).

## Requirements (mandatory)

### Functional Requirements

- **FR-001**: The system MUST serve a standards-compliant `llms.txt` document at `/llms.txt` formatted as UTF-8 plain-text Markdown (`# Title`, concise `> Summary`, and structured `## Section` link lists) describing Folioone and linking only to authoritative public platform pages.
- **FR-002**: The system MUST automatically serve a concise, standards-compliant `llms.txt` document at `/<slug>/llms.txt` for every live published personal website, derived exclusively from the website's active published snapshot and live published article snapshots, without requiring a separate opt-in step beyond publishing the website.
- **FR-003**: Every `llms.txt` document MUST use absolute canonical URLs derived from the configured public site origin so agents can resolve links reliably outside a browser context.
- **FR-004**: `/<slug>/llms.txt` MUST include only explicitly approved public fields from the active snapshot: published person identity (name, headline, role, location, short bio), approved sections in their published order (about, featured, experience, education, skills, projects, achievements, certifications, social links, booking link, and explicitly opted-in contact fields), optional active links-page summary, and live published articles with canonical links and excerpts.
- **FR-005**: `/<slug>/llms.txt` MUST omit empty sections, exclude hidden/unselected Master Identity entries, exclude excluded contact fields, and reflect only the live article snapshots (immediately omitting any unpublished, archived, or deleted article).
- **FR-006**: Requests to `/<slug>/llms.txt` for an unknown, reserved, never-published, or unpublished slug MUST return a Not Found response without disclosing whether an account or draft exists.
- **FR-007**: When a website owner changes their website address or unpublishes their website, `/<old-slug>/llms.txt` (or `/<slug>/llms.txt`) MUST immediately stop serving the withdrawn snapshot on subsequent application requests.
- **FR-008**: Public HTML pages for `/` and live published `/<slug>` websites MUST expose a machine-discoverable link reference to their respective `llms.txt` endpoint; unpublished routes, private workspace pages, and preview routes MUST NOT advertise `llms.txt` endpoints for private or non-existent content.
- **FR-009**: The system MUST sanitize and normalize user-provided text and URLs rendered into `llms.txt` so that line breaks, Markdown syntax characters, or unsafe URL schemes cannot corrupt document structure or emit unsafe links.
- **FR-010**: Reserved website address validation MUST prevent any user from claiming an address that collides with `llms.txt` discovery paths (such as `llms`).

### Privacy and permissions

- **Read access**: `/llms.txt` and live `/<slug>/llms.txt` are publicly readable by anonymous visitors, search crawlers, LLMs, and agents.
- **Automatic publication alignment**: Publishing a personal website is the explicit owner action that makes its allowlisted snapshot public (AD-005); `/<slug>/llms.txt` mirrors only that already-approved public snapshot and introduces no additional public fields.
- **Strict snapshot boundary (AD-005, AD-010, NFR-002)**: Public `llms.txt` responses MUST read only active, validated published website snapshots and live published article snapshots. They MUST NEVER query or expose canonical Master Identity tables, Personas, unpublished website drafts, draft/archived articles, private profile photo URLs, private video URLs, internal account IDs, tokens, or billing/entitlement data.
- **No user enumeration**: Site-wide `/llms.txt` MUST NOT enumerate user slugs, accounts, or private routes.
- **Revocation (NFR-004)**: Unpublishing a website, renaming its slug, or unpublishing/archiving/deleting an article MUST immediately withdraw that content from subsequent `/<slug>/llms.txt` application responses. External third-party LLM caches or crawlers that already fetched a document before withdrawal cannot be recalled; this limitation is documented honestly.

### Key Entities (if data is affected)

- **Platform LLM Summary**: Curated, version-controlled public description of Folioone's product purpose and public pages (no user data).
- **Published Website Snapshot** (existing): The active, validated, allowlisted snapshot of an owner's published personal website, owned by one Account and addressed by a unique normalized slug. No database schema changes are required for this feature.
- **Published Article Snapshot** (existing): Live snapshot of an owner's published article linked to a published website; immediately removed upon article withdrawal.

## Success Criteria (mandatory)

- **SC-001**: An anonymous request to `/llms.txt` succeeds in under 500 ms under local/standard test conditions, returns valid UTF-8 Markdown conforming to the `llms.txt` structure (`#` title, `>` summary, `##` link sections), and contains zero user-specific or private data.
- **SC-002**: An anonymous request to `/<slug>/llms.txt` for a live published website returns 100% of approved public sections and live published articles with valid canonical URLs, and 0% of hidden entries, unselected sections, excluded contact fields, or draft/archived articles across all automated privacy test cases.
- **SC-003**: Across the full lifecycle (publish → private edit → republish → article withdraw → slug rename → unpublish), `/<slug>/llms.txt` reflects the exact expected public state on the immediately following request with zero stale private leaks.
- **SC-004**: 100% of malformed, unknown, unpublished, and reserved slugs return Not Found on `/<slug>/llms.txt` with no existence leakage.
- **SC-005**: Generated `llms.txt` output remains concise and bounded (under 100 KB per website document) and passes Markdown structural validation even when profile fields contain special characters, multiline text, or maximum-cap entry lists.

## Assumptions and open questions

- **Assumption 1**: The `llms.txt` format follows the established [llmstxt.org](https://llmstxt.org/) Markdown convention (UTF-8 Markdown with `#` H1 title, `>` blockquote summary, and `##` sections containing structured items and Markdown links).
- **Assumption 2**: Site-wide `/llms.txt` covers Folioone's own public platform pages only and does not act as a directory of individual users' websites.
- **Assumption 3**: Per-website `/<slug>/llms.txt` is automatically enabled for live published websites using their existing approved snapshot, requiring no new database columns or SQL migrations (existing reserved-slug constraints in `docs/sql/` will be evaluated during planning if `llms` is added to the reserved list).
- **Assumption 4**: Expanded `llms-full.txt`, per-article `.md` companions, digital card `llms.txt` (`/social/<slug>/llms.txt`), and JSON/JSON-LD endpoints (`FUT-004`) are deferred to separate follow-up specs.
- **Open questions**: None remaining for specification; ready for `/speckit-plan`.
