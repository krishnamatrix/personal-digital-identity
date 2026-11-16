# Spec-driven development

Folioone uses [GitHub Spec Kit](https://github.com/github/spec-kit) with Codex skills. Describe the expected outcome before implementation; keep the specification, plan, tasks, and delivered behavior aligned in the same change.

Start with the [product requirements](product-requirements.md), a consolidated draft baseline with stable domain requirement IDs, acceptance scenarios, planned scope, and decisions needing resolution. Feature specs link applicable IDs; they do not assume that documented behavior is verified in the current environment. The constitution's six principles govern how this baseline becomes scoped, tested work.

## Start in Codex chat

Open this repository in a fresh Codex chat to discover the project-local skills in `.agents/skills/`. These are chat commands, not terminal commands. If skill discovery has not refreshed, ask Codex to read the corresponding `SKILL.md` directly.

| Step      | Chat command                                                    | Result                                                                              |
| --------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Specify   | `$speckit-specify <what the user should be able to do and why>` | `spec.md` with scope, user stories, numbered requirements, and acceptance scenarios |
| Clarify   | `$speckit-clarify`                                              | Resolve material ambiguity before planning; skip if requirements are already clear  |
| Plan      | `$speckit-plan <technical constraints>`                         | `plan.md`, research, and relevant contracts/data model/quickstart                   |
| Tasks     | `$speckit-tasks`                                                | `tasks.md` with file paths, dependencies, requirement references, and verification  |
| Analyze   | `$speckit-analyze`                                              | Check consistency and constitution compliance; resolve critical findings            |
| Implement | `$speckit-implement`                                            | Execute the requested scope, update tasks, and record actual verification results   |

`$speckit-checklist` can generate a requirements quality checklist. `$speckit-constitution` maintains project principles when those principles change. The initial constitution is already populated from this repository's rules. Issue creation through `$speckit-taskstoissues` requires an explicit request to create external issues.

A request for a specification or plan authorizes that phase. When implementation is already requested, proceed through the needed phases without adding a separate approval ceremony. Pause for material product ambiguity or actions that require authorization under `AGENTS.md`.

## Feature artifacts and branches

```text
specs/NNN-short-name/
├── spec.md              # User outcomes, FR/SC IDs, acceptance scenarios, scope
├── plan.md              # Repository design, constitution gates, validation
├── tasks.md             # Implementation and verification checklist
├── research.md          # Decisions, alternatives, sources when needed
├── data-model.md        # Only if data is affected
├── contracts/           # Only if interfaces are affected
├── quickstart.md        # Reproduction/acceptance steps when useful
└── checklists/          # Requirements quality checks when useful
```

Use sequential spec directory names such as `001-llms-txt`. The example is a naming illustration; this setup does not define that feature's behavior. Keep existing architecture and milestone documents in `docs/architecture/` and link to them as baseline evidence. Do not silently treat old milestone status as current deployment status.

Spec directories are independent of Git branch names. This setup preserves `feat/llms.txt` and does not install the optional Git extension, so the workflow does not automatically create or switch branches. Create future branches using the requested name or the repository's default `codex/` prefix.

The specify skill writes `.specify/feature.json` as a local feature pointer. It is ignored by Git. To select an existing feature in a terminal or CI job:

```sh
export SPECIFY_FEATURE_DIRECTORY=specs/001-llms-txt
bash .specify/scripts/bash/check-prerequisites.sh --json --paths-only
```

Use the actual directory name. The directory must exist. Tell Codex the selected path when switching features in chat; a terminal export does not change an already-running Codex process. A small compatibility adjustment in `common.sh` accepts explicit feature selection on custom branch names. The specify, tasks, and constitution skills point to the Folioone template overrides. Retain these adaptations when upgrading.

## Folioone rules

Read `AGENTS.md`, `.specify/memory/constitution.md`, and relevant architecture decisions. Project overrides in `.specify/templates/overrides/` make privacy boundaries, scope, requirement traceability, and test evidence explicit. Upstream templates remain available as the baseline.

Every changed behavior needs meaningful acceptance coverage. Run applicable unit tests and repository checks (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm check:db-boundary`, and formatting checks). Record exact commands and outcomes; never mark an unrun check as passing. Check formatting on changed authored files; generated upstream assets may have their own formatting.

Database execution, `pnpm validate`, local database resets, hosted tests, and browser suites remain subject to `AGENTS.md`; this workflow does not authorize them. Keep SQL proposals, reported SQL execution, mocked behavior, and hosted verification distinct. Do not read `.env.local` or capture secrets in specs.

## Tooling and upgrades

The installed Specify CLI reports `0.6.2.dev0`; scaffold assets were installed offline from that CLI on 2026-11-15. The checked-in scripts, templates, and skills are sufficient for the core workflow; no application runtime dependency was added. `specify check` checks local tooling and `specify version` identifies the CLI. See the [Codex integration documentation](https://github.github.com/spec-kit/integrations/codex.html) for upstream behavior.

Review upgrades before applying them: preserve the constitution, template overrides, custom-branch compatibility, existing agent instructions, and `.specify/.gitignore`. Do not force-reinitialize over project files without checking the generated diff.
