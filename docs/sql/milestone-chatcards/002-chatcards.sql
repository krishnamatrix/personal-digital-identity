-- ============================================================================
-- Folioone ChatCards  |  002-chatcards.sql  |  schema: folioone
-- ChatCards (PRO): shareable conversation invitations, activation codes, and private
-- one-to-one text conversations between a card owner and a recipient.
--
-- STATUS:        PREPARED - NOT EXECUTED on any hosted project. Reviewed and run manually by
--                the developer in the Supabase SQL Editor (as postgres). `pnpm validate`
--                applies it to the LOCAL stack only.
-- Prerequisites: milestone-9/001-pro-plans.sql (has_pro, account_plans) and
--                milestone-chatcards/001-chatcard-routes.sql executed.
-- Execution:     001 -> 002 (this file) -> 003.
-- Repeatable?:   ONE-TIME. The preflight must show every column `true`.
-- Safety:        Touches only schema folioone. No SECURITY DEFINER, no service_role privileges,
--                no custom roles. Every table has RLS enabled AND forced.
-- Design:        docs/architecture/chatcards.md (AD-017). Summary:
--
--   chat_cards                 owner-private card (draft/active/paused/archived). Writes need PRO
--                              (has_pro() in the policies, so the rule holds without the app).
--   chat_card_public           the published snapshot (AD-005). Readable by anyone ONLY when they
--                              present the card's random public id through
--                              chat_card_public_get(): there is no way to list cards. Never
--                              exposes account_id to anon.
--   chat_card_code_batches /   activation codes, stored as SHA-256 hashes only. The hash column is
--   chat_card_codes            not readable by any API role. A recipient can see a code row only
--                              inside chat_card_redeem(), and only the row whose hash they supplied.
--   chat_card_redemptions      who redeemed which code (the recipient's entitlement). Unique
--                              (code_id, slot) makes redemption atomic: two people racing for the
--                              last use cannot both succeed. Kept for audit (no DELETE grant).
--   chat_card_redeem_attempts  every redemption attempt, written inside chat_card_redeem() before
--                              anything is checked: the rate limit cannot be skipped.
--   conversations              one owner + one recipient, from one card. requested -> active |
--                              declined; active -> closed. Transitions checked by a trigger.
--   conversation_messages      text only, 1-2000 characters, server timestamps, identity ordering.
--   conversation_blocks        a participant blocks the other; the owner's block stops new requests.
--   conversation_reports       a participant reports a conversation or message (operator review).
--
-- !!! DELIBERATE EXPOSURE CHANGES - REVIEW BEFORE RUNNING !!!
--   1. anon and authenticated may EXECUTE chat_card_public_get(public_id). It returns one live
--      card's public fields (never account_id to anon) and nothing for an unknown id.
--   2. A conversation participant can read the other participant's account uuid on the
--      conversation row (owner_id / recipient_id). The app never renders it.
--   3. Owner PRO lapse: chat_card_public.owner_pro_until mirrors the owner's paid period. After
--      it passes, nobody can start a conversation, redeem a code or send a message on that
--      owner's cards; history stays readable to both participants and nothing is deleted.
-- ============================================================================

-- Read-only preflight; every result must be true before continuing.
SELECT current_database() = 'postgres' AS expected_database,
       session_user = 'postgres' AS expected_session_role,
       to_regprocedure('folioone.has_pro()') IS NOT NULL AS m9_applied,
       (SELECT pg_get_constraintdef(oid) FROM pg_constraint
         WHERE conname = 'website_sites_slug_check') LIKE '%''chatcards''%' AS chatcards_001_applied,
       to_regclass('folioone.chat_cards') IS NULL AS chat_cards_absent,
       to_regclass('folioone.conversations') IS NULL AS conversations_absent;

BEGIN;

-- --------------------------------------------------------------------------
-- 1. Tables
-- --------------------------------------------------------------------------

CREATE TABLE folioone.chat_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL DEFAULT auth.uid(),
  public_id text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  status text NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  description text,
  host_name text NOT NULL,
  welcome_message text,
  cover_image_url text,
  persona_id uuid,
  link_kind text,
  access_policy text NOT NULL DEFAULT 'approval',
  auto_accept boolean NOT NULL DEFAULT false,
  accepting_new boolean NOT NULL DEFAULT true,
  allow_follow_ups boolean NOT NULL DEFAULT true,
  max_active_conversations integer,
  max_conversations_per_recipient integer NOT NULL DEFAULT 1,
  expires_at timestamptz,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_cards_account_id_accounts_id_fk
    FOREIGN KEY (account_id) REFERENCES folioone.accounts(id) ON DELETE CASCADE,
  CONSTRAINT chat_cards_public_id_key UNIQUE (public_id),
  CONSTRAINT chat_cards_public_id_check CHECK (public_id ~ '^[0-9a-f]{32}$'),
  CONSTRAINT chat_cards_status_check CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  CONSTRAINT chat_cards_title_check CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  CONSTRAINT chat_cards_description_check CHECK (description IS NULL OR char_length(description) <= 1000),
  CONSTRAINT chat_cards_host_name_check CHECK (char_length(btrim(host_name)) BETWEEN 1 AND 80),
  CONSTRAINT chat_cards_welcome_check CHECK (welcome_message IS NULL OR char_length(welcome_message) <= 1000),
  CONSTRAINT chat_cards_cover_check CHECK (cover_image_url IS NULL OR
    (cover_image_url ~ '^https://' AND char_length(cover_image_url) <= 2000)),
  CONSTRAINT chat_cards_link_kind_check CHECK (link_kind IS NULL OR link_kind IN ('website', 'card')),
  CONSTRAINT chat_cards_access_policy_check CHECK (access_policy IN ('open', 'approval', 'verified')),
  CONSTRAINT chat_cards_approval_manual_check CHECK (access_policy <> 'approval' OR NOT auto_accept),
  CONSTRAINT chat_cards_max_active_check CHECK (max_active_conversations IS NULL OR
    max_active_conversations BETWEEN 1 AND 10000),
  CONSTRAINT chat_cards_max_per_recipient_check CHECK (max_conversations_per_recipient BETWEEN 1 AND 20)
);
CREATE INDEX chat_cards_account_idx ON folioone.chat_cards (account_id, created_at DESC);

