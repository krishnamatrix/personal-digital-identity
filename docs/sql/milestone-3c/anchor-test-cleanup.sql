-- Folioone M3D: cleanup for the dedicated account-anchor test user "C".
-- STATUS: APPROVED BY THE DEVELOPER WITH TWO SAFETY CHANGES (UUID protection;
-- exactly one row deleted); reviewed; run manually by the developer (reported run 2026-11-09; the assistant never executes it). Run manually as postgres in the dev project.
--
-- Purpose: after `pnpm test:persona-anchor`, remove ONLY user C's public.accounts
-- row so the "anchor absent" branch can be exercised again. Persona tables
-- reference accounts ON DELETE CASCADE, so C's leftover Personas, selections,
-- sections, overrides and revisions go with it. identity_profiles (if any) is
-- also cascaded; C is a throwaway user with no Master Identity of value.
--
-- Safety: the script resolves C by e-mail and REFUSES to continue unless every
-- placeholder is filled, C's e-mail is not A's, B's or the dev account's, C's
-- resolved UUID is not A's or B's, and exactly ONE accounts row is deleted
-- (zero or several abort and roll back). Step 1 is a read-only preview; step 2 deletes.
-- It never touches auth.users (delete the Auth user in the dashboard if wanted).

-- 1. PREVIEW (read-only). Replace the e-mail. Expect exactly 1 row.
SELECT u.id AS user_id, u.email,
       (SELECT count(*) FROM public.accounts a WHERE a.id = u.id) AS account_rows,
       (SELECT count(*) FROM public.personas p WHERE p.account_id = u.id) AS personas
FROM auth.users u
WHERE u.email = 'REPLACE-WITH-USER-C-EMAIL';

-- 2. DELETE (single transaction). Uncomment after reviewing step 1.
--    Fill in EVERY placeholder first (C's e-mail; A's, B's and the dev test
--    account's e-mails AND A's and B's UUIDs). The block refuses to run while any
--    placeholder is left, so a protection can never be silently skipped.
-- BEGIN;
-- DO $$
-- DECLARE
--   v_email      constant text := 'REPLACE-WITH-USER-C-EMAIL';
--   v_protected_emails constant text[] := ARRAY[
--     'REPLACE-WITH-USER-A-EMAIL',
--     'REPLACE-WITH-USER-B-EMAIL',
--     'REPLACE-WITH-DEV-TEST-EMAIL'
--   ];
--   v_user_a_text constant text := 'REPLACE-WITH-USER-A-UUID';
--   v_user_b_text constant text := 'REPLACE-WITH-USER-B-UUID';
--   v_user_a uuid;
--   v_user_b uuid;
--   v_id uuid;
--   v_deleted integer;
-- BEGIN
--   -- Every placeholder must have been replaced.
--   IF v_email LIKE 'REPLACE-WITH-%'
--      OR v_user_a_text LIKE 'REPLACE-WITH-%'
--      OR v_user_b_text LIKE 'REPLACE-WITH-%'
--      OR EXISTS (SELECT 1 FROM unnest(v_protected_emails) e WHERE e LIKE 'REPLACE-WITH-%') THEN
--     RAISE EXCEPTION 'Refusing: a REPLACE-WITH-... placeholder was not filled in';
--   END IF;
--   -- A cast failure here also aborts the transaction.
--   v_user_a := v_user_a_text::uuid;
--   v_user_b := v_user_b_text::uuid;
--
--   SELECT id INTO v_id FROM auth.users WHERE email = v_email;
--   IF v_id IS NULL THEN RAISE EXCEPTION 'No such user'; END IF;
--
--   -- E-mail protection: C must not be A, B or the dev test account.
--   IF v_email = ANY (v_protected_emails) THEN
--     RAISE EXCEPTION 'Refusing: this e-mail is not the dedicated anchor test user';
--   END IF;
--   -- UUID protection: the resolved C id must not be A's or B's id, and must not
--   -- be the id of any protected e-mail account either.
--   IF v_id = v_user_a OR v_id = v_user_b THEN
--     RAISE EXCEPTION 'Refusing: resolved user id matches RLS test user A or B';
--   END IF;
--   IF EXISTS (SELECT 1 FROM auth.users u
--              WHERE u.id = v_id AND u.email = ANY (v_protected_emails)) THEN
--     RAISE EXCEPTION 'Refusing: resolved user id belongs to a protected account';
--   END IF;
--
--   -- Explicit starting condition: C must currently have an account anchor.
--   IF NOT EXISTS (
--     SELECT 1
--     FROM public.accounts
--     WHERE id = v_id
--   ) THEN
--     RAISE EXCEPTION 'Refusing: User C has no account anchor';
--   END IF;
--
--   DELETE FROM public.accounts WHERE id = v_id;
--   GET DIAGNOSTICS v_deleted = ROW_COUNT;
--   IF v_deleted <> 1 THEN
--     RAISE EXCEPTION 'Expected to delete exactly 1 accounts row, deleted % (transaction aborted)', v_deleted;
--   END IF;
-- END $$;
-- COMMIT;

-- 3. VERIFY (read-only): expect account_rows = 0, personas = 0.
SELECT (SELECT count(*) FROM public.accounts a WHERE a.id = u.id) AS account_rows,
       (SELECT count(*) FROM public.personas p WHERE p.account_id = u.id) AS personas
FROM auth.users u WHERE u.email = 'REPLACE-WITH-USER-C-EMAIL';
