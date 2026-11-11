# M4 — Authentication and first-time onboarding

STATUS: implemented and verified locally (`pnpm validate`). **Nothing here has been run against hosted
Supabase or deployed.** The new database objects are SQL _prepared for review_.

## User journey

| Step | Route                        | Notes                                                                                                                        |
| ---- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1    | `/signup`                    | Name, email, password (8–72, confirmed). Name is stored as Auth `user_metadata.full_name`.                                   |
| 2    | email                        | Supabase sends the confirmation mail (link → `/auth/callback`). Same neutral message whether or not the address exists.      |
| 3    | `/auth/callback`             | Handles `?code=` (PKCE) and `?token_hash=&type=`. Lands on `/onboarding` (sign-up) or `/reset-password` (recovery).          |
| 4    | `/onboarding`                | 7 steps; progress saved per step in `identity_profiles.onboarding_step`; resumable; every step after Welcome is skippable.   |
| 5    | `/profile`                   | Master Identity editor. Reached by **Finish**, by **Skip for now**, or by login. Unfinished setup shows a "Continue" banner. |
| 6    | `/login`, `/forgot-password` | Login → `/profile`. Forgot password mails a link → `/auth/callback?type=recovery` → `/reset-password` → `/login`.            |
| 7    | sign-out (header)            | Session cookies cleared; protected data is not rendered without a session.                                                   |

Session persistence: `@supabase/ssr` cookies, refreshed by `src/middleware.ts` on `/profile`, `/personas`,
`/onboarding`, `/reset-password`. Data access still goes only through the authenticated server client + RLS.

## Master Identity model (no duplicate fields)

- Existing `identity_profiles` columns are reused: **biography = `summary`**, personal website = `website_url`,
  `display_name`, `headline`, `location`. `linkedin_url` / `github_url` remain because Persona selections
  reference them; saving Social links mirrors the first LinkedIn and GitHub link into them.
- New columns (SQL below): `full_name`, `profile_image_url`, `cover_image_url`, `contact_email`, `phone`,
  `current_designation`, `current_organization`, `industry`, `professional_summary`, `primary_purpose`,
  `onboarding_step`, `onboarding_completed_at`.
- One generic table **`folioone.identity_entries`** (`kind`, `position`, `is_visible`, `data jsonb`) holds employment,
  education, skills, projects, social links, achievements, certifications, languages, interests.

### Adding a section later

1. Add the kind to `ENTRY_KINDS` / `ENTRY_KIND_DEFS` in `src/domains/identity/entry-kinds.ts` (fields, labels, limits).
2. Add the kind to the CHECK in a new reviewed SQL file (`ALTER TABLE … DROP/ADD CONSTRAINT identity_entries_kind_check`).
3. Mount `<EntryListEditor kind="…">` in `profile-workspace.tsx`. Validation, saving, ordering, visibility,
   empty states and the dirty indicator come for free.

## Profile editor

Section navigation (side rail on desktop, scrolling tabs on mobile), per-section Save / Cancel, "Unsaved changes"
indicator (also a dot in the navigation and a browser leave-warning), completion indicator with a "next step" link,
useful empty states, preview of the **saved** profile (hidden items excluded). All panels stay mounted so drafts
survive switching sections.

## Manual SQL required (not executed by Claude)

`docs/sql/milestone-4/001-identity-profile-expansion.sql` — run once, as `postgres`, in the Supabase SQL Editor of
each project, **after** `docs/sql/folioone-schema/001–006`. It only touches schema `folioone`. Run the preflight
first (all `true`), then the script, then the three verification queries at its end. **Deploy this build only
after it has run**, otherwise `/profile` shows "could not load" (the selected columns do not exist yet).
Local validation applies it automatically.

## Supabase Auth configuration (Dashboard — manual)

Authentication → URL Configuration:

