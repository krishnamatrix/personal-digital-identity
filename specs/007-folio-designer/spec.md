# Feature Specification: Folio Designer

**Feature ID**: 007-folio-designer  
**Feature Branch**: _Not created by this command_  
**Created**: 2026-11-22  
**Status**: Draft  
**Input**: User description: "Create a new module Folio Designer, add menu under My Presence. Have text to paste prompt and based on the prompt create design with user information"

## Problem and scope

A signed-in owner wants to describe—in plain language—how their public presence should look and feel, and receive a personalized design proposal that reflects both that intent and the identity information they already maintain in Folioone. Today they must browse fixed design catalogs and configure surfaces manually; Folio Designer shortens that loop by combining a user-authored prompt with approved identity context to produce a reviewable design outcome.

**In scope**:

- Add **Folio Designer** as a workspace destination listed under the existing **My Presence** navigation group (alongside My Website, Digital Cards, Video Intro, and related presence tools).
- Provide a dedicated Folio Designer screen where the owner can type or paste a natural-language prompt describing audience, tone, visual style, emphasis (for example highlight projects versus writing), or other presentation goals.
- On explicit generate action, combine the prompt with the signed-in owner's saved identity information (name, headline, summary, role, industry, and other fields the product already stores for that account) to produce a **design proposal** the owner can preview before applying it anywhere.
- Initial application target is the owner's **My Website** draft configuration (theme/layout selection and related presentation choices documented for websites). The proposal must map to designs the product can actually render and preview.
- Show clear loading, empty, validation, unavailable, and error states; preserve the prompt text when a run fails so the owner does not lose their work.
- Require authentication and owner-only access; no other account may trigger generation or view another owner's prompts or proposals.

**Out of scope**:

- Automatically publishing a website, digital card, or any public snapshot from a generated proposal (`FUT-006`, deliberate publication rules).
- Writing or overwriting Master Identity, Persona records, or article content without a separate explicit save on those screens.
- Generating net-new visual assets (custom logos, AI portraits, or arbitrary image files) unless a future spec extends media generation.
- Digital card design application in the first release (may be added as a follow-on once website flow is validated).
- Persisting a history of prompts or proposals across sessions unless a later spec defines retention and export.
- Public or anonymous access to Folio Designer.

**Existing evidence**:

- Workspace navigation groups **My Identity** and **My Presence** are defined in `src/components/workspace/workspace-frame.tsx`; **My Presence** already routes to website, cards, video intro, insights, personas, and related profile sections.
- Website design catalog, preview, and draft configuration behavior are described in M5/M7 and product requirements `WEB-001`–`WEB-010`.
- `specs/002-local-ai-gateway/spec.md` and `specs/005-persona-document-llm/spec.md` establish authenticated, server-mediated AI patterns with review-before-save (`FUT-006`, `AD-007`).
- No Folio Designer route, screen, or service exists in the repository today.

**Product requirement references**:

- **Journey alignment**: P1 publish deliberately (preview before publish); P3 reviewable AI assistance (`FUT-006`).
- **Functional**: `WEB-001`–`WEB-004` (website configuration and preview), `WEB-010` (design catalog constraints), `ID-006` (identity saves do not silently update live surfaces), `AUTH-004`/`AUTH-006` (session and honest unavailable states).
- **Nonfunctional**: `NFR-001` (owner-only access), `NFR-006` (clear async states), `NFR-007` (sensitive processing and bounded payloads), `NFR-009` (verifiable acceptance behavior).
- **New requirements introduced here** (to be folded into product requirements on approval):
  - **DES-001**: Folio Designer is reachable from My Presence for authenticated owners.
  - **DES-002**: Owners can submit a bounded natural-language prompt and receive a reviewable website design proposal informed by their saved identity.
  - **DES-003**: Applying a proposal updates website **draft** configuration only after explicit confirmation; it does not publish.

**Scope classification**: Planned capability (new My Presence module). Live AI and design-mapping behavior remain unverified until implemented and tested in a configured environment.

**Decisions affected**:

- **FUT-006 / AD-007**: Generated output is a proposal; canonical identity and live publication stay unchanged until the owner reviews and confirms apply on the Folio Designer screen (draft website config) or edits elsewhere explicitly.
- **D-003**: No automatic merge of AI suggestions into Master Identity from Folio Designer.

