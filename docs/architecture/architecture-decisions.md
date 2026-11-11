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

## AD-008: Canonical Application Schema `folioone`

- **Decision:** All Folioone application data lives in one PostgreSQL schema named `folioone` in every environment (local, staging, future production). Environments are separated by Supabase project and credentials, never by schema name. `folioone_staging` and `folioone_prod` are not used.
- **Rationale:** One name removes per-environment SQL, code and test variants, and keeps application data out of `public`, which Supabase exposes by default and shares with other tooling.
- **Consequences:** The schema name is a single constant (`FOLIOONE_SCHEMA`, `src/lib/db-schema.ts`) passed as `db.schema` to every Supabase client; repositories are typed against that client so a client without it does not compile. The approved design is unchanged (RLS enabled and forced, request-path gate, nine RPC contracts, PT409, account anchor, advisory and row locking, append-only revisions, SECURITY INVOKER with empty `search_path`). The hosted SQL is the generated package in `docs/sql/folioone-schema/`, executed manually by the developer; it never touches `public` or Auth users and copies no data. Existing development data in `public` is left in place and unused. See [database-schema-folioone.md](database-schema-folioone.md).
- **Unresolved:** Hosted execution is pending the developer's manual run and catalog evidence. Retiring the legacy `public` objects is a separate, later decision.

## AD-009: Centralized, server-only database access layer

**Decision.** All Supabase database operations live in `src/lib/db/` (`client.ts`, `query.ts`, `schema.ts`, `queries/*`). Services call it;
pages, components, actions, route handlers and middleware never query. Column lists are always explicit (no wildcard).
**Why.** One obvious, auditable place for every query; public reads can be proven to touch only approved columns; the boundary is
machine-checked (`pnpm check:db-boundary`, part of `pnpm validate`) rather than convention.
**Unchanged.** RLS remains the authorization authority; the layer is an architectural boundary, not a replacement. No service-role
credentials, direct connections or SECURITY DEFINER (single reviewed exception: AD-011). Details: `database-access-layer.md`.

## AD-010: Articles are canonical identity content published through the website snapshot

**Decision.** Articles live in `folioone.articles` (owner-only). The public site renders only from `website_published_articles`,
rows copied from `articles` inside `website_publish` in the same transaction as the page snapshot. Bodies are validated JSON
rendered by our own renderer, not HTML. A trigger removes a snapshot row the moment its article stops being published.
**Why.** One publishing architecture (M5), immediate revocation without request-time reads of private tables, no stored-XSS
surface, and article ownership independent of URL slugs (so Personas can adopt articles later).
**Details.** `m6-articles-and-thoughts.md`.

## AD-011: PRO is granted only by one narrow SECURITY DEFINER function

**Decision.** Plans live in `folioone.account_plans` (one row per account, `free` or `pro` with `pro_until`) and verified
payments in `folioone.pro_payments`. Users may read their own rows and create only a Free row; nobody but
`folioone.billing_activate_pro` can write PRO. That function is the project's **only** SECURITY DEFINER function. It acts
for `auth.uid()` only, accepts only the published prices (INR 299 / USD 5) and 30 days, and requires a proof:
HMAC-SHA256 over `account|order|payment|amount|currency|days` keyed with `FOLIOONE_ENTITLEMENT_SECRET`, a secret held only
by the app server and by `folioone.billing_secrets` (no grants, no policies). The server computes the proof only after
verifying the payment with Razorpay (Checkout signature, order created by us for this account, PRO price, payment captured).
Each Razorpay order and payment is recorded once.
**Why.** A plan the user could write through RLS would let anyone call PostgREST with their own token and make themselves
PRO. The alternatives were worse: a service-role key bypasses all RLS (AD-004) and a manual step would delay activation.
**Also.** Triggers (SECURITY INVOKER, via `folioone.has_pro()`) refuse choosing or publishing a PRO-only design on a Free
account (`PT402`), so the lock holds even against direct API calls. Each payment buys 30 days with no automatic renewal.
No webhooks (they would need a credential outside a user session).
**Details.** `m9-pro-plans.md`, `docs/sql/milestone-9/`.

## AD-012: Profile photos are stored privately and copied to a public bucket only on publish

**Decision.** Uploaded photos live in the private Storage bucket `identity-media` at `<account_id>/profile/<image_id>.<ext>`
and are referenced from `identity_profiles.profile_image_url` by their authenticated object URL (no schema change; external
image links keep working). Publishing the website or card copies the photo to the public bucket `public-media` at
`<account_id>/website/…` or `<account_id>/card/…`; the snapshot stores that public URL. Unpublishing, or publishing with a
different photo, deletes the old copies. Storage policies let only the owner (first folder = `auth.uid()`) read, insert or
delete; there is no UPDATE policy, so objects are never overwritten. All calls use the owner's session (AD-004).
**Why.** AD-005: nothing becomes public by editing. A single public bucket would expose every uploaded photo before its owner
published anything; one copy per surface lets the website and card show different photos and be unpublished separately.
**Details.** `m10-profile-media.md`, `docs/sql/milestone-10/`.
