# Data Model: Folio Designer

**Feature**: `007-folio-designer` | **Date**: 2026-11-22

No new database tables or columns. Folio Designer adds ephemeral request/response types and reuses existing website draft storage.

## Ephemeral types (application memory / HTTP only)

### DesignPrompt

| Field    | Type   | Rules                                      |
| -------- | ------ | ------------------------------------------ |
| `text`   | string | Trimmed; 20–2,000 characters (FR-002/003) |
| `locale` | string | Optional browser hint; not trusted for auth |

**Lifecycle**: Created in the Folio Designer UI on each generate attempt; retained in component state across failures (FR-008); discarded on full page reload unless optional session restore is implemented.

### IdentityDesignContext

Snapshot assembled server-side at generation time; never persisted.

| Field                 | Type   | Rules                                                |
| --------------------- | ------ | ---------------------------------------------------- |
| `name`                | string | From profile; may be empty                           |
| `headline`            | string | Optional                                             |
| `professionalSummary` | string | Optional; truncated server-side                      |
| `biographyExcerpt`    | string | Optional; max 500 chars                              |
| `industry`            | string | Optional                                             |
| `purpose`             | string | Optional                                             |
| `organization`        | string | Optional                                             |
| `designation`         | string | Optional                                             |
| `visibleEntryCounts`  | object | Map of entry kind → visible count (integers ≥ 0)   |

**Relationships**: Read-only view over Master Identity + entry visibility; no Persona in v1.

### FolioDesignerProposal

| Field                   | Type            | Rules                                                                 |
| ----------------------- | --------------- | --------------------------------------------------------------------- |
| `theme`                 | `ThemeId`       | Must be in `THEME_IDS`                                                |
| `config`                | `WebsiteConfig` | Parsed via `websiteConfigSchema` + `normalizeConfig`                 |
| `rationale`             | string          | 1–600 chars; user-facing explanation                                  |
| `emphasizedSections`    | `SectionId[]`   | Subset of `SECTION_IDS`; deduplicated                                 |
| `identityFieldsUsed`    | string[]        | Allowlisted keys (e.g. `headline`, `professionalSummary`, `projects`) |
| `generatedAt`           | string          | ISO timestamp (server clock)                                          |

**State transitions**:

```text
[no proposal] --generate(success)--> [proposal active]
[proposal active] --regenerate--> [proposal stale/superseded] --> [proposal active]
[proposal active] --dismiss/clear--> [no proposal]
[proposal active] --apply(confirmed)--> [draft saved] --> [no proposal in UI optional]
```

### ApplyFolioDesignerRequest

| Field      | Type                    | Rules                                      |
| ---------- | ----------------------- | ------------------------------------------ |
| `proposal` | `FolioDesignerProposal` | Re-validated on server before persist      |

**Effect**: Calls `saveWebsiteDraft({ theme, config })`; does not call `publishWebsite`.

## Persistent entities (unchanged schema)

### Website draft (`websites` row)

Existing columns hold `theme` and `config` jsonb after apply. Created via `createSite` on first slug claim elsewhere; Folio Designer apply may initialize draft if site row exists with default slug flow unchanged—if no site row, apply returns actionable error directing owner to set a website address on My Website first (spec edge: “initializes draft” interpreted as updating draft when site exists).

## Validation summary

| Operation   | Validates                                                         | Owner scope                          |
| ----------- | ----------------------------------------------------------------- | ------------------------------------ |
| Generate    | prompt length, session auth, LLM output → proposal schema       | `auth.getUser()` only                |
| Preview     | proposal schema; builds content without DB write                | Same session                         |
| Apply       | proposal schema; `saveWebsiteDraft`; PRO theme rules              | Same session; no client `userId`     |

## Error codes (HTTP generate)

| Code              | Meaning                                      |
| ----------------- | -------------------------------------------- |
| `unauthenticated` | No session                                   |
| `invalid_prompt`  | Empty/short/long prompt                      |
| `unavailable`     | LLM not configured                           |
| `generation_failed` | LLM/parse failure                          |
| `pro_required`    | Apply only: PRO theme without entitlement    |