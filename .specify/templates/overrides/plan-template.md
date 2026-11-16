# Implementation Plan: [FEATURE]

**Branch**: [Actual branch] | **Date**: [DATE] | **Spec**: [spec.md](spec.md)

## Summary

[Requirements addressed and chosen technical approach.]

## Technical Context

**Language/Version**: TypeScript; Node >=20.9; verify pinned versions in package.json.  
**Primary Dependencies**: Next.js App Router, React, Tailwind/shadcn, Zod, pnpm.  
**Storage**: [N/A or authenticated Supabase access via src/lib/db/; confirm the affected domain's actual persistence state]  
**Testing**: Vitest; browser/hosted checks only when explicitly authorized.  
**Target Platform**: Web.  
**Project Type**: Next.js modular monolith.  
**Performance Goals**: [Relevant measurable budget, or N/A with reason]  
**Constraints**: [Privacy, compatibility, public snapshot boundaries, relevant architecture decisions]  
**Scale/Scope**: [Affected journeys, surfaces, and limits]

## Constitution Check

Read `.specify/memory/constitution.md` before design and recheck after design. For each gate, record PASS with evidence, N/A with a reason, or the unresolved violation.

- [ ] I: Scoped requirements, acceptance scenarios, exclusions, and open decisions are explicit.
- [ ] II: Canonical identity, domain layers, approved stack, and design direction are preserved.
- [ ] III: Authentication, ownership, private data, and public publication boundaries are addressed.
- [ ] IV: SQL proposals and execution evidence are separate; restricted actions are identified.
- [ ] V: Requirements map to meaningful tests and actual verification commands.
- [ ] VI: Product requirement IDs, delivery classification, source conflicts, and dependent decisions are explicit; planned capabilities are not claimed as implemented.

## Existing evidence and decisions

[Link relevant docs/architecture records and current code. State inconsistencies or assumptions. Record alternatives only when they explain a meaningful choice.]

## Project Structure

[List only affected paths: src/app/, src/domains/, src/lib/db/, src/components/, tests/, docs/sql/, and specs/ as applicable. Do not invent a separate backend.]

## Contracts and data changes

[Inputs, outputs, error behavior, ownership, schema/API changes and compatibility; N/A when unaffected. SQL authoring does not authorize execution.]

## Validation and requirement mapping

| Product requirement / feature scenario | Implementation paths | Test or manual check             | Command and authorization needed |
| -------------------------------------- | -------------------- | -------------------------------- | -------------------------------- |
| [Product ID] / FR-001 / US1 scenario 1 | [Paths]              | [Meaningful observable behavior] | [Command]                        |

Include applicable typecheck, lint, formatting, unit, and database-boundary checks. Identify any database/browser/hosted validation requiring separate authorization. Never mark unrun checks as passing.

## Rollout and risks

[Compatibility, flags, publication/cache behavior and rollback when relevant; otherwise explain N/A.]

## Complexity Tracking

[Constitution violations, rationale, and resolution; "None" if none.]