## User Scenarios & Testing (mandatory)

### User Story 1 - Open Folio Designer from My Presence (Priority: P1)

An authenticated owner opens the workspace sidebar, expands or scrolls to **My Presence**, and selects **Folio Designer** to reach the designer screen.

**Independent Test**: Sign in as an owner; confirm Folio Designer appears only under My Presence; navigating to it shows the prompt area and generate affordance without exposing other accounts' data.

**Acceptance Scenarios**:

1. **Given** a signed-in owner, **When** they choose Folio Designer from My Presence, **Then** they land on the Folio Designer screen with a visible prompt field and instructions for what to enter.
2. **Given** a visitor without a session, **When** they attempt to open Folio Designer, **Then** they are redirected to sign-in and do not see designer content.
3. **Given** an owner on a narrow viewport, **When** they use mobile navigation, **Then** Folio Designer remains reachable with the same core prompt and generate controls.

### User Story 2 - Generate a design proposal from a prompt and identity context (Priority: P1)

The owner pastes or types a prompt describing how they want to present themselves. They run generation and see a preview of a proposed website design that reflects both the prompt and their saved identity (for example headline and summary inform layout emphasis or sample hero copy in preview only).

**Independent Test**: With a seeded identity profile and a fixed prompt, trigger generation (mocked or live) and verify the response includes a previewable design proposal tied to catalog-capable website settings, without persisting identity or publishing.

**Acceptance Scenarios**:

1. **Given** a non-empty prompt within the documented length limit and a saved profile with at least a display name, **When** the owner confirms generate, **Then** they see progress feedback and then a design preview with enough detail to judge fit (layout/theme and which identity facets informed the result).
2. **Given** an empty or whitespace-only prompt, **When** the owner attempts generate, **Then** the system blocks the action and explains that a prompt is required, without calling AI.
3. **Given** AI or design mapping is unavailable (misconfiguration or provider failure), **When** the owner generates, **Then** they see an honest unavailable or failure message and their prompt text remains editable in the form.
4. **Given** a completed proposal, **When** the owner edits the prompt and generates again, **Then** the previous proposal is clearly superseded or marked stale so they cannot mistake old output for the new prompt.

### User Story 3 - Review and apply to website draft (Priority: P2)

The owner likes a proposal and explicitly applies it to their website draft, then can open My Website preview to continue tuning or publish through existing flows.

**Independent Test**: Apply a mocked proposal; verify website draft settings change only after confirm; verify live published site (if any) is unchanged until existing publish actions.

**Acceptance Scenarios**:

1. **Given** a visible design proposal, **When** the owner chooses apply and confirms, **Then** website draft configuration updates to match the proposal and a success confirmation offers a path to My Website.
2. **Given** a visible design proposal, **When** the owner dismisses or navigates away without applying, **Then** no website draft or identity data changes occur.
3. **Given** a website draft updated from Folio Designer, **When** the owner publishes via existing My Website controls, **Then** only then may visitor-visible content change, consistent with `ID-006`.

### Edge Cases

- Prompt at maximum length, prompts with only punctuation, or prompts in a non-English language: validate length; still attempt generation when within bounds; surface provider errors without leaking internal details.
- Sparse identity (missing headline or summary): generation still runs using available fields and states which fields were missing so the preview does not imply false completeness.
- Owner with no website draft yet: applying a proposal initializes or updates draft configuration without creating a public slug or published snapshot.
- Concurrent tabs: applying in one tab does not corrupt another tab's unsaved prompt; last explicit apply wins for draft config with predictable messaging.
- PRO vs Free entitlements: if a proposal selects a premium-only design, apply respects existing entitlement rules (`BILL-001`–`BILL-005`) and explains lock state instead of silently granting access.

## Requirements (mandatory)

### Functional Requirements