CREATE TABLE folioone.chat_card_public (
  card_id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  public_id text NOT NULL,
  status text NOT NULL,
  title text NOT NULL,
  description text,
  host_name text NOT NULL,
  welcome_message text,
  cover_image_url text,
  link_path text,
  access_policy text NOT NULL,
  auto_accept boolean NOT NULL,
  accepting_new boolean NOT NULL,
  allow_follow_ups boolean NOT NULL,
  max_conversations_per_recipient integer NOT NULL,
  expires_at timestamptz,
  owner_pro_until timestamptz,
  published_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_card_public_card_fk
    FOREIGN KEY (card_id) REFERENCES folioone.chat_cards(id) ON DELETE CASCADE,
  CONSTRAINT chat_card_public_account_fk
    FOREIGN KEY (account_id) REFERENCES folioone.accounts(id) ON DELETE CASCADE,
  CONSTRAINT chat_card_public_public_id_key UNIQUE (public_id),
  CONSTRAINT chat_card_public_status_check CHECK (status IN ('active', 'paused', 'archived')),
  CONSTRAINT chat_card_public_title_check CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  CONSTRAINT chat_card_public_description_check CHECK (description IS NULL OR char_length(description) <= 1000),
  CONSTRAINT chat_card_public_host_name_check CHECK (char_length(btrim(host_name)) BETWEEN 1 AND 80),
  CONSTRAINT chat_card_public_welcome_check CHECK (welcome_message IS NULL OR char_length(welcome_message) <= 1000),
  CONSTRAINT chat_card_public_cover_check CHECK (cover_image_url IS NULL OR
    (cover_image_url ~ '^https://' AND char_length(cover_image_url) <= 2000)),
  CONSTRAINT chat_card_public_link_path_check CHECK (link_path IS NULL OR
    link_path ~ '^/(social/)?[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT chat_card_public_access_policy_check CHECK (access_policy IN ('open', 'approval', 'verified')),
  CONSTRAINT chat_card_public_max_per_recipient_check CHECK (max_conversations_per_recipient BETWEEN 1 AND 20)
);
CREATE INDEX chat_card_public_account_idx ON folioone.chat_card_public (account_id);

CREATE TABLE folioone.chat_card_code_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL,
  label text NOT NULL,
  code_count integer NOT NULL,
  max_redemptions integer NOT NULL DEFAULT 1,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_card_code_batches_card_fk
    FOREIGN KEY (card_id) REFERENCES folioone.chat_cards(id) ON DELETE CASCADE,
  CONSTRAINT chat_card_code_batches_label_check CHECK (char_length(btrim(label)) BETWEEN 1 AND 80),
  CONSTRAINT chat_card_code_batches_count_check CHECK (code_count BETWEEN 1 AND 500),
  CONSTRAINT chat_card_code_batches_max_check CHECK (max_redemptions BETWEEN 1 AND 25)
);
CREATE INDEX chat_card_code_batches_card_idx ON folioone.chat_card_code_batches (card_id, created_at DESC);

CREATE TABLE folioone.chat_card_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  code_hash text NOT NULL,
  hint text NOT NULL,
  max_redemptions integer NOT NULL DEFAULT 1,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_card_codes_card_fk
    FOREIGN KEY (card_id) REFERENCES folioone.chat_cards(id) ON DELETE CASCADE,
  CONSTRAINT chat_card_codes_batch_fk
    FOREIGN KEY (batch_id) REFERENCES folioone.chat_card_code_batches(id) ON DELETE CASCADE,
  CONSTRAINT chat_card_codes_hash_key UNIQUE (code_hash),
  CONSTRAINT chat_card_codes_hash_check CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT chat_card_codes_hint_check CHECK (hint ~ '^[0-9A-Z]{4}$'),
  CONSTRAINT chat_card_codes_max_check CHECK (max_redemptions BETWEEN 1 AND 25)
);
CREATE INDEX chat_card_codes_batch_idx ON folioone.chat_card_codes (batch_id);
CREATE INDEX chat_card_codes_card_idx ON folioone.chat_card_codes (card_id);

CREATE TABLE folioone.chat_card_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id uuid NOT NULL,
  card_id uuid NOT NULL,
  -- SET NULL keeps the audit row (a use of the code) if the recipient deletes their account.
  recipient_id uuid DEFAULT auth.uid(),
  slot integer NOT NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_card_redemptions_code_fk
    FOREIGN KEY (code_id) REFERENCES folioone.chat_card_codes(id) ON DELETE CASCADE,
  CONSTRAINT chat_card_redemptions_card_fk
    FOREIGN KEY (card_id) REFERENCES folioone.chat_cards(id) ON DELETE CASCADE,
  CONSTRAINT chat_card_redemptions_recipient_fk
    FOREIGN KEY (recipient_id) REFERENCES folioone.accounts(id) ON DELETE SET NULL,
  CONSTRAINT chat_card_redemptions_code_slot_key UNIQUE (code_id, slot),
  CONSTRAINT chat_card_redemptions_code_recipient_key UNIQUE (code_id, recipient_id),
  CONSTRAINT chat_card_redemptions_slot_check CHECK (slot BETWEEN 1 AND 25)
);
CREATE INDEX chat_card_redemptions_card_recipient_idx
  ON folioone.chat_card_redemptions (card_id, recipient_id);

CREATE TABLE folioone.chat_card_redeem_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id uuid NOT NULL DEFAULT auth.uid(),
  attempted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_card_redeem_attempts_account_fk
    FOREIGN KEY (account_id) REFERENCES folioone.accounts(id) ON DELETE CASCADE
);
CREATE INDEX chat_card_redeem_attempts_account_idx
  ON folioone.chat_card_redeem_attempts (account_id, attempted_at DESC);

CREATE TABLE folioone.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  recipient_id uuid NOT NULL DEFAULT auth.uid(),
  redemption_id uuid,
  recipient_name text NOT NULL,
  status text NOT NULL DEFAULT 'requested',
  close_reason text,
  closed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  closed_at timestamptz,
  owner_last_read_at timestamptz,
  recipient_last_read_at timestamptz,
  CONSTRAINT conversations_card_fk
    FOREIGN KEY (card_id) REFERENCES folioone.chat_cards(id) ON DELETE CASCADE,
  CONSTRAINT conversations_owner_fk
    FOREIGN KEY (owner_id) REFERENCES folioone.accounts(id) ON DELETE CASCADE,
  CONSTRAINT conversations_recipient_fk
    FOREIGN KEY (recipient_id) REFERENCES folioone.accounts(id) ON DELETE CASCADE,
  CONSTRAINT conversations_redemption_fk
    FOREIGN KEY (redemption_id) REFERENCES folioone.chat_card_redemptions(id) ON DELETE SET NULL,
  CONSTRAINT conversations_two_people_check CHECK (owner_id <> recipient_id),
  CONSTRAINT conversations_recipient_name_check CHECK (char_length(btrim(recipient_name)) BETWEEN 1 AND 80),
  CONSTRAINT conversations_status_check CHECK (status IN ('requested', 'active', 'declined', 'closed')),
  CONSTRAINT conversations_close_reason_check CHECK (close_reason IS NULL OR close_reason IN ('closed', 'left', 'blocked')),
  CONSTRAINT conversations_closed_by_check CHECK (closed_by IS NULL OR closed_by IN ('owner', 'recipient'))
);
CREATE INDEX conversations_owner_idx ON folioone.conversations (owner_id, created_at DESC);
CREATE INDEX conversations_recipient_idx ON folioone.conversations (recipient_id, created_at DESC);
CREATE INDEX conversations_card_idx ON folioone.conversations (card_id, status);

