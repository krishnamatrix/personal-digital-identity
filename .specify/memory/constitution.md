# Folioone Constitution

**Version**: 1.0.0 | **Ratified**: 2026-11-15 | **Last Amended**: 2026-11-15

## I. Specify outcomes before implementation

For new features and meaningful behavior changes, maintain `spec.md`, `plan.md`, and `tasks.md` under `specs/NNN-short-name/`. Define the problem, scope, exclusions, prioritized user journeys, numbered functional requirements, measurable success criteria, and acceptance scenarios. Resolve material uncertainty before dependent implementation. Trace tasks and verification to requirements. Keep artifacts current when scope changes; small fixes may amend an existing spec.

## II. Preserve the canonical identity and domain boundaries

Master Identity is canonical. Personas curate it; portfolios, cards, and CVs derive from selected content. Preserve the Next.js/TypeScript modular monolith and approved visual direction. Runtime database calls belong only in `src/lib/db/`, behind the authenticated application boundary, with explicit column lists. Services and UI must not bypass that layer. Use pnpm and the pinned dependencies; justify additions. See `AGENTS.md` and AD-001 through AD-012 in `docs/architecture/architecture-decisions.md`.

## III. Private by default, explicit publishing

Verify user-owned requests server-side with `auth.getUser()` and use the same authenticated Supabase client. Never trust a caller-supplied ownership ID or use administrative credentials. Private tables require enabled and forced RLS, minimal grants, and owner predicates. Public pages and machine-readable output read only active, approved, versioned allowlisted snapshots. Specify unpublished behavior, cache invalidation, and media revocation when affected. AI suggestions require user review before canonical changes or publishing. Never read `.env.local` or store secrets in feature artifacts.

## IV. Separate authored changes from execution evidence

Author SQL under `docs/sql/` for manual developer execution. Do not connect to databases, execute SQL, enable persistence requiring unverified DDL, or infer execution from a file's existence. Update execution records only from explicit developer reports. Database validation/reset workflows and hosted/browser suites require the authorization described in `AGENTS.md`. A spec, plan, or setup request does not grant that authorization. Report mocked, local, catalog, and hosted evidence separately; surface conflicting baseline records rather than guessing.

## V. Verify behavior and keep evidence honest

Add meaningful tests for changed behavior, including authorization, invalid input, publication privacy, and failure cases when relevant. Link acceptance scenarios to tasks and tests. Use Vitest for unit coverage and applicable repository checks for types, lint, formatting, and database boundaries. Run `pnpm test` before finishing implementation. Record commands, actual outcomes, and blocked or unrun checks. Do not claim hosted isolation based on mocks. Documentation-only changes need formatting and workflow verification rather than artificial application tests.

## Workflow and completion

Use specify → clarify as needed → plan → tasks → analyze → implement. The plan must check each principle before implementation; resolve critical consistency findings. Honor the scope requested by the user: spec-only work ends with the spec, while authorized implementation can proceed through the necessary phases. Branch names are independent of spec IDs; preserve explicitly requested names. Do not add unrelated application behavior as part of tooling setup.

A feature is complete when scoped requirements have implementation and acceptance evidence, relevant checks pass or limitations are clearly disclosed, and its spec, plan, tasks, and affected documentation reflect the delivered result.

## Governance

This constitution applies project rules to the Spec Kit workflow; it does not override current user instructions or `AGENTS.md`. Existing architecture records remain the source for approved architecture. Amend this file deliberately when project principles change; record rationale and date, and update affected templates and specs. Increment major for incompatible principles, minor for added principles, and patch for clarifications. Do not rewrite unrelated historical decisions or infer deployment state from documentation age.
