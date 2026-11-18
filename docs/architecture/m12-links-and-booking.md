# M12: Links page and booking block

Both are part of My Website: they live in `website_sites.config` (`links`, `booking`), are copied into the
published snapshot by `buildPublishedContent`, and go live, change or disappear when the website is published
or unpublished. No new tables.

## Links page (`/<slug>/links`)

- **Editor**: My Website → Links page. Switch it on, pick a button style (filled, outline, soft), show social
  icons, and add buttons: custom links, featured posts, social profiles, published articles, "My website" and
  the booking page. Each button can be renamed, reordered, highlighted (accent colour + star) and scheduled
  (show from / hide after, UTC days, via the shared `DatePicker`).
- **Publishing** (`buildLinks`): entries must still be visible in My Identity and articles still published;
  unresolvable buttons are dropped. Schedules are stored in the snapshot and applied on every request
  (`linksLiveOn`), so scheduled buttons appear and disappear without republishing.
- **Page** (`LinksView`): one mobile-first column in the website theme's colours (`themeColors`), text on the
  accent chosen for contrast (`readableOn`). Tracked by `PageTracker` like the website: each button is a
  `link_click` with its kind (`custom`, `featured`, `social`, `article`, `website`, `booking`). Own-site links are
  tracked because they carry `data-track-kind`.

## Booking block (section `booking`, "Book a time")

- **Editor**: My Website → Content → Book a time: booking page link, title, description.
- `parseBookingLink`: https only. Calendly, Cal.com and Google Calendar appointment schedules are embedded;
  any other booking link opens in a new tab.
- **Privacy**: the provider's iframe loads only after the visitor clicks "Pick a time" (like the YouTube
  player), so its scripts and cookies never load for readers. "Open in a new tab" always remains available.
- **Insights**: `booking_open` (scheduler opened) plus links-page booking taps → the "Bookings opened" tile.
  Needs `docs/sql/milestone-12/001-booking-insights.sql`; until then those events are silently ignored.

## Setup (developer)

Run `docs/sql/milestone-12/001-booking-insights.sql` (after M11). Nothing else.
