# Plan: Local AI gateway

Use existing TypeScript, Zod and fetch without new dependencies. Add lazy server-only config in
src/lib/ai/config.ts and OpenAI-compatible structured extraction transport in
src/lib/ai/openai-compatible.ts. Wire resume-extractor.ts through provider selection, leaving
Gemini transport intact. Activate .env.development.local only if absent; do not read .env.local.

Constitution: I scoped requirements/stories; II existing domains/stack; III server-only config
and authenticated import unchanged; IV no database actions; V mocked request/error regressions;
VI IMP/NFR mapping and D-003 limitation explicit. All gates pass by design, with evidence in tasks.

US1 maps to config.ts/tests/ai-config.test.ts; US2 maps to openai-compatible.ts,
resume-extractor.ts and tests/resume-extractor.test.ts. Document operational settings in
.env.example and docs/architecture/environment-variables.md. Generate all endpoint URLs from one
normalized base prefix; never invent a new chat, AI writer or embeddings product surface.

Validation: focused config/extraction suites; pnpm test/typecheck/lint/check:db-boundary;
Prettier on changed files. Synthetic gateway availability checks must not send user resumes or
credentials. No database, hosted-browser or deployment actions.

## Unified provider follow-up

Extend src/lib/ai/config.ts with canonical lower/uppercase settings, provider aliases and isolated legacy credential resolution. Dispatch Google through its configured generateContent endpoint in resume-extractor.ts; reuse the existing gateway transport for OpenAI/local. Extend config and mocked request tests for precedence, cloud model/key requirements, custom Google endpoint/model and provider switches. Do not send live cloud requests. Update .env.example, environment documentation and smoke-runner key aliases.
