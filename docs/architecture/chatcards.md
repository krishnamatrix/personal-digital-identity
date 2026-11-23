# ChatCards (PRO): private conversation invitations

> **Share access to a conversation, not your personal information.**

A ChatCard is a shareable invitation to a private, one-to-one text conversation. The owner (a
PRO account) creates it, decides who may use it and shares its link or QR code. A recipient
(on any plan, including a brand-new Free account) opens it, completes any verification and
writes. Neither side sees the other's email address, phone number, social accounts or any
Master Identity field. Decision record: AD-017. Spec: `specs/004-chatcards/`.

## Where it lives

| Area                                           | Route / module                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| Navigation                                     | **My Connections → ChatCards** (`/chatcards`) and **Messages** (`/messages`)       |
| Owner dashboard                                | `src/app/chatcards/page.tsx`, `chatcards-dashboard.tsx`                            |
| Create wizard (4 steps)                        | `/chatcards/new` → `chat-card-editor.tsx` (`ChatCardWizard`)                       |
| Manage (overview, edit, preview, share, codes) | `/chatcards/[id]` → `chat-card-manager.tsx`                                        |
| Public landing page                            | `/chat/[publicId]` (no sign-in needed to view) → `src/app/chat/`                   |
| Inbox and conversation                         | `/messages`, `/messages/[id]` → `src/app/messages/`                                |
| Rules (pure)                                   | `src/domains/chatcards/chat-card-schema.ts`, `activation-codes.ts`                 |
| PRO gate                                       | `src/domains/chatcards/entitlement.ts` (`canUseChatCards`, `requireChatCardOwner`) |
| Services                                       | `chat-card-service.ts` (owner), `conversation-service.ts` (recipient + both sides) |
| Data access                                    | `src/lib/db/queries/chatcards.ts` (re-exported by `@/lib/db/query`)                |
| SQL                                            | `docs/sql/milestone-chatcards/001` → `002` → `003`                                 |

The schema is hand-written SQL (as for M5 onwards); `src/db/schema/` (Drizzle) covers only the
original identity tables and is not extended.

## Data model

```
accounts ─┬─< chat_cards (owner-private) ──1:1── chat_card_public (published snapshot)
          │       │
          │       ├─< chat_card_code_batches ─< chat_card_codes (hash + 4-char hint only)
          │       │                                     │
          │       │                                     └─< chat_card_redemptions >── accounts (recipient)
          │       │
          │       └─< conversations (owner_id, recipient_id) ─< conversation_messages
          │                 ├─< conversation_reports
          │                 └── conversation_blocks (blocker → blocked)
          └─< chat_card_redeem_attempts (rate limit)
insight_events.chat_card_id → chat_card_public.card_id (analytics, M11 table)
```

- **Status**: `draft → active ⇄ paused → archived` (archived is final). "Expired" is derived:
  `expires_at` has passed. Archiving never deletes anything; conversations keep their history.
- **Deletion**: only account deletion removes data (cascades). A recipient deleting their account
  removes their conversations but keeps the code-use audit row (`recipient_id` set to NULL).
- **Persona** (`persona_id`) and **link** (`link_kind`: website / digital card) are optional and
  owner-only. Personas may be fixture-backed, so there is no FK; the service accepts only one of
  the owner's own active Personas. The public snapshot holds a resolved `link_path` to the owner's
  _live_ page only.

## Security model (all enforced in Postgres, not only in the app)

Every query uses the signed-in user's JWT (or anon) through the existing server client; RLS is
enabled and forced on all ten tables; there is no SECURITY DEFINER, service-role key, custom
role or direct Postgres connection.

| Rule                         | Where                                                                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Owner writes need active PRO | `has_pro()` in every owner INSERT/UPDATE policy; accept needs PRO in the lifecycle trigger                                                                                                                   |
| Cards cannot be listed       | `chat_card_public` is visible to anon only for the public id that `chat_card_public_get()` puts in `folioone.chat_card` (a transaction-local setting); there is no list API                                  |
| Owner never exposed publicly | anon has no SELECT on `chat_card_public.account_id`; pages render only the snapshot's public fields                                                                                                          |
| Codes never readable         | Only `sha256` hashes are stored; no API role is granted `code_hash`; a redeemer sees one code row, only inside `chat_card_redeem()`, only for the hash they sent                                             |
| Atomic redemption            | `UNIQUE (code_id, slot)` + `UNIQUE (code_id, recipient_id)`: two people racing for a single-use code cannot both win                                                                                         |
| Redemption rate limit        | `chat_card_redeem()` records the attempt _first_, then refuses after 10 in 15 minutes; there is no way to see a code row without going through it                                                            |
| Membership                   | conversations / messages / reports readable only by the two participants                                                                                                                                     |
| Who may start a conversation | `conversations_before_insert` trigger: live, not paused/expired, accepting, owner PRO, not blocked, code redeemed when verified, auto-accept only if the card allows; 5 requests / hour; per-recipient limit |
| Lifecycle                    | `conversations_before_update`: owner accepts / declines / closes, recipient leaves, either side blocks; nothing reopens; each side moves only its own read marker                                            |
| Messages                     | sender and timestamp set by the server; identity ordering; 1–2000 chars; only in active conversations (plus one opening message on a request); follow-up rule; 20 / minute, 300 / hour                       |

