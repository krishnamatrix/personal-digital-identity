# Feature Specification: Local AI gateway

**Created**: 2026-11-15 | **Branch**: feat/llms.txt | **Status**: Authorized configuration/integration

## Problem and scope

The user requests AI features use http://127.0.0.1:31415/v1 and selected model `auto`.
Authentication requirements were not supplied; support optional server-only AI_API_KEY and send
no authorization header when unset. Do not read or overwrite .env.local.

Product references: IMP-001–003, NFR-007/008/009. D-003 (resume import review/auto-merge) remains
unresolved and is not changed by provider configuration. This work changes provider transport,
not import consent, merge behavior, database schema, or AI feature scope.

### US1 — Configure the shared server gateway (P1)

Configure provider, base URL, model and optional key centrally. Normalize the supplied /v1 prefix
once and expose chat/completions, responses, messages, embeddings URLs. Configuration is never
client-supplied or NEXT*PUBLIC*. Activate the requested endpoint in an ignored development env
file without reading .env.local. Preserve explicit Gemini configuration as an alternative.

### US2 — Use existing resume import through the gateway (P1)

Send text or PDF file parts through OpenAI-compatible Chat Completions with schema-constrained
JSON. Validate returned content with the existing resume schema; reject truncation, refusal,
malformed JSON, invalid shape, HTTP and network failures. Keep authenticated import ordering and
file validation unchanged. PDF input requires gateway/model support; no provider-switch retry.

## Requirements and acceptance

- FR-001: Server config supports openai-compatible and gemini providers; legacy Gemini works when
  no provider override is set and its existing key exists. Invalid config does not send requests.
- FR-002: Local development uses the provided URL and auto model; optional auth is server-only.
- FR-003: The current feature uses /v1/chat/completions exactly once per attempt with no-store,
  timeout, an explicit system prompt, structured JSON and validated text/PDF content.
- FR-004: Propagate safe error codes only, never provider response bodies, credentials or resume
  contents. Do not silently retry requests with different formats or external providers.
- FR-005: Document that Responses/Messages/Embeddings are configured URLs, not implemented new
  product features. Allow json_object as an explicit gateway compatibility setting; still validate
  the result locally. Schema mode is the default.

Success: modern/legacy config and extraction tests pass, configuration is ignored by Git locally,
keys never appear in requests' URLs, malformed outputs fail safely, and existing tests remain green.
Live PDF model support is unverified until exercised against an authorized configured gateway.

## Unified provider follow-up (2026-11-15)

FR-006: Support llm*provider=google|openai|local, llm_endpoint (base URL), llm_api_key, llm_model and optional llm_response_format, with uppercase LLM*\* aliases. Preferred lowercase settings override uppercase aliases, then provider-specific legacy settings. Google uses native generateContent and configurable model/base; OpenAI/local use Chat Completions. Cloud credentials and OpenAI model are required. Legacy local keys/endpoints must not leak into cloud selection. No automatic provider fallback or new product features.
