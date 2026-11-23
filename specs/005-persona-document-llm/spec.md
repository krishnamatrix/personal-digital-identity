# Feature Specification: LLM Persona Document Extraction & Classification Service

**Feature ID**: 005-persona-document-llm  
**Feature Branch**: feat/llms.txt  
**Created**: 2026-11-20  
**Status**: Draft  
**Input**: User description: "Create llm api service to pass the document to llm, use markitdown to convert to md format and convert to required object to fill the screen model also llm should find which type of persona it is"

## Problem and scope

When creating a new Persona in Folioone, users often already have an existing document (such as a resume, speaker bio, founder brief, academic CV, or portfolio notes) that captures how they want to present themselves to a specific audience. Manually re-entering that information across the four-step Create Persona flow is slow, and sending raw binary files directly to diverse LLM providers fails when a provider or local gateway does not accept native binary document attachments.

Folioone needs an authenticated LLM document-extraction API service that converts an uploaded document into clean Markdown via MarkItDown, passes that Markdown to the configured LLM provider, identifies which type of Persona the document represents, and returns a validated structured object that prefills the Create Persona screen model for user review before saving.

**In scope**:

- Provide an authenticated server-side API service endpoint that accepts an uploaded document, converts it to normalized Markdown via a local MarkItDown command, and sends that Markdown to the configured LLM provider.
- Classify the uploaded document's Persona type into Folioone's five starter categories (`Professional`, `Founder`, `Academic`, `Creative`, `Speaker`) plus an `Other` fallback (with an optional concise rationale so the user understands why it was chosen).
- Extract and validate a structured Persona screen-model object from the LLM response covering the detected Persona type, Step 1 metadata (`name`, `audience`, `purpose`, `description`), Step 2 suggested visible sections (from Folioone's supported section keys), and Step 3 tailored presentation overrides (`headline`, `summary`).
- Display the detected Persona type and prefilled fields in the Create Persona UI so the user can review, adjust, or clear any suggestion across all four steps before explicitly creating the Persona.
- Enforce authentication, file size/format validation, ephemeral temporary-file cleanup with zero permanent storage of uploaded documents, and honest unavailable/failure states when either MarkItDown or the LLM provider is unconfigured or fails.

**Out of scope**:

- Automatically creating, saving, or publishing a Persona without explicit user review and confirmation (`AD-007`, `FUT-006`).
- Modifying canonical Master Identity records from a Persona document upload (`AD-002`).
- Persisting uploaded raw documents or converted Markdown files to database tables or object storage.
- Adding new Persona database columns or changing Persona persistence mode (`PERSONA_STORAGE`).
- Running a separate remote MarkItDown HTTP microservice (deferred to a future deployment spec if cloud runtimes lack Python/MarkItDown).
- Multi-document batch uploads, URL scraping, or external cloud-drive connectors (`FUT-005`).

**Existing evidence**:

- `specs/002-local-ai-gateway/spec.md` defines the unified server-only LLM provider configuration (`llm_provider`, `llm_endpoint`, `llm_api_key`, `llm_model`, `llm_response_format` and legacy Gemini/local settings).
- `src/app/personas/persona-create-flow.tsx` currently has a four-step Create Persona screen model (`Describe it`, `Choose content`, `Shape presentation`, `Review`) and an initial upload button wired to `extractPersonaDocumentAction` (`src/app/personas/actions.ts`), which currently parses PDF/DOCX/TXT directly without MarkItDown conversion, without a dedicated HTTP API service endpoint, without Persona-type classification, and without suggested section visibility.
- `src/domains/personas/persona-constants.ts` defines `STARTER_PERSONA_NAMES` (`Professional`, `Founder`, `Academic`, `Creative`, `Speaker`), `PERSONA_LIMITS`, `PROFILE_FIELDS`, and `STARTER_SECTIONS`.
- No MarkItDown runtime integration or live LLM provider verification is claimed by this specification.

**Product requirement references**:

- **Primary planned & baseline requirements**: `PER-002` (four-step Create Persona flow), `FUT-006` (reviewable, dismissible AI suggestions requiring explicit approval before saving), `AUTH-006` (honest unavailable state when optional provider/service is absent), `IMP-001`–`IMP-003` (authenticated upload, bounded size/type validation, untrusted extraction validation, no file persistence).
- **Nonfunctional requirements**: `NFR-001` (authenticated owner-only access), `NFR-006` (honest loading/error/unavailable states preserving user input), `NFR-007` (server-only credentials, bounded payloads, prompt-injection defense, no personal content in logs), `NFR-008` (approved modular monolith architecture), `NFR-009` (traceable verification), `NFR-010` (bounded latency and payload budgets).

**Scope classification**: Proposed AI-assisted Persona creation enhancement building on `PER-002` and `FUT-006`. Live MarkItDown execution and live LLM responses remain environment-dependent and unverified until tested against a configured environment.

**Decisions affected**:

- **D-003** (AI extraction review gate): This feature explicitly honors the review-before-save principle (`AD-007`, `FUT-006`) — extracted Persona details only prefill the unsaved Create Persona draft and never persist until the user completes the flow and clicks Create Persona.
- **AD-002** (unresolved exact persona types): Preserves Folioone's non-rigid Persona design — detected Persona type informs the user and prefills suggestions without locking the user out of custom naming or editing.

## User Scenarios & Testing (mandatory)

### User Story 1 - Upload a document to convert via MarkItDown, classify Persona type, and prefill the Create Persona screen (Priority: P1)

An authenticated user creating a new Persona uploads an existing document (such as a PDF resume, Word bio, or text brief). The service converts the document into Markdown using MarkItDown, sends the Markdown to the configured LLM, identifies the Persona type (`Professional`, `Founder`, `Academic`, `Creative`, `Speaker`, or `Other`), and returns a validated screen-model object that prefills all relevant steps of the Create Persona form for review.

**Independent Test**: Submit a valid supported document to the authenticated API service with mocked MarkItDown conversion and mocked LLM output; verify the response contains the detected Persona type, metadata, tailored headline/summary, and suggested visible sections, and verify the Create Persona screen displays the detected Persona type and prefills the draft without saving a Persona.

**Acceptance Scenarios**:

1. **Given** an authenticated user with MarkItDown and an LLM provider configured, **When** the user uploads a valid supported document from the Create Persona screen, **Then** the service converts the document to Markdown via MarkItDown, sends that Markdown to the LLM, classifies the Persona type (`Professional`, `Founder`, `Academic`, `Creative`, `Speaker`, or `Other`), and returns a validated screen-model payload that prefills the form and shows the detected Persona type for review.
2. **Given** the form has been prefilled from an uploaded document, **When** the user navigates through Steps 1–4 to inspect or edit the suggested Persona type, metadata, visible sections, or presentation wording, **Then** no Persona has been saved yet, Master Identity is unchanged, and the user retains full control before clicking Create Persona.

### User Story 2 - Reject unauthenticated, invalid, oversized, or maliciously formatted uploads safely (Priority: P1)

An unauthenticated caller or a user uploading an empty, oversized, unsupported, corrupted, or prompt-injecting file attempts to call the extraction API service. The service rejects invalid requests cleanly without executing unsafe operations or leaking internal details.

**Independent Test**: Send unauthenticated, empty, oversized (> 5 MB), unsupported-format, and malformed-LLM-output requests to the API service; verify appropriate safe error statuses and messages with zero leaked credentials, stack traces, or document contents.

**Acceptance Scenarios**:

1. **Given** an unauthenticated request to the LLM Persona extraction API service, **When** a document is submitted, **Then** the service rejects the request as unauthorized without invoking MarkItDown or the LLM provider.
2. **Given** an authenticated user uploads an unsupported file type, an empty file, or a file exceeding the 5 MB limit, **When** submitted to the API service, **Then** the service rejects the upload with a clear, actionable validation error before invoking MarkItDown or the LLM.
3. **Given** a document contains prompt-injection instructions or the LLM returns malformed, truncated, or out-of-bounds data, **When** processed, **Then** the service validates and clamps the output strictly against the screen-model contract (including allowlisted Persona types and section keys) or returns a safe failure message while preserving any fields the user already typed.

### User Story 3 - Honest unavailable and failure states (Priority: P2)

A user visits Create Persona in an environment where MarkItDown or the LLM provider is not configured or temporarily unreachable. The screen remains fully usable for manual entry and communicates unavailability honestly.

**Independent Test**: Run with the LLM provider or local MarkItDown binary unavailable/failing; verify the API service returns an honest unavailable/failure response and the Create Persona flow stays usable manually without losing typed input.

**Acceptance Scenarios**:

1. **Given** the LLM provider or MarkItDown converter is not configured or unavailable, **When** a user opens Create Persona or calls the API service, **Then** the system reports unavailability clearly and allows manual Persona creation without obstruction.
2. **Given** the user has already typed values in Create Persona and an upload attempt fails, **When** the error is shown, **Then** all previously typed values remain intact.

### Edge Cases

- **Unreadable or image-only PDF**: MarkItDown produces empty or whitespace-only Markdown; the service rejects it cleanly with a helpful message rather than calling the LLM with empty input.
- **Excessively long converted Markdown**: Converted Markdown exceeds the 100,000-character budget; the service rejects it cleanly before calling the LLM so provider requests stay predictable.
- **Ambiguous Persona type**: Document blends multiple roles (e.g., founder + speaker); the LLM selects its primary detected Persona type from the 5 starter types or `Other` with a short rationale while allowing the user to rename or edit freely.
- **Temporary file cleanup**: Any ephemeral temp file created for local MarkItDown conversion is deleted in a guaranteed cleanup path on both success and failure — never persisted to user storage or database tables.
- **External provider timeout or refusal**: Service enforces request timeouts, never automatically switches to an unconfigured external provider, and never exposes provider keys or raw error bodies to the browser.

## Requirements (mandatory)

### Functional Requirements

- **FR-001**: The system MUST expose an authenticated server-side API service endpoint that accepts a single uploaded document and returns a validated Persona screen-model payload plus the detected Persona type.
- **FR-002**: The service MUST verify the caller's authenticated session server-side before reading, converting, or sending any document to an LLM.
- **FR-003**: The service MUST validate uploaded files for non-empty content, bounded file size (maximum 5 MB), and allowed document extensions/signatures before conversion.
- **FR-004**: The service MUST convert the validated document into clean Markdown (`.md`) using a local MarkItDown invocation (with configurable command path and bounded timeout), clean up any temporary file unconditionally, and reject empty or excessively long (> 100,000 characters) converted Markdown before calling the LLM.
- **FR-005**: The service MUST pass the converted Markdown (treated strictly as untrusted data, not instructions) to the configured server-only LLM provider and request a schema-constrained structured response.
- **FR-006**: The LLM output MUST classify `personaType` into the closed allowlist (`Professional`, `Founder`, `Academic`, `Creative`, `Speaker`, `Other`) with an optional concise `personaTypeReason` (≤ 200 characters).
- **FR-007**: The LLM output MUST map extracted details to the Create Persona screen model — `name` (≤ 100), `audience` (≤ 200), `purpose` (≤ 200), `description` (≤ 500), tailored `headline` (≤ 180), tailored `summary` (≤ 2000), and `suggestedSections` (allowlisted subset of Folioone's starter section keys) — validated and clamped server-side before returning to the browser.
- **FR-008**: The Create Persona UI MUST call the API service when the user uploads a document, clearly display the detected Persona type (and optional rationale), prefill Steps 1–3 of the screen model for review, and NEVER automatically save the Persona or modify Master Identity.
- **FR-009**: The service MUST never persist uploaded documents or converted Markdown to permanent storage or database tables, and MUST exclude document contents, extracted personal text, and provider credentials from logs and client error payloads.
- **FR-010**: When MarkItDown or the LLM provider is unavailable or fails, the API service and UI MUST surface an honest, actionable message while preserving all user-entered draft fields.

### Privacy and permissions

- **Authentication**: Only signed-in users may invoke the API service; unauthenticated requests fail immediately with an unauthorized response.
- **Data minimization & ephemerality**: Uploaded files and converted Markdown exist only for the duration of the request; any temporary file created for local MarkItDown conversion is removed immediately in a guaranteed cleanup block and never stored in Supabase Storage, database tables, or diagnostic logs.
- **No silent mutation (`AD-002`, `AD-007`)**: The API service is strictly read/suggest-only. It never writes to Master Identity, Personas, or any public snapshot.
- **Server-only secrets (`NFR-007`)**: LLM provider endpoints, API keys, and MarkItDown command configuration remain strictly server-only and never reach browser code.

### Key Entities (if data is affected)

- **Uploaded Source Document** (ephemeral): User-supplied file validated before conversion and discarded immediately after MarkItDown completes.
- **Converted Markdown Document** (ephemeral): Normalized UTF-8 Markdown output produced by MarkItDown and bounded to ≤ 100,000 characters before LLM submission.
- **Persona Extraction Result** (ephemeral response payload): Validated structured object containing `personaType` (`Professional | Founder | Academic | Creative | Speaker | Other`), optional `personaTypeReason`, Step 1 metadata (`name`, `audience`, `purpose`, `description`), Step 2 `suggestedSections` (allowlisted starter section keys), and Step 3 presentation overrides (`headline`, `summary`).

## Success Criteria (mandatory)

- **SC-001**: 100% of unauthenticated, empty, oversized (> 5 MB), and unsupported-format requests are rejected before MarkItDown or any LLM call is invoked.
- **SC-002**: For valid supported documents processed through MarkItDown and a valid structured LLM response, 100% of returned fields conform to Folioone's Persona length/allowlist rules, include a valid Persona type classification (`Professional`, `Founder`, `Academic`, `Creative`, `Speaker`, or `Other`), and prefill the Create Persona screen without triggering a save.
- **SC-003**: Across all failure modes (MarkItDown unavailable/empty output/timeout, LLM unavailable, timeout, refusal, malformed JSON, empty extraction), the user receives a safe actionable error message and retains 100% of previously typed form values.
- **SC-004**: Zero uploaded files, temporary conversion files, converted Markdown bodies, personal text, or provider credentials persist on disk or appear in server logs or client-side bundles across automated verification checks.
- **SC-005**: Document conversion and response validation enforce deterministic bounds (upload ≤ 5 MB, converted Markdown ≤ 100,000 characters, bounded MarkItDown execution timeout).

## Assumptions and open questions

- **Assumption 1**: The LLM provider transport reuses Folioone's existing unified server-only AI configuration (`002-local-ai-gateway`: local OpenAI-compatible gateway, OpenAI, or Google Gemini) with no automatic cross-provider fallback.
- **Assumption 2**: Local MarkItDown (`markitdown` CLI in the server's environment, overridable via a server-only environment variable) is used for document-to-Markdown conversion; if `markitdown` is not installed, the feature degrades honestly with a clear unavailable message.
- **Assumption 3**: Converting documents to Markdown via MarkItDown allows local or text-only LLM models (which may not accept raw PDF binary attachments) to process PDFs, Word documents, and other rich formats reliably.
- **Open questions**: None remaining for specification; ready for `/speckit-plan`.
