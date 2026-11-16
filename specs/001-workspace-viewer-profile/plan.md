# Implementation Plan: Workspace viewer profile compatibility

**Branch**: feat/llms.txt | **Date**: 2026-11-15 | **Spec**: [spec.md](spec.md)

## Summary and technical context

Keep the Next.js/TypeScript/Supabase architecture. Add `findViewerProfile` beside `findProfile`
in `src/lib/db/queries/identity.ts`. Return a typed Pick of IdentityProfile containing displayName,
fullName, headline; validate it with the existing profileSchema projection. Normal selection:
`display_name,full_name,headline`. On `42703` or `PGRST204` only, run one baseline selection:
`display_name,headline`, normalize absent fullName to null, and validate. Both reads use the same
client and verified account filter. A failed retry uses the existing error mapper. No writes,
new dependencies, schema changes, or general-purpose retry mechanism.

Switch `src/domains/identity/viewer.ts` to that projection via `@/lib/db/query`. Keep the existing
session, billing, fallback-name and Next.js control-flow behavior. The full profile editor retains
strict M4 requirements. Do not change `console.error` to disguise failures.

## Constitution check

- I: PASS — scoped bug specification, numbered requirements, two stories and acceptance scenarios.
- II: PASS — only query-layer reads and viewer orchestration change; no canonical identity mutation.
- III: PASS — verified owner client/filter, explicit columns, no anonymous/private boundary change.
- IV: PASS — no database inspection/SQL execution; migration readiness remains developer-controlled.
- V: PASS by design — regression tests required; actual results recorded in tasks.md.
- VI: PASS — ID-001/PER-007/NFR references and D-006 limitation recorded in spec.md.

## Structure, contracts, and validation mapping

| Requirement | Implementation                               | Evidence                                                                                                                        |
| ----------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| FR-001/002  | src/lib/db/queries/identity.ts               | tests/identity-profile-repository.test.ts: projection, verified ownership, at most one compatibility retry                      |
| FR-003      | src/domains/identity/viewer.ts               | tests/workspace-viewer-loader.test.ts: normal names, recovered legacy selection, errors, no profile, auth and framework signals |
| FR-004      | existing findProfile/create/update unchanged | repository regression: full profile missing-column errors remain errors                                                         |
| FR-005      | docs/architecture/development-setup.md       | documented M4 SQL prerequisites and explicit scope of viewer compatibility                                                      |

No data model or new public API contract. The barrel exports the new helper automatically.
Run targeted tests first, then `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm check:db-boundary`,
and Prettier on changed files. Do not run database/browser/reset workflows.

## Risks and rollout

Follow-up FR-006: in `src/domains/identity/viewer.ts` only, skip page-load logging for typed
`BillingPersistenceError` with PGRST205/42P01 and retain the existing false isPro default.
Missing billing schema/cache is optional for display; the unchanged billing query/service still
fails for pricing/checkout/entitlement operations. Regression tests in
`tests/workspace-viewer-loader.test.ts` cover both missing-table codes, unrelated codes/types,
active PRO and framework rethrows. This does not authorize M9 execution or verify database state.

A legacy schema adds one failed read and one baseline read per request, not a global cache or
write retry. If baseline columns are also absent, errors remain visible; this is not full schema
repair. Existing migration docs remain authoritative for profile editing. Revert the query helper
and viewer import to roll back; no data rollback is needed. Real database reproduction remains
unverified because this work uses mocks and does not inspect the configured project.
