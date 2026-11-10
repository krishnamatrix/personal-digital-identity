# M5 — Public identity website and publishing

STATUS: implemented and verified locally (`pnpm validate`). Nothing was run against hosted Supabase or deployed.
The new database objects are SQL **prepared for review**: `docs/sql/milestone-5/001-website.sql`.

## Architecture

```
My Identity (identity_profiles + identity_entries)         ← single source of truth, unchanged
        │  read (owner session, RLS)
        ▼
website_sites  (private draft: slug, status, theme, config)      src/domains/website/{config,slug}.ts
        │  buildPublishedContent(identity, config)   ← pure; the ONLY place content is selected
        ▼
website_published (approved snapshot, jsonb, is_live)            website_publish() RPC
        │  anonymous read, live rows only, column-limited
        ▼
/[slug]  →  SiteView(theme, content)                              src/components/website/*
```

- **Domains kept apart:** Master Identity (`domains/identity`), website configuration + publishing
  (`domains/website`), and public rendering (`app/[slug]`, `components/website`). Themes import only
  `PublishedContent`; nothing in rendering can query My Identity.
- **Selection rules (build-published.ts):** an entry is published only if it is visible in My Identity AND not excluded on the
  website; contact details (email, phone, website) are published only when switched on; empty sections are skipped; URLs must
  be http(s). The snapshot is Zod-validated when written _and_ again on every public read.
- **Draft vs published:** editing My Identity or the draft never changes the public site. "Republish" rebuilds the snapshot.
  The overview flags "changed since last publish" by comparing the snapshot with what publishing would produce now.
- **Unpublish:** one RPC sets `is_live=false` and clears `content` in the same transaction; `/[slug]` is `force-dynamic`, so
  the next request already sees a 404. Slug change updates `website_sites` and `website_published` atomically, so the old
  address stops resolving at once and never serves stale content.
- **Preview:** `/website/preview` (owner-only, noindex) renders the saved draft over the current My Identity in an iframe, so
  the desktop/tablet/mobile modes use real media queries. Viewing never publishes.

## Database (manual review required)

| Object                        | Purpose                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `folioone.website_sites`      | Private, one row per account. Unique slug (format/length/reserved CHECK), status, theme, config. |
| `folioone.website_published`  | Snapshot rendered publicly. Unique slug. `is_live`.                                              |
| `website_publish()`           | SECURITY INVOKER, empty search_path. Upserts snapshot + marks site published.                    |
| `website_unpublish()`         | SECURITY INVOKER. Hides and clears the snapshot.                                                 |
| `website_change_slug(p_slug)` | SECURITY INVOKER. Changes the slug in both tables atomically.                                    |

**Deliberate exposure change — please review.** Earlier milestones gave `anon` no access to `folioone`. A public site needs
it, so the SQL adds: `GRANT USAGE ON SCHEMA folioone TO anon`; an RLS policy `website_published_select_live TO anon USING
(is_live)`; and a **column-level** `GRANT SELECT (slug, theme, title, description, content, is_live, published_at,
updated_at)` — not `account_id`. No other table becomes readable by `anon`. The public route uses an anonymous server client
(cookies ignored). pg_graphql, if enabled on the hosted project, will list `website_published` to `anon`: this adds to the
open GraphQL-evidence item (`docs/sql/milestone-3c/verify-graphql-evidence.sql`).

Run order: `folioone-schema` 001–006 → `milestone-4/001` → `milestone-5/001`. Preflight first (all `true`), then the script, then
the four verification queries at its end. Deploy this build only after it has run (otherwise `/website` shows an error and
`/<slug>` returns 404 for everything). `pnpm validate` applies it locally and asserts 14 functions, 10 forced-RLS tables, 32 policies.

## Slugs

3–40 chars, `a-z 0-9` and single hyphens, no leading/trailing hyphen, case-insensitive (stored lowercase). Reserved words
(`login`, `signup`, `onboarding`, `profile`, `personas`, `settings`, `api`, `auth`, `admin`, `dashboard`, `website`, …) live in
`src/domains/website/slug.ts` and in the SQL CHECK; a test keeps the two lists identical. Static routes always win over `/[slug]`.

