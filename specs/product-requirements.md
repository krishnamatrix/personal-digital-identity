# Folioone Product Requirements

**Version**: 1.0.0  
**Created**: 2026-11-15  
**Status**: Draft consolidated baseline for review  
**Branch**: `feat/llms.txt`  
**Input**: Create detailed requirements for this product using the existing repository context.

## 1. Purpose and interpretation

Folioone helps a person maintain one private source of personal and professional information,
curate it for different audiences, and deliberately publish websites, articles, and digital cards.
The intended result is less repeated editing and clear control over what becomes public.

This document consolidates repository requirements. It does not certify deployment, database
execution, payment operation, or compliance. Requirements describe intended behavior; source-file
presence is not evidence that a capability works in a hosted environment.

| Classification  | Meaning                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Baseline        | Behavior described by the current milestone/design records; implementation and environment readiness require separate evidence. |
| Planned         | Longer-term product direction in the architecture/blueprint; requires a scoped feature spec before implementation.              |
| Decision needed | Sources conflict or leave a material choice unresolved; affected implementation must resolve it first.                          |

Requirements use stable IDs. Feature specs must reference these IDs, or explicitly explain why
a requirement is new or being amended. This product baseline is not an executable feature plan.

## 2. Users, jobs, and product boundaries

| Actor              | Job                                                                                | Access boundary                                                              |
| ------------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Identity owner     | Maintain a trustworthy personal/professional record and reuse it across audiences. | Verified account; own private records only.                                  |
| Portfolio owner    | Select content, preview a website, publish it, and withdraw it.                    | Drafts remain private; publication is explicit.                              |
| Writer             | Maintain articles and choose which appear on the public website.                   | Article state and website publication are separate controls.                 |
| Public visitor     | Read a shared website/article/card and save approved contact information.          | Live published snapshots only; no access to the owner's workspace.           |
| Paying owner       | Unlock premium designs for a clearly stated period.                                | Entitlement follows verified payment; client UI cannot grant access.         |
| Developer/operator | Configure services and execute reviewed deployment steps.                          | Operational activity does not authorize access through public product flows. |

### Prioritized user journeys

1. **P1 — Establish identity:** sign up, confirm email, complete or skip onboarding, save profile
   sections, and return later without losing saved information.
2. **P1 — Publish deliberately:** select visible identity content, choose a design, preview, publish,
   edit privately, republish, and unpublish with predictable visitor-visible results.
3. **P1 — Protect ownership:** another account and an anonymous visitor cannot read or mutate
   private identity, drafts, originals, or entitlements.
4. **P2 — Curate an audience:** create a Persona with selected fields and overrides while preserving
   Master Identity, then manage its lifecycle and conflicts.
5. **P2 — Share writing and contacts:** maintain articles and a digital card, select public fields,
   share links, and withdraw publication.
6. **P2 — Manage media and premium designs:** upload a private photo, deliberately publish a copy,
   and purchase a verified, time-limited premium entitlement.
7. **P3 — Extend the identity:** multiple portfolios, CV generation, collections/timeline,
   connected sources, reviewable AI assistance, and complete export/deletion workflows.

The P1/P2/P3 ordering above is a proposed planning order for this consolidated document, not a
claim that later-priority features are absent or that the owner has approved a release schedule.

**Excluded from the baseline:** social feeds, likes, comments, follower relationships, reader
accounts, collaborative editing, newsletters, automatic publication, unreviewed canonical AI
edits, and external-provider sync without a separately designed consent/revocation workflow.

## 3. Product model

| Concept             | Responsibility and relationship                                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account             | Owns one canonical identity and its private content; authentication is handled by Supabase Auth.                                                                                 |
| Master Identity     | Canonical profile and reusable employment, education, skills, projects, links, achievements, certifications, languages, interests, and articles.                                 |
| Persona             | Audience-specific selections, ordering, highlights, and presentation overrides over canonical information; editing it does not edit Master Identity.                             |
| Website / portfolio | Configures a public presentation, address, content selection, design, and publication state. M5 currently specifies one website per account; multiple portfolios remain planned. |
| Article             | Account-owned writing independent of Persona and website slugs; public serving uses separately published snapshots.                                                              |
| Digital card        | Compact contact presentation. M8 selects directly from Master Identity and provides one card per account; Persona-backed cards remain an unresolved future alignment.            |
| Media asset         | Private original with an owner; deliberate, surface-specific public derivatives are created on publication.                                                                      |
| Published snapshot  | Validated, allowlisted content approved for a particular public surface; isolated from mutable drafts and private canonical tables.                                              |
| Entitlement         | Free or time-limited PRO access derived from verified payment, not an editable profile flag.                                                                                     |