CREATE TABLE folioone.conversation_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id uuid NOT NULL,
  sender_id uuid NOT NULL DEFAULT auth.uid(),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_messages_conversation_fk
    FOREIGN KEY (conversation_id) REFERENCES folioone.conversations(id) ON DELETE CASCADE,
  CONSTRAINT conversation_messages_sender_fk
    FOREIGN KEY (sender_id) REFERENCES folioone.accounts(id) ON DELETE CASCADE,
  CONSTRAINT conversation_messages_body_check CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000)
);
CREATE INDEX conversation_messages_conversation_idx ON folioone.conversation_messages (conversation_id, id DESC);
CREATE INDEX conversation_messages_sender_idx ON folioone.conversation_messages (sender_id, created_at DESC);

CREATE TABLE folioone.conversation_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL DEFAULT auth.uid(),
  blocked_id uuid NOT NULL,
  conversation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_blocks_blocker_fk
    FOREIGN KEY (blocker_id) REFERENCES folioone.accounts(id) ON DELETE CASCADE,
  CONSTRAINT conversation_blocks_blocked_fk
    FOREIGN KEY (blocked_id) REFERENCES folioone.accounts(id) ON DELETE CASCADE,
  CONSTRAINT conversation_blocks_conversation_fk
    FOREIGN KEY (conversation_id) REFERENCES folioone.conversations(id) ON DELETE SET NULL,
  CONSTRAINT conversation_blocks_pair_key UNIQUE (blocker_id, blocked_id),
  CONSTRAINT conversation_blocks_two_people_check CHECK (blocker_id <> blocked_id)
);
CREATE INDEX conversation_blocks_blocked_idx ON folioone.conversation_blocks (blocked_id);

CREATE TABLE folioone.conversation_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  message_id bigint,
  reporter_id uuid NOT NULL DEFAULT auth.uid(),
  reason text NOT NULL,
  details text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_reports_conversation_fk
    FOREIGN KEY (conversation_id) REFERENCES folioone.conversations(id) ON DELETE CASCADE,
  CONSTRAINT conversation_reports_message_fk
    FOREIGN KEY (message_id) REFERENCES folioone.conversation_messages(id) ON DELETE SET NULL,
  CONSTRAINT conversation_reports_reporter_fk
    FOREIGN KEY (reporter_id) REFERENCES folioone.accounts(id) ON DELETE CASCADE,
  CONSTRAINT conversation_reports_reason_check CHECK (reason IN
    ('spam', 'harassment', 'inappropriate', 'impersonation', 'other')),
  CONSTRAINT conversation_reports_details_check CHECK (details IS NULL OR char_length(details) <= 1000)
);
CREATE INDEX conversation_reports_conversation_idx ON folioone.conversation_reports (conversation_id);

-- --------------------------------------------------------------------------
-- 2. RLS on, forced; start from no privileges at all
-- --------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['chat_cards', 'chat_card_public', 'chat_card_code_batches', 'chat_card_codes',
                           'chat_card_redemptions', 'chat_card_redeem_attempts', 'conversations',
                           'conversation_messages', 'conversation_blocks', 'conversation_reports']
  LOOP
    EXECUTE format('ALTER TABLE folioone.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE folioone.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE folioone.%I FROM PUBLIC, anon, authenticated, service_role', t);
  END LOOP;
END;
$$;

-- --------------------------------------------------------------------------
-- 3. Policies and column grants
-- --------------------------------------------------------------------------

-- chat_cards: owner only; every write needs active PRO.
CREATE POLICY chat_cards_select_own ON folioone.chat_cards FOR SELECT TO authenticated
  USING (account_id = (SELECT auth.uid()));
CREATE POLICY chat_cards_insert_pro ON folioone.chat_cards FOR INSERT TO authenticated
  WITH CHECK (account_id = (SELECT auth.uid()) AND (SELECT folioone.has_pro()));
CREATE POLICY chat_cards_update_pro ON folioone.chat_cards FOR UPDATE TO authenticated
  USING (account_id = (SELECT auth.uid()))
  WITH CHECK (account_id = (SELECT auth.uid()) AND (SELECT folioone.has_pro()));
GRANT SELECT ON TABLE folioone.chat_cards TO authenticated;
GRANT INSERT (title, description, host_name, welcome_message, cover_image_url, persona_id, link_kind,
              access_policy, auto_accept, accepting_new, allow_follow_ups, max_active_conversations,
              max_conversations_per_recipient, expires_at)
  ON TABLE folioone.chat_cards TO authenticated;
GRANT UPDATE (title, description, host_name, welcome_message, cover_image_url, persona_id, link_kind,
              access_policy, auto_accept, accepting_new, allow_follow_ups, max_active_conversations,
              max_conversations_per_recipient, expires_at, status, published_at, archived_at, updated_at)
  ON TABLE folioone.chat_cards TO authenticated;

-- chat_card_public: only by public id (inside chat_card_public_get), or by its owner, or by
-- someone who already redeemed a code / has a conversation on this card.
CREATE POLICY chat_card_public_select_by_id ON folioone.chat_card_public FOR SELECT TO anon
  USING (public_id = current_setting('folioone.chat_card', true) AND status IN ('active', 'paused'));
CREATE POLICY chat_card_public_select_member ON folioone.chat_card_public FOR SELECT TO authenticated
  USING (
    (public_id = current_setting('folioone.chat_card', true) AND status IN ('active', 'paused'))
    OR account_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM folioone.conversations c
               WHERE c.card_id = chat_card_public.card_id AND c.recipient_id = (SELECT auth.uid()))
    OR EXISTS (SELECT 1 FROM folioone.chat_card_redemptions r
               WHERE r.card_id = chat_card_public.card_id AND r.recipient_id = (SELECT auth.uid())));
CREATE POLICY chat_card_public_insert_pro ON folioone.chat_card_public FOR INSERT TO authenticated
  WITH CHECK (account_id = (SELECT auth.uid()) AND (SELECT folioone.has_pro())
    AND EXISTS (SELECT 1 FROM folioone.chat_cards c
                WHERE c.id = card_id AND c.account_id = (SELECT auth.uid()) AND c.public_id = chat_card_public.public_id));