**Availability check, honestly:** it covers format, reserved words, your own address, and any _live_ site. A slug held by
someone else's unpublished draft is invisible to you (RLS), so the UI says "Looks available. It is confirmed when you save",
and the unique constraint is the final authority ("already taken" on save).

## Sharing and SEO

Per-page `<title>`, description, canonical URL, Open Graph and Twitter tags from the published row (editable on the Publish tab;
defaults to name + headline + short biography). The share image (`/<slug>/opengraph-image`) is a typographic card in the theme's
colours. Copy link, native share (where supported), open, and a QR code (SVG, downloadable) are in the Publish tab and Overview.

## Vercel Preview instructions

1. Run the three SQL files above on the Supabase project the Preview will use; keep `folioone` in _Exposed schemas_.
2. Vercel → Project → Environment Variables (Preview): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (build + runtime). Leave `NEXT_PUBLIC_SITE_URL` **unset** so links, canonical URLs and the QR code use each preview URL.
   Optional `PERSONA_STORAGE` (default `fixture`). No service-role key.
3. Supabase Auth → URL configuration: add the Preview URL(s) to the redirect allow-list (see `m4-auth-onboarding.md`).
4. Build `pnpm build`, install `pnpm install --frozen-lockfile`. Deploy a preview manually (nothing deploys automatically).
5. Walk the journey: sign up → profile → **My Website** → address → content → design → preview → publish → open `/<slug>`
   in a private window → edit profile (public unchanged) → republish → unpublish (404) → change address.
6. Production later: set `NEXT_PUBLIC_SITE_URL=https://<your-domain>`; every `<domain>/<slug>` link then uses it.

## Known functional gaps

- **Articles and thoughts:** not built (no article model exists); the section is intentionally absent.
- **Share image** does not embed the profile photo (the server would have to fetch an arbitrary user-supplied URL).
- **Images** are https URLs (no upload yet, see M4 gaps) and are loaded directly by visitors' browsers (`no-referrer`, lazy).
  No CSP/security headers yet.
- **Introduction** is always first and always shown; other sections are reorderable. No per-theme colour customisation.
- **Old slugs** are released on change and not redirected; anyone may later claim them.
- **No analytics, custom domains, password protection, `sitemap.xml`/`robots.txt`** or search-engine "noindex" toggle.
- **Availability** cannot see other users' unpublished claims (see above).
- Fixture mode has no website; `/website` needs Supabase configured and the SQL applied.

## Portfolio templates (M7)

Beyond the three hand-built themes, people can choose from 20 templates (23 designs in all),
grouped as Editorial, Classic, Minimal, Bold, Creative and Technical in the Design tab.

- **Data, not components.** `src/domains/website/templates.ts` describes each template: a page
  layout (`split`, `centered`, `masthead`, `sidebar`, `cover`, `poster`, `terminal`), a section
  style (reusing the built-in `professional` / `creative` / `minimal` section bodies), a heading
  style, a type pairing, a palette and a radius. `template-site.tsx` renders any of them through
  CSS variables, so adding a template is a data change (plus the SQL list below).
- **Typefaces** are self-hosted by `next/font` (`template-fonts.ts`) with `preload: false`, so a
  site downloads only its own two faces. The build fetches them from Google Fonts once; no
  runtime request goes to Google.
- **Preview before saving.** `/website/preview?theme=<id>` renders the owner's saved draft in any
  valid design without saving it; the picker's "Preview" links and the Preview tab use it.
- **Accessibility gate.** `tests/website-templates.test.tsx` requires WCAG AA contrast for body
  text and buttons in every palette, and renders every template.
- **Database.** The theme CHECK constraints only allowed the original three ids.
  `docs/sql/milestone-7/001-website-templates.sql` (repeatable, constraints only) widens them;
  a test keeps its list equal to the application's `THEME_IDS`. Until it is executed, saving or
  publishing with a new template fails with a constraint error.