A Persona selection, an article's `published` editorial state, or saving a website/card draft
must not be interpreted as public distribution without the relevant publishing action.

## 4. Functional requirements — baseline

### 4.1 Authentication and onboarding

Source: [M4](../docs/architecture/m4-auth-onboarding.md).

- **AUTH-001:** Support name, email, password, and password confirmation at sign-up; reject
  invalid input and passwords outside the documented 8–72 character range.
- **AUTH-002:** Support confirmation callbacks and password recovery callbacks; reject unsafe
  redirect destinations and present actionable failure states without exposing other accounts.
- **AUTH-003:** Give neutral sign-up/recovery responses that do not disclose email membership.
- **AUTH-004:** Support login, sign-out, session refresh, forgot password, and password reset.
  Protected data must not render for an expired or missing session.
- **AUTH-005:** Provide the documented seven-step onboarding flow, persist progress per saved
  step, allow steps after Welcome to be skipped, and allow later continuation from the profile.
- **AUTH-006:** Make optional provider-dependent features unavailable honestly when their server
  configuration is absent; manual identity entry must remain usable.

### 4.2 Master Identity and editing

Sources: M4; [entry registry](../src/domains/identity/entry-kinds.ts).

- **ID-001:** Maintain one canonical profile per account, with personal information, biography,
  professional summary, headline, location, contact fields, designation, organization, industry,
  purpose, image references, and social/web links as supported by the validated profile schema.
- **ID-002:** Support add, edit, remove, ordering, and show/hide controls for the record kinds below.
- **ID-003:** Validate required fields, allowed fields, dates, URL schemes, lengths, and list caps
  on the server. Reject end dates before start dates. Display field-specific corrections.
- **ID-004:** Provide per-section Save/Cancel, unsaved indicators, and a leave warning. Switching
  sections must preserve drafts. Saved preview must exclude hidden records and unsaved changes.
- **ID-005:** Provide completion guidance and useful empty states without manufacturing profile
  content or implying that optional fields are mandatory for publication.
- **ID-006:** Saving identity changes must not silently update a live website or digital card.

| Kind            | Main information                                               | Current application cap |
| --------------- | -------------------------------------------------------------- | ----------------------- |
| Employment      | Title, organization, location, dates/current role, description | 30                      |
| Education       | Institution, qualification, specialization, dates, description | 20                      |
| Skill           | Name, category, description                                    | 100                     |
| Project         | Name, role, URL, description, technologies, image URLs         | 30                      |
| Social/web link | Platform, optional custom label, URL                           | 30                      |
| Achievement     | Title, date, description                                       | 50                      |
| Certification   | Name, issuer, date, credential URL                             | 50                      |
| Language        | Name and optional proficiency                                  | 30                      |
| Interest        | Name                                                           | 50                      |

These caps reflect the application registry, not a claim that equivalent database constraints
exist. A future change must update validation, user messaging, and relevant schema requirements.

### 4.3 Personas

Sources: [M3B](../docs/architecture/milestone-3b-persona-application.md),
[M3C](../docs/architecture/milestone-3c-persona-persistence.md), and AD-002.

- **PER-001:** List owned Personas with Active/Archived/All views and a default marker.
- **PER-002:** Create through Describe → Choose content → Shape presentation → Review. A successful
  configured create must be atomic and begin at version 1 with one revision.
- **PER-003:** Include/exclude, highlight, reorder, and override supported fields; allow intentional
  blank values and reset to Master Identity. Show effective values and provenance in preview.
- **PER-004:** Show/hide, rename, and reorder sections. Apply confirmed bulk changes atomically
  with one version increment and revision, or leave all state unchanged on failure.
