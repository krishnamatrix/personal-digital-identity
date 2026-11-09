# Folioone Implementation Blueprint

**Status:** Architecture approved. The initial Identity and Access foundation (Milestones 2A–2C) is complete; hosted two-user verification is recorded in [Milestone 2C](milestone-2c-rls-isolation-verification.md). Database DDL is authored for manual developer execution only. Codex must not connect to Supabase or apply migrations.

## 1. Initial Repository Assessment (Historical)

The workspace currently contains only the root `AGENTS.md`. No source files, package manifest or pnpm lockfile, Next.js or TypeScript configuration, UI dependencies, authentication or database setup, migrations, tests, environment examples, or product documentation were present. This checkout has no Git metadata or history. No environment-file contents were inspected; no configured variable names could be confirmed. Consequently, there is no existing stack to preserve or project-specific command to run. All technical choices below are recommendations based on the product brief and preferred technology direction.

## 2. Recommended Architecture

Use the approved stack: **Next.js App Router, TypeScript, pnpm, Supabase PostgreSQL, Drizzle ORM, Supabase Auth, Supabase Storage, Tailwind CSS, shadcn/ui, Zod, Vitest, and Playwright**. This is a **modular monolith** organized around business domains. Develop against hosted Supabase PostgreSQL; local Docker PostgreSQL is not a prerequisite. Keep domain logic independent of React components and route handlers. Route handlers and server actions authenticate, validate, authorize, and call domain services; domain services own business rules and use explicit persistence/query modules.

**Master Identity** is the canonical personal and professional information for an account. **Persona** is a curated presentation of that identity for an audience, referencing shared records through selections and optional presentation overrides. An account may have many personas. **Portfolio** is a website generated from a selected identity/persona and its selected content; an account may have multiple portfolios, each with its own sections and ordering. **Identity Card** is a compact, shareable presentation of a persona. **CV** is a document generated from selected canonical information. Experiences, education, skills, and projects are stored once; these outputs are projections, never duplicate canonical stores. A publishing service builds versioned allowlisted snapshots; it changes public output only after explicit publication.

### Domain boundaries and rollout

| Domain                      | Initial scope                     | Boundary                                                                                                              |
| --------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Identity Core               | Include                           | Canonical profile, experience, education, skills, projects, ownership and visibility.                                 |
| Authentication and Accounts | Include                           | Supabase Auth identity, application account linkage, sessions and account lifecycle.                                  |
| Privacy and Access Control  | Include                           | Authorization policy, RLS, field visibility, private defaults and audit-relevant publication actions.                 |
| Media Management            | Include                           | Private uploads, ownership, metadata, processing state and controlled public derivatives.                             |
| Portfolio Engine            | Include multiple basic portfolios | Each portfolio selects a persona and owns section configuration/order; read-only rendering of an approved projection. |
| Persona Management          | Include basic personas            | Persona settings and selections over canonical records; no copied master content.                                     |
| Publishing Engine           | Include                           | Explicitly publish/unpublish versioned allowlisted projections and public routes.                                     |
| Resume Intelligence         | Defer parsing                     | Begin with manual entry and secure resume upload; add extraction/review workflow later.                               |
| Highlights and Achievements | Include                           | Curated achievements with categories, evidence, dates and visibility.                                                 |
| Projects and Creations      | Include                           | Reusable owned records selected by personas and portfolios.                                                           |
| Timeline and Collections    | Defer beyond basic highlights     | Collections and timeline are views over owned records; add dedicated curation after core model.                       |
| Digital Identity Cards      | Defer                             | Build as a projection after publishing and media controls; add QR/vCard formats later.                                |
| CV Studio                   | Defer                             | Generate tailored documents from canonical records and persona/job selections; do not duplicate source data.          |
| External Integrations       | Defer except account foundation   | Add provider-scoped OAuth tokens and sync jobs only after consent, revocation, and conflict rules are designed.       |
| AI Services                 | Defer generation                  | Later suggestions are separate, reviewable, dismissible records, never silently applied to canonical identity.        |

## 3. Proposed Directory Structure

