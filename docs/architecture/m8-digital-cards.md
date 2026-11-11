# Milestone 8 — Digital Cards

**Status:** Implemented in the application. SQL `docs/sql/milestone-8/001-digital-cards.sql` is
PREPARED - NOT EXECUTED; until the developer runs it, `/cards` shows its "could not load" state.

## What it is

A digital business card per account, shared at `https://<domain>/social/<slug>`. It is separate
from Personas: the owner picks fields straight from My Identity, a card type and one of 32
designs. Three steps in the workspace (`/cards`, sidebar "Digital Cards"):

1. **Details**: card type (Professional, Personal, Social, Creative: sets the usual fields and
   suggests designs), display name and initials overrides, and a switch per field: title &
   organisation, email, phone, location, LinkedIn, X, GitHub, website, one custom link (label +
   https URL, the only value stored on the card itself), and whether to use the profile photo.
   Fields that are not in My Identity are disabled with a link to add them.
2. **Design**: 32 designs (`src/domains/cards/card-designs.ts`), 7 layouts, filterable by
   category. Designs with a `photo` emboss fade the profile photo into the card (the photo is published only for these
   designs; see `m10-profile-media.md`); without a
   photo (or with the switch off) they emboss the initials instead. `monogram` designs always
   emboss the initials.
3. **Share**: claim the address, publish / update / unpublish, copy or open the link.

## Data and privacy (AD-005)

- `folioone.digital_cards` is private (owner RLS, no anon access). `slug` is nullable until
  claimed and globally unique.
- `folioone.digital_card_published` is the published snapshot. anon may read it only where
  `is_live`, and only the columns `slug, card_type, design, content, is_live, published_at,
updated_at` (never `account_id`). Unpublish clears the content in the same statement.
- `content` holds only the switched-on fields (`cardContentSchema`), is rebuilt from My Identity
  at publish time, and is re-validated on every public render. Links must be http(s).
- `digital_card_publish` / `_unpublish` / `_change_slug` are SECURITY INVOKER with an empty
  search_path, EXECUTE for `authenticated` only.
- The file also widens the website slug CHECK constraints so `cards` and `social` are reserved
  (`RESERVED_SLUGS` in `src/domains/website/slug.ts`; a test keeps SQL and code equal).

## QR code

The public card (and the workspace preview) has a small QR icon. Nothing is shown until it is
pressed; the code is then generated in the browser (`qrcode`, already a dependency) and laid
over the card. It encodes a vCard 3.0 (`cardVCard`) of exactly the published fields plus the
card's address, so a phone camera offers to save the contact. "Save contact" downloads the same
vCard as a `.vcf` file.
