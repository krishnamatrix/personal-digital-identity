-- Purpose: propose private Persona configuration revision/audit storage. Payloads
-- describe configuration and override changes only; canonical identity values
-- are not snapshotted. This file creates no write path or revision RPC.
-- Prerequisites: files 001 and 002 were manually executed and verified; no
-- persona_revisions relation exists; developer has reviewed the retention choice
-- (Persona deletion cascades this history; account-deletion policy is AD-006).
-- Execution order: 3 of 5 Milestone 3A SQL files.
-- Repeatability: one-time; stop if target objects exist.
-- Expected outcome: per-Persona ordered history owned by the same account.

BEGIN;

CREATE TABLE public.persona_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id uuid NOT NULL,
  account_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  revision_number bigint NOT NULL,
  event_type text NOT NULL,
  configuration_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT persona_revisions_persona_owner_fk
    FOREIGN KEY (persona_id, account_id)
    REFERENCES public.personas(id, account_id) ON DELETE CASCADE,
  CONSTRAINT persona_revisions_actor_owner_check CHECK (actor_id = account_id),
  CONSTRAINT persona_revisions_number_positive_check CHECK (revision_number > 0),
  CONSTRAINT persona_revisions_event_type_check
    CHECK (event_type IN ('created', 'updated', 'duplicated', 'archived',
                          'restored', 'default_changed', 'deleted')),
  CONSTRAINT persona_revisions_payload_object_check
    CHECK (jsonb_typeof(configuration_payload) = 'object'),
  CONSTRAINT persona_revisions_persona_number_unique
    UNIQUE (persona_id, revision_number)
);
CREATE INDEX persona_revisions_owner_history_idx
  ON public.persona_revisions (account_id, persona_id, created_at DESC);

-- Verification SQL (read-only):
SELECT c.relname, pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'persona_revisions';
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint WHERE conrelid = 'public.persona_revisions'::regclass
ORDER BY conname;
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'persona_revisions';

COMMIT;

-- Expected verification: owner-only catalog object; same-owner composite FK,
-- append-only revision number uniqueness, actor and JSON-object checks exist.
-- Authenticated access remains unavailable until file 004 installs the
-- request-path-gated RLS and column grants and file 005 installs the atomic
-- mutation RPCs. Revision rows can only be inserted by an approved RPC request
-- (gate in 004); there is no UPDATE or DELETE grant or policy. Persona deletion
-- removes history through the ON DELETE CASCADE foreign key (referential
-- integrity actions run as the table owner), so the 'deleted' event_type is
-- permitted by the check but is not written by any proposed RPC.
--
-- Rollback limitation: dropping this table destroys all Persona revision history.
-- Only before data exists and with explicit developer approval:
-- DROP TABLE public.persona_revisions;
