# M11: Featured posts and Insights

## Featured posts

- **My Identity → Featured** (`featured_post` list kind, `entry-kinds.ts`): link, title, type (post, video, article,
  podcast, talk, other), published month, "why it matters", image URL, and "Headline item" (shown large).
- **Fill from link** (`fetchLinkPreviewAction` → `src/lib/link-preview/fetch-preview.ts`): the server reads the page's
  Open Graph tags (YouTube: oEmbed + the standard thumbnail). Only empty fields are filled. SSRF guard: https on port 443
  only, no credentials in the URL, every DNS answer checked at connect time (private, loopback, link-local/metadata,
  CGNAT, multicast and reserved ranges refused, including after redirects), at most 3 redirects, 6 s, 512 KB, HTML only.
  Signed-in users only, 15 lookups a minute.
- **Website**: a "Featured posts & media" section (default position: after About; existing sites get it there too).
  Items are ticked per website in My Website → Content, like other lists. Rendering (`sections.tsx`, all 23 themes):
  headline items as a large media + text card, the rest as a responsive card grid (one column on phones), a compact list
  in minimal styles. YouTube items show the thumbnail with a play button and load the `youtube-nocookie.com` player only
  on click. Broken remote images fall back to a quiet platform panel.

## Insights

`/insights` (sidebar → My presence → Insights): views, unique visitors, link clicks and click rate, email/phone taps,
contacts saved from the card, QR opens and video plays, each against the previous period; views per day; the links
people clicked (social profiles, featured posts, projects, card links); featured-post clicks and plays; traffic
sources (referrer site or `utm_source`), tagged campaigns, regions, devices, languages, browsers and in-app browsers,
website pages; and the latest 25 events. Ranges: 7, 30 or 90 days.

### Collection

- `PageTracker` (client) on `/[slug]`, `/[slug]/articles/[article]` and `/social/[slug]` sends one `view` and, by
  delegated listener, `link_click` (outbound http(s) links), `contact_click` (mailto/tel), and elements marked
  `data-track-event` (`qr_open`, `vcard_save`, `video_play`) to `POST /api/pulse` with `navigator.sendBeacon`.
- `recordBeacon` validates the payload, drops bots / link-preview fetchers / prefetches, rate-limits per visitor, skips
  the owner viewing their own page, and inserts with the **anonymous** client (`getAnonymousDb`). Always 204.
- Pages are identified by `public_id` (M11 SQL), never by `account_id`. The tracker is rendered only when that id can
  be read, so public pages keep working before the SQL is applied.

### What is stored (and what is not)

Stored per event: page (website/card public id), event, path (no query string), link kind/label/URL (query strings
stripped except content ids such as YouTube `v`), referrer **host** (other sites only), `utm_source/medium/campaign`,
country (only if the host sends a country header; Railway does not), browser time zone, primary language, device class,
browser and OS family, and a 16-hex visitor hash.

Never stored: IP address, full user agent, full referrer URL, cookies or any client identifier, e-mail or phone values.
The visitor hash is `sha256(daily random salt | ip | user agent)`; the salt lives in server memory only and changes
daily (and on restart), so it counts unique visitors per day and cannot be reversed or linked across days. No cookie is
set, so no consent banner is required for this collection; mention it in the privacy policy.

### Access

`insight_events` (RLS forced): anon may INSERT listed columns for a **live** page only (`id`, `occurred_at` are
server-set); the owner may SELECT events of their own pages; nobody can update. Known limit: anyone with the public anon
key can insert events for a live page (inflated counts); values are bounded by CHECKs.

## Setup (developer)

1. Run `docs/sql/milestone-11/001-featured-posts.sql`, then `002-insights.sql` (after M5 and M8).
2. No environment variables. Retention: a commented `DELETE` for events older than 13 months is in `002-insights.sql`.
