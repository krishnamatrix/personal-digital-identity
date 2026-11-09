-- Purpose: propose the private Persona owner table, lifecycle, defaults and
-- optimistic version fields. This is a proposal for manual Supabase SQL Editor
-- execution by the developer as postgres only after review; Codex never runs it.
-- Prerequisites: approved M3A design; M2 identity tables remain present and
-- verified; public schema and authenticated role exist; inspect the exact ACLs
-- and constraints before execution. No Persona table may already exist.
-- Execution order: 1 of 5 Milestone 3A SQL files.
-- Repeatability: one-time and intentionally not rerunnable; stop on any existing
-- target relation/index instead of hiding a partial or conflicting deployment.
-- Expected outcome: private persona parent rows tied to public.accounts,
-- optional zero-or-one active default per account, and active/archive lifecycle.
-- No application visibility/publication grants or canonical record copies exist.

BEGIN;

CREATE TABLE public.personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  name text NOT NULL,
  slug text,
  description text,
  audience text,
  purpose text,
  visibility text NOT NULL DEFAULT 'private',
  status text NOT NULL DEFAULT 'active',
  is_default boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT personas_account_id_accounts_id_fk
    FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE,
  CONSTRAINT personas_id_account_id_unique UNIQUE (id, account_id),
  CONSTRAINT personas_name_length_check
    CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  CONSTRAINT personas_name_trimmed_check CHECK (name = btrim(name)),
  CONSTRAINT personas_description_length_check
    CHECK (description IS NULL OR char_length(description) <= 500),
  CONSTRAINT personas_audience_length_check
    CHECK (audience IS NULL OR char_length(audience) <= 200),
  CONSTRAINT personas_purpose_length_check
    CHECK (purpose IS NULL OR char_length(purpose) <= 200),
  CONSTRAINT personas_slug_format_check
    CHECK (slug IS NULL OR (char_length(slug) <= 80
      AND slug ~ '^[a-z0-9]+([_-][a-z0-9]+)*$')),
  CONSTRAINT personas_status_check
    CHECK (status IN ('active', 'archived')),
  CONSTRAINT personas_private_visibility_check CHECK (visibility = 'private'),
  CONSTRAINT personas_archive_state_check
    CHECK ((status = 'active' AND archived_at IS NULL)
        OR (status = 'archived' AND archived_at IS NOT NULL)),
  CONSTRAINT personas_archived_not_default_check
    CHECK (status = 'active' OR NOT is_default),
  CONSTRAINT personas_position_nonnegative_check CHECK (position >= 0),
  CONSTRAINT personas_version_positive_check CHECK (version > 0)
);

CREATE UNIQUE INDEX personas_account_active_name_unique
  ON public.personas (account_id, lower(name))
  WHERE status = 'active';
CREATE UNIQUE INDEX personas_account_slug_unique
  ON public.personas (account_id, slug)
  WHERE slug IS NOT NULL;
CREATE UNIQUE INDEX personas_one_active_default_per_account
  ON public.personas (account_id)
  WHERE is_default AND status = 'active';
CREATE INDEX personas_account_status_position_idx
  ON public.personas (account_id, status, position, id);

-- Verification SQL (read-only):
SELECT c.relname, pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'personas';
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint WHERE conrelid = 'public.personas'::regclass
ORDER BY conname;
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'personas' ORDER BY indexname;

COMMIT;

-- Expected verification: one postgres-owned table; keys/checks and four named
-- indexes exist. This file alone does not enable RLS or grant application access;
-- the table is not ready for application use until ordered files 002-004 pass.
-- RLS/security verification is separate from catalog inspection and requires
-- separately approved Auth/PostgREST tests.
--
-- Rollback: only before any Persona data or dependent objects exist, and only
-- with developer approval. The following is destructive and is not executable
-- by default:
-- DROP TABLE public.personas;
