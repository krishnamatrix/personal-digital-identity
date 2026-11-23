# Research & Design Decisions: Folio Designer

**Feature**: `007-folio-designer` | **Date**: 2026-11-22

## 1. HTTP API vs Server Actions for generation

- **Decision**: Expose `POST /api/llm/folio-designer` (`application/json` body `{ "prompt": string }`) as the authoritative generation contract, mirroring `005-persona-document-llm`. Use a server action only for **apply** (`applyFolioDesignerProposalAction`) because it reuses `saveWebsiteDraft` and benefits from Next.js form/action patterns for confirm + redirect.
- **Rationale**: JSON API keeps prompt validation, auth, LLM errors, and `Cache-Control: no-store` in one testable route; apply stays a thin wrapper over existing website draft persistence with entitlement checks already in `saveWebsiteDraft`.
- **Alternatives considered**:
  - Server Action for both generate and apply: Rejected to avoid duplicating HTTP semantics and to match established LLM service pattern.
  - Streaming LLM responses: Out of scope for v1; proposals are small structured JSON.

## 2. Proposal shape and catalog alignment

- **Decision**: Define `folioDesignerProposalSchema` as `{ theme: ThemeId, config: WebsiteConfig, rationale: string, emphasizedSections: SectionId[], identityFieldsUsed: string[] }` where `theme` is validated against `THEME_IDS` and `config` is parsed through `normalizeConfig` after LLM output passes Zod. LLM prompt includes a condensed catalog (id, label, category, blurb) and `SECTION_IDS` with hints—no free-form theme ids.
- **Rationale**: Satisfies FR-005 and `WEB-010`; reuses `buildPublishedContent` for faithful preview; `saveWebsiteDraft` accepts the same `{ theme, config }` draft shape.
- **Alternatives considered**:
  - Partial config patches merged client-side: Rejected—ambiguous merge with saved draft; server normalizes full config instead.
  - Generating CSS or custom palettes: Out of spec; cannot render in `SiteView`.

## 3. Identity context sent to the LLM

- **Decision**: Build `IdentityDesignContext` server-side from `loadSource()` / profile fields only: `name`, `headline`, `professionalSummary`, `biography` excerpt (first 500 chars), `industry`, `purpose`, `organization`, `designation`, plus counts of visible entries per kind (experience, projects, articles, etc.)—not raw entry bodies or unpublished article text.
- **Rationale**: Meets privacy spec assumptions, bounds tokens (`NFR-007`), still reflects sparse vs rich profiles in rationale output.
- **Alternatives considered**:
  - Full entry dump: Rejected—oversized payloads and unnecessary PII in prompts.
  - Persona selection: Deferred; v1 uses Master Identity only.

## 4. Preview without persisting the proposal

- **Decision**: Add `buildDraftPreview(theme, config)` in `website-service.ts` (or `folio-designer-service.ts` calling shared `loadSource` + `buildPublishedContent`) returning `{ theme, content }` identical to `getPreview()` but with caller-supplied draft fields instead of `findSite` row. Designer UI renders `SiteView` in a constrained panel from server-fetched preview props (page RSC loads initial empty state; client refresh after generate via route revalidation or dedicated preview endpoint `POST /api/llm/folio-designer/preview` returning serializable content).
- **Rationale**: Faithful visual preview without writing draft; satisfies FR-006; reuses existing render path.
- **Alternatives considered**:
  - ThemeThumb only: Insufficient for section emphasis and identity-informed layout judgment.
  - iframe `/website/preview?theme=` : Only overrides theme, not config.

## 5. Route and navigation placement

- **Decision**: Workspace route `/designer`, sidebar label **Folio Designer**, icon `PenTool` or `Wand2` (lucide), inserted in **MY PRESENCE** after **My Website** (presence tooling cluster).
- **Rationale**: Short path, matches module name, avoids colliding with `/website/*` tabs.
- **Alternatives considered**:
  - `/website/designer` nested tab: Blurs “module under My Presence” as a top-level destination per spec.

## 6. PRO entitlement on apply

- **Decision**: Generation may propose any catalog theme; **apply** delegates to `saveWebsiteDraft`, which already throws `ProRequiredError` when switching to a PRO theme without entitlement—surface that error in the designer confirm step with link to pricing.
- **Rationale**: Matches spec edge case and existing `website-service` behavior without new billing logic.
- **Alternatives considered**:
  - Filter PRO themes out of LLM catalog for Free users: Hides viable suggestions; spec prefers honest lock at apply time.

## 7. Persistence and session behavior

- **Decision**: No database tables for prompts/proposals in v1. Proposal lives in React state (and optional `sessionStorage` restore for same-tab navigation only—implementation optional, not required). Apply is the only durable write (`websites` draft columns via existing `saveDraft`).
- **Rationale**: Matches spec assumptions; zero SQL.
- **Alternatives considered**:
  - `folio_designer_sessions` table: Out of scope until retention spec exists.