- **PER-005:** Support set/remove default, duplicate, archive, restore, and confirmed permanent
  deletion of archived Personas. Preserve canonical identity; name blocking consumers when known.
- **PER-006:** Reject stale mutations with a conflict state. Reload/reapply must preserve unrelated
  newer changes; never silently overwrite them or automatically retry a possibly committed mutation.
- **PER-007:** Disclose fixture-backed, nonpersistent behavior when fixture mode is active. Do not
  enable live persistence solely because an adapter or SQL file exists.

### 4.4 Website configuration and publishing

Sources: [M5/M7](../docs/architecture/m5-public-website.md), AD-005.

- **WEB-001:** Provide the baseline single website draft with address, content selection/order,
  design, metadata, and publication controls. Keep draft configuration owner-only.
- **WEB-002:** Publish only identity entries that are visible and selected. Contact fields require
  explicit inclusion; omit empty sections and reject unsafe links.
- **WEB-003:** Provide owner-only, non-indexable saved-draft preview with desktop/tablet/mobile
  modes. Previewing a design must not save, publish, or grant entitlement to it.
- **WEB-004:** Publish a validated snapshot on explicit action; show changes since last publication.
  Republish must rebuild from the selected current content.
- **WEB-005:** Serve `/<slug>` from the live snapshot only. Unknown/unpublished addresses return
  not found. Editing drafts/canonical data must leave the existing snapshot unchanged.
- **WEB-006:** Normalize addresses to lowercase; enforce 3–40 characters, single hyphens between
  alphanumeric groups, reserved route names, and uniqueness. Availability checks are advisory until
  save succeeds. Resolve collisions without revealing another owner's private draft.
- **WEB-007:** Change the private and public address atomically. The old address must stop serving
  that publication. M5 releases old addresses without redirect; see decision D-005 before expansion.
- **WEB-008:** Unpublish must disable public content atomically and prevent subsequent application
  reads. Public media/cache revocation has additional acceptance obligations under NFR-004.
- **WEB-009:** Provide published title, description, canonical URL, social metadata/share image,
  copy/open/share actions, and downloadable link QR where supported.
- **WEB-010:** Support the design catalog documented in M5/M7 (three original themes plus twenty
  templates), with consistent design IDs and readable contrast; premium access is governed below.

### 4.5 Articles and thoughts

Source: [M6](../docs/architecture/m6-articles-and-thoughts.md), AD-010.

- **ART-001:** Provide owned article listing, title/body search, Draft/Published/Archived filters
  and counts, recent/published/title sorting, and twelve items per page.
- **ART-002:** Provide title, subtitle, rich-text body, excerpt, cover, category, tags, and SEO
  details. Support the allowlisted formatting described in M6, word count, and reading time.
- **ART-003:** Autosave after 1.5 seconds of inactivity and offer explicit Save. Distinguish unsaved,
  saving, saved, failed, and changed-elsewhere states; warn before leaving with pending edits.
- **ART-004:** Allow draft → published/archived, published → draft/archived, and archived → draft.
  Publishing requires title/content and saves pending edits first. Assign a stable slug on first publish.
- **ART-005:** Version-check updates/deletes; require delete confirmation. Reject stale writes and
  offer recovery rather than overwriting newer text.
- **ART-006:** Keep the website article section disabled/empty by default. Allow selection and
  ordering of up to fifty eligible published articles; snapshot them only on website publication.
- **ART-007:** Render public article pages from live article snapshots. Unpublish/archive/delete
  must withdraw their public snapshot immediately; configuration deselection applies on republish.
- **ART-008:** Accept validated, bounded rich-text JSON, never arbitrary stored HTML. Sanitize
  allowlisted nodes/marks and URLs on save and public read; use the shared safe renderer for preview.

### 4.6 Digital cards

Source: [M8](../docs/architecture/m8-digital-cards.md).

- **CARD-001:** Support the baseline one-card-per-account Details → Design → Share flow and
  Professional/Personal/Social/Creative presets.
- **CARD-002:** Select existing Master Identity fields individually; disable unavailable fields
  with an edit-identity path. Support display-name/initials overrides and one labeled custom link.
