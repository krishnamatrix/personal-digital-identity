# Tasks: ChatCards

- [x] T1 SQL 001 reserved routes (`tests/website-domain.test.ts`)
- [x] T2 SQL 002 tables, RLS, triggers, functions (`tests/chatcards-sql-and-boundary.test.ts`, `tests/hosted/chatcards.hosted.ts`)
- [x] T3 SQL 003 Insights events (`tests/chatcards-domain.test.ts` event list)
- [x] T4 Domain rules and codes (`tests/chatcards-domain.test.ts`)
- [x] T5 Query module (`tests/chatcards-queries.test.ts`)
- [x] T6 PRO gate for every owner action; recipients ungated (`tests/chatcards-entitlement.test.ts`)
- [x] T7 Owner UI: dashboard, wizard, manager, share, codes
- [x] T8 Recipient UI: landing page, redemption, request; sign-in return path
- [x] T9 Messages: inbox, thread, polling, close / leave / block / report
- [x] T10 Navigation, middleware, PRO feature list
- [x] T11 Local DB integration: PRO gate, enumeration, hashes, atomic race, revoke / expiry, approval, membership,
      ordering, forged sender, closed, block, pause, expiry, rate limit, lapse (`tests/hosted/chatcards.hosted.ts`)
- [x] T12 Playwright journey with screenshots (`e2e/chatcards-journey.spec.ts`)
- [ ] T13 Developer: review and run SQL 001 → 002 → 003 on the hosted project; report for the tracker
