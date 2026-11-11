-- ============================================================================
-- Folioone M9  |  001-pro-plans.sql  |  schema: folioone
-- Free / PRO plans paid through Razorpay: who is on which plan, the payments that bought
-- PRO, the ONE narrow function allowed to grant PRO, and database enforcement of PRO-only
-- website and card designs.
--
-- STATUS:        PREPARED - NOT EXECUTED on any hosted project. Reviewed and run manually by
--                the developer in the Supabase SQL Editor (as postgres). `pnpm validate`
--                applies it to the LOCAL stack only.
-- Prerequisites: docs/sql/milestone-5 .. milestone-8 executed. Then run 002-billing-secret.sql
--                (by hand, with your own secret; never committed).
-- Repeatable?:   ONE-TIME. The preflight must show every column `true`; a second run fails
--                inside the transaction and rolls back.
-- Safety:        Touches only schema folioone. No roles, no service_role privileges, nothing
--                readable by anon. Existing RLS untouched.
--
-- !!! DELIBERATE EXCEPTION - REVIEW BEFORE RUNNING (AD-011) !!!
-- folioone.billing_activate_pro is SECURITY DEFINER: users must never be able to write their
-- own plan, so no table here grants INSERT/UPDATE of PRO to `authenticated`. The function:
--   * acts only for auth.uid() (never a user id from input);
--   * requires a proof = HMAC-SHA256(account|order|payment|amount|currency|days) keyed with a
--     secret held ONLY by the app server (FOLIOONE_ENTITLEMENT_SECRET) and by
--     folioone.billing_secrets (no grants, no policies). The server computes the proof only
--     after verifying the payment with Razorpay (signature, order owner, amount, captured);
--   * accepts only the two PRO prices (INR 29900 paise / USD 500 cents) and 30 days;
--   * records each Razorpay order and payment once (unique), so a payment cannot be reused.
--
-- Design:
--   account_plans    one row per account: plan 'free' | 'pro', pro_until. New accounts get a
--                    'free' row from a trigger on accounts; existing accounts are backfilled.
--                    Owner may SELECT; owner may INSERT only a free row; nobody else writes.
--   pro_payments     ledger of verified Razorpay payments (owner may SELECT).
--   billing_secrets  the entitlement secret (no access at all except the definer function).
--   has_pro()        SECURITY INVOKER: is the caller's PRO active right now?
--   enforce_pro_design()  trigger: choosing or publishing a PRO design requires has_pro().
--                    Keeping a PRO design chosen earlier (after PRO lapses) stays allowed;
--                    publishing it again does not. Lists below must match
--                    src/domains/billing/plans.ts (a test checks).
-- ============================================================================

-- Read-only preflight; every result must be true before continuing.
SELECT current_database() = 'postgres' AS expected_database,
       session_user = 'postgres' AS expected_session_role,
       (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS postgres_bypasses_rls,
       to_regprocedure('extensions.hmac(text, text, text)') IS NOT NULL AS pgcrypto_available,
       to_regclass('folioone.digital_cards') IS NOT NULL AS m8_applied,
       to_regclass('folioone.account_plans') IS NULL AS plans_absent,
       to_regclass('folioone.pro_payments') IS NULL AS payments_absent,
       to_regclass('folioone.billing_secrets') IS NULL AS secrets_absent;

BEGIN;

CREATE TABLE folioone.account_plans (
  account_id uuid PRIMARY KEY,
  plan text NOT NULL DEFAULT 'free',
  pro_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_plans_account_id_accounts_id_fk
    FOREIGN KEY (account_id) REFERENCES folioone.accounts(id) ON DELETE CASCADE,
  CONSTRAINT account_plans_plan_check CHECK (plan IN ('free', 'pro')),
  CONSTRAINT account_plans_pro_until_check CHECK (plan = 'free' OR pro_until IS NOT NULL)
);

CREATE TABLE folioone.pro_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  razorpay_order_id text NOT NULL,
  razorpay_payment_id text NOT NULL,
  amount integer NOT NULL,
  currency text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pro_payments_account_id_accounts_id_fk
    FOREIGN KEY (account_id) REFERENCES folioone.accounts(id) ON DELETE CASCADE,
  CONSTRAINT pro_payments_order_key UNIQUE (razorpay_order_id),
  CONSTRAINT pro_payments_payment_key UNIQUE (razorpay_payment_id),
  CONSTRAINT pro_payments_price_check CHECK (
    (currency = 'INR' AND amount = 29900) OR (currency = 'USD' AND amount = 500)),
  CONSTRAINT pro_payments_period_check CHECK (period_end > period_start)
);
CREATE INDEX pro_payments_account_id_idx ON folioone.pro_payments (account_id);

CREATE TABLE folioone.billing_secrets (
  name text PRIMARY KEY,
  secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_secrets_name_check CHECK (name = 'entitlement'),
  CONSTRAINT billing_secrets_secret_check CHECK (char_length(secret) >= 32)
);

ALTER TABLE folioone.account_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE folioone.account_plans FORCE ROW LEVEL SECURITY;
ALTER TABLE folioone.pro_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE folioone.pro_payments FORCE ROW LEVEL SECURITY;
ALTER TABLE folioone.billing_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE folioone.billing_secrets FORCE ROW LEVEL SECURITY;

-- Same ACL hygiene as the earlier files: strip default-ACL grants, then grant exactly what is needed.
DO $$
DECLARE
  grant_entry record;
BEGIN
  FOR grant_entry IN
    SELECT c.oid::regclass AS relation_name, pg_get_userbyid(acl.grantee) AS grantee_name
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) AS acl
    WHERE n.nspname = 'folioone'
      AND c.relname IN ('account_plans', 'pro_payments', 'billing_secrets')
      AND acl.grantee <> 0 AND acl.grantee <> c.relowner
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %s FROM %I',
                   grant_entry.relation_name, grant_entry.grantee_name);
  END LOOP;
END;
$$;
REVOKE ALL PRIVILEGES ON TABLE folioone.account_plans FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE folioone.pro_payments FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE folioone.billing_secrets FROM PUBLIC, anon, authenticated, service_role;

-- Owners read their own plan; they may create ONLY a free row for themselves (the accounts
-- trigger does this). No UPDATE or DELETE: PRO is written only by billing_activate_pro.
CREATE POLICY account_plans_select_own ON folioone.account_plans FOR SELECT TO authenticated
  USING (account_id = (SELECT auth.uid()));
CREATE POLICY account_plans_insert_free_own ON folioone.account_plans FOR INSERT TO authenticated
  WITH CHECK (account_id = (SELECT auth.uid()) AND plan = 'free' AND pro_until IS NULL);
GRANT SELECT, INSERT ON TABLE folioone.account_plans TO authenticated;

CREATE POLICY pro_payments_select_own ON folioone.pro_payments FOR SELECT TO authenticated
  USING (account_id = (SELECT auth.uid()));
GRANT SELECT ON TABLE folioone.pro_payments TO authenticated;
-- billing_secrets: no policies and no grants on purpose.

-- Every existing account starts on Free.
INSERT INTO folioone.account_plans (account_id)
SELECT id FROM folioone.accounts
ON CONFLICT (account_id) DO NOTHING;

-- New accounts get their Free row in the same transaction (runs as the signing-up user).
CREATE FUNCTION folioone.account_plans_create_free()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
BEGIN
  INSERT INTO folioone.account_plans (account_id) VALUES (NEW.id)
  ON CONFLICT (account_id) DO NOTHING;
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER accounts_create_free_plan_trg
  AFTER INSERT ON folioone.accounts
  FOR EACH ROW EXECUTE FUNCTION folioone.account_plans_create_free();

-- Is the caller's PRO active? (Reads their own row through RLS.)
CREATE FUNCTION folioone.has_pro()
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM folioone.account_plans
     WHERE account_id = (SELECT auth.uid()) AND plan = 'pro' AND pro_until > now());
$fn$;

-- PRO-only designs. TG_ARGV[0] = design column, TG_ARGV[1] = 'card' | 'website'.
-- Private tables: checked when a design is first set or changed. Published tables: checked
-- whenever a live snapshot is (re)published (published_at changes or is_live turns on).
-- Statements without a signed-in user (the developer in the SQL Editor) are not restricted.
CREATE FUNCTION folioone.enforce_pro_design()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE
  v_new jsonb := to_jsonb(NEW);
  v_old jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END;
  v_design text := v_new ->> TG_ARGV[0];
  v_relevant boolean;
  v_pro boolean;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_ARGV[1] = 'card' THEN
    v_pro := v_design = ANY (ARRAY['pinstripe', 'monogram', 'ledger', 'meridian', 'counsel', 'sage', 'blush', 'dune', 'vellum', 'lavender', 'aurora', 'neon', 'pop', 'bubble', 'grid', 'bauhaus', 'sunset', 'noir', 'gallery', 'studio', 'atelier', 'obsidian', 'terracotta', 'console', 'typewriter', 'blueprint']);
  ELSE
    v_pro := v_design = ANY (ARRAY['atelier', 'monograph', 'gazette', 'noir', 'meridian', 'console', 'gallery', 'bauhaus', 'sage', 'obsidian', 'grid', 'dune', 'folio-ink', 'coastal', 'studio', 'ledger', 'aurora', 'typewriter', 'vellum']);
  END IF;
  IF NOT v_pro THEN
    RETURN NEW;
  END IF;
  IF v_new ? 'is_live' THEN
    v_relevant := (v_new ->> 'is_live')::boolean AND (
      v_old IS NULL
      OR NOT (v_old ->> 'is_live')::boolean
      OR v_new -> 'published_at' IS DISTINCT FROM v_old -> 'published_at'
      OR v_new -> TG_ARGV[0] IS DISTINCT FROM v_old -> TG_ARGV[0]);
  ELSE
    v_relevant := v_old IS NULL OR v_new -> TG_ARGV[0] IS DISTINCT FROM v_old -> TG_ARGV[0];
  END IF;
  IF v_relevant AND NOT folioone.has_pro() THEN
    RAISE EXCEPTION 'This design is part of Folioone PRO' USING ERRCODE = 'PT402';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER digital_cards_pro_design_trg
  BEFORE INSERT OR UPDATE ON folioone.digital_cards
  FOR EACH ROW EXECUTE FUNCTION folioone.enforce_pro_design('design', 'card');
CREATE TRIGGER digital_card_published_pro_design_trg
  BEFORE INSERT OR UPDATE ON folioone.digital_card_published
  FOR EACH ROW EXECUTE FUNCTION folioone.enforce_pro_design('design', 'card');
CREATE TRIGGER website_sites_pro_design_trg
  BEFORE INSERT OR UPDATE ON folioone.website_sites
  FOR EACH ROW EXECUTE FUNCTION folioone.enforce_pro_design('theme', 'website');
CREATE TRIGGER website_published_pro_design_trg
  BEFORE INSERT OR UPDATE ON folioone.website_published
  FOR EACH ROW EXECUTE FUNCTION folioone.enforce_pro_design('theme', 'website');

-- The ONLY way to become PRO. See the header (AD-011) before changing anything here.
CREATE FUNCTION folioone.billing_activate_pro(
  p_order_id text, p_payment_id text, p_amount integer, p_currency text,
  p_days integer, p_proof text)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_secret text;
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'billing_activate_pro: sign in required' USING ERRCODE = '42501';
  END IF;
  IF p_days <> 30
     OR NOT ((p_currency = 'INR' AND p_amount = 29900) OR (p_currency = 'USD' AND p_amount = 500))
     OR p_order_id !~ '^[A-Za-z0-9_]{6,64}$' OR p_payment_id !~ '^[A-Za-z0-9_]{6,64}$' THEN
    RAISE EXCEPTION 'billing_activate_pro: invalid request' USING ERRCODE = '22023';
  END IF;

  SELECT secret INTO v_secret FROM folioone.billing_secrets WHERE name = 'entitlement';
  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'billing_activate_pro: not configured' USING ERRCODE = '55000';
  END IF;
  IF p_proof IS DISTINCT FROM encode(extensions.hmac(
       concat_ws('|', v_uid::text, p_order_id, p_payment_id, p_amount::text, p_currency, p_days::text),
       v_secret, 'sha256'), 'hex') THEN
    RAISE EXCEPTION 'billing_activate_pro: invalid proof' USING ERRCODE = '42501';
  END IF;

  -- One activation at a time per account.
  INSERT INTO folioone.account_plans (account_id) VALUES (v_uid) ON CONFLICT (account_id) DO NOTHING;
  SELECT GREATEST(now(), COALESCE(pro_until, now())) INTO v_start
    FROM folioone.account_plans WHERE account_id = v_uid FOR UPDATE;

  -- The same payment confirmed twice (retry, double click): same answer, no extra days.
  SELECT period_end INTO v_end FROM folioone.pro_payments
   WHERE account_id = v_uid AND razorpay_payment_id = p_payment_id AND razorpay_order_id = p_order_id;
  IF FOUND THEN
    RETURN v_end;
  END IF;

  v_end := v_start + make_interval(days => p_days);
  -- Unique order/payment ids: a payment used by another account raises 23505.
  INSERT INTO folioone.pro_payments
    (account_id, razorpay_order_id, razorpay_payment_id, amount, currency, period_start, period_end)
  VALUES (v_uid, p_order_id, p_payment_id, p_amount, p_currency, v_start, v_end);
  UPDATE folioone.account_plans
     SET plan = 'pro', pro_until = v_end, updated_at = now()
   WHERE account_id = v_uid;
  RETURN v_end;
END;
$fn$;

REVOKE ALL ON FUNCTION folioone.account_plans_create_free() FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION folioone.enforce_pro_design() FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION folioone.has_pro() FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION folioone.billing_activate_pro(text, text, integer, text, integer, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION folioone.has_pro() TO authenticated;
GRANT EXECUTE ON FUNCTION folioone.billing_activate_pro(text, text, integer, text, integer, text)
  TO authenticated;

COMMIT;

-- Post-execution verification (read-only). Expected:
--  1. 3 tables: owner postgres, RLS enabled AND forced; anon nothing; service_role nothing;
--     authenticated: account_plans SELECT+INSERT (no UPDATE/DELETE), pro_payments SELECT only,
--     billing_secrets nothing.
--  2. 3 policies: account_plans 2, pro_payments 1, billing_secrets 0.
--  3. 4 functions; ONLY billing_activate_pro is security_definer; all with empty search_path;
--     anon EXECUTE false on all.
--  4. 5 triggers (accounts + 4 design tables).
--  5. Every account has a plan row.
SELECT c.relname, pg_get_userbyid(c.relowner) AS owner, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_select,
       has_table_privilege('authenticated', c.oid, 'INSERT') AS auth_insert,
       has_table_privilege('authenticated', c.oid, 'UPDATE') AS auth_update,
       has_table_privilege('authenticated', c.oid, 'DELETE') AS auth_delete,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
       has_table_privilege('service_role', c.oid, 'SELECT') AS service_select
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'folioone' AND c.relname IN ('account_plans', 'pro_payments', 'billing_secrets') ORDER BY 1;

SELECT tablename, policyname, cmd, roles, qual, with_check FROM pg_policies
WHERE schemaname = 'folioone' AND tablename IN ('account_plans', 'pro_payments', 'billing_secrets') ORDER BY 1, 3, 2;

SELECT p.proname, p.prosecdef AS security_definer, p.proconfig,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec
FROM pg_proc p WHERE p.pronamespace = 'folioone'::regnamespace
  AND p.proname IN ('account_plans_create_free', 'enforce_pro_design', 'has_pro', 'billing_activate_pro') ORDER BY 1;

SELECT tgrelid::regclass, tgname FROM pg_trigger
WHERE tgname IN ('accounts_create_free_plan_trg', 'digital_cards_pro_design_trg', 'digital_card_published_pro_design_trg',
                 'website_sites_pro_design_trg', 'website_published_pro_design_trg') ORDER BY 2;

SELECT (SELECT count(*) FROM folioone.accounts) AS accounts,
       (SELECT count(*) FROM folioone.account_plans) AS plan_rows;

-- Who is on which plan (developer use in the SQL Editor):
-- SELECT u.email, p.plan, p.pro_until, p.pro_until > now() AS pro_active
-- FROM folioone.account_plans p JOIN auth.users u ON u.id = p.account_id ORDER BY p.plan DESC, u.email;

-- Rollback (DESTRUCTIVE: removes every plan and payment record). Only with approval.
-- BEGIN;
-- DROP TRIGGER accounts_create_free_plan_trg ON folioone.accounts;
-- DROP TRIGGER digital_cards_pro_design_trg ON folioone.digital_cards;
-- DROP TRIGGER digital_card_published_pro_design_trg ON folioone.digital_card_published;
-- DROP TRIGGER website_sites_pro_design_trg ON folioone.website_sites;
-- DROP TRIGGER website_published_pro_design_trg ON folioone.website_published;
-- DROP FUNCTION folioone.billing_activate_pro(text, text, integer, text, integer, text);
-- DROP FUNCTION folioone.enforce_pro_design();
-- DROP FUNCTION folioone.has_pro();
-- DROP FUNCTION folioone.account_plans_create_free();
-- DROP TABLE folioone.pro_payments;
-- DROP TABLE folioone.account_plans;
-- DROP TABLE folioone.billing_secrets;
-- COMMIT;
