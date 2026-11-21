# Quickstart & Verification Guide: LLM Persona Document Service

**Feature**: `005-persona-document-llm` | **Date**: 2026-11-20

## Automated Checks (Local)

Run the Vitest suites and repository checks after implementation:

```bash
pnpm exec vitest run tests/markitdown.test.ts tests/persona-document.test.ts tests/persona-document-api.test.ts tests/persona-document-upload.test.tsx tests/persona-ui.test.tsx tests/persona-actions.test.ts
pnpm lint
pnpm check:db-boundary
```

## Live Local Testing (Optional, Requires Local MarkItDown + LLM Provider)

1. Install MarkItDown locally (or set `MARKITDOWN_BIN` in `.env.local` to the full binary path):

   ```bash
   pip install 'markitdown[all]'
   markitdown --version
   ```

2. Ensure your server-only LLM settings (`llm_provider`, `llm_endpoint`, `llm_model`, and `llm_api_key` if required) are configured in `.env.local`.

3. Start the app (`pnpm dev` or `pnpm dev:local`), sign in, open `/personas/new`, and click **Upload persona details** with a `.pdf`, `.docx`, `.txt`, or `.md` file.

4. Verify:
   - The **Detected Persona type** badge and rationale appear in Step 1.
   - Step 1 (`name`, `audience`, `purpose`, `description`), Step 2 (suggested visible sections), and Step 3 (`headline`, `summary` custom wording) are prefilled for review.
   - Nothing is saved until you click **Create Persona** in Step 4.
