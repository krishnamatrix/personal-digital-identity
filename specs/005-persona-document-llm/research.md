# Research & Design Decisions: LLM Persona Document Extraction & Classification Service

**Feature**: `005-persona-document-llm` | **Date**: 2026-11-20

## 1. Converting Documents to Markdown via Local MarkItDown CLI

- **Decision**: Implement `src/lib/ai/markitdown.ts` using Node's `child_process.execFile` (no shell) against a single ephemeral file inside a freshly created `fs.mkdtemp(path.join(os.tmpdir(), "folioone-md-"))` directory, cleaned up unconditionally in `finally`. Allow overriding the binary path via server-only `process.env.MARKITDOWN_BIN` (default `"markitdown"`).
- **Rationale**:
  - `execFile` with an argument array (`[tempFilePath]`) eliminates shell-injection risks even if the user's original filename contains special characters (the temp file uses a fixed safe name like `upload.pdf` / `upload.docx` / `upload.txt` / `upload.md`).
  - Converting PDF/DOCX/TXT/MD to Markdown on the server means the LLM always receives clean, normalized UTF-8 Markdown text — making PDF uploads work reliably even with text-only local LLM gateways (`002-local-ai-gateway`).
  - Dependency-injecting the process runner in `convertToMarkdown` allows 100% deterministic unit tests without requiring Python/`markitdown` in CI.
- **Alternatives considered**:
  - Passing raw PDF bytes directly to the LLM: Fails on text-only local gateways and does not fulfill the MarkItDown-to-Markdown requirement.
  - Using `child_process.exec`: Rejected due to shell-injection risk.

## 2. Dedicated HTTP API Service (`POST /api/llm/persona-document`)

- **Decision**: Expose `POST /api/llm/persona-document` (`src/app/api/llm/persona-document/route.ts`) with `runtime = "nodejs"` and `dynamic = "force-dynamic"`, replacing the temporary `extractPersonaDocumentAction` Server Action so there is a single authoritative API contract.
- **Rationale**: Matches the user's explicit request for an LLM API service, provides clean HTTP status semantics (`200`, `400`, `401`, `422`, `503`) with `Cache-Control: no-store`, and enforces server-side auth via `getPersonaService().loadCanonicalForCreate()` without touching `@/lib/db/*` (AD-009).
- **Alternatives considered**:
  - Keeping both a Server Action and an HTTP API route: Rejected to avoid duplicate validation/auth paths.

## 3. Persona Type Classification & Screen-Model Mapping

- **Decision**: Extend `personaExtractionSchema` with:
  - `personaType`: enum `["Professional", "Founder", "Academic", "Creative", "Speaker", "Other"]`
  - `personaTypeReason`: `string | null` (clamped `<= 200` chars)
  - `suggestedSections`: `string[]` (filtered against `STARTER_SECTION_KEYS` allowlist, deduplicated, never allowing arbitrary keys)
  - Existing fields: `name`, `audience`, `purpose`, `description`, `headline`, `summary` (all clamped to `PERSONA_LIMITS` / `PROFILE_FIELDS`).
- **Rationale**: Directly maps to Folioone's `STARTER_PERSONA_NAMES` and `STARTER_SECTIONS` in `src/domains/personas/persona-constants.ts`, gives the user a clear explanation of the detected Persona type in Step 1, and prefills Steps 1–3 while preserving full manual editability before clicking Create Persona (`AD-002`, `AD-007`).
- **Alternatives considered**:
  - Adding a new `persona_type` database column: Explicitly out of scope; avoids SQL migrations and preserves AD-002's non-rigid Persona model.
