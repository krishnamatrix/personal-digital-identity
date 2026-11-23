# Plan: ChatCards

1. **Phase 0 – inspection.** Reused: `account_plans` + `has_pro()` (M9) for PRO; the snapshot pattern of
   digital cards (M8, AD-005); `insight_events` (M11) for analytics; `src/lib/db/query.ts` boundary; the
   QR code library already used by websites; workspace navigation and UI primitives; local validation
   (`pnpm validate`). Missing dependency: none for billing (PRO is real: verified Razorpay payments). No
   grace period exists, so none is invented.
2. **Phase 1 – foundation.** SQL 001/002; domain schema; query module; entitlement gate; owner service;
   dashboard, wizard, manager, public landing page, share + QR.
3. **Phase 2 – conversations.** Request function, lifecycle trigger, inbox, thread, block, report.
4. **Phase 3 – activation codes.** Generation (CSPRNG), hashing, batches, export, redemption function with
   attempt-first rate limit and atomic slots, revocation.
5. **Phase 4 – analytics and UX.** SQL 003, events, dashboard metrics, empty / paused / expired /
   unavailable / upgrade states, mobile layout.

Key decision: AD-017 (no SECURITY DEFINER; transaction-local settings + invoker functions; triggers for
cross-table rules; polling).
