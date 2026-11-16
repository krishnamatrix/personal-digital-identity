<!--
Sync Impact Report
Version change: 1.0.0 -> 1.1.0 (minor: expanded product guidance and new traceability principle).
Modified principles: II. Preserve the canonical identity and domain boundaries (scope clarified).
Added sections: VI. Trace product requirements and distinguish delivery scope.
Removed sections: none.
Templates: ✅ .specify/templates/overrides/spec-template.md updated.
           ✅ .specify/templates/overrides/plan-template.md updated.
           ✅ .specify/templates/overrides/tasks-template.md updated.
Runtime guidance: ✅ AGENTS.md, README.md, specs/README.md updated.
Commands: .specify/templates/commands/ absent; installed Codex skills reviewed for references.
Added artifact: specs/product-requirements.md (draft consolidated product baseline).
Deferred placeholders: none. Product decisions D-001 through D-009 remain explicit in the baseline;
they are not silently resolved by this amendment. No database or deployment status was changed.
-->

# Folioone Constitution

**Version**: 1.1.0 | **Ratified**: 2026-11-15 | **Last Amended**: 2026-11-15

## I. Specify outcomes before implementation

For new features and meaningful behavior changes, maintain `spec.md`, `plan.md`, and `tasks.md` under `specs/NNN-short-name/`. Define the problem, scope, exclusions, prioritized user journeys, numbered functional requirements, measurable success criteria, and acceptance scenarios. Resolve material uncertainty before dependent implementation. Trace tasks and verification to requirements. Keep artifacts current when scope changes; small fixes may amend an existing spec.

## II. Preserve the canonical identity and domain boundaries

Master Identity is canonical. Personas curate it; portfolios, cards, and CVs derive from selected content. Preserve the Next.js/TypeScript modular monolith and approved visual direction. Runtime database calls belong only in `src/lib/db/`, behind the authenticated application boundary, with explicit column lists. Services and UI must not bypass that layer. Use pnpm and the pinned dependencies; justify additions. See `AGENTS.md` and AD-001 through AD-012 in `docs/architecture/architecture-decisions.md`.

Product changes MUST preserve one canonical identity and explicit content selection. Website,
article, card, media, and entitlement workflows MUST honor their domain-specific lifecycle and
access contracts. The broader multi-portfolio/Persona-consumer model MUST NOT be presented as
current milestone functionality without a scoped design and verification. This prevents a
future product direction from silently changing an existing public or persistence contract.

## III. Private by default, explicit publishing

Verify user-owned requests server-side with `auth.getUser()` and use the same authenticated Supabase client. Never trust a caller-supplied ownership ID or use administrative credentials. Private tables require enabled and forced RLS, minimal grants, and owner predicates. Public pages and machine-readable output read only active, approved, versioned allowlisted snapshots. Specify unpublished behavior, cache invalidation, and media revocation when affected. AI suggestions require user review before canonical changes or publishing. Never read `.env.local` or store secrets in feature artifacts.

## IV. Separate authored changes from execution evidence

Author SQL under `docs/sql/` for manual developer execution. Do not connect to databases, execute SQL, enable persistence requiring unverified DDL, or infer execution from a file's existence. Update execution records only from explicit developer reports. Database validation/reset workflows and hosted/browser suites require the authorization described in `AGENTS.md`. A spec, plan, or setup request does not grant that authorization. Report mocked, local, catalog, and hosted evidence separately; surface conflicting baseline records rather than guessing.

## V. Verify behavior and keep evidence honest

Add meaningful tests for changed behavior, including authorization, invalid input, publication privacy, and failure cases when relevant. Link acceptance scenarios to tasks and tests. Use Vitest for unit coverage and applicable repository checks for types, lint, formatting, and database boundaries. Run `pnpm test` before finishing implementation. Record commands, actual outcomes, and blocked or unrun checks. Do not claim hosted isolation based on mocks. Documentation-only changes need formatting and workflow verification rather than artificial application tests.

## VI. Trace product requirements and distinguish delivery scope

Feature specs MUST cite applicable stable requirement IDs in `specs/product-requirements.md`,
or state that a requirement is new and identify its source. They MUST distinguish baseline
behavior, planned capabilities, proposals, environment verification, and unresolved decisions.
Plans MUST map scoped requirements to implementation and acceptance evidence; tasks MUST retain
those references. No source-file presence, fixture demonstration, or historical status alone
constitutes a deployed feature or live security guarantee.

When records conflict, the spec MUST name the conflict, identify affected requirements, and
resolve it before dependent implementation or release claims. Product-specific decisions
D-001 through D-009 are recorded in the baseline; they are not approved changes. Requirements
MUST NOT silently convert a missing review step, best-effort cleanup, or payment-recovery gap
into a completed guarantee. This preserves a reviewable contract as the product evolves.

## Workflow and completion

Use specify → clarify as needed → plan → tasks → analyze → implement. The plan MUST check all six principles before implementation; resolve critical consistency findings. Honor the scope requested by the user: spec-only work ends with the spec, while authorized implementation can proceed through the necessary phases. Branch names are independent of spec IDs; preserve explicitly requested names. Do not add unrelated application behavior as part of tooling setup.

A feature is complete when scoped requirements have implementation and acceptance evidence, relevant checks pass or limitations are clearly disclosed, and its spec, plan, tasks, and affected documentation reflect the delivered result.

## Governance

This constitution applies project rules to the Spec Kit workflow; it does not override current user instructions or `AGENTS.md`. Existing architecture records remain the source for approved architecture. Amend this file deliberately when project principles change; record rationale and date, and update affected templates and specs. Increment major for incompatible principles, minor for added principles, and patch for clarifications. Do not rewrite unrelated historical decisions or infer deployment state from documentation age.

Every feature review MUST check the six principles, requirement-to-acceptance mapping, applicable
source conflicts, and actual evidence. An amendment MUST include a Sync Impact Report, preserve
the original ratification date, and name affected requirements/templates. Resolve material
product changes with the owner before treating them as approved; routine documentation
clarifications within an authorized request do not require an additional approval step.