- **CARD-003:** Offer the documented thirty-two designs across seven layouts, subject to premium
  access. Include a photo only when selected and supported by the chosen design; otherwise use initials.
- **CARD-004:** Claim an address and publish/update/unpublish explicitly at `/social/<slug>`.
  Store private drafts separately from allowlisted public snapshots; revalidate public payloads.
- **CARD-005:** Generate the contact QR on demand and download vCard 3.0 containing exactly the
  published contact fields and card address. Do not add private or disabled contact fields.

### 4.7 Profile photos and resume import

Sources: [M10](../docs/architecture/m10-profile-media.md), M4 resume-import section, AD-012.

- **MEDIA-001:** Allow upload/change/remove from profile and onboarding. Crop to square, resize
  to 800 pixels, and re-encode to remove metadata; validate type/signature and size server-side.
- **MEDIA-002:** Accept JPEG/PNG/WebP originals up to 2 MB, use fresh object names, and store them
  privately under the authenticated owner's path. Owner display must use authorized short-lived access.
- **MEDIA-003:** Create separate website/card public copies only during publication. Replacing
  one surface's image must not accidentally revoke another surface's active image.
- **MEDIA-004:** Removing a private profile photo must not claim to withdraw a published copy.
  Explain that live copies remain until republish/unpublish; track and surface cleanup failure.
- **IMP-001:** Offer configured resume import only after authentication. Accept PDF/DOCX up to
  5 MB; validate extension/signature before processing and validate extracted content as untrusted input.
- **IMP-002:** Preserve existing user-entered information. Fill eligible empty fields only and
  append validated, deduplicated entries within the section caps; never delete existing records.
- **IMP-003:** Do not persist the uploaded resume to disk/storage in the documented import flow.
  Do not expose provider credentials to the browser or public output. Resolve D-003 before expanding
  import because the recorded auto-merge flow conflicts with the general AI review principle.

### 4.8 Free and PRO

Source: [M9](../docs/architecture/m9-pro-plans.md), AD-011. These are repository product rules,
not independently verified current provider pricing or legal/payment guidance.

- **BILL-001:** Show Free/PRO plans and locked designs with a path to pricing. Allow preview of
  locked website designs without granting save/publish access.
- **BILL-002:** Use the documented INR 299 / USD 5 offers for a thirty-day entitlement, select the
  currency server-side under the documented country/time-zone rules, and show the amount before payment.
- **BILL-003:** Activate PRO only after server verification of signature, account/product, order,
  amount, currency, and captured payment. Record each order/payment once to prevent duplicate credit.
- **BILL-004:** Extend entitlement from the later of now or the existing expiry. Do not renew or
  charge automatically. Verify replay handling does not grant a second extension.
- **BILL-005:** Enforce premium design selection/publication on server and database paths, not
  only through UI locks. Expiry must not take down an already-live site/card; republish requires PRO
  or a Free design. Preserve the documented behavior of already-saved premium designs.
- **BILL-006:** Distinguish payment success from entitlement activation. The baseline has no
  automatic recovery/webhooks; disclose the failure case and define operator reconciliation before
  production readiness, rather than showing an unverified success message.

## 5. Planned capabilities — separately scoped work

Source: [implementation blueprint](../docs/architecture/implementation-blueprint.md), AD-002/003/006.
These requirements capture direction and do not authorize implementation or a release date.

| ID      | Capability                                                                               | Required boundary / prerequisite                                                                                                           |
| ------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| FUT-001 | Multiple independent portfolios per account, each with content and section configuration | Resolve D-001; preserve canonical references and independent publication/revocation.                                                       |
| FUT-002 | Persona-backed websites/cards and tailored CV generation                                 | Decide consumer relationships; render selected effective content without copying canonical identity.                                       |
| FUT-003 | Curated highlights/categories, collections, and timelines with evidence/media            | Preserve ownership, ordering, provenance, and explicit selection.                                                                          |
| FUT-004 | Machine-readable public JSON, JSON-LD, and llms.txt                                      | Read only live approved snapshots; resolve format/routes/discovery/indexing in a feature spec. Branch naming is not a feature requirement. |
| FUT-005 | External connected accounts and discovered content                                       | Specify provider consent, scopes, token handling, deduplication, conflict resolution, disconnect and revocation.                           |
| FUT-006 | AI suggestions and assisted generation                                                   | Keep proposals separate, reviewable, dismissible, and attributable; require approval before canonical updates/publication.                 |
| FUT-007 | Full account export in documented machine-readable formats                               | Cover canonical records, selections, writing, media metadata and owned content; decide format and expiry/security.                         |
| FUT-008 | Account/media deletion and integration revocation                                        | Invalidate public outputs and derivatives, revoke credentials, define completion/backup/retention behavior.                                |

