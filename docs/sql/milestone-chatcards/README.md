# ChatCards SQL (prepared, NOT executed on any hosted project)

Run in this order, in the Supabase SQL Editor, as `postgres`, after reviewing each file. Each
file starts with a read-only **preflight**: run it alone first and continue only if every column
is `true`. Each ends with read-only **verification** queries and commented **rollback** steps.

| Order | File                        | What it does                                                                             | Prerequisites                                     |
| ----- | --------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1     | `001-chatcard-routes.sql`   | Reserves `chat`, `chatcards`, `messages` in the four website / card address CHECKs       | M8 executed; no existing address uses those words |
| 2     | `002-chatcards.sql`         | 10 tables, 26 policies, 6 trigger functions, 4 callable functions (all SECURITY INVOKER) | M9 (`has_pro`) and 001 executed                   |
| 3     | `003-chatcard-insights.sql` | `insight_events.chat_card_id`, 11 ChatCard events, 2 policies                            | M13/002 and 002 executed                          |

Expected after all three: `pnpm validate`'s catalog shape (35 functions in `folioone`, exactly one
SECURITY DEFINER — `billing_activate_pro` from M9 — 29 forced-RLS tables, 85 policies).

Execution status is recorded in `../execution-tracker.md` only when the developer reports it.
Design: `docs/architecture/chatcards.md` (AD-017).