```text
src/
  app/                         # App Router layouts, pages, route handlers
    (workspace)/               # Authenticated administration workspace
    (public)/                   # Published portfolio routes
    api/                        # Narrow HTTP endpoints
  domains/
    identity/ personas/ portfolios/ projects/ highlights/ media/ publishing/
    auth/ privacy/             # Domain types, services, schemas, queries
  components/
    ui/                         # Shared primitives and design-system components
    workspace/ public-site/     # Product-specific composition
  lib/                          # Supabase clients, config, logging, shared utilities
  styles/                       # Tokens, fonts, global styles
drizzle/                        # Versioned schema migrations
tests/                          # Integration and cross-domain tests
e2e/                            # Playwright journeys
public/                         # Non-sensitive static assets only
docs/architecture/              # Decisions and this blueprint
```

Use Tailwind CSS and shadcn/ui as the single UI system. Keep the administration workspace and public portfolio visually distinct while sharing tokens and accessible primitives. Preserve the approved warm ivory, charcoal navigation, editorial typography, restrained accents, spacious layouts, and image-led portfolio direction. Do not redesign the product or introduce another UI framework.

## 4. Initial Relational Data Model

Use UUID primary keys, `user_id` ownership on user-owned rows, timestamps, foreign keys, and database constraints. Separate business data into tables; reserve JSONB for extensible provider payload metadata or versioned rendering metadata, not core identity fields.

