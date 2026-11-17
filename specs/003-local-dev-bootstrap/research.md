# Research: Local development bootstrap

## Decision: Keep environment-file parsing in Next.js

**Decision**: The launcher checks that the repository-root `.env.local` exists, then starts the existing `next dev` command with the repository root as its working directory. It does not parse or print environment values itself.

**Rationale**: The app already uses Next.js and Next handles its supported environment-file loading and precedence. Avoiding a second parser prevents inconsistent quoting/expansion behavior and keeps secrets out of launcher output.

**Alternatives considered**:

- Add a dotenv dependency and inject values before starting Next: unnecessary dependency and duplicates Next behavior.
- Make `dev:local` a second alias of `next dev`: does not provide the requested explicit check/setup feedback for `.env.local`.

## Decision: Check file presence without checking its contents

**Decision**: Fail with a safe message when `.env.local` does not exist; do not validate or echo its contents.

**Rationale**: This establishes the intended local setup while avoiding reading secrets in application-level launcher code. Next reports its own parsing or runtime issues without the launcher copying values into logs.

**Alternatives considered**:

- Parse and validate every variable: broadens the launcher's responsibility and duplicates provider/database configuration validation.
- Silently run without the file: obscures whether the requested local bootstrap was used.
