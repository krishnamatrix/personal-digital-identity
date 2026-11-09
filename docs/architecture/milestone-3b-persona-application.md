# Milestone 3B — Persona Application (fixture-backed)

**Status:** Implemented in the application against a deterministic **in-memory fixture adapter**. There is **no live Persona persistence**. The Persona SQL in `docs/sql/milestone-3a/` remains unexecuted and unmodified, and nothing here connects to Supabase for Persona data.

The UX follows [milestone-3a-persona-ux.md](milestone-3a-persona-ux.md) and the shared design language in [design-system.md](design-system.md). No new visual language was introduced.

## What this milestone does and does not prove

- **Proves (mock/unit/component tests):** the application's behaviour and its contract with the repository boundary: validation, version-conflict handling, atomicity of each user action, effective-content resolution, accessibility behaviour, and that Master Identity is only read.
- **Does not prove:** anything about the hosted database, RLS, grants, the PostgREST request-path gate, SQL constraints or concurrency in PostgreSQL. Those require the SQL to be approved, executed, catalog-verified and covered by separately approved hosted tests. Passing tests here must never be cited as RLS evidence.

## Screens and workflows

| Route                  | Purpose                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `/personas`            | List with Active / Archived / All filter, default marker, per-card actions, empty state with optional starter suggestions |
| `/personas/new`        | Four-step create: Describe it → Choose content → Shape presentation → Review                                              |
| `/personas/[id]?tab=…` | Editor with Details, Content, Presentation and Preview tabs                                                               |

Implemented workflows: create, edit details, include/exclude/highlight/reorder profile fields, show/hide/rename/reorder sections, category-scoped bulk actions with a confirmation summary, Persona-specific overrides (set, intentional blank, reset to My Identity), private preview with provenance inspector, set/remove default, duplicate, archive/restore, permanent delete (archived only, explicit confirmation), validation, and optimistic-concurrency conflict handling.

## Decisions applied

1. Permanent deletion only after archiving; archive and delete are separate actions. The delete dialog states that My Identity data is untouched.
2. The four-step create flow is saved by **one** service operation (`create` → `createWithConfiguration`): metadata, field selections, overrides, section layout and optional default flag commit together as version 1 with one revision. Independent field mutations are not simulated.
3. Bulk actions (include all, exclude all, clear highlights, use My Identity values everywhere) and field reordering are **one** atomic operation each (`applyProfileFieldChanges`): one version bump, one revision, all or nothing. The user sees a confirmation summary first.
4. Personas is a working navigation destination. Out-of-scope destinations (Portfolio, Digital Cards, CV Studio, AI, Connected Accounts, Privacy & Sharing, Account Settings and unbuilt identity pages) were removed from active navigation. The header menu links only to existing pages.
5. A semantic `--danger` / `--danger-soft` token and `destructive` / `destructive-outline` button variants were added. The profile editor's ad hoc `text-red-700` now uses the token.
6. Only the primitives needed were added: `Switch` (native checkbox, `role="switch"`), `LiveRegions` + `useAnnouncer`, and `ConfirmDialog` (built on the existing Dialog). The Dialog gained `DialogDescription`, `DialogClose` and an accessible name on its close button.

## Architecture

```text
src/domains/personas/
  persona-types.ts / -constants.ts / -errors.ts / -schema.ts   types, field + section allowlists, SQLSTATE-aligned errors, Zod
  persona-repository.ts        PersonaRepository interface (the persistence boundary)
  persona-memory-repository.ts InMemoryPersonaRepository (FIXTURE; copy-on-write atomicity)
  persona-resolver.ts          effective-content resolver (shared by every future consumer)
  persona-bulk.ts              pure bulk-action planner + confirmation summary
  persona-service.ts           validation, verified-account scoping, one repository call per user action
  persona-runtime.ts           server-only wiring (fixture repository + read-only profile loader)
src/app/personas/              pages, server actions, client components
```

- The account id always comes from the verified Supabase session (`createAuthenticatedClient`), never from client input. Server actions treat every argument as untrusted and validate it in the service.
- My Identity is **read-only**: the runtime uses `findProfile` (a SELECT) and not `getOwnProfile`, which would create rows. Overrides never copy canonical values.
- The fixture is held on `globalThis`, per server process, keyed by account. It resets on restart. The UI says so on every Persona screen.
- Errors carry codes aligned with the proposed RPC SQLSTATEs (`PERSONA_ERROR_SQLSTATE`), so a PostgREST adapter can map `error.code` one-to-one.

