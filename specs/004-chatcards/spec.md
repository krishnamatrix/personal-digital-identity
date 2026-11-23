# Feature Specification: ChatCards

**Created**: 2026-11-22 | **Status**: Implemented locally; SQL prepared, not executed on hosted Supabase

Design and security model: `docs/architecture/chatcards.md` (AD-017). SQL: `docs/sql/milestone-chatcards/`.

## Problem and scope

Let a Folioone PRO user invite people into a private one-to-one text conversation without disclosing an
email address, phone number, social account or any Master Identity field. Recipients use any plan.

In scope: owner dashboard, 4-step creation wizard, edit, preview, publish / pause / resume / archive, link + QR
(SVG / PNG), three access policies (open, approval, verified), activation-code batches (hashed, single-use by
default, expiry, revocation, CSV / TXT export), recipient landing page, code redemption, requests, inbox,
conversation thread with pagination and polling, close / leave / block / report, rate limits, analytics
through the existing Insights table, PRO gate with the existing plan model.

Out of scope (this milestone): group chats, attachments, voice / video, end-to-end encryption, per-conversation
billing, purchase-verification integrations, native apps, AI assistant, notifications outside the app, an
in-app moderation queue.

## User stories

- **US1 (P1) Owner creates and shares a ChatCard.** PRO only (server and database). Free accounts see an
  upgrade screen. Acceptance: Free owner refused for every owner action, directly or through the API.
- **US2 (P1) Recipient starts a conversation.** Any signed-in account; signing up from a card returns to it.
  Approval cards wait for the owner; open cards may start at once; paused / expired / archived / lapsed
  cards take none.
- **US3 (P1) Verified access with activation codes.** Codes are random (80 bits), hashed, shown once, redeemed
  atomically; used / revoked / expired codes fail with one generic message; 10 attempts per 15 minutes.
- **US4 (P1) Private conversation.** Only participants read or write; closed conversations reject messages;
  blocking stops new conversations from that person; reports never reach the other person.
- **US5 (P2) Owner analytics.** Visits, unique visitors, QR-link visits (not proof of a scan), redemptions,
  requests, active conversations; no message content in events.

## Requirements

Traceable to the request's sections 1–12; each is covered by a test listed in `tasks.md`.