| Entity                                         | Relationships and notes                                                                                                                                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accounts`                                     | Application account keyed to the Supabase Auth user UUID; account lifecycle and preferences. Auth remains authoritative for credentials.                                                                                              |
| `identity_profiles`                            | One canonical profile per account; names, headline, summary, contact/profile fields and locale. Private by default.                                                                                                                   |
| `experiences`, `education`, `skills`           | Many-to-one to account; normalized dates, organization/institution, descriptions, skill names and optional proficiency.                                                                                                               |
| `projects`                                     | Many-to-one to account; title, description, dates, links and status. Store project once; associate skills with a join table if needed.                                                                                                |
| `personas`                                     | Many-to-one to account; type, name, slug, description and settings. Unique `(user_id, slug)`. Multiple per account.                                                                                                                   |
| Persona selections                             | Join tables such as `persona_projects`, `persona_experiences`, `persona_education`, `persona_skills`, and `persona_highlights`; unique record/persona pairs and optional presentation overrides. Canonical rows remain account-owned. |
| `portfolios`                                   | Many-to-one to account and associated with a selected persona; title, unique account slug, publication settings and status. Multiple per account.                                                                                     |
| Portfolio sections                             | `portfolio_sections` belongs to portfolio; section type/configuration and explicit position/order. Section content references persona selections/canonical entities through typed relations, not copied records.                      |
| `highlight_categories`, `highlights`           | Categories may be system-defined or account-custom; account-owned highlights may reference a project/source entity, optional media asset, external URL/reference, dates and description.                                              |
| `collections`, `collection_items`              | Collections belong to account/persona as appropriate; items reference typed supported entities using explicit nullable foreign keys or subtype tables, with ordering and uniqueness constraints. Avoid unconstrained polymorphic IDs. |
| `timeline_events`                              | Account-owned dated events, optionally linked to a source entity. Prefer deriving events from canonical records where possible; store only curated events that need independent content.                                              |
| `media_assets`                                 | Account-owned storage key, MIME type, size, checksum, processing status, and visibility. Never store raw file bytes in business tables.                                                                                               |
| `identity_cards`                               | Account/persona-linked card settings and slug; rendered data is projected, not copied into a separate identity.                                                                                                                       |
| `integrations`                                 | Account, provider, external subject, scopes, status and encrypted/token-vault reference. Never store plaintext provider secrets.                                                                                                      |
| `discovered_items`                             | Account/provider-linked candidate items with source/provider, external identifier, discovery time, source URL, provenance metadata, review state and deduplication keys. Never silently merge into canonical records.                 |
| AI suggestions                                 | Account-owned suggestion type, proposed payload, source references, model/version metadata, status and expiry. User review and explicit approval are required before creating/updating canonical records.                             |
| `publishing_settings`, `published_projections` | Portfolio/persona/card publication settings and immutable versioned snapshots with public slug, enabled formats, allowlisted payload, source version, status and timestamps. Public serving uses only approved active snapshots.      |

Use unique indexes for account-to-profile, account/persona slug, account/portfolio slug, account/provider integration, and selection pairs. Index `user_id` on every owned table, foreign keys used in joins, public slug plus active publication state for resolution, and `(portfolio_id, position)` for section ordering. Define deletion behavior deliberately: account deletion schedules private-row and storage cleanup, integration revocation, and public projection invalidation; referenced records use restrictive or explicit soft-delete behavior where required. Provide full user export and deletion workflows as planned capabilities, not initial-milestone implementation requirements.

## 5. Authentication, Authorization, and Tenancy

### Authenticated Supabase access

Use Supabase Auth as login authority. Verify each cookie-backed session on the server with `auth.getUser()`. Use the same authenticated Supabase server client for user-owned PostgREST operations so the verified user's access token is forwarded and PostgreSQL evaluates `auth.uid()`. Never accept an account/user ID from request input as the authorization identity. Drizzle supplies schema definitions and local SQL authoring only; it does not connect for user-scoped runtime queries. The developer manually executes reviewed SQL from `docs/sql/` as `postgres`; that administrative identity bypasses RLS and must never be used by application runtime. No service-role key is used.

RLS must be enabled on every private and user-owned table, with explicit `USING` and `WITH CHECK` ownership policies and deny-by-default behavior. Enforce ownership across joins with composite ownership constraints or equivalent checks so a user's selection cannot reference another account's row. Test selects, inserts, updates, deletes, and joins as two distinct users. Public anonymous access is limited to published snapshot rows/views and public media paths; canonical tables remain inaccessible. Application authorization remains required, but does not replace RLS.

Trusted background jobs are outside the current milestone. If approved later, design isolated credentials and explicit job authorization. Supabase service-role keys bypass RLS and must never be used for user-facing requests or shipped to browsers.

## 6. Privacy and Publishing

New accounts, personas, records, and uploads default to private. Model visibility explicitly (for example, private, selected-persona, public-when-published) and evaluate it server-side. Persona selection alone does not make a record public. Field-level allowlists decide which profile fields enter a public projection; deny-by-default is safer than serializing a whole profile and removing fields afterward.

Store resume originals and private uploads in non-public buckets with short-lived signed access after authorization. Validate type and size, use generated storage names, and treat filenames and extracted text as untrusted. Public images should be deliberate derivatives copied or transformed to a public-serving path only when the user publishes them. Prevent direct public access to private storage objects.

Publishing is an explicit user action with preview of exact audience and fields. On publish, create a new immutable snapshot version from the selected persona, portfolio sections/order, approved fields and selected canonical records. Public routes resolve a normalized slug through an active-publication index and read only the corresponding approved snapshot; unknown, unpublished, or disabled slugs return not found. Public pages and JSON/JSON-LD/`llms.txt` never query canonical private tables. Unpublish atomically disables the active slug/version, invalidates CDN/framework caches and revalidation tags, and revokes or removes associated public media derivatives. Define cache TTL and purge behavior for deployment infrastructure; snapshots may remain private for history but must not remain publicly resolvable. Private uploads and resumes stay in private buckets, served only through authorized short-lived signed URLs. Create sanitized, purpose-specific public derivatives only during explicit publication and track their source assets for revocation/deletion.

Add automated leak tests asserting private fields, unselected records, unpublished versions, resume contents, integration tokens, and private media URLs never appear in public responses. Maintain a source-to-projection manifest or equivalent references so updates, account deletion, and unpublishing can invalidate every affected snapshot and derivative.

### Data ownership lifecycle

Plan a full account export covering canonical data, personas/selections, portfolios, highlights, media metadata, integrations metadata, and user-generated content in documented machine-readable formats. Account deletion must revoke integrations, disable public routes and invalidate caches, delete projections and private database records, schedule deletion of private and public media/resume objects, and record completion without retaining unnecessary personal data. Support individual media/resume deletion with derivative and snapshot invalidation. Integration disconnect revokes provider grants where supported, deletes stored credentials, and marks/removes sync data according to retention policy. These are required architectural capabilities, but full workflows may follow the initial milestones.

## 7. UI Component Architecture

Use App Router server components for data-oriented screens and public rendering; add client components only for interaction. Build accessible shared primitives (buttons, forms, dialogs, menus, tabs, tables, upload states) and compose them into domain-specific workspace modules. Keep form schemas aligned with Zod domain validation and show server errors in actionable form states. The workspace dashboard should compose identity overview, completion, privacy status, portfolio preview, quick actions, personas, highlights, AI suggestions (when implemented), integrations, and CV Studio entry points. The public portfolio gets its own layout and typography composition, sharing only foundational tokens and primitives. Make responsive behavior and keyboard/accessibility states part of each component's acceptance criteria.

## 8. Testing Strategy

Use Vitest for domain services, schemas, and projection/privacy rules, and Playwright for application flows. Hosted PostgreSQL/RLS tests require developer-controlled database setup and separate approval. Unit and mock-based tests are not evidence of live Supabase access or RLS isolation. The developer manually executes numbered SQL files as `postgres`; do not run `drizzle-kit migrate` or connect from tests. No local Docker PostgreSQL is used.

## 9. Milestone Plan

1. **Foundation:** scaffold the approved stack, Supabase clients, environment validation, and test tooling. Runtime does not use an administrative database connection.
2. **Identity and access (Milestones 2A–2C):** account/profile schema and RLS DDL were manually deployed and catalog-verified; authenticated application flow and two-user Auth/PostgREST isolation are recorded in [Milestone 2C](milestone-2c-rls-isolation-verification.md). This evidence applies to Identity only; each new domain needs its own DDL and approved security tests.
3. **Reusable identity content:** experiences, education, skills, projects, highlights, media upload controls, and persona selection relationships.
4. **Private workspace:** implement the approved editorial dashboard and profile editing flows with private defaults and responsive accessibility.
5. **Publishing:** projection builder, preview, explicit publish/unpublish, public portfolio rendering, and JSON/JSON-LD/`llms.txt` endpoints with leak tests.
6. **Expansion:** collections, timeline, identity cards, QR/vCard, CV Studio, resume parsing, integrations, AI suggestions, export and deletion workflows, each behind consent, review, and privacy requirements. AI suggestions require user review and approval.

## 10. Risks, Assumptions, and Open Decisions

- **Open:** confirm product name, hosting/deployment target, Supabase project separation for development, preview, and production, and whether Supabase CLI tooling will supplement hosted database development.
- **Open:** define public slug normalization/reservation, custom domains, indexing/SEO defaults, cache purge mechanism, snapshot retention and takedown behavior.
- **Open:** define field-level visibility granularity, consent and retention rules for resumes, export formats, deletion completion/retention policy, and applicable privacy obligations.
- **Open:** verify effective grants and RLS behavior for each future domain after its DDL is manually executed; obtain separate approval before hosted two-user tests for that domain.
- **Risk:** public projection bugs can expose private personal data. Keep public serving isolated from canonical tables and enforce deny-by-default projection tests.
- **Risk:** imported or AI-generated content can be inaccurate. Preserve source provenance and require human review before changing canonical identity or publishing.
- **Risk:** external integration tokens and uploaded resumes are sensitive. Defer integrations/parsing until secure token handling, file controls, and deletion workflows are established.
- **Assumption:** the approved visual direction is frozen; implementation should translate it into tokens and components without redesigning it.

## Recommended Next Task

Milestone 3B (Persona screens and application layer) is approved for application implementation only, backed by an in-memory fixture adapter. The Persona SQL proposals remain unexecuted and unapproved for execution; live Persona persistence is not implemented. See [milestone-3b-persona-application.md](milestone-3b-persona-application.md).
