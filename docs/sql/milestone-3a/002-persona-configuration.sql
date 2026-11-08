-- Purpose: propose private Persona section configuration, allowlisted field
-- selection for the currently existing identity_profiles row, and explicit
-- profile-field overrides. No canonical values are copied or updated.
-- Prerequisites: 001-persona-tables.sql manually executed and independently
-- verified; public.accounts and public.identity_profiles exist; inspect existing
-- target objects and ACLs. Run as developer-controlled postgres only after review.
-- Execution order: 2 of 4 Milestone 3A SQL files.
-- Repeatability: one-time; stop if any target relation or constraint already
-- exists. Do not use IF NOT EXISTS to mask a partial deployment.
-- Expected outcome: selected fields and layout belong to one Persona/account;
-- canonical profile remains the source unless a specific override row exists.

BEGIN;

CREATE TABLE public.persona_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id uuid NOT NULL,
  account_id uuid NOT NULL,
  section_key text NOT NULL,
  label_override text,
  is_visible boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT persona_sections_persona_owner_fk
    FOREIGN KEY (persona_id, account_id)
    REFERENCES public.personas(id, account_id) ON DELETE CASCADE,
  CONSTRAINT persona_sections_persona_key_unique UNIQUE (persona_id, section_key),
  CONSTRAINT persona_sections_persona_position_unique UNIQUE (persona_id, position),
  CONSTRAINT persona_sections_key_nonempty_check
    CHECK (char_length(btrim(section_key)) BETWEEN 1 AND 80),
  CONSTRAINT persona_sections_label_length_check
    CHECK (label_override IS NULL OR char_length(label_override) <= 100),
  CONSTRAINT persona_sections_position_nonnegative_check CHECK (position >= 0)
);
CREATE INDEX persona_sections_owner_persona_idx
  ON public.persona_sections (account_id, persona_id);

CREATE TABLE public.persona_profile_field_selections (
  persona_id uuid NOT NULL,
  account_id uuid NOT NULL,
  field_key text NOT NULL,
  is_included boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  is_highlighted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT persona_profile_field_selections_pk PRIMARY KEY (persona_id, field_key),
  CONSTRAINT persona_profile_field_selections_persona_owner_fk
    FOREIGN KEY (persona_id, account_id)
    REFERENCES public.personas(id, account_id) ON DELETE CASCADE,
  CONSTRAINT persona_profile_field_selections_profile_owner_fk
    FOREIGN KEY (account_id)
    REFERENCES public.identity_profiles(account_id) ON DELETE CASCADE,
  CONSTRAINT persona_profile_field_selections_field_key_check
    CHECK (field_key IN ('display_name', 'headline', 'summary', 'location',
                         'website_url', 'linkedin_url', 'github_url')),
  CONSTRAINT persona_profile_field_selections_position_check CHECK (position >= 0),
  CONSTRAINT persona_profile_field_selections_highlight_check
    CHECK (NOT is_highlighted OR is_included)
);
CREATE INDEX persona_profile_field_selections_owner_idx
  ON public.persona_profile_field_selections
     (account_id, persona_id, is_included, position);

CREATE TABLE public.persona_profile_overrides (
  persona_id uuid NOT NULL,
  account_id uuid NOT NULL,
  field_key text NOT NULL,
  override_value text,
  override_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT persona_profile_overrides_pk PRIMARY KEY (persona_id, field_key),
  CONSTRAINT persona_profile_overrides_persona_owner_fk
    FOREIGN KEY (persona_id, account_id)
    REFERENCES public.personas(id, account_id) ON DELETE CASCADE,
  CONSTRAINT persona_profile_overrides_field_key_check
    CHECK (field_key IN ('display_name', 'headline', 'summary', 'location',
                         'website_url', 'linkedin_url', 'github_url')),
  CONSTRAINT persona_profile_overrides_version_check CHECK (override_version > 0),
  CONSTRAINT persona_profile_overrides_value_length_check
    CHECK ((field_key <> 'display_name' OR override_value IS NULL OR char_length(override_value) <= 120)
       AND (field_key <> 'headline' OR override_value IS NULL OR char_length(override_value) <= 180)
       AND (field_key <> 'summary' OR override_value IS NULL OR char_length(override_value) <= 2000)
       AND (field_key <> 'location' OR override_value IS NULL OR char_length(override_value) <= 160)
       AND (field_key NOT IN ('website_url', 'linkedin_url', 'github_url')
            OR override_value IS NULL
            OR (char_length(override_value) <= 2048 AND override_value ~ '^https?://')))
);
CREATE INDEX persona_profile_overrides_owner_idx
  ON public.persona_profile_overrides (account_id, persona_id);

-- Verification SQL (read-only):
SELECT c.relname, pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN
 ('persona_sections','persona_profile_field_selections','persona_profile_overrides')
ORDER BY c.relname;
SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid)
FROM pg_constraint WHERE conrelid IN
 ('public.persona_sections'::regclass,
  'public.persona_profile_field_selections'::regclass,
  'public.persona_profile_overrides'::regclass)
ORDER BY table_name::text, conname;

COMMIT;

-- Expected verification: all FKs include Persona/account ownership; selection
-- field keys are allowlisted; absent rows are excluded; override row presence
-- distinguishes explicit NULL from reset. These tables are not app-ready until
-- file 004 installs and verifies RLS/grants. No runtime RLS test is implied.
--
-- Rollback: dropping these tables destroys Persona configuration. Only before
-- any user data exists, with developer approval; remove dependents first:
-- DROP TABLE public.persona_profile_overrides;
-- DROP TABLE public.persona_profile_field_selections;
-- DROP TABLE public.persona_sections;
