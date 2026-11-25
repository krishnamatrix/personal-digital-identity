# Interface Contract: Folio Designer LLM API

**Feature**: `007-folio-designer` | **Date**: 2026-11-22

## `POST /api/llm/folio-designer`

Generate a website design proposal from a natural-language prompt and the signed-in owner's identity context.

### Request

- **Auth**: Required (Supabase session; server uses authenticated data loaders—never a client-supplied user id).
- **Content-Type**: `application/json`
- **Body**:

```json
{
  "prompt": "I want a calm, editorial site that highlights my writing and speaking, not a dense resume layout."
}
```

| Field    | Type   | Rules                |
| -------- | ------ | -------------------- |
| `prompt` | string | 20–2,000 chars trimmed |

### Responses

All responses: `Cache-Control: no-store`, `Content-Type: application/json; charset=utf-8`.

#### `200 OK`

```json
{
  "ok": true,
  "data": {
    "theme": "editorial-serif",
    "config": { },
    "rationale": "Chosen for editorial typography and prominent articles section.",
    "emphasizedSections": ["about", "articles", "featured"],
    "identityFieldsUsed": ["headline", "professionalSummary", "articles"],
    "generatedAt": "2026-11-22T20:15:00.000Z"
  }
}
```

- `config` is a full normalized `WebsiteConfig` object (same shape as website draft `config` column).
- `theme` is a valid `ThemeId` from the product catalog.

#### Errors

| HTTP | `code`              | Meaning                          |
| ---- | ------------------- | -------------------------------- |
| 401  | `unauthenticated`   | Not signed in                    |
| 400  | `invalid_prompt`    | Prompt validation failed         |
| 503  | `unavailable`       | LLM provider not configured      |
| 422  | `generation_failed` | LLM or schema validation failed  |

```json
{
  "ok": false,
  "code": "invalid_prompt",
  "message": "Describe your design in at least 20 characters."
}
```

**Security**: Responses must not include stack traces, provider bodies, API keys, or full identity payloads.

---

## `POST /api/llm/folio-designer/preview` (optional companion)

Build a renderable preview from a proposal **without** saving the website draft.

### Request

- **Auth**: Required.
- **Body**:

```json
{
  "theme": "minimal",
  "config": { }
}
```

Must match a validated `FolioDesignerProposal` subset (`theme` + `config`).

### Response `200 OK`

```json
{
  "ok": true,
  "data": {
    "theme": "minimal",
    "content": { }
  }
}
```

`content` matches the `PublishedContent` shape consumed by `SiteView` (owner preview paths only).

#### Errors

Same auth/unavailable pattern as generate; `400` `invalid_proposal` when schema fails.

---

## Server action: `applyFolioDesignerProposalAction`

Not a public REST contract; documented for implementers.

- **Input**: Validated `FolioDesignerProposal` (hidden field or serialized JSON).
- **Effect**: `saveWebsiteDraft({ theme, config })`.
- **Errors**: Maps `ProRequiredError` to user-facing message with pricing link; does not publish.