- **Site URL**: the stable app URL (e.g. the Vercel production/staging domain).
- **Redirect URLs** (allow-list): `https://<your-domain>/auth/callback`, plus `https://*-<team>.vercel.app/auth/callback`
  (or the exact Preview URL) for Vercel Preview, and `http://localhost:3000/auth/callback` for local development.

Authentication → Providers → Email: keep **Confirm email** enabled for hosted projects. Password minimum length ≥ 8.

Authentication → Emails (optional, makes links work when opened on another device): set the _Confirm signup_ link to
`{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup&next=/onboarding` and _Reset password_ to
`{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`. With the default
templates the PKCE link works only in the browser that started the flow.

The redirect URL each email carries is built from `NEXT_PUBLIC_SITE_URL` if set, otherwise from the request host
(so each Vercel Preview URL gets links back to itself), otherwise `VERCEL_URL`. It must be in the allow-list above or
Supabase falls back to the Site URL.

Built-in Supabase SMTP is heavily rate-limited; configure a custom SMTP provider before real users sign up.

## Vercel Preview

Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (build + runtime), optional
`NEXT_PUBLIC_SITE_URL` (leave **unset** for Preview so links follow each preview URL), `PERSONA_STORAGE`
(default `fixture`). No service-role key anywhere. Build `pnpm build`, install `pnpm install --frozen-lockfile`.
Health: `/api/health`. Not deployed.

## Known functional gaps

- **Image upload**: images are entered as https URLs. Uploading needs a Supabase Storage bucket + policies (not
  prepared; storage is disabled in the local stack). Remote images are rendered as-is (no proxy, no CSP yet).
- No "resend confirmation email" action; a user who loses the mail signs up again or uses password reset.
- Social links accept any http(s) URL; the platform is not verified to match the host.
- Per-account list caps are enforced in the application (e.g. 30 positions, 100 skills), not in the database.
- Saving a list is upsert-then-delete (not one transaction): a failure between the two leaves old extra items, never loses data.
- Preview is an in-app view; there is no public page, share link, or per-field visibility beyond show/hide per item.
- Social-link platform URLs are not fetched/verified; no OAuth or sync (out of scope).
- The sidebar still lists only Overview / Profile / Personas; the dashboard remains sample (fixture) content.

## Resume import (onboarding step 1)

New users can start onboarding from their resume. It lives on the first onboarding step, not on the
sign-up form: sign-up needs email confirmation before a session exists, and nothing may be written to
My Identity without a verified user.

- **Flow:** `ResumeImport` (client) → `importResumeAction` → `importResume` service. The service verifies
  the session first (`getAuthenticatedDb`), so anonymous requests never read the file or call the API.
- **File handling** (`resume-file.ts`): PDF or DOCX, 5 MB max, checked by extension **and** content
  signature. A PDF is sent to Gemini as inline data; a DOCX is reduced to text with `mammoth`.
  The file is never written to disk or storage. Server actions accept up to 6 MB (`next.config.ts`).
- **Extraction** (`src/lib/ai/resume-extractor.ts`, the only LLM call site): Google Gemini
  `gemini-3.5-flash-lite` via REST `generateContent` (plain fetch, no SDK, key in the `x-goog-api-key`
  header), minimal thinking, JSON output against `resumeExtractionSchema` (converted to Gemini's
  schema subset), with the reply re-parsed by the same Zod schema. The
  document is treated as data; the output is untrusted and re-validated.
- **Merge rules** (`resume-mapping.ts`, pure and unit-tested): profile fields are filled only where the
  profile is empty, each validated on its own; list entries are validated with the editor's per-kind
  schema, appended after existing items, de-duplicated by title + subtitle and capped at the section
  maximum. Nothing the person entered is overwritten or deleted.
- **Configuration:** `GEMINI_API_KEY` (server-only). Unset, the import is hidden and onboarding is
  unchanged. Depends on the M4 SQL (`identity_entries` and the expanded profile columns).
