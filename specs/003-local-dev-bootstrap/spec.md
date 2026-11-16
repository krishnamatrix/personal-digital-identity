# Feature Specification: Local development bootstrap

**Feature ID**: 003-local-dev-bootstrap  
**Feature Branch**: feat/llms.txt  
**Created**: 2026-11-15  
**Status**: Draft  
**Input**: User request: "Create npm run dev:local and use env.local config to bootstrap app"

## Problem and scope

Developers need one obvious command to start Folioone with their private local configuration already available to the app. Today the development command does not communicate that local setup intent, and developers must know which ignored environment file to prepare. A dedicated local command should make startup predictable while preserving the general development command.

**In scope**: Add the `npm run dev:local` developer entry point; use the repository's ignored `.env.local` configuration when bootstrapping the local app; provide actionable setup feedback when local configuration is missing or unusable; keep private values out of source control and startup output.

**Out of scope**: Starting or resetting Supabase/Docker services, applying migrations, changing database targets, changing AI provider behavior, adding deployment configuration, or replacing the existing `dev` command.

**Existing evidence**: `package.json` currently defines `dev` as `next dev`; `.gitignore` excludes `.env.local`; `.env.example` documents Supabase and LLM settings. Next.js development already reads environment files, but there is no dedicated `dev:local` script. No claim is made that services referenced by local settings are running or that credentials are valid.

**Product requirement references**: New developer-experience requirement sourced from this user request; no existing product requirement ID covers local startup/bootstrap.

**Scope classification**: Proposed developer workflow change. Local environment values and external service readiness remain developer-owned and unverified by the command.

**Decisions affected**: None of D-001–D-009. Must preserve the server-only and secret-handling constraints in Constitution III and existing database workflow restrictions.

## User Scenarios & Testing (mandatory)

### User Story 1 - Start the locally configured app (Priority: P1)

As a developer, I want to run `npm run dev:local` so the application starts using the local configuration I prepared, without manually exporting each setting into my shell.

**Independent Test**: Start the command with a temporary local environment file containing a harmless sentinel setting and verify the app process receives it while the server starts; verify a secret-like sentinel is never printed.

**Acceptance Scenarios**:

1. **Given** a valid `.env.local` and installed dependencies, **When** the developer runs `npm run dev:local`, **Then** the development app starts and its server process uses values from `.env.local`.
2. **Given** no `.env.local`, **When** the developer runs `npm run dev:local`, **Then** startup gives a clear setup message that points to `.env.example` and does not silently claim local configuration was loaded.
3. **Given** an invalid or unreadable local configuration, **When** the developer runs `npm run dev:local`, **Then** startup reports a safe actionable error without exposing configuration values.
4. **Given** the existing `npm run dev` command, **When** the developer uses it, **Then** its current development behavior remains available.

### Edge Cases

- A shell variable may already be set; the documented precedence must be predictable and must not unexpectedly discard the developer's explicit process environment.
- `.env.local` contains a malformed line or inaccessible file; errors identify the configuration problem without echoing values.
- Local settings point to unavailable services; the app may start, but dependent features report their existing unavailable/configuration state.
- The command is run from outside the repository root; it must not load a different directory's `.env.local` as Folioone configuration.
- User-provided API keys and Supabase values remain server-side unless a variable is explicitly documented as browser-safe.

## Requirements (mandatory)

### Functional Requirements

- **FR-001**: The project MUST provide the `npm run dev:local` command to start the local development app.
- **FR-002**: The command MUST bootstrap the app with values from the repository-root `.env.local` without requiring the developer to export each file value manually.
- **FR-003**: Startup MUST clearly identify when `.env.local` is missing or unusable and provide a next step using `.env.example`.
- **FR-004**: Startup MUST NOT print secret values or add `.env.local` to version control.
- **FR-005**: The command MUST preserve developer-supplied process environment values according to a documented, deterministic precedence rule.
- **FR-006**: The existing `npm run dev` command MUST remain available with its current behavior.
- **FR-007**: The local command MUST NOT start, reset, migrate, or connect to a database as part of bootstrapping.
- **FR-008**: Documentation MUST explain the setup, expected `.env.local` contents, behavior when configuration is absent, and the distinction between app startup and dependent service readiness.

### Privacy and permissions

This is a developer workflow and does not change user-data permissions. `.env.local` may contain server credentials and MUST remain ignored and unlogged. Browser-exposed settings must continue to use only intentionally public `NEXT_PUBLIC_*` values; private provider credentials must never be exposed to client code.

## Success Criteria (mandatory)

- **SC-001**: A developer with a valid local configuration can start Folioone with one command, `npm run dev:local`, without manually exporting values from the file.
- **SC-002**: With no local configuration, the developer receives one actionable setup message and no misleading successful-start indication.
- **SC-003**: In a startup check using secret-like sentinel values, none of those values appear in captured command output.
- **SC-004**: Existing `npm run dev` remains usable and no database action occurs when either development command starts.

## Assumptions and open questions

- `.env.local` is the canonical ignored local configuration file, consistent with the user's explicit request and existing repository documentation.
- The command starts the app only. It does not provision Supabase or guarantee that local services, credentials, schema, or AI models are ready.
- Environment precedence will follow the documented app/runtime convention, preserving explicit process-level overrides where supported.
