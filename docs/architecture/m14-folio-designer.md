# M14: Folio Designer (platform-managed, AI-assisted designs)

STATUS: implemented and validated on the LOCAL stack (`pnpm validate`). Nothing has been run
against hosted Supabase or deployed. SQL: `docs/sql/milestone-14/001-design-templates.sql`
(prepared, not executed). Decision record: AD-018.

Platform admins ("Folio designers") create website and digital-card designs from a prompt or by
hand, version them, preview them with a sample person or their own profile, and publish or retire
them, with no deploy. Everyone else sees published designs in the existing design pickers.

## A design is data, not code

```
designer prompt ──► LLM (Gemini or OpenAI-compatible, e.g. FreeLLMAPI)
                      │ structured output (JSON schema)
                      ▼
               spec JSON ──► zod schema (enums, bounded numbers, #rrggbb only)
                      │      + WCAG AA contrast gate (one automatic AI repair round)
                      ▼
      design_template_versions (immutable, numbered)  ◄── hand edits in the editor
                      │ admin publishes version N
                      ▼
      design_templates.current_version = N, status = published
                      │ owner chooses it and publishes their site / card
                      ▼
      website_published.content.design = { id, version, spec }   (pinned copy)
                      │ every visit
                      ▼
      the app's own renderer (template-site.tsx / business-card.tsx) draws the spec
```

- **No generated code ever runs.** The AI fills a fixed schema
  (`src/domains/designs/design-spec.ts`): layout, section style, heading style, two typefaces
  from a list the app self-hosts, weight, tracking, radius, and a palette of `#rrggbb` colours.
  Schemas are `.strict()`, so no extra field (CSS, URLs, HTML) survives. A bad spec can look
  ugly; it cannot run script or load anything. The same schema checks AI output, hand edits,
  what is written, and every spec read back (database rows and snapshots).
- **Readable by construction.** `design-checks.ts` applies the WCAG AA thresholds the code designs
  are tested against. The AI gets one automatic repair round; a version with problems can be
  saved as a draft but cannot be published.
- **Fonts** stay a fixed list in code (`FONT_KEYS`, self-hosted by `next/font` at build time).
  Uploaded fonts would add licensing and size questions; adding a face is a one-line change.
- **No object storage needed yet.** Picker thumbnails are drawn live from the spec. When
  designs gain images (textures, covers), they go in Storage and the spec holds only the path.

## Data model

| Table                      | Who can do what (RLS forced)                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `platform_admins`          | Each person reads only their own row. **No API writes**: the developer adds designers in the SQL Editor.                                    |
| `design_templates`         | `(surface, id)`; label, category, blurb, tier (free/pro), status (draft/published/retired), current_version. Built-ins seeded as read-only. |
| `design_template_versions` | Append-only (no UPDATE/DELETE grant), numbered 1, 2, 3… by trigger; spec, prompt, origin (ai/manual).                                       |

- Admins read everything and write designer rows only (`is_platform_admin()` in every write
  policy). Signed-in users read published and retired designs and only the **current** version's
  spec. Drafts are invisible to them. anon reads nothing (public pages use snapshots).
- A design never returns to draft once live; a version must exist before it becomes current; only
  never-published drafts can be deleted.
- The 23 website + 32 card code designs are seeded (`source = 'builtin'`), so every
  `theme` / `design` value points at a row. They are still drawn by code and their tiers still
  come from `plans.ts` (a test keeps seed and code equal).

## Choosing and publishing (enforced in Postgres)

`enforce_pro_design()` (the M9 trigger function, replaced; same four triggers):

1. The design must exist and be visible to the caller; drafts are refused (`PT422`).
2. Newly choosing a design in a draft needs it to be **published**; a retired design stays on the
   sites and cards that already use it, and they can still republish with it.
3. A PRO-tier design needs `has_pro()` when chosen or (re)published (`PT402`), as before.
4. A published snapshot that uses a designer design must carry `content.design` that is an
   **exact copy** of the design's current version (`id`, `version`, `spec`), and a code design
   must not carry one. So nobody can hand-craft a "custom design" through the API, or publish
   a stale version.

The four old CHECK lists of design ids are replaced by a format check; validity is "a row in
`design_templates`".

## Version pinning

A live site or card renders the spec copied into its snapshot, so a designer editing or
re-publishing a design never changes anyone's live page. After a new version goes live, the
owner's overview shows "changed since last publish" (the snapshot differs from what publishing
would produce now), and their next publish picks it up. Retiring hides a design from pickers
only.

## Where it lives

| Area                        | Module                                                                                                     |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Spec schema, ids, fonts     | `src/domains/designs/design-spec.ts`                                                                       |
| Contrast gate               | `src/domains/designs/design-checks.ts`                                                                     |
| Picker catalog / resolution | `src/domains/designs/design-catalog.ts` (`listWebsiteDesigns`, `listCardDesigns`, `resolve*Design`)        |
| Admin service               | `src/domains/designs/design-admin-service.ts` (every call checks `platform_admins`)                        |
| AI                          | `src/lib/ai/design-generator.ts` (Gemini + OpenAI-compatible, structured output, repair round)             |
| Data access                 | `src/lib/db/queries/designs.ts`                                                                            |
| Admin UI                    | `/admin/designs` (list + new), `/admin/designs/[surface]/[id]` (editor), `.../preview?v=N&with=sample\|me` |
| Pickers                     | `src/app/website/website-workspace.tsx`, `src/app/cards/cards-workspace.tsx` (server-provided `designs`)   |
| Rendering of pinned designs | `site-view.tsx`, `/social/[slug]`, `siteColors()` for links / articles / share image                       |
| Navigation                  | **PLATFORM → Folio Designer**, shown only when `getViewer().isAdmin`; every admin page re-checks and 404s  |

## Known limitations

- The AI can only choose among the renderer's existing layouts, section styles and fonts. New
  kinds of layout still need code (and then become available to every designer design).
- A version's prompt is readable by signed-in users for the current version of a live design.
- Code designs cannot be edited or retired from the UI (they are in code); designers can start
  from any of them.
- No approval workflow between several designers (any admin can publish).
- Admin pages render the live preview scaled to the column; the full-page preview link shows real
  breakpoints.