- **FR-001**: The workspace MUST list **Folio Designer** under the **My Presence** navigation group and route owners to a dedicated Folio Designer screen.
- **FR-002**: The Folio Designer screen MUST provide a multiline prompt control supporting paste and keyboard entry, with a documented minimum and maximum prompt length (default assumption: 20–2,000 characters).
- **FR-003**: The system MUST reject generation when the prompt is empty or below the minimum length, with field-level guidance.
- **FR-004**: On generate, the system MUST use only the signed-in owner's identity information and the submitted prompt; it MUST NOT accept an account identifier from client input to scope data access.
- **FR-005**: The system MUST produce a design proposal that can be rendered through the existing website design and preview model (catalog-aligned theme/layout and configuration fields), not free-form markup that the product cannot preview.
- **FR-006**: The system MUST show a visual preview (or equivalent faithful representation) of the proposal before any apply action, including which identity fields influenced the outcome at a summary level.
- **FR-007**: Applying a proposal MUST require an explicit confirm step and MUST update website **draft** configuration only; it MUST NOT publish, unpublish, or alter Master Identity.
- **FR-008**: The system MUST preserve the owner's prompt in the UI across failed generations and allow reset/clear without affecting saved identity or drafts until apply is confirmed.
- **FR-009**: When AI services are not configured or return errors, the system MUST surface honest unavailable or failure states per `AUTH-006` and `NFR-006` without exposing credentials, raw provider payloads, or other users' data.
- **FR-010**: Folio Designer MUST meet the same accessibility expectations as other workspace screens: labeled controls, keyboard operability, visible focus, and announcements for async status changes.

### Privacy and permissions

- **Read access**: Only the authenticated owner may open Folio Designer and view their prompts and proposals for that session.
- **Identity use**: Generation may send a bounded subset of the owner's private profile and presentation fields to the configured AI processor to fulfill the prompt; the owner must see upfront disclosure that their identity content will be used for this request (consistent with other AI-assisted flows).
- **No public leakage**: Prompts, proposals, and intermediate AI content remain private workspace data unless the owner later publishes via existing website flows.
- **Logging**: Operator logs MUST NOT store full prompts, full profile payloads, or generated proposal bodies; only minimal diagnostic metadata for support.
- **Publication**: No design proposal becomes visitor-visible without the owner's separate publish action on My Website.

### Key Entities (if data is affected)

- **Design prompt**: Natural-language instructions the owner enters for a single generation attempt; ephemeral in UI unless future retention is specified.
- **Identity design context**: Snapshot of allowlisted owner identity fields assembled at generation time (not a new canonical record).
- **Design proposal**: Structured website draft configuration plus preview metadata produced by generation; discarded or superseded when the owner regenerates or leaves without applying.
- **Application action**: Owner-confirmed event that writes the proposal into website draft settings.

## Success Criteria (mandatory)

- **SC-001**: In user testing, at least 90% of participants signed in as owners can find Folio Designer under My Presence and locate the prompt field within one minute without assistance.
- **SC-002**: At least 85% of valid prompt submissions (non-empty, within length limits) return a previewable design proposal or a clear actionable error within 30 seconds under nominal load in a configured environment.
- **SC-003**: Zero tested cases allow an unauthenticated user or a second account to view or trigger generation using another owner's identity context.
- **SC-004**: In acceptance testing, applying a proposal never changes live visitor-visible website content until the owner completes the existing publish flow; 100% of apply-without-publish cases leave the published snapshot unchanged.
- **SC-005**: Owners report (survey or structured feedback) that the preview reflects both their prompt intent and their identity information in at least 80% of successful generations in a pilot cohort.

## Assumptions and open questions

- First release applies proposals to **My Website** drafts only; Digital Cards integration is deferred to reduce scope while validating prompt-to-design quality.
- Proposals select and tune within the **existing website design catalog** (`WEB-010`) rather than inventing unrenderable one-off themes.
- Default prompt bounds are 20–2,000 characters; operators may tighten further for cost control without changing owner-facing minimum validation.
- AI processing follows the same authenticated server mediation pattern as other Folioone LLM features; exact provider is an implementation choice.
- Identity context includes display name, headline, professional summary, industry, purpose, and visible section highlights when present; highly sensitive fields (private notes, unpublished articles) are excluded unless explicitly added in a later spec.
- No cross-session history of prompts is stored in v1; refreshing the page clears in-progress proposals unless the owner applied them to draft.