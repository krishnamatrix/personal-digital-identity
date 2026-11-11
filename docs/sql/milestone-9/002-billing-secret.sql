-- ============================================================================
-- Folioone M9  |  002-billing-secret.sql  |  schema: folioone
-- Creates the entitlement secret that folioone.billing_activate_pro checks. The database
-- GENERATES it, so no secret is ever written in this repository.
--
-- STATUS:        PREPARED - NOT EXECUTED. Run by hand in the Supabase SQL Editor (as postgres)
--                AFTER 001-pro-plans.sql. NOT part of `pnpm validate`.
-- After running: copy the returned `secret` value into the app server's environment as
--                FOLIOONE_ENTITLEMENT_SECRET (Railway variables / .env.local), then clear the
--                SQL Editor result. Never commit it, never paste it into chat or tickets.
-- Repeatable?:   The INSERT runs once. To ROTATE, run the UPDATE below instead, then update
--                FOLIOONE_ENTITLEMENT_SECRET immediately (activations fail until both match).
-- ============================================================================

SELECT to_regclass('folioone.billing_secrets') IS NOT NULL AS m9_applied,
       NOT EXISTS (SELECT 1 FROM folioone.billing_secrets) AS no_secret_yet;

INSERT INTO folioone.billing_secrets (name, secret)
VALUES ('entitlement', encode(extensions.gen_random_bytes(32), 'hex'))
RETURNING secret;

-- Rotation (instead of the INSERT):
-- UPDATE folioone.billing_secrets
--    SET secret = encode(extensions.gen_random_bytes(32), 'hex'), created_at = now()
--  WHERE name = 'entitlement'
-- RETURNING secret;
