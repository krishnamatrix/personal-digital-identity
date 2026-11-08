# Folioone Architecture Decisions

**Status:** Approved architecture. Milestone 2 Identity and Access implementation is authorized. All database changes are authored as numbered SQL for manual developer execution; Codex does not connect or execute SQL.

## AD-001: Modular Monolith and Technology Stack

- **Decision:** Use Next.js App Router, TypeScript, pnpm, Supabase PostgreSQL, Drizzle ORM, Supabase Auth, Supabase Storage, Tailwind CSS, shadcn/ui, Zod, Vitest, and Playwright. Organize the application as a modular monolith with domain boundaries.
- **Rationale:** This matches the approved product and preferred foundation while keeping domain logic cohesive and deployable as one application.
- **Consequences:** Keep persistence, services, validation, and UI composition separated by domain. Tailwind/shadcn/ui is the single component system; do not add MUI or another competing UI framework. Use hosted Supabase PostgreSQL for development; Docker PostgreSQL is not required.
- **Unresolved:** Hosting/deployment target, Supabase project separation, and whether Supabase CLI services will supplement hosted database development.

## AD-002: Master Identity and Derived Presentations

- **Decision:** Master Identity is the sole canonical source for personal and professional information. A Persona curates that information for an audience. A Portfolio is a website generated from a selected identity/persona and content. An Identity Card is a compact shareable persona presentation. A CV is a document generated from selected canonical information. Accounts may own multiple personas and multiple portfolios.
- **Rationale:** Users maintain each experience, education record, skill, and project once, then select it for different audiences and outputs.
- **Consequences:** Store canonical records relationally. Model persona-specific selection and presentation overrides as relations/configuration, not copied identity rows. Give each portfolio its own sections and ordering. Publish all outputs through projections.
- **Unresolved:** Exact persona types and the extent of permitted presentation overrides.

## AD-003: Relational Domain Model

- **Decision:** Use relational tables and foreign keys for accounts, identity profiles, experiences, education, skills, projects, personas, persona selections, portfolios, portfolio sections, highlights/categories, collections, timeline events, media, cards, integrations, discovered items, suggestions, publishing settings, and published projection versions. Use JSONB only for bounded flexible metadata and versioned rendering payloads.
- **Rationale:** Ownership, referential integrity, ordering, uniqueness, privacy, and cross-account isolation require queryable, constrained entities.
- **Consequences:** Every owned row carries account ownership; enforce ownership in foreign keys/policies. Highlights support custom categories, optional media and external references. Discovered items retain source and provenance. AI suggestions remain separate and require user review and approval before canonical changes. Author schema changes as numbered SQL under `docs/sql/` for manual execution; do not execute them from the application or Codex.
- **Unresolved:** Final enum/check-constraint strategy, collection item modeling, and exact projection payload/version retention policy.

## AD-004: Authenticated Supabase Requests and RLS

- **Decision:** Authenticate every user-owned request on the server with Supabase Auth. Call `auth.getUser()` to verify the cookie-backed session, then use that same authenticated Supabase server client for PostgREST reads and writes. The user's access token is forwarded to PostgreSQL and supplies `auth.uid()`. Never use a browser-supplied user ID as the authorization identity. Drizzle remains for schema definitions and local SQL authoring, not user-scoped runtime queries.
- **Rationale:** Supabase PostgREST carries the authenticated user's JWT into PostgreSQL, where RLS can evaluate `auth.uid()` directly. This avoids a direct administrative database connection and custom runtime login roles.
- **Consequences:** Never use the `postgres` administrative connection or a service-role key for user-facing queries; both bypass RLS. Enable and force RLS on every private table, grant only necessary table privileges to the Supabase `authenticated` role, and use explicit owner predicates in `USING`/`WITH CHECK`. Application authorization remains necessary but does not replace RLS.
- **DDL operations:** The developer manually executes reviewed DDL through Supabase SQL Editor as `postgres`. Codex only authors/reviews files. SQL execution status is tracked separately and must be reported by the developer.
- **Verification:** Unit/mock tests can verify application boundaries only. The identity DDL was manually executed and catalog-verified, and the separately approved hosted two-user Auth/PostgREST isolation test is recorded as passed in [Milestone 2C](milestone-2c-rls-isolation-verification.md). Catalog inspection and runtime RLS enforcement remain distinct evidence types; each new domain still requires its own reviewed DDL and security tests.
- **Unresolved:** Persona and future-domain JWT-to-RLS behavior and effective ACLs remain unverified until their DDL is manually executed, catalog-checked, and separately approved hosted tests pass.

## AD-005: Private by Default and Snapshot-Only Publishing

- **Decision:** All profiles, personas, records, and media start private. Public publishing requires an explicit user action and preview. Build versioned, allowlisted snapshots from selected content. Public pages and machine-readable endpoints read only active approved snapshots, never canonical tables.
- **Rationale:** A separate public read boundary reduces the risk of exposing private master identity data.
- **Consequences:** Resolve normalized public slugs through an active publication index; unpublished/unknown routes return not found. Unpublish disables the active snapshot, purges CDN/framework caches and revalidation tags, and revokes public media derivatives. Private media/resumes remain in private storage and require authorization plus short-lived signed URLs. Public derivatives are generated intentionally and linked to source assets for revocation. Automated tests assert private fields, unselected content, tokens, unpublished snapshots, resume contents, and private media URLs never leak.
- **Unresolved:** Slug normalization/reservation, custom domains, indexing defaults, cache purge infrastructure, snapshot retention, and takedown policy.

## AD-006: User Data Lifecycle

- **Decision:** Design for full account data export, account deletion, media/resume deletion, integration revocation, and public projection invalidation. These capabilities need not ship in the first milestone.
- **Rationale:** Users must retain control over sensitive identity data, uploaded documents, connected accounts, and published derivatives.
- **Consequences:** Track provenance and source-to-projection/media dependencies. Deletion workflows revoke integration grants and credentials, disable public routes, invalidate caches, remove database rows and storage objects, and account for derived media. Export covers canonical content, personas/selections, portfolios, highlights, media metadata, and user-created content in documented formats.
- **Unresolved:** Export format, completion guarantees, legally required retention, and exact deletion/backup lifecycle.

## AD-007: Approved Product and Visual Direction

- **Decision:** Preserve the approved personal digital identity product scope and frozen visual direction: warm ivory, charcoal navigation, editorial typography, restrained warm accents, spacious modern workspace, image-rich achievements, and a public portfolio with a distinct visual personality. This is not a social network. AI-generated suggestions require user review and approval.
- **Rationale:** Maintain product coherence and user trust while translating the approved design into implementation tokens and components.
- **Consequences:** Do not add feeds, likes, comments, generic purple-gradient AI styling, excessive glassmorphism, or an independent redesign. AI output cannot silently edit or publish canonical data.
- **Unresolved:** No product or UX direction remains open in this record; implementation details should follow the approved direction.