Custom domains, visitor analytics, indexing controls, payment recovery automation, and broader
subscription models require explicit scope decisions; they are not silently included by this baseline.

## 6. Nonfunctional requirements

- **NFR-001 — Tenant isolation:** Every private read/write must authenticate and enforce owner
  access, including referenced rows and direct API paths. Error states must not disclose foreign data.
- **NFR-002 — Public allowlists:** Anonymous pages, metadata, QR/vCard, and future machine-readable
  formats must expose only explicitly approved fields; never tokens, originals, private storage URLs,
  private drafts, unselected records, or account identifiers outside the approved contract.
- **NFR-003 — Data integrity:** Operations documented as atomic must commit wholly or roll back.
  Concurrent edits must be detected where versioned. A reported successful save must survive a reload
  in persistent mode; fixture mode must disclose its limits.
- **NFR-004 — Revocation:** Future application requests after completed unpublish must not return
  withdrawn content. Cache and derivative cleanup must be verified separately. Already-downloaded
  third-party copies cannot be recalled. Best-effort Storage cleanup is a documented gap, not proof
  that a public object is gone; resolve D-004 before claiming complete revocation.
- **NFR-005 — Accessible presentation:** Preserve keyboard operation, accessible form/dialog
  names, focus behavior, status announcements, readable contrast, and usable responsive navigation.
  Test representative small/large viewports and the design catalog's documented contrast checks.
- **NFR-006 — Honest failure states:** Present loading/empty/validation/signed-out/conflict/
  dependency/unavailable-service/save-failed states with recovery actions; do not show success after
  a failed operation or replace real workspace data with unlabeled sample data.
- **NFR-007 — Sensitive processing:** Keep credentials server-only, sanitize uploaded/external/AI
  input, bound payload/file sizes, and exclude personal content and secrets from diagnostic logs/specs.
- **NFR-008 — Architecture:** Retain the approved stack and centralized server-only database layer
  with explicit columns. Application schema is `folioone`; environment separation uses projects.
- **NFR-009 — Verification:** Trace requirements to acceptance tests; distinguish mocks, local
  integrations, catalog evidence and hosted tests. Database execution stays developer-controlled.
- **NFR-010 — Performance planning:** Each feature must define measurable latency/payload budgets
  appropriate to its journey before performance acceptance. Traffic, SLOs, availability, and recovery
  targets are not established by current product sources; do not invent approved targets.

## 7. Acceptance scenarios and evidence matrix

Each scenario is independently reproducible with controlled fixtures; hosted/storage/payment
acceptance requires its own authorized environment. References are coverage candidates, not pass claims.

