# Quickstart & Verification Guide: Folio Designer

**Feature**: `007-folio-designer` | **Date**: 2026-11-22

## Automated checks (local)

After implementation:

```bash
pnpm exec vitest run tests/folio-designer-schema.test.ts tests/folio-designer-api.test.ts tests/folio-designer-ui.test.tsx tests/website-domain.test.ts
pnpm lint
pnpm check:db-boundary
pnpm typecheck
```

Expected coverage:

- Prompt length validation (400, no LLM call).
- Auth gate on API routes (401).
- LLM output clamped to `THEME_IDS` and `normalizeConfig`.
- UI: nav link, generate, stale proposal on regen, apply confirm, PRO lock messaging.
- Apply does not invoke publish paths (mock `saveWebsiteDraft`).

## Live local testing (optional, requires LLM)

1. Configure server-only LLM variables per `specs/002-local-ai-gateway/spec.md` in `.env.local`.
2. `pnpm dev`, sign in, open **My Presence → Folio Designer** (`/designer`).
3. Enter a prompt (≥ 20 characters), acknowledge identity-use disclosure, click **Generate**.
4. Verify:
   - Preview panel updates (theme + `SiteView` or documented equivalent).
   - Rationale lists identity fields used.
   - **Apply to website draft** updates My Website without publishing.
   - Live site (if published) unchanged until existing publish flow.

5. Negative checks:
   - Sign out → `/designer` redirects to login.
   - Empty prompt → inline validation.
   - Unset LLM → unavailable message; prompt text preserved.

## Manual entitlement check

With a Free account, generate a proposal selecting a PRO-only theme (if returned), attempt apply → expect PRO guidance, draft unchanged.