# Plan: Folio Designer (M14)

Design record: `docs/architecture/m14-folio-designer.md` (AD-018).

1. SQL `docs/sql/milestone-14/001-design-templates.sql`: `platform_admins`, `design_templates`,
   `design_template_versions`, `is_platform_admin()`, version-numbering and lifecycle triggers,
   seed of the 55 code designs, `enforce_pro_design()` replaced with a table lookup + pin check,
   design-list CHECKs replaced by a format check.
2. Domain `src/domains/designs/`: spec schema (data only), contrast gate, sample content,
   catalog (pickers + resolution), admin service.
3. AI `src/lib/ai/design-generator.ts`: structured output for both providers, one repair round.
4. Website and card services: resolve the chosen design, pin designer specs into snapshots, apply
   the tier; renderers draw pinned specs.
5. Admin UI `/admin/designs` (list, new, editor, full preview); PLATFORM nav group for admins.
6. Tests: unit (schema, checks, generator, catalog, renderer, nav), SQL static review, local DB
   integration, Playwright journey with screenshots.