| ID / journey                  | Given / When / Then                                                                                                                                                                                                   | Requirement coverage                    | Existing coverage candidates                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| AC-01 Start identity          | Given a confirmed account, when the owner saves onboarding progress and returns, then saved progress resumes and skipped optional fields remain optional.                                                             | AUTH-001–006, ID-001                    | `tests/auth-flows.test.ts`, `tests/auth-actions.test.ts`                                                      |
| AC-02 Preserve drafts         | Given an unsaved section, when the owner changes tabs then returns, then the draft remains; Cancel restores saved state and saved preview excludes hidden entries.                                                    | ID-002–006                              | `tests/identity-entries.test.ts`, `tests/identity-profile-service.test.ts`                                    |
| AC-03 Isolate accounts        | Given owners A/B and an anonymous reader, when B/anonymous requests A's private rows or files, then access fails without disclosing content; A can still read their own data.                                         | NFR-001/002, MEDIA-002, PER-007         | `tests/persona-isolation.test.ts`; separately authorized RLS/Storage evidence required                        |
| AC-04 Curate safely           | Given Master Identity, when a Persona is created with selections/overrides and a confirmed bulk action, then effective preview is correct, identity is unchanged, and each atomic operation has one version/revision. | PER-001–005                             | `tests/persona-service.test.ts`, `tests/persona-atomicity.test.ts`                                            |
| AC-05 Handle conflict         | Given two loaded versions, when one is saved and the other changes, then stale save is rejected and recovery retains unrelated newer work.                                                                            | PER-006, ART-005, NFR-003               | `tests/persona-reapply-and-preview.test.tsx`, `tests/articles-service.test.ts`                                |
| AC-06 Publish selection       | Given hidden and selected entries plus an excluded email, when the owner previews/publishes, then only eligible approved fields appear; canonical edits remain private until republish.                               | WEB-001–005, NFR-002                    | `tests/website-domain.test.ts`, `tests/website-templates.test.tsx`                                            |
| AC-07 Withdraw public data    | Given a live site/card/article, when its documented withdrawal action completes, then subsequent public requests fail; public derivative/cache revocation is tested independently.                                    | WEB-007/008, ART-007, CARD-004, NFR-004 | `tests/articles-lifecycle.test.ts`, `tests/digital-cards.test.tsx`; Storage/CDN verification remains separate |
| AC-08 Publish writing         | Given a saved published article that is not selected, when visitors open the website, then it is absent; selecting and republishing exposes a sanitized snapshot only.                                                | ART-001–008                             | `tests/articles-website.test.ts`, `tests/articles-rich-text.test.tsx`                                         |
| AC-09 Share contact           | Given a published card with email/phone excluded, when a visitor opens the card or saves/scans its contact, then neither excluded field appears in any representation.                                                | CARD-001–005, NFR-002                   | `tests/digital-cards.test.tsx`                                                                                |
| AC-10 Separate image surfaces | Given a private photo and two published surfaces, when one surface is republished with another image, then the other remains correct and no original is publicly readable.                                            | MEDIA-001–004                           | `tests/profile-media.test.ts`; real Storage policies/cleanup need separate evidence                           |
| AC-11 Import defensively      | Given an authenticated owner with existing content, when a valid or invalid resume is submitted, then validated import preserves existing data and invalid/oversize/anonymous input is rejected.                      | IMP-001–003, NFR-007                    | `tests/resume-import.test.ts`, `tests/resume-extractor.test.ts`; D-003 remains unresolved                     |
| AC-12 Verify premium          | Given Free/expired/PRO accounts, when design selection and verified/unverified/replayed payments are exercised, then access follows entitlement and a payment grants time at most once.                               | BILL-001–006                            | `tests/billing.test.tsx`; provider integration/reconciliation needs separate evidence                         |

## 8. Release success criteria

- **SC-001:** Every in-scope requirement in a release maps to at least one acceptance check with
  recorded outcome; unresolved blockers are visible and no deferred capability is labeled complete.
- **SC-002:** All defined negative privacy cases return no protected content across public page,
  metadata, contact, and machine-readable representations included in that release.
- **SC-003:** Publish → private edit → republish → unpublish produces the documented state at each
  step; owner preview and visitor output agree for the same approved snapshot.
- **SC-004:** Persistent saves survive reload, stale writes fail safely, and atomic-operation
  failure injection produces no partial user-visible state for the operations scoped as atomic.
- **SC-005:** Core journeys are operable by keyboard with actionable validation and recovery;
  relevant automated accessibility/contrast and responsive checks pass.
- **SC-006:** PRO activation, replay protection, expiry, and failed confirmation are verified in an
  authorized test environment before claiming the paid journey is production-ready.

## 9. Decisions, source conflicts, and release blockers

