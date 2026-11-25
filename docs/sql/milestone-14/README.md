# M14 Folio Designer SQL (prepared, NOT executed on any hosted project)

Run in the Supabase SQL Editor, as `postgres`, after reviewing the file. Run its read-only
**preflight** alone first and continue only if every column is `true`. It ends with read-only
**verification** queries, the statement that makes someone a designer, and commented **rollback**
steps.

| Order | File                       | What it does                                                                                                                                                                                                                              | Prerequisites       |
| ----- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| 1     | `001-design-templates.sql` | 3 tables (`platform_admins`, `design_templates`, `design_template_versions`), 7 policies, 3 new SECURITY INVOKER functions; seeds the 55 code designs; replaces `enforce_pro_design()`; swaps the 4 design-list CHECKs for a format check | M7, M8, M9 executed |

Expected afterwards (with every earlier package): `pnpm validate`'s catalog shape (38 functions in
`folioone`, exactly one SECURITY DEFINER — `billing_activate_pro` from M9 — 32 forced-RLS tables,
92 policies).

**After running it**, add yourself (or another person) as a Folio designer with the statement at
the end of the file (replace the email). The workspace then shows **PLATFORM → Folio Designer**.

**AI (optional).** Prompt-based design uses the server's existing LLM settings (`llm_provider`
etc., `.env.example`); Gemini and OpenAI-compatible gateways such as FreeLLMAPI both work. Without
them, designers edit values by hand.

Execution status is recorded in `../execution-tracker.md` only when the developer reports it.
Design: `docs/architecture/m14-folio-designer.md` (AD-018).