CREATE POLICY chat_card_public_update_pro ON folioone.chat_card_public FOR UPDATE TO authenticated
  USING (account_id = (SELECT auth.uid()))
  WITH CHECK (account_id = (SELECT auth.uid()) AND (SELECT folioone.has_pro())
    AND EXISTS (SELECT 1 FROM folioone.chat_cards c
                WHERE c.id = card_id AND c.account_id = (SELECT auth.uid()) AND c.public_id = chat_card_public.public_id));
GRANT SELECT (card_id, public_id, status, title, description, host_name, welcome_message, cover_image_url,
              link_path, access_policy, auto_accept, accepting_new, allow_follow_ups,
              max_conversations_per_recipient, expires_at, owner_pro_until, published_at, updated_at)
  ON TABLE folioone.chat_card_public TO anon;
GRANT SELECT, INSERT, UPDATE ON TABLE folioone.chat_card_public TO authenticated;

-- Code batches: owner only, PRO to create.
CREATE POLICY chat_card_code_batches_select_own ON folioone.chat_card_code_batches FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM folioone.chat_cards c WHERE c.id = card_id AND c.account_id = (SELECT auth.uid())));
CREATE POLICY chat_card_code_batches_insert_pro ON folioone.chat_card_code_batches FOR INSERT TO authenticated
  WITH CHECK ((SELECT folioone.has_pro())
    AND EXISTS (SELECT 1 FROM folioone.chat_cards c WHERE c.id = card_id AND c.account_id = (SELECT auth.uid())));
GRANT SELECT ON TABLE folioone.chat_card_code_batches TO authenticated;
GRANT INSERT (card_id, label, code_count, max_redemptions, expires_at)
  ON TABLE folioone.chat_card_code_batches TO authenticated;

-- Codes: the owner sees and revokes their codes (never the hash: it is not granted to anyone);
-- a redeemer sees only the one row whose hash chat_card_redeem() put in folioone.code_hash.
CREATE POLICY chat_card_codes_select ON folioone.chat_card_codes FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM folioone.chat_cards c WHERE c.id = card_id AND c.account_id = (SELECT auth.uid()))
    OR code_hash = current_setting('folioone.code_hash', true));
CREATE POLICY chat_card_codes_insert_pro ON folioone.chat_card_codes FOR INSERT TO authenticated
  WITH CHECK ((SELECT folioone.has_pro())
    AND EXISTS (SELECT 1 FROM folioone.chat_cards c WHERE c.id = card_id AND c.account_id = (SELECT auth.uid()))
    AND EXISTS (SELECT 1 FROM folioone.chat_card_code_batches b WHERE b.id = batch_id AND b.card_id = chat_card_codes.card_id));
CREATE POLICY chat_card_codes_update_pro ON folioone.chat_card_codes FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM folioone.chat_cards c WHERE c.id = card_id AND c.account_id = (SELECT auth.uid())))
  WITH CHECK ((SELECT folioone.has_pro())
    AND EXISTS (SELECT 1 FROM folioone.chat_cards c WHERE c.id = card_id AND c.account_id = (SELECT auth.uid())));
GRANT SELECT (id, card_id, batch_id, hint, max_redemptions, expires_at, revoked_at, created_at)
  ON TABLE folioone.chat_card_codes TO authenticated;
GRANT INSERT (card_id, batch_id, code_hash, hint, max_redemptions, expires_at)
  ON TABLE folioone.chat_card_codes TO authenticated;
GRANT UPDATE (revoked_at) ON TABLE folioone.chat_card_codes TO authenticated;

-- Redemptions: a recipient inserts only through chat_card_redeem() (the code row is invisible
-- otherwise, so the trigger refuses); they read their own, the card owner reads all of theirs.
CREATE POLICY chat_card_redemptions_select ON folioone.chat_card_redemptions FOR SELECT TO authenticated
  USING (recipient_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM folioone.chat_cards c WHERE c.id = card_id AND c.account_id = (SELECT auth.uid())));
-- (The code, card and PRO checks live in chat_card_redemptions_before_insert: a policy that
-- read chat_card_public here would recurse through that table's own policy.)
CREATE POLICY chat_card_redemptions_insert_own ON folioone.chat_card_redemptions FOR INSERT TO authenticated
  WITH CHECK (recipient_id = (SELECT auth.uid()));
GRANT SELECT ON TABLE folioone.chat_card_redemptions TO authenticated;
GRANT INSERT (code_id, card_id, recipient_id, slot) ON TABLE folioone.chat_card_redemptions TO authenticated;

-- Attempts: own rows only (the rate limit counts them).
CREATE POLICY chat_card_redeem_attempts_select_own ON folioone.chat_card_redeem_attempts FOR SELECT TO authenticated
  USING (account_id = (SELECT auth.uid()));
CREATE POLICY chat_card_redeem_attempts_insert_own ON folioone.chat_card_redeem_attempts FOR INSERT TO authenticated
  WITH CHECK (account_id = (SELECT auth.uid()));
GRANT SELECT ON TABLE folioone.chat_card_redeem_attempts TO authenticated;
GRANT INSERT (account_id) ON TABLE folioone.chat_card_redeem_attempts TO authenticated;

-- Conversations: the two participants only. Who may START one (live card, owner has PRO, not
-- blocked, redeemed code when required, 'active' only on auto-accept cards) is checked by
-- conversations_before_insert, which cannot be skipped.
CREATE POLICY conversations_select_participant ON folioone.conversations FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()) OR recipient_id = (SELECT auth.uid()));
CREATE POLICY conversations_insert_recipient ON folioone.conversations FOR INSERT TO authenticated
  WITH CHECK (recipient_id = (SELECT auth.uid()) AND status IN ('requested', 'active'));
CREATE POLICY conversations_update_participant ON folioone.conversations FOR UPDATE TO authenticated
  USING (owner_id = (SELECT auth.uid()) OR recipient_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()) OR recipient_id = (SELECT auth.uid()));
GRANT SELECT ON TABLE folioone.conversations TO authenticated;
GRANT INSERT (card_id, owner_id, recipient_id, recipient_name, status) ON TABLE folioone.conversations TO authenticated;
GRANT UPDATE (status, close_reason, owner_last_read_at, recipient_last_read_at)
  ON TABLE folioone.conversations TO authenticated;

-- Messages: participants read; a participant writes into an active conversation (the recipient
-- also writes the single opening message of a request). The trigger adds: nothing is sent once
-- the owner's PRO has lapsed, the opening-message and follow-up rules, and the flood limit.
-- sender_id defaults to auth.uid() and is not insertable, so it cannot be forged.
CREATE POLICY conversation_messages_select_participant ON folioone.conversation_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM folioone.conversations c
                 WHERE c.id = conversation_id
                   AND (c.owner_id = (SELECT auth.uid()) OR c.recipient_id = (SELECT auth.uid()))));
CREATE POLICY conversation_messages_insert_participant ON folioone.conversation_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM folioone.conversations c
      WHERE c.id = conversation_id
        AND ((c.status = 'active' AND (c.owner_id = (SELECT auth.uid()) OR c.recipient_id = (SELECT auth.uid())))
          OR (c.status = 'requested' AND c.recipient_id = (SELECT auth.uid())))));
GRANT SELECT ON TABLE folioone.conversation_messages TO authenticated;
GRANT INSERT (conversation_id, body) ON TABLE folioone.conversation_messages TO authenticated;

-- Blocks: you can block only the other participant of one of your conversations.
CREATE POLICY conversation_blocks_select_own ON folioone.conversation_blocks FOR SELECT TO authenticated
  USING (blocker_id = (SELECT auth.uid()) OR blocked_id = (SELECT auth.uid()));
CREATE POLICY conversation_blocks_insert_participant ON folioone.conversation_blocks FOR INSERT TO authenticated
  WITH CHECK (blocker_id = (SELECT auth.uid())
    AND EXISTS (SELECT 1 FROM folioone.conversations c
                WHERE c.id = conversation_id
                  AND ((c.owner_id = (SELECT auth.uid()) AND c.recipient_id = blocked_id)
                    OR (c.recipient_id = (SELECT auth.uid()) AND c.owner_id = blocked_id))));
CREATE POLICY conversation_blocks_delete_own ON folioone.conversation_blocks FOR DELETE TO authenticated
  USING (blocker_id = (SELECT auth.uid()));
GRANT SELECT, DELETE ON TABLE folioone.conversation_blocks TO authenticated;
GRANT INSERT (blocked_id, conversation_id) ON TABLE folioone.conversation_blocks TO authenticated;

-- Reports: a participant files one; only the reporter can read it back. Reviewed by the
-- operator in the SQL Editor (no in-app moderation queue in this milestone).
CREATE POLICY conversation_reports_select_own ON folioone.conversation_reports FOR SELECT TO authenticated
  USING (reporter_id = (SELECT auth.uid()));
CREATE POLICY conversation_reports_insert_participant ON folioone.conversation_reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = (SELECT auth.uid())
    AND EXISTS (SELECT 1 FROM folioone.conversations c
                WHERE c.id = conversation_id
                  AND (c.owner_id = (SELECT auth.uid()) OR c.recipient_id = (SELECT auth.uid())))
    AND (message_id IS NULL OR EXISTS (SELECT 1 FROM folioone.conversation_messages m
                                       WHERE m.id = message_id AND m.conversation_id = conversation_reports.conversation_id)));
GRANT SELECT ON TABLE folioone.conversation_reports TO authenticated;
GRANT INSERT (conversation_id, message_id, reason, details) ON TABLE folioone.conversation_reports TO authenticated;

-- --------------------------------------------------------------------------
-- 4. Triggers (all SECURITY INVOKER, empty search_path)
-- --------------------------------------------------------------------------

-- Archived is final; status timestamps are server-set.
CREATE FUNCTION folioone.chat_cards_before_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
BEGIN
  IF OLD.status = 'archived' AND NEW.status <> 'archived' THEN
    RAISE EXCEPTION 'chat card is archived' USING ERRCODE = 'PT409';
  END IF;
  IF NEW.status = 'active' AND OLD.published_at IS NULL THEN
    NEW.published_at := now();
  END IF;
  IF NEW.status = 'archived' AND OLD.status <> 'archived' THEN
    NEW.archived_at := now();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER chat_cards_before_update BEFORE UPDATE ON folioone.chat_cards
  FOR EACH ROW EXECUTE FUNCTION folioone.chat_cards_before_update();

-- The snapshot's owner_pro_until always comes from the writer's own plan row, never the client.
CREATE FUNCTION folioone.chat_card_public_sync_pro()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
BEGIN
  NEW.owner_pro_until := (SELECT ap.pro_until FROM folioone.account_plans ap
                          WHERE ap.account_id = (SELECT auth.uid()) AND ap.plan = 'pro');
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER chat_card_public_sync_pro BEFORE INSERT OR UPDATE ON folioone.chat_card_public
  FOR EACH ROW EXECUTE FUNCTION folioone.chat_card_public_sync_pro();