## Backend contract and integration requirements

Mapping of repository methods to the proposed RPCs (`docs/sql/milestone-3a/005`):

| Repository method                                                                                         | Proposed RPC                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `updateMetadata`, `upsertSection`, `reorderSections`, `setDefault`, `setLifecycle`, `duplicate`, `delete` | `persona_update_metadata`, `persona_upsert_section`, `persona_reorder_sections`, `persona_set_default`, `persona_set_lifecycle`, `persona_duplicate`, `persona_delete` |
| `list`, `get`                                                                                             | owner-scoped SELECTs under RLS                                                                                                                                         |

**Not covered by the milestone-3a RPCs. The M3C proposal (`docs/sql/milestone-3c`, unexecuted) adds them; the requirements below are what it implements:**

1. **Atomic create with configuration.** `createWithConfiguration` persists metadata, all field selections, overrides, sections and the optional default flag as one revision numbered 1. Composing `persona_create` with repeated `persona_update_profile_field` / section calls is not an acceptable substitute: it is not atomic, and bumps the version per call. A new RPC (and an update to the request-path gate allowlist) is required.
2. **Atomic batch field changes.** `applyProfileFieldChanges` takes an array of field changes (inclusion, highlight, position, override set/reset) and produces exactly one version bump and one revision, rolling back entirely on any invalid entry. This backs bulk actions, field reordering and the Presentation tab's multi-field save. `persona_update_profile_field` changes one field per call and is not sufficient.
3. **Error mapping.** `version_conflict` (40001), `invalid_state` (55000) and `not_found` (P0002) must be mapped from the PostgREST error `code`, not the HTTP status.
4. **Deletion dependencies.** When Portfolio/Card references exist, a `dependency` (23503) failure must be shown with the blocking consumers named, per the UX spec.

These are recorded for the later integration step only; they do not reopen SQL decisions D-1 to D-7.

## Application rules worth knowing

- Sections are limited to the starter set in the UI (`STARTER_SECTIONS`); the proposed SQL accepts any 1–80 character key. Only **Profile** has selectable content today; other sections are layout placeholders.
- Sections and content start hidden/excluded. Included fields render only inside a **visible** Profile section; the UI warns when they are included but the section is hidden.
- "Reapply my change" after a conflict re-runs the same single action on the latest version, only on an explicit click. Bulk actions do not offer reapply: the user must re-preview and re-confirm against fresh state. "Reload latest" discards unsaved edits.
- Archived Personas are read-only until restored; restore never re-applies the default.
- Revision history is recorded by the fixture (count shown in the editor) but there is no history browser yet.

## Known limitations

- Data is not durable and not shared across server instances.
- Persona list ordering has no UI (the proposed SQL has no Persona-reorder RPC).
- Only the seven profile fields are selectable; categories such as Experience or Projects do not exist yet.
- Out-of-process behaviour such as real concurrency, RLS, grants and the gate is untested here.
- The dashboard's "Your personas" cards remain static presentation data; only its "New persona" button was wired.
- Playwright (`e2e/personas.spec.ts`) exercises signed-out access and signed-in desktop and mobile flows with the dedicated development test account. It validates the browser experience against the in-memory fixture only. It is not evidence of hosted database, RLS, grants or request-path-gate behaviour. Signed-in scenarios skip when no test credentials are configured.
- Out of scope and not implemented: publishing, Portfolio, Digital Cards, CV Studio, social features, AI Suggestions.

## Tests

`pnpm test` includes, for 3B: repository contract (`persona-memory-repository.test.ts`), effective-content resolver, service (create-as-one-operation, bulk, conflicts, account isolation, Master Identity read-only), server-action result mapping, UI flows driven through the real actions against the fixture (`persona-ui.test.tsx`), UI primitives, navigation, and an architectural boundary test (`persona-boundary.test.ts`) that fails if Persona code gains PostgREST table/RPC access, service-role usage, or writes to Master Identity.
