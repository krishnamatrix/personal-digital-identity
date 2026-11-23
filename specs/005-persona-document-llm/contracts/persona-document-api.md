# Interface Contract: `POST /api/llm/persona-document`

**Feature**: `005-persona-document-llm` | **Date**: 2026-11-20

## Request

- **Method & Path**: `POST /api/llm/persona-document`
- **Auth**: Required (authenticated Supabase session cookie verified server-side via `getPersonaService().loadCanonicalForCreate()`).
- **Content-Type**: `multipart/form-data`
- **Form field**:
  - `file`: Single uploaded document (`<= 5 MB`, non-empty, extension `.pdf`, `.docx`, `.txt`, or `.md`, validated by content signature).

## Responses

All responses include `Cache-Control: no-store` and `Content-Type: application/json; charset=utf-8`.

### `200 OK` — Extraction succeeded

```json
{
  "ok": true,
  "data": {
    "personaType": "Speaker",
    "personaTypeReason": "Highlights keynote talks, conference appearances, and workshop topics.",
    "name": "Conference Speaker",
    "audience": "Event organizers and conference attendees",
    "purpose": "Keynote and panel invitations",
    "description": "Focused on analytical computing and engineering leadership talks.",
    "headline": "Keynote Speaker on Symbolic Computation",
    "summary": "Experienced conference speaker covering distributed systems and formal methods.",
    "suggestedSections": ["profile", "experience", "publications"]
  }
}
```

- `personaType`: `"Professional" | "Founder" | "Academic" | "Creative" | "Speaker" | "Other"`
- `personaTypeReason`: `string | null` (`<= 200` chars)
- `name`: `string | null` (`<= 100` chars)
- `audience`: `string | null` (`<= 200` chars)
- `purpose`: `string | null` (`<= 200` chars)
- `description`: `string | null` (`<= 500` chars)
- `headline`: `string | null` (`<= 180` chars)
- `summary`: `string | null` (`<= 2000` chars)
- `suggestedSections`: array of allowlisted keys from `STARTER_SECTION_KEYS`

### Error responses

| HTTP Status | `code`              | Meaning                                                                    |
| ----------- | ------------------- | -------------------------------------------------------------------------- |
| `401`       | `unauthenticated`   | Caller is not signed in.                                                   |
| `400`       | `invalid_file`      | Missing, empty, oversized (`> 5 MB`), unsupported, or malformed file.      |
| `503`       | `unavailable`       | Local `markitdown` CLI is not installed or no LLM provider is configured.  |
| `422`       | `extraction_failed` | Document yielded empty/oversized Markdown or LLM failed to extract fields. |

```json
{
  "ok": false,
  "code": "invalid_file",
  "message": "Upload a file of 5 MB or less."
}
```

**Security invariants**: Error payloads never include stack traces, provider response bodies, credentials, temporary file paths, or document contents.
