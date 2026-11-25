# Implementation Plan: AI intro POC

**Date**: 2026-11-21 | **Spec**: [spec.md](spec.md)

## Summary and technical context

Use the existing Next.js 15 / React 19 / TypeScript / Tailwind / shadcn stack without dependencies. Isolate UI at `/poc/video-studio`. Domain validators and extractive script helper stay separate from the server-only D-ID adapter and memory job service. Browser Canvas + MediaRecorder creates a six-second silent motion portrait, explicitly distinct from talking-avatar output. Browser speech is a separate preview.

Live route uses authenticated Supabase Auth verification only, never queries a database, and never uses administrative credentials. It uploads multipart images to D-ID and polls talks. One-hour memory jobs are owner-scoped; duplicate request IDs share a promise, a process-wide capacity cap and per-owner submission limit bound usage. Existing inputs/outputs are not published or persisted. Provider status reconciliation happens only on authenticated requests. No automatic submission retry.

## Constitution Check

- [x] I: spec includes bounded POC requirements and acceptance scenarios.
- [x] II: approved stack and UI primitives; no canonical writes or new dependencies.
- [x] III: local demo; explicit live transmission approval, owner-scoped jobs; no publish boundary changes.
- [x] IV: no SQL, database connection, migrations, hosted tests, or environment file reads.
- [x] V: meaningful validation, provider, ownership, duplicate and UI acceptance tests; checks recorded in tasks.
- [x] VI: new POC scope and NFR references; AD-014 production conflict resolved through explicit isolation.

## Project structure and contracts

- `src/domains/video-studio/studio.ts`: pure constraints, file signatures, script drafting.
- `src/domains/video-studio/provider.ts`: D-ID REST adapter; fixed provider origin, bounded timeouts, sanitized errors.
- `src/domains/video-studio/jobs.ts`: owner-scoped, single-process promise reservations and polling.
- `src/app/api/poc/video-studio/route.ts`: operator gate, auth, same-origin POST, multipart bounds, response no-store.
- `src/components/video-studio/`: studio and browser renderer.
- `src/app/poc/video-studio/page.tsx`: isolated entry point and configuration availability flag only.
- `tests/video-studio*.test.*`: FR-001–008 acceptance evidence.

POST multipart: image, script, voice, consent, requestId. Returns job ID. GET job ID returns processing/ready/failed and provider result URL only for owner. No arbitrary external URL input. Fixed voice allowlist. Never return raw provider errors.

## Validation and requirement mapping

FR-001–003: pure/domain and UI tests. FR-004/007/008: browser helper guards and UI tests. FR-005/006: mocked provider/job/route tests, never real inference. Commands: pnpm test, pnpm typecheck, pnpm lint, pnpm check:db-boundary, changed-file Prettier check. No browser or hosted suite is authorized.

## Rollout and risks

Live mode requires VIDEO_POC_LIVE_ENABLED=true and DID_API_KEY. Do not add keys to source or read existing env files. Default demo is local and free. No service guarantees: restart loses jobs, multiple instances have inconsistent limits, provider URLs expire. Disable flag to remove live access. Future production work needs durable reservations, billing, storage validation/ownership, captions and an AD-014 amendment.

## Complexity tracking

None within the bounded experimental scope.