| ID    | Decision / discrepancy                                                                                                                           | Required resolution                                                                                                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-001 | AD-002/blueprint allow many Persona-backed portfolios/cards; M5/M8 define one site/card directly from identity.                                  | Treat M5/M8 as current milestone scope; obtain a feature decision before adding multiplicity or wiring consumers to Personas.                                                      |
| D-002 | AD-003 favors normalized relational core content; M4 uses typed `identity_entries.data` JSON.                                                    | Document the approved storage-model reconciliation before schema redesign; this requirements document does not approve migration.                                                  |
| D-003 | Constitution/AD-007 require review before canonical AI changes; M4 describes validated resume extraction merged into empty fields automatically. | Decide whether an explicit import is sufficient consent or whether a review/apply screen is required. Do not call the existing flow compliant with a review gate without evidence. |
| D-004 | AD-005/012 require public media revocation; M10 describes best-effort cleanup that does not roll back publishing.                                | Specify failure visibility, retries/ownership, cache limits, and acceptance evidence; do not claim complete revocation from snapshot-only tests.                                   |
| D-005 | M5 releases old slugs with no redirect; broader slug/takedown/indexing/custom-domain policies remain open.                                       | Decide impersonation/reclaim risk, canonical redirects, reservations, indexing, and retention before expanding address lifecycle.                                                  |
| D-006 | README/AGENTS/M3B fixture statements coexist with later persistence and verification records.                                                    | Determine environment-specific readiness from current configuration and developer-supplied execution evidence; do not infer it from milestone labels or read secrets.              |
| D-007 | Payment can be captured without entitlement when browser confirmation is interrupted.                                                            | Define operator reconciliation, customer messaging, and ownership before production launch; automated recovery is separately scoped.                                               |
| D-008 | Export/deletion/privacy operations have no complete format, retention, backup or completion contract.                                            | Specify the lifecycle and applicable obligations before shipping those workflows or making compliance claims.                                                                      |
| D-009 | Older milestone “not built” sections conflict with later article/photo/card/design milestones.                                                   | Use the later domain-specific record for described behavior, retain historical documents, and separately verify actual deployed capability.                                        |

These items do not block writing this draft. They block decisions or release claims that depend
on their resolution. No database, provider, or deployment action is authorized by this document.

## 10. Source map and maintenance

All sources are repository records inspected on 2026-11-15. Public product facts and provider
behavior have not been independently researched for this document.

| Source                                                                                                                            | Authority in this document                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [Architecture decisions](../docs/architecture/architecture-decisions.md)                                                          | Product relationships, privacy, tenancy, schema, centralized queries, articles, billing exception, media boundaries      |
| [Implementation blueprint](../docs/architecture/implementation-blueprint.md)                                                      | Original broader product intent and planned capabilities; historical milestone status is not current deployment evidence |
| [M3B](../docs/architecture/milestone-3b-persona-application.md) / [M3C](../docs/architecture/milestone-3c-persona-persistence.md) | Persona journeys, atomic operations, fixture/persistence distinction                                                     |
| [M4](../docs/architecture/m4-auth-onboarding.md)                                                                                  | Auth, onboarding, identity editing, resume import                                                                        |
| [M5/M7](../docs/architecture/m5-public-website.md)                                                                                | Website publishing, slugs, previews, design catalog and known limits                                                     |
| [M6](../docs/architecture/m6-articles-and-thoughts.md)                                                                            | Article editor/lifecycle, safe content and publication                                                                   |
| [M8](../docs/architecture/m8-digital-cards.md)                                                                                    | Card selection/design/sharing and QR/vCard                                                                               |
| [M9](../docs/architecture/m9-pro-plans.md)                                                                                        | Premium offers, entitlement verification, expiry and recovery limits                                                     |
| [M10](../docs/architecture/m10-profile-media.md)                                                                                  | Private photo originals and public copies, cleanup limitations                                                           |
| [Entry registry](../src/domains/identity/entry-kinds.ts)                                                                          | Existing application fields, limits and validation                                                                       |
| [AGENTS](../AGENTS.md) / [constitution](../.specify/memory/constitution.md)                                                       | Development workflow, scope, authorization, evidence requirements                                                        |

Maintain stable requirement IDs; record changes and superseded behavior rather than silently
rewriting history. Feature specs link requirements here, implementation plans identify affected
contracts, and task lists attach verification evidence. New product decisions must resolve the
relevant decision IDs and reconcile the source record through an explicit change.
