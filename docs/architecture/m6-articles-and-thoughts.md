# M6 — Articles & Thoughts

Articles are canonical Master Identity content (they belong to the account, independent of Personas and of the
website slug). Publishing an article in Folioone does **not** put it on the public website: the owner selects articles in
**My Website → Content** and publishes the website, which snapshots them through the existing M5 mechanism.

## Product and UX decisions

- **Navigation:** "Articles & Thoughts" under MY IDENTITY (`/articles`). List: search (title + body), filters (All, Drafts,
  Published, Archived, with counts), sort (recently updated / published / title), 12 per page, honest empty states.
- **Editor (`/articles/[id]`):** a distraction-free canvas (serif, 42rem measure) with title and subtitle above the body;
  a sticky formatting toolbar (heading, subheading, bold, italic, inline code, link, bullet and numbered lists, quote,
  code block, image by URL, divider, undo/redo); details (excerpt, cover URL, category, tags, SEO) in a side panel that
  stacks under the canvas on tablet/mobile. Live word count and reading time (220 wpm).
- **Saving:** autosave 1.5 s after the last change plus an explicit Save button. States: Saved hh:mm, Unsaved changes,
  Saving…, Save failed, Changed elsewhere. `beforeunload` and the back link warn while anything is unsaved. Publish/archive
  first persist pending edits so stale text is never published.
- **Preview** uses the same `ArticleBody` / `ArticleView` components as the public page, so it matches.
- **Editor library:** Tiptap 3 (ProseMirror) — maintained, React 19 / Next 15 compatible (`immediatelyRender: false`).
  StarterKit is configured to headings 2–3 only, no underline/strike.

## Rich-text model

Bodies are stored as **validated JSON, never HTML** (`src/domains/articles/rich-text.ts`). Every document — from the editor,
from the database, from a snapshot — is rebuilt by `sanitizeDoc` from an allowlist (paragraph, heading 2/3, blockquote,
bullet/ordered list, code block, rule, image, hard break; marks bold/italic/code/link; http(s) URLs only; node, depth and
size caps). A custom React renderer draws it: there is no `dangerouslySetInnerHTML`. `body_text`, `word_count` and
`reading_minutes` are derived on save so lists never load bodies.

## Lifecycle

`draft → published | archived`, `published → draft | archived`, `archived → draft` (restore). An archived article cannot be
published directly. Validated in `lifecycle.ts` and the service; the database independently requires `published` ⇒
slug and `published_at`. The address (slug) is assigned from the title on **first publish** and never changes afterwards;
on a clash a random suffix is tried. Publishing needs a title and content. Delete needs a confirmation dialog and the
current version. **Concurrency:** every update is `WHERE id AND account_id AND version = <loaded>` and bumps `version`;
no row ⇒ conflict (or not found, after a re-read). The editor shows "Changed elsewhere" and offers to reload.

## Data model (`docs/sql/milestone-6/001-articles.sql`)

- `folioone.articles` — private, owner-only RLS (select/insert/update/delete), forced RLS. Columns: id, account_id (FK
  accounts, cascade), slug (nullable until first publish, unique per account), title, subtitle, excerpt, content jsonb,
  body_text, cover_image_url, category, tags text[], status, seo_title, seo_description, word_count, reading_minutes,
  version, published_at, archived_at, created_at, updated_at; constraints for lengths, URL shape, status, tags ≤ 10,
  size caps, published ⇒ slug + published_at.
- `folioone.website_published_articles` — the **published snapshot** of each selected article (site_slug, slug, copy of
  title/excerpt/content/SEO, position). anon may `SELECT` a column list that excludes `account_id` and `article_id`, only
  through an RLS policy that requires the owning `website_published` row to be live.
- `website_publish` gains `p_article_ids uuid[]`: in the **same transaction** as the page snapshot it deletes and recreates
  the owner's article snapshot **by copying from `articles`** (only the caller's own, currently _published_ articles, in
  the order given, max 50). The client never supplies article bodies. `website_unpublish` also deletes the snapshot rows;
  `website_change_slug` re-addresses them.
- Trigger `articles_drop_snapshot` (SECURITY INVOKER): when a published article becomes draft/archived its snapshot row is
  deleted in the same statement; deleting the article cascades. So unpublish/archive/delete take effect **immediately**,
  without a website republish.
- **Snapshot writes are request-gated** (same pattern as the Persona gate). Three STABLE, SECURITY INVOKER,
  empty-`search_path` helpers (`website_snapshot_insert_context`, `_delete_context`, `_update_context`) test
  `request.method = 'POST'` and an exact `request.path` (`/rpc/website_publish`, `/rpc/website_unpublish`,
  `/rpc/website_change_slug`; no schema prefix, as observed by the Persona diagnostic and exercised by the local
  suites). INSERT is allowed only in `website_publish`, for the caller's own site slug and own published article;
  DELETE only in `website_publish`/`website_unpublish` or inside a trigger (`pg_trigger_depth() > 0`, never true
  for a direct request) while the article is no longer published; `UPDATE (site_slug)` only in
  `website_change_slug`, to the caller's own current address. All also require `auth.uid()` ownership, so a direct
  PostgREST write to `website_published_articles` is rejected even for the row's owner. The gate is an integrity
  control; tenant isolation is the owner predicate.
- Everything is `SECURITY INVOKER`; no roles, no service role, no `public` schema changes.

## Website integration

- New section `articles` ("Articles & thoughts") with `config.articles.selectedIds` (ordered, ≤ 50). Off by default and
  empty by default; existing M5 configs upgrade to "off, none selected". The content editor lists only **published**
  articles, with include checkboxes and up/down ordering.
- `buildPublishedContent` receives only published articles, picks the selected ones in order, and writes a listing into the
  snapshot (with the article `version`, so later edits show as "unpublished changes").
- Public rendering: `/[slug]` lists the **live snapshot rows** (so a withdrawn article vanishes at once);
  `/[slug]/articles/[article]` renders one snapshot row, with title, description, canonical URL, Open Graph `article`
  metadata and cover image. URLs are scoped to the site slug; ownership never depends on the slug. Nothing queries
  `articles` at request time on the public path.
- Removing an article from the website _configuration_ takes effect at the next website (re)publish, like every other
  M5 configuration change; unpublishing/archiving/deleting the article or unpublishing the website is immediate.

## Layering

`app/articles/*` (pages + server actions) → `domains/articles/article-service.ts` → `lib/db/query.ts` →
`lib/db/queries/articles.ts` (explicit columns, no wildcards) → Supabase with the user's session. Public reads use the
anonymous client. The boundary check (`pnpm check:db-boundary`) covers all of it.

## Not built (by scope)

Comments, likes, followers, newsletters, reader accounts, feeds, collaborative editing, AI writing, external publishing,
analytics, custom domains.
