# Tasks: Local AI gateway

- [x] T001 Record provider/base/model requirements and scope in specs/002-local-ai-gateway/spec.md and specs/002-local-ai-gateway/plan.md.
- [x] T002 [US1] Add lazy validated server configuration and normalized endpoint URLs in src/lib/ai/config.ts with tests/ai-config.test.ts (FR-001/002).
- [x] T003 [US2] Implement bounded Chat Completions structured extraction transport in src/lib/ai/openai-compatible.ts and provider dispatch in src/lib/ai/resume-extractor.ts (FR-003/004).
- [x] T004 [US2] Cover text/PDF payloads, optional auth, output validation, errors and explicit format modes in tests/resume-extractor.test.ts (FR-003/004/005).
- [x] T005 [US1] Activate local ignored .env.development.local safely and document provider settings and feature limits in .env.example and docs/architecture/environment-variables.md (FR-002/005).
- [x] T006 Run focused/full verification and record results in specs/002-local-ai-gateway/tasks.md.

Dependencies: T001 → T002 → T003 → T004/T005 → T006. T004 and T005 touch independent
files and can proceed after the transport contract exists. Execute sequentially in this request.
US1 independent test: config endpoints/defaults/invalid-input cases. US2 independent test: mocked
extraction inputs, valid result, refusal/truncation/malformed/HTTP/network cases. MVP is both
stories together so configuration actually enables the existing feature.

## Verification and required operator action

- Config/extraction tests: 31 passed, including the JSON-mode schema prompt check.
- Full unit suite: 54 files, 721 tests passed before the final JSON-mode prompt refinement;
  targeted config/extraction tests passed again after that refinement.
- Typecheck, lint and database-boundary checks passed; changed files passed Prettier and diff checks.
- `.env.development.local` is ignored by Git. No .env.local contents or secrets were read.
- The non-inference `/v1/models` connectivity check returned HTTP 401 without a key.
  Reachability is verified; authenticated inference, auto routing and PDF support are unverified.
- No database, hosted-browser, external-provider fallback or deployment actions were performed.

- [x] T007 Operator: set AI_API_KEY securely in .env.development.local or the server process environment, restart the dev server, and verify authenticated gateway inference; record the outcome in specs/002-local-ai-gateway/tasks.md without credentials or private resume content.

## Authenticated curl verification — 2026-11-15

The user explicitly designated AI_API_KEY in .env.local for these tests. Only that
assignment was loaded for the requests; no other env values or credentials were printed.

- [x] T008 Add reusable synthetic curl runner scripts/ai/smoke-gateway.py and standalone curl examples/results in docs/architecture/ai-gateway-smoke.md.

`python3 scripts/ai/smoke-gateway.py --env-file .env.local --all`: exit 0.
All six HTTP checks passed: models (409 entries), plain chat, strict JSON-schema chat,
Responses, Messages, embeddings (3,072 dimensions). Thus the earlier unauthenticated
401 is resolved for these credentials. The server must restart to reload its environment.
No real resume, database, PDF inference, or full extraction integration was exercised.
The core app still uses only Chat Completions; these smoke checks do not add other features.

## Unified provider configuration — 2026-11-15

- [x] T009 [US1] Add google/openai/local selection, lower/uppercase llm settings, provider-specific legacy credential fallback, cloud key/model requirements and configurable Google endpoint in src/lib/ai/config.ts (FR-006).
- [x] T010 [US2] Use configured Google endpoint in src/lib/ai/resume-extractor.ts and verify actual request routing/header/model with mocks in tests/resume-extractor.test.ts; validate setting precedence and credential isolation in tests/ai-config.test.ts (FR-006).
- [x] T011 [US1] Document unified settings in .env.example and docs/architecture/environment-variables.md; support key aliases in scripts/ai/smoke-gateway.py and its docs/architecture/ai-gateway-smoke.md guide (FR-006).
- [x] T012 Record full/targeted checks and limits in specs/002-local-ai-gateway/tasks.md.

T009 precedes T010/T011; T012 follows verification. Config/extraction: 39 tests pass.
Full suite: 54 files, 729 tests pass. Typecheck, lint, database boundary, changed-file
formatting and diff checks pass. Smoke key alias/process precedence checked with
synthetic values only. No secrets or env-file contents read in this follow-up;
no new cloud inference or database operations. Existing local configuration remains
working via aliases; preferred llm settings can be supplied in .env.local and take
precedence over legacy development overrides. Google/OpenAI live behavior remains
unverified; transport changes are mock-tested. Restart dev server after setting changes.
