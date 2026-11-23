# Feature Specification: AI intro studio proof of concept

**Feature ID**: 006-ai-intro-poc  
**Created**: 2026-11-21  
**Status**: Implementation authorized by request to create POC

## Problem and scope

A portfolio owner wants to turn a portrait and an approved script into a short introduction, optionally preparing the script from résumé text.

**In scope**: Isolated studio; local demo; downloadable silent motion-portrait demo; stock voice preview; optional real talking-avatar generation; readable résumé text upload/paste; review and reset.

**Out of scope**: Canonical identity writes, portfolio publishing, database persistence, PDF/DOCX extraction, voice cloning, production billing and background jobs.

**Existing evidence**: AD-014 and docs/architecture/m13-video-intro.md describe recorded video. This POC does not modify that workflow or imply deployed availability.

**Product requirement references**: NFR-001, NFR-005–010. New VIDEO-POC requirements originate from the user's 2026-11-21 request.

**Scope classification**: Experimental POC, not production capability.

**Decisions affected**: AD-014 excludes synthetic video in the existing product. Resolution: experimental route only, live mode explicitly enabled by operator, existing recorded intros untouched. Production integration still requires a separate architecture amendment. No unresolved baseline decision is silently resolved.

## User Scenarios & Testing

### User Story 1 - Try an introduction (Priority: P1)

Upload a photo, edit a script or import readable résumé text, preview a stock voice, and generate a local demo.

1. Given a JPEG/PNG portrait and approved short script, when generating a demo, then a downloadable silent motion portrait with script excerpts is produced and labeled as a demo without lip sync or embedded voice.
2. Given invalid, oversized, or undecodable input, when preparing generation, then explain the error without external transmission.
3. Given edited input, when reviewing, then a stale output cannot be mistaken for the new inputs.

### User Story 2 - Generate a real avatar (Priority: P2)

An authenticated owner explicitly chooses live mode and approves transmission and possible provider charges.

1. Given operator-enabled live mode and authentication, when submitting once, then the provider receives only the portrait, approved script, and selected voice.
2. Given missing consent, no authentication, cross-owner job lookup, or disabled live mode, then reject before provider access.
3. Given repeated identical request IDs, then reuse the submission; ambiguous failures do not automatically retry.
4. Given completion or failure, then show the real video or a sanitized error; allow manual status checks after bounded polling.

### Edge Cases

- Empty or overlong script; corrupt portrait; binary résumé; unsupported browser recording/speech; provider timeout, moderation or quota rejection.
- Jobs expire after one hour or server restart; no durable recovery claim.
- No portfolio publishing or database access occurs. Output URLs from live provider expire and are bearer-accessible; do not describe them as authenticated Folioone storage.

## Requirements

- **FR-001**: Accept valid JPEG/PNG up to 2 MB; validate signature and decode locally.
- **FR-002**: Permit editable script of 10–140 words and at most 2,000 characters; estimate speaking duration.
- **FR-003**: Accept UTF-8 TXT/MD résumé up to 100 KB, or pasted text, and create an explicitly extractive draft requiring review.
- **FR-004**: Provide a local silent video demo and optional browser stock-voice preview with honest labels and unsupported-browser errors.
- **FR-005**: Gate real provider use by operator flag, authentication, and explicit consent; keep credentials server-only.
- **FR-006**: Associate in-memory live jobs with verified owners, deduplicate request IDs, bound submissions and polling, sanitize failures, and never auto-resubmit ambiguous jobs.
- **FR-007**: Revoke local object URLs, clear stale output on edits, and offer reset; never persist uploads or scripts in browser storage.
- **FR-008**: Support keyboard access, responsive layout, reduced motion, progress, and error announcements.

### Privacy and permissions

Demo files remain in browser memory; browser/system speech may use OS services. Live mode uploads photo and script to D-ID after approval; provider retention and expiring bearer URLs apply. No canonical writes or publish controls. Live metadata is memory-only and owner-scoped. No permanent storage, cleanup guarantee at provider, or production readiness claim.

### Key Entities

Portrait; approved script; selected stock voice; local demo blob; owner-scoped generation job and expiring result.

## Success Criteria

- **SC-001**: A supported browser can produce a six-second downloadable demo from valid inputs without provider credentials.
- **SC-002**: Every provider operation is blocked without its required configuration, owner authorization, and consent.
- **SC-003**: All invalid-input and ownership acceptance cases have unit evidence.
- **SC-004**: Studio controls remain usable at narrow and wide viewport sizes; browser review remains separately authorized.

## Assumptions and open questions

- POC runs in a single Node process; limits and job IDs are transient. Do not deploy live mode as a multi-instance production service.
- Provider pricing, account access, live output quality, and provider-side deletion remain unverified.
