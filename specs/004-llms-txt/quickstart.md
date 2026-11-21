# Quickstart & Verification Guide: `llms.txt`

**Feature**: `004-llms-txt` | **Date**: 2026-11-20

## Automated Checks (Local)

Run the repository verification suite after implementation:

```bash
pnpm typecheck
pnpm lint
pnpm check:db-boundary
pnpm test
pnpm exec prettier --check src/domains/llms/llms-txt.ts src/app/llms.txt/route.ts "src/app/[slug]/llms.txt/route.ts" src/app/page.tsx "src/app/[slug]/page.tsx" tests/llms-txt.test.ts tests/llms-txt-routes.test.ts
```

## Manual Verification (Local Dev Server)

Start the app locally (`pnpm dev` or `pnpm dev:local`), then verify:

1. **Platform `/llms.txt`**:

   ```bash
   curl -i http://localhost:3000/llms.txt
   ```

   - Expect `200 OK`, `content-type: text/markdown; charset=utf-8`, `# Folioone`, `>` summary, and absolute links to `http://localhost:3000/` and `http://localhost:3000/pricing`.
   - Confirm no user slugs or private workspace routes appear.

2. **Published personal website `/<slug>/llms.txt`**:

   ```bash
   curl -i http://localhost:3000/<live-slug>/llms.txt
   ```

   - Expect `200 OK`, `content-type: text/markdown; charset=utf-8`, `cache-control: no-store`.
   - Confirm only approved public sections, active scheduled links, and live published articles appear.

3. **Unpublished / unknown / reserved / malformed slug**:

   ```bash
   curl -i http://localhost:3000/nonexistent-slug/llms.txt
   curl -i http://localhost:3000/admin/llms.txt
   ```

   - Expect `404 Not Found`, `cache-control: no-store`, `x-robots-tag: noindex`.

4. **HTML discovery metadata**:

   ```bash
   curl -s http://localhost:3000/ | grep -i 'llms.txt'
   curl -s http://localhost:3000/<live-slug> | grep -i 'llms.txt'
   ```

   - Expect `<link rel="alternate" type="text/markdown" href="...llms.txt"/>`.
