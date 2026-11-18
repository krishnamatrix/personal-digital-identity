# Implementation Plan: Local development bootstrap

**Branch**: feat/llms.txt | **Date**: 2026-11-15 | **Spec**: [spec.md](spec.md)

## Summary

Add `npm run dev:local` as a safe, explicit local startup path. A small Node launcher checks that the repository-root `.env.local` exists, changes to the repository root, and starts the existing Next.js development server. Next.js retains responsibility for loading its supported environment files and process-variable precedence. Keep `npm run dev` unchanged. Do not connect to or start any database or external service.

## Technical Context

**Language/Version**: JavaScript on Node.js >=20.9 (package requirement).  
**Primary Dependencies**: Existing Node runtime, npm scripts, Next.js 15.5.29. No new dependency.  
**Storage**: None.  
**Testing**: User did not request tests or verification in this implementation turn; do not add or run tests. Capture any unperformed acceptance verification honestly.  
**Target Platform**: Local developer machines using the repository's supported Node environment.  
**Project Type**: Next.js modular monolith.  
**Performance Goals**: Launcher overhead is negligible relative to starting the development server.  
**Constraints**: Never read, print, copy, or commit `.env.local` values. Preserve current `dev` behavior and process environment overrides. No database, migration, or service startup.  
**Scale/Scope**: One npm script, one Node launcher, and local development documentation.

## Constitution Check

- [x] I: User outcome, acceptance scenarios, exclusions, and assumptions are explicit in spec.md.
- [x] II: Uses existing Next.js/Node stack; no domain, identity, or database layer changes.
- [x] III: Keeps local credentials private and does not expose them to browser code.
- [x] IV: No SQL, database access, or execution evidence involved.
- [x] V: Acceptance criteria are recorded; tests and verification are not requested and will not be claimed as run.
- [x] VI: New developer workflow requirement is attributed to the user's request; environment/service readiness is distinguished.

## Existing evidence and decisions

- `package.json` currently maps `dev` to `next dev`.
- `.gitignore` ignores `.env.local`; `.env.example` is the placeholder template.
- Next.js already loads its development environment files. The launcher checks the intended local file and invokes Next from the repository root rather than reimplementing dotenv parsing.
- No product decision D-001–D-009 is affected.

## Project Structure

- `package.json` — add `dev:local` npm script; leave `dev` unchanged.
- `scripts/dev-local.mjs` — check local env file presence and start Next with repository-root cwd.
- `docs/architecture/development-setup.md` — document setup, command behavior and limits.
- `specs/003-local-dev-bootstrap/` — plan, tasks, research, and quickstart.

## Contracts and data changes

Command contract: from the repository root, `npm run dev:local` requires `.env.local`; if absent it exits with a safe message pointing to `.env.example`. If present, it runs the existing Next.js development server with repository-root cwd and inherited process environment. Next's established loading and precedence rules remain in effect. No values are displayed. No data model, HTTP endpoint, or database contract changes.

## Validation and requirement mapping

| Feature requirement / scenario | Implementation paths                   | Test or manual check                                                     | Command and authorization needed                             |
| ------------------------------ | -------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------ |
| FR-001/002; US1 scenario 1     | package.json, scripts/dev-local.mjs    | Start with a harmless sentinel in `.env.local`; check server receives it | Not run in this turn; explicit verification request required |
| FR-003; US1 scenarios 2–3      | scripts/dev-local.mjs                  | Missing file and unreadable file produce safe actionable errors          | Not run in this turn; explicit verification request required |
| FR-004/005; edge cases         | scripts/dev-local.mjs, .gitignore      | Ensure values aren't printed and process overrides are retained          | Not run in this turn; explicit verification request required |
| FR-006/007; US1 scenario 4     | package.json                           | Confirm `dev` unchanged and launcher performs no database operations     | Not run in this turn; explicit verification request required |
| FR-008                         | docs/architecture/development-setup.md | Review documented setup and service boundary                             | Documentation added; no runtime verification requested       |

## Rollout and risks

No rollout or migration is required. Developers create `.env.local` from `.env.example`. Local services may still need separate setup; the launcher only starts the app. Existing `npm run dev` is unchanged.

## Complexity Tracking

None.