-- New conversation: everything that decides whether this person may start one, plus server
-- timestamps, the entitlement link, the request rate limit and the per-recipient limit. Reads
-- only rows the recipient can see under RLS. Refusals are deliberately generic (42501).
CREATE FUNCTION folioone.conversations_before_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_card record;
BEGIN
  SELECT p.account_id, p.status, p.accepting_new, p.expires_at, p.owner_pro_until, p.auto_accept,
         p.access_policy, p.max_conversations_per_recipient
    INTO v_card
    FROM folioone.chat_card_public p WHERE p.card_id = NEW.card_id;
  IF NOT FOUND OR v_card.account_id = v_uid OR v_card.status <> 'active' OR NOT v_card.accepting_new
     OR (v_card.expires_at IS NOT NULL AND v_card.expires_at <= now())
     OR v_card.owner_pro_until IS NULL OR v_card.owner_pro_until <= now()
     OR (NEW.status = 'active' AND NOT v_card.auto_accept)
     OR EXISTS (SELECT 1 FROM folioone.conversation_blocks b
                WHERE b.blocker_id = v_card.account_id AND b.blocked_id = v_uid) THEN
    RAISE EXCEPTION 'chat card not available' USING ERRCODE = '42501';
  END IF;
  NEW.redemption_id := (SELECT r.id FROM folioone.chat_card_redemptions r
                        WHERE r.card_id = NEW.card_id AND r.recipient_id = v_uid
                        ORDER BY r.redeemed_at DESC LIMIT 1);
  IF v_card.access_policy = 'verified' AND NEW.redemption_id IS NULL THEN
    RAISE EXCEPTION 'activation code required' USING ERRCODE = '42501';
  END IF;
  IF (SELECT count(*) FROM folioone.conversations
      WHERE recipient_id = v_uid AND created_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'too many conversation requests' USING ERRCODE = 'PT429';
  END IF;
  IF (SELECT count(*) FROM folioone.conversations
      WHERE recipient_id = v_uid AND card_id = NEW.card_id AND status <> 'declined')
     >= v_card.max_conversations_per_recipient THEN
    RAISE EXCEPTION 'conversation limit reached for this card' USING ERRCODE = 'PT409';
  END IF;
  NEW.owner_id := v_card.account_id;
  NEW.recipient_id := v_uid;
  NEW.created_at := now();
  NEW.accepted_at := CASE WHEN NEW.status = 'active' THEN now() END;
  NEW.closed_at := NULL;
  NEW.closed_by := NULL;
  NEW.close_reason := NULL;
  NEW.owner_last_read_at := NULL;
  NEW.recipient_last_read_at := now();
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER conversations_before_insert BEFORE INSERT ON folioone.conversations
  FOR EACH ROW EXECUTE FUNCTION folioone.conversations_before_insert();

-- Lifecycle: owner accepts (needs PRO, respects the card's active limit) or declines a request,
-- or closes; recipient leaves; either side may close because of a block. Nothing reopens. Each
-- side can only move its own read marker.
CREATE FUNCTION folioone.conversations_before_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_max integer;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status OR NEW.close_reason IS DISTINCT FROM OLD.close_reason THEN
    IF OLD.status IN ('declined', 'closed') THEN
      RAISE EXCEPTION 'conversation is closed' USING ERRCODE = 'PT409';
    END IF;
    IF v_uid = OLD.owner_id THEN
      IF OLD.status = 'requested' AND NEW.status = 'active' THEN
        IF NOT folioone.has_pro() THEN
          RAISE EXCEPTION 'PRO required to accept conversations' USING ERRCODE = 'PT402';
        END IF;
        SELECT c.max_active_conversations INTO v_max FROM folioone.chat_cards c WHERE c.id = OLD.card_id;
        IF v_max IS NOT NULL AND (SELECT count(*) FROM folioone.conversations
                                  WHERE card_id = OLD.card_id AND status = 'active') >= v_max THEN
          RAISE EXCEPTION 'active conversation limit reached' USING ERRCODE = 'PT409';
        END IF;
        NEW.close_reason := NULL;
        NEW.accepted_at := now();
      ELSIF OLD.status = 'requested' AND NEW.status = 'declined' THEN
        NEW.close_reason := NULL;
        NEW.closed_by := 'owner';
        NEW.closed_at := now();
      ELSIF NEW.status = 'closed' AND NEW.close_reason IN ('closed', 'blocked') THEN
        NEW.closed_by := 'owner';
        NEW.closed_at := now();
      ELSE
        RAISE EXCEPTION 'invalid conversation change' USING ERRCODE = 'PT409';
      END IF;
    ELSIF v_uid = OLD.recipient_id THEN
      IF NEW.status = 'closed' AND NEW.close_reason IN ('left', 'blocked') THEN
        NEW.closed_by := 'recipient';
        NEW.closed_at := now();
      ELSE
        RAISE EXCEPTION 'invalid conversation change' USING ERRCODE = 'PT409';
      END IF;
    ELSE
      RAISE EXCEPTION 'not a participant' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NEW.owner_last_read_at IS DISTINCT FROM OLD.owner_last_read_at THEN
    IF v_uid <> OLD.owner_id THEN
      RAISE EXCEPTION 'not your read marker' USING ERRCODE = '42501';
    END IF;
    NEW.owner_last_read_at := now();
  END IF;
  IF NEW.recipient_last_read_at IS DISTINCT FROM OLD.recipient_last_read_at THEN
    IF v_uid <> OLD.recipient_id THEN
      RAISE EXCEPTION 'not your read marker' USING ERRCODE = '42501';
    END IF;
    NEW.recipient_last_read_at := now();
  END IF;
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER conversations_before_update BEFORE UPDATE ON folioone.conversations
  FOR EACH ROW EXECUTE FUNCTION folioone.conversations_before_update();

-- Redemption: the code must be visible to the caller (only inside chat_card_redeem(), which puts
-- its hash in folioone.code_hash), unrevoked, unexpired, with this use still free, on a live
-- verified card whose owner has PRO and is not the caller.
CREATE FUNCTION folioone.chat_card_redemptions_before_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM folioone.chat_card_codes k
    JOIN folioone.chat_card_public p ON p.card_id = k.card_id
    -- No hash comparison here: no API role may read code_hash. The row is visible at all only
    -- through chat_card_codes_select, i.e. for the hash in folioone.code_hash (the owner, who
    -- also sees their codes, is excluded by account_id <> v_uid below).
    WHERE k.id = NEW.code_id AND k.card_id = NEW.card_id
      AND k.revoked_at IS NULL AND (k.expires_at IS NULL OR k.expires_at > now())
      AND NEW.slot <= k.max_redemptions
      AND p.status = 'active' AND p.access_policy = 'verified' AND p.account_id <> v_uid
      AND p.owner_pro_until > now() AND (p.expires_at IS NULL OR p.expires_at > now())) THEN
    RAISE EXCEPTION 'activation code not valid' USING ERRCODE = '42501';
  END IF;
  NEW.recipient_id := v_uid;
  NEW.redeemed_at := now();
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER chat_card_redemptions_before_insert BEFORE INSERT ON folioone.chat_card_redemptions
  FOR EACH ROW EXECUTE FUNCTION folioone.chat_card_redemptions_before_insert();

-- Messages: owner's PRO must be active, a request carries exactly one opening message, the
-- follow-up rule, a flood limit per sender (20 a minute, 300 an hour), server timestamp.
CREATE FUNCTION folioone.conversation_messages_before_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_conv record;
  v_last uuid;
BEGIN
  SELECT c.status, c.owner_id, c.recipient_id, p.owner_pro_until, p.allow_follow_ups
    INTO v_conv
    FROM folioone.conversations c
    JOIN folioone.chat_card_public p ON p.card_id = c.card_id
   WHERE c.id = NEW.conversation_id;
  IF NOT FOUND OR v_conv.owner_pro_until IS NULL OR v_conv.owner_pro_until <= now() THEN
    RAISE EXCEPTION 'conversation not available' USING ERRCODE = '42501';
  END IF;
  SELECT m.sender_id INTO v_last FROM folioone.conversation_messages m
   WHERE m.conversation_id = NEW.conversation_id ORDER BY m.id DESC LIMIT 1;
  IF v_conv.status = 'requested' AND FOUND THEN
    RAISE EXCEPTION 'wait for the request to be accepted' USING ERRCODE = 'PT409';
  END IF;
  IF v_conv.status = 'active' AND v_uid = v_conv.recipient_id AND NOT v_conv.allow_follow_ups
     AND v_last = v_uid THEN
    RAISE EXCEPTION 'wait for a reply' USING ERRCODE = 'PT409';
  END IF;
  IF (SELECT count(*) FROM folioone.conversation_messages
      WHERE sender_id = v_uid AND created_at > now() - interval '1 minute') >= 20
     OR (SELECT count(*) FROM folioone.conversation_messages
         WHERE sender_id = v_uid AND created_at > now() - interval '1 hour') >= 300 THEN
    RAISE EXCEPTION 'too many messages' USING ERRCODE = 'PT429';
  END IF;
  NEW.sender_id := v_uid;
  NEW.created_at := now();
  NEW.body := btrim(NEW.body);
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER conversation_messages_before_insert BEFORE INSERT ON folioone.conversation_messages
  FOR EACH ROW EXECUTE FUNCTION folioone.conversation_messages_before_insert();

-- --------------------------------------------------------------------------
-- 5. Functions called by the app (SECURITY INVOKER: RLS applies to everything they touch)
-- --------------------------------------------------------------------------

-- Publish / pause / resume / archive: one transaction for the card and its snapshot.
CREATE FUNCTION folioone.chat_card_set_status(p_card_id uuid, p_status text, p_link_path text)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_now timestamptz := now();
BEGIN
  IF p_status NOT IN ('active', 'paused', 'archived') THEN
    RAISE EXCEPTION 'unknown status' USING ERRCODE = '22023';
  END IF;
  UPDATE folioone.chat_cards SET status = p_status WHERE id = p_card_id AND account_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'chat card not found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO folioone.chat_card_public
    (card_id, account_id, public_id, status, title, description, host_name, welcome_message,
     cover_image_url, link_path, access_policy, auto_accept, accepting_new, allow_follow_ups,
     max_conversations_per_recipient, expires_at, published_at)
  SELECT c.id, c.account_id, c.public_id, c.status, c.title, c.description, c.host_name, c.welcome_message,
         c.cover_image_url, p_link_path, c.access_policy, c.auto_accept, c.accepting_new, c.allow_follow_ups,
         c.max_conversations_per_recipient, c.expires_at, v_now
    FROM folioone.chat_cards c WHERE c.id = p_card_id
  ON CONFLICT (card_id) DO UPDATE SET
    status = EXCLUDED.status, title = EXCLUDED.title, description = EXCLUDED.description,
    host_name = EXCLUDED.host_name, welcome_message = EXCLUDED.welcome_message,
    cover_image_url = EXCLUDED.cover_image_url, link_path = EXCLUDED.link_path,
    access_policy = EXCLUDED.access_policy, auto_accept = EXCLUDED.auto_accept,
    accepting_new = EXCLUDED.accepting_new, allow_follow_ups = EXCLUDED.allow_follow_ups,
    max_conversations_per_recipient = EXCLUDED.max_conversations_per_recipient,
    expires_at = EXCLUDED.expires_at;
  RETURN v_now;
END;
$fn$;

-- The public read: one card by its random public id. There is no way to list cards.
CREATE FUNCTION folioone.chat_card_public_get(p_public_id text)
RETURNS TABLE (card_id uuid, public_id text, status text, title text, description text, host_name text,
               welcome_message text, cover_image_url text, link_path text, access_policy text,
               auto_accept boolean, accepting_new boolean, allow_follow_ups boolean,
               max_conversations_per_recipient integer, expires_at timestamptz,
               owner_pro_active boolean, is_owner boolean, published_at timestamptz)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
BEGIN
  IF p_public_id IS NULL OR p_public_id !~ '^[0-9a-f]{32}$' THEN
    RETURN;
  END IF;
  PERFORM set_config('folioone.chat_card', p_public_id, true);
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN QUERY
      SELECT p.card_id, p.public_id, p.status, p.title, p.description, p.host_name, p.welcome_message,
             p.cover_image_url, p.link_path, p.access_policy, p.auto_accept, p.accepting_new,
             p.allow_follow_ups, p.max_conversations_per_recipient, p.expires_at,
             COALESCE(p.owner_pro_until > now(), false), false, p.published_at
        FROM folioone.chat_card_public p WHERE p.public_id = p_public_id;
  ELSE
    RETURN QUERY
      SELECT p.card_id, p.public_id, p.status, p.title, p.description, p.host_name, p.welcome_message,
             p.cover_image_url, p.link_path, p.access_policy, p.auto_accept, p.accepting_new,
             p.allow_follow_ups, p.max_conversations_per_recipient, p.expires_at,
             COALESCE(p.owner_pro_until > now(), false), p.account_id = (SELECT auth.uid()), p.published_at
        FROM folioone.chat_card_public p WHERE p.public_id = p_public_id;
  END IF;
END;
$fn$;

-- Redeem an activation code (the app sends its SHA-256, never the code). Every call is counted
-- first, so more than 10 attempts in 15 minutes are refused whatever they contain. Outcomes are
-- deliberately coarse: 'redeemed' | 'invalid' | 'unavailable' | 'rate_limited'.
CREATE FUNCTION folioone.chat_card_redeem(p_public_id text, p_code_hash text)
RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_card uuid;
  v_code_id uuid;
  v_max integer;
  v_slot integer;
  v_constraint text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in first' USING ERRCODE = '42501';
  END IF;
  INSERT INTO folioone.chat_card_redeem_attempts (account_id) VALUES (v_uid);
  IF (SELECT count(*) FROM folioone.chat_card_redeem_attempts
      WHERE account_id = v_uid AND attempted_at > now() - interval '15 minutes') > 10 THEN
    RETURN 'rate_limited';
  END IF;
  IF p_public_id IS NULL OR p_public_id !~ '^[0-9a-f]{32}$'
     OR p_code_hash IS NULL OR p_code_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN 'invalid';
  END IF;
  PERFORM set_config('folioone.chat_card', p_public_id, true);
  SELECT p.card_id INTO v_card FROM folioone.chat_card_public p
   WHERE p.public_id = p_public_id AND p.status = 'active' AND p.access_policy = 'verified'
     AND p.account_id <> v_uid AND p.owner_pro_until > now()
     AND (p.expires_at IS NULL OR p.expires_at > now());
  IF v_card IS NULL THEN
    RETURN 'unavailable';
  END IF;
  PERFORM set_config('folioone.code_hash', p_code_hash, true);
  -- Visible: only the row with this hash (the caller is not the owner, checked above).
  SELECT k.id, k.max_redemptions INTO v_code_id, v_max FROM folioone.chat_card_codes k
   WHERE k.card_id = v_card AND k.revoked_at IS NULL AND (k.expires_at IS NULL OR k.expires_at > now());
  IF v_code_id IS NULL THEN
    RETURN 'invalid';
  END IF;
  IF EXISTS (SELECT 1 FROM folioone.chat_card_redemptions r
             WHERE r.code_id = v_code_id AND r.recipient_id = v_uid) THEN
    RETURN 'redeemed';
  END IF;
  FOR v_slot IN 1..v_max LOOP
    BEGIN
      INSERT INTO folioone.chat_card_redemptions (code_id, card_id, recipient_id, slot)
      VALUES (v_code_id, v_card, v_uid, v_slot);
      RETURN 'redeemed';
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint = 'chat_card_redemptions_code_recipient_key' THEN
        RETURN 'redeemed';
      END IF;
      -- That use was taken a moment ago: try the next one.
    END;
  END LOOP;
  RETURN 'invalid';
END;
$fn$;

-- Request (or, on an auto-accept card, start) a conversation with its opening message. The
-- policies and triggers above decide; this only makes the card visible by its public id.
CREATE FUNCTION folioone.chat_card_request(p_public_id text, p_name text, p_message text)
RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_card uuid;
  v_owner uuid;
  v_auto boolean;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in first' USING ERRCODE = '42501';
  END IF;
  IF p_public_id IS NULL OR p_public_id !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'chat card not available' USING ERRCODE = 'P0002';
  END IF;
  PERFORM set_config('folioone.chat_card', p_public_id, true);
  SELECT p.card_id, p.account_id, p.auto_accept INTO v_card, v_owner, v_auto
    FROM folioone.chat_card_public p WHERE p.public_id = p_public_id;
  IF v_card IS NULL OR v_owner = v_uid THEN
    RAISE EXCEPTION 'chat card not available' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO folioone.conversations (card_id, owner_id, recipient_id, recipient_name, status)
  VALUES (v_card, v_owner, v_uid, btrim(p_name), CASE WHEN v_auto THEN 'active' ELSE 'requested' END)
  RETURNING id INTO v_id;
  INSERT INTO folioone.conversation_messages (conversation_id, body) VALUES (v_id, p_message);
  RETURN v_id;
END;
$fn$;

DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['folioone.chat_cards_before_update()', 'folioone.chat_card_public_sync_pro()',
                           'folioone.conversations_before_insert()', 'folioone.conversations_before_update()',
                           'folioone.chat_card_redemptions_before_insert()',
                           'folioone.conversation_messages_before_insert()',
                           'folioone.chat_card_set_status(uuid, text, text)',
                           'folioone.chat_card_public_get(text)',
                           'folioone.chat_card_redeem(text, text)',
                           'folioone.chat_card_request(text, text, text)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f);
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION folioone.chat_card_set_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION folioone.chat_card_public_get(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION folioone.chat_card_redeem(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION folioone.chat_card_request(text, text, text) TO authenticated;

COMMIT;

-- --------------------------------------------------------------------------
-- Read-only verification
-- --------------------------------------------------------------------------

-- Expect 10 rows, every rls/forced true, anon_insert false, service_select false; anon_select true
-- only for chat_card_public (column grants, no account_id).
SELECT c.relname, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
       has_any_column_privilege('anon', c.oid, 'SELECT') AS anon_select,
       has_any_column_privilege('anon', c.oid, 'INSERT') AS anon_insert,
       has_table_privilege('authenticated', c.oid, 'DELETE') AS auth_delete,
       has_any_column_privilege('service_role', c.oid, 'SELECT') AS service_select
FROM pg_class c
WHERE c.relnamespace = 'folioone'::regnamespace
  AND c.relname IN ('chat_cards', 'chat_card_public', 'chat_card_code_batches', 'chat_card_codes',
                    'chat_card_redemptions', 'chat_card_redeem_attempts', 'conversations',
                    'conversation_messages', 'conversation_blocks', 'conversation_reports')
ORDER BY 1;
-- auth_delete is true only for conversation_blocks (unblock).

-- Expect false, false: nobody can read a code hash or the owner of a card anonymously.
SELECT has_column_privilege('authenticated', 'folioone.chat_card_codes', 'code_hash', 'SELECT') AS auth_reads_hash,
       has_column_privilege('anon', 'folioone.chat_card_public', 'account_id', 'SELECT') AS anon_reads_owner;

-- Expect 10 rows, all security_definer false, proconfig {search_path=""}.
SELECT p.proname, p.prosecdef AS security_definer, p.proconfig,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
FROM pg_proc p
WHERE p.pronamespace = 'folioone'::regnamespace
  AND (p.proname LIKE 'chat\_card%' OR p.proname LIKE 'conversation%')
ORDER BY 1;
-- anon_exec true only for chat_card_public_get.

-- Expect 26 policies across the 10 tables.
SELECT tablename, policyname, cmd, roles FROM pg_policies
WHERE schemaname = 'folioone'
  AND (tablename LIKE 'chat\_card%' OR tablename LIKE 'conversation%')
ORDER BY 1, 3, 2;

-- Operator: open abuse reports (newest first). Contains participant ids, so review here only.
-- SELECT r.created_at, r.reason, r.details, r.conversation_id, r.message_id FROM folioone.conversation_reports r
-- ORDER BY r.created_at DESC LIMIT 50;

-- Retention: redemption attempts are only needed for the rate limit (developer, as needed):
-- DELETE FROM folioone.chat_card_redeem_attempts WHERE attempted_at < now() - interval '30 days';

-- Rollback (DESTRUCTIVE: deletes every ChatCard, code, redemption and conversation). Run 003's
-- rollback first.
-- BEGIN;
-- DROP FUNCTION folioone.chat_card_request(text, text, text);
-- DROP FUNCTION folioone.chat_card_redeem(text, text);
-- DROP FUNCTION folioone.chat_card_public_get(text);
-- DROP FUNCTION folioone.chat_card_set_status(uuid, text, text);
-- DROP TABLE folioone.conversation_reports, folioone.conversation_blocks, folioone.conversation_messages,
--   folioone.conversations, folioone.chat_card_redeem_attempts, folioone.chat_card_redemptions,
--   folioone.chat_card_codes, folioone.chat_card_code_batches, folioone.chat_card_public, folioone.chat_cards;
-- DROP FUNCTION folioone.conversation_messages_before_insert();
-- DROP FUNCTION folioone.chat_card_redemptions_before_insert();
-- DROP FUNCTION folioone.conversations_before_update();
-- DROP FUNCTION folioone.conversations_before_insert();
-- DROP FUNCTION folioone.chat_card_public_sync_pro();
-- DROP FUNCTION folioone.chat_cards_before_update();
-- COMMIT;