Errors are deliberately generic ("This conversation is not available.", "That code did not
work…") so they reveal neither whether a card / code / conversation exists nor whom it belongs to.

### Why policies are thin and triggers do the cross-table checks

A policy on `conversations` that read `chat_card_public`, whose own policy reads
`conversations`, makes Postgres stop with "infinite recursion detected in policy". So policies
check only "is this my row"; the cross-table rules run in `BEFORE INSERT/UPDATE` triggers
(SECURITY INVOKER, so they see only what the caller may see). Triggers cannot be skipped.

## PRO entitlement

`canUseChatCards(client, accountId)` reuses the existing rule (`isProActive`: plan `pro` and
`pro_until` in the future, read from the account's own `account_plans` row). Every owner service
call goes through `requireChatCardOwner()`; a client-supplied plan is never read.

- **No grace period** exists in Folioone; a PRO period simply ends at `pro_until` (30 days per
  payment, no auto-renewal, no cancellation flow). ChatCards follow that.
- **When PRO lapses**: the owner's cards stop taking new conversations and code redemptions (the
  public page shows "Not available right now"); messages can no longer be sent in either
  direction; the owner sees the upgrade screen instead of the dashboard. **Nothing is deleted**:
  both sides can still read every conversation in Messages, and the owner can still decline,
  close, block and report. Renewing restores everything at once (opening ChatCards or Messages
  refreshes the snapshots' `owner_pro_until`).
- Recipients never need PRO.

## Activation codes (book-author workflow)

1. The author creates a **Verified access** card, e.g. "Ask the Author", and generates a batch
   (up to 500 per batch; single-use by default; optional expiry; up to 25 people per code if not
   single-use).
2. Codes are 16 characters from Crockford base32 (no I/L/O/U), grouped `XXXX-XXXX-XXXX-XXXX`:
   80 bits from the OS CSPRNG. Only `sha256` is stored, with a 4-character hint for the owner.
3. The codes are shown **once**, in the server action's response, with CSV / TXT download made
   in the browser. They are never logged or stored and cannot be shown again (revoke and reissue
   if lost).
4. The book prints one common QR code (the card link with `?src=qr`) and one unique code per copy.
5. The reader scans, signs in or creates a Free account (and returns to the card), enters the
   code, which is redeemed atomically and tied to their account, then sends a request (or starts at
   once if the author chose no extra approval).

**Limitation (deliberate, documented to owners):** a code proves that someone _holds_ one of the
author's codes, not that they bought the book: codes can be passed on or shared. A shared QR code
alone never grants access.

## Analytics

ChatCard events go into the existing `insight_events` table (M11) through the anonymous client,
so no event is linked to a signed-in account, and none contains message text, a code, a name or an
account id: `chat_card_viewed`, `chat_card_qr_scanned`, `activation_code_attempted`,
`activation_code_redeemed`, `conversation_requested`, `conversation_accepted`,
`conversation_declined`, `message_sent`, `conversation_closed`, `chat_card_paused`,
`chat_card_published`. Views carry the same daily-salted visitor hash and device class as other
pages; bots and prefetches are ignored; the owner's own visits are not counted.

`chat_card_qr_scanned` means "opened through the QR code's link". A browser cannot prove a
physical scan, and the dashboard labels it "Opened from QR link". Request / accepted / active
counts on the dashboard come from the conversations themselves (authoritative), not from events.
Retention follows M11 (13 months).

## Messaging delivery

The conversation page polls for new messages every 5 seconds while visible (server action, same
RLS). Supabase Realtime is not configured in this project; adding it later needs no schema change.
There are no email or push notifications yet: new requests show as unread in Messages.

## Known limitations

- No notifications outside the app (email / push); the owner checks Messages.
- No in-app moderation queue: reports are stored for the operator (query in 002's footer).
- "Maximum active conversations" applies when the owner accepts requests; with automatic
  acceptance it is not enforced (the database cannot count other people's conversations for a
  recipient without SECURITY DEFINER).
- A participant can see the other participant's account UUID through the raw API (never shown in
  the app); UUIDs grant nothing by themselves.
- Codes are per batch up to 500 at a time; generating thousands means several batches.
- Recipient names are self-chosen; ChatCards do not verify identity.
