-- Purpose: propose the atomic Persona mutation RPCs. Each is a PostgREST
-- endpoint implemented as a PL/pgSQL function that is VOLATILE, SECURITY
-- INVOKER and has SET search_path = ''. All configuration changes and the
-- matching persona_revisions row are written in ONE statement block, hence one
-- transaction (PostgREST runs a request in a single transaction). A failure at
-- any step, including the revision INSERT, aborts the transaction and rolls the
-- whole mutation back.
--
-- *** EXECUTION GATE ***
-- Pending review. Do NOT execute until the hosted request-path diagnostic has
-- passed (diagnostics/README.md) and files 001-004 are executed and verified.
-- This file is only valid together with the gate in file 004: the table
-- INSERT/UPDATE/DELETE policies accept writes only inside POST requests to
-- /rpc/<one of these ten function names>. Renaming a function here requires
-- the same change in persona_write_rpc_context() in file 004.
--
-- Prerequisites: files 001-004 executed and verified; diagnostic passed; no
-- function named persona_* exists in schema public except
-- persona_write_rpc_context().
-- Execution order: 5 of 5 Milestone 3A SQL files.
-- Repeatability: one-time; plain CREATE FUNCTION (no OR REPLACE) so existing
-- objects stop the script. Run as postgres in a single SQL Editor execution.
-- Expected outcome: ten functions, EXECUTE only for authenticated.
--
-- ---------------------------------------------------------------------------
-- Contract shared by every function
-- ---------------------------------------------------------------------------
-- Authenticated user resolution: v_uid := (SELECT auth.uid()). NULL raises
--   28000. No function has an account/user parameter; ownership is always
--   derived from v_uid and repeated in every WHERE clause in addition to RLS.
-- Ownership checks: the target Persona is read with
--   WHERE id = p_persona_id AND account_id = v_uid ... FOR UPDATE. A missing OR
--   foreign Persona both raise P0002 "Persona not found" (no ownership leak).
--   RLS independently hides foreign rows and the write policies require the
--   request-path gate.
-- Expected-version check: personas.version must equal p_expected_version, else
--   SQLSTATE 40001. Every successful configuration change increments
--   personas.version by exactly 1 and inserts exactly one revision whose
--   revision_number equals the new version (UNIQUE (persona_id,
--   revision_number) is a second guard against double-writes).
-- Lifecycle validation: configuration edits require status = 'active'
--   (otherwise 55000). Only persona_set_lifecycle (restore),
--   persona_duplicate (source) and persona_delete (requires archived) accept
--   archived Personas.
-- No-op requests: when the requested state already holds, the function returns
--   the current row unchanged with NO version bump and NO revision.
-- Input validation: NULL/blank required inputs and unknown enumerated values
--   raise 22023. Length/format limits are enforced by the table CHECK
--   constraints from files 001-002 (violations surface as 23514).
-- Revisions: configuration_payload describes the change (before/after of the
--   Persona-owned configuration), never a copy of canonical identity values.
--   Override text the user authored for the Persona is included (private).
-- Transaction behavior: one transaction per request; deferred constraint
--   persona_sections_persona_position_unique is checked at commit or earlier
--   where stated; per-account advisory transaction locks serialize operations
--   that depend on account-wide invariants (position, single default).
-- Error codes: 28000 unauthenticated; P0002 not found; 40001 stale version;
--   55000 wrong lifecycle state; 22023 invalid input; 23505 unique violation
--   (duplicate active name/slug/default); 23503 FK violation (missing account
--   or profile row, future Portfolio/Card RESTRICT references); 23514 check
--   violation.
-- EXECUTE privilege: revoked from PUBLIC, anon, service_role; granted to
--   authenticated only, on each exact signature (end of file).

BEGIN;

-- ===========================================================================
-- persona_create
-- Purpose: create a private, active, non-default Persona; revision 1.
-- Input validation: p_name required (trimmed, non-empty); optional text values
--   are trimmed and stored as NULL when blank; slug format/length by CHECK.
-- Ownership: account_id is v_uid. FK to public.accounts requires the account row.
-- Expected version: not applicable (new row, version = 1).
-- Lifecycle: new row is status 'active', is_default false, visibility 'private'
--   (column defaults; those columns are not insertable by authenticated).
-- Mutation: INSERT personas with position = max(position)+1 for the account,
--   serialized by a per-account advisory transaction lock.
-- Revision: event 'created', revision_number = 1.
-- Errors: 28000, 22023, 23505 (active name or slug exists), 23503, 23514.
-- ===========================================================================
CREATE FUNCTION public.persona_create(
  p_name text,
  p_description text DEFAULT NULL,
  p_audience text DEFAULT NULL,
  p_purpose text DEFAULT NULL,
  p_slug text DEFAULT NULL
)
RETURNS public.personas
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_name text := btrim(p_name);
  v_row public.personas;
  v_next_position integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION 'Persona name is required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('folioone.persona:' || v_uid::text, 0));

  SELECT COALESCE(MAX(p.position), -1) + 1 INTO v_next_position
  FROM public.personas AS p WHERE p.account_id = v_uid;

  INSERT INTO public.personas
    (account_id, name, slug, description, audience, purpose, position)
  VALUES
    (v_uid, v_name, NULLIF(btrim(p_slug), ''), NULLIF(btrim(p_description), ''),
     NULLIF(btrim(p_audience), ''), NULLIF(btrim(p_purpose), ''), v_next_position)
  RETURNING * INTO v_row;

  INSERT INTO public.persona_revisions
    (persona_id, account_id, actor_id, revision_number, event_type, configuration_payload)
  VALUES
    (v_row.id, v_uid, v_uid, v_row.version, 'created',
     jsonb_build_object('metadata', jsonb_build_object(
       'name', v_row.name, 'slug', v_row.slug, 'description', v_row.description,
       'audience', v_row.audience, 'purpose', v_row.purpose)));

  RETURN v_row;
END;
$fn$;

-- ===========================================================================
-- persona_update_metadata
-- Purpose: replace the editable metadata (name, slug, description, audience,
--   purpose) of an active Persona.
-- Input validation: all parameters are required positionally by name (no
--   defaults) and fully REPLACE the stored values; NULL/blank clears an
--   optional field. p_name must be non-blank. p_expected_version required.
-- Ownership: Persona must belong to v_uid (P0002 otherwise).
-- Expected version: 40001 when stale.  Lifecycle: status must be 'active'.
-- Mutation: UPDATE personas metadata columns, version + 1, updated_at.
-- Revision: event 'updated', payload {before, after} of the five fields.
-- No-op: identical values return the row unchanged (no version, no revision).
-- Errors: 28000, 22023, P0002, 40001, 55000, 23505, 23514.
-- ===========================================================================
CREATE FUNCTION public.persona_update_metadata(
  p_persona_id uuid,
  p_expected_version integer,
  p_name text,
  p_slug text,
  p_description text,
  p_audience text,
  p_purpose text
)
RETURNS public.personas
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_name text := btrim(p_name);
  v_row public.personas;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_persona_id IS NULL OR p_expected_version IS NULL THEN
    RAISE EXCEPTION 'Persona id and expected version are required' USING ERRCODE = '22023';
  END IF;
  IF v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION 'Persona name is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.personas AS p
  WHERE p.id = p_persona_id AND p.account_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Persona not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.version <> p_expected_version THEN
    RAISE EXCEPTION 'Persona was changed by another request' USING ERRCODE = '40001';
  END IF;
  IF v_row.status <> 'active' THEN
    RAISE EXCEPTION 'Persona is archived' USING ERRCODE = '55000';
  END IF;

  v_before := jsonb_build_object('name', v_row.name, 'slug', v_row.slug,
    'description', v_row.description, 'audience', v_row.audience, 'purpose', v_row.purpose);
  v_after := jsonb_build_object('name', v_name, 'slug', NULLIF(btrim(p_slug), ''),
    'description', NULLIF(btrim(p_description), ''),
    'audience', NULLIF(btrim(p_audience), ''), 'purpose', NULLIF(btrim(p_purpose), ''));
  IF v_before = v_after THEN
    RETURN v_row;
  END IF;

  UPDATE public.personas AS p
  SET name = v_name,
      slug = NULLIF(btrim(p_slug), ''),
      description = NULLIF(btrim(p_description), ''),
      audience = NULLIF(btrim(p_audience), ''),
      purpose = NULLIF(btrim(p_purpose), ''),
      version = p.version + 1,
      updated_at = now()
  WHERE p.id = v_row.id AND p.account_id = v_uid
  RETURNING * INTO v_row;

  INSERT INTO public.persona_revisions
    (persona_id, account_id, actor_id, revision_number, event_type, configuration_payload)
  VALUES
    (v_row.id, v_uid, v_uid, v_row.version, 'updated',
     jsonb_build_object('change', 'metadata', 'before', v_before, 'after', v_after));

  RETURN v_row;
END;
$fn$;

-- ===========================================================================
-- persona_update_profile_field
-- Purpose: change how one allowlisted canonical profile field is presented by
--   an active Persona: inclusion, highlight, position and/or a Persona-specific
--   override value (set or reset). Canonical identity_profiles is never read
--   or written.
-- Input validation: p_field_key must be one of display_name, headline,
--   summary, location, website_url, linkedin_url, github_url. p_override_action
--   is 'keep' (default), 'set' or 'reset'; p_override_value is only allowed
--   with 'set' (NULL with 'set' stores an intentional NULL override).
--   p_position >= 0. p_is_highlighted = true requires the field to be included.
--   Excluding a field also clears its highlight. Omitted (NULL) selection
--   parameters leave the stored selection unchanged. At least one change must
--   be requested; otherwise 22023.
-- Ownership: Persona must belong to v_uid (P0002 otherwise); selection and
--   override rows are keyed (persona_id, field_key) with account_id = v_uid.
-- Expected version: 40001 when stale.  Lifecycle: status must be 'active'.
-- Mutation: INSERT/UPDATE persona_profile_field_selections; INSERT/UPDATE or
--   DELETE persona_profile_overrides; Persona version + 1. An excluded field
--   keeps any override row (explicitly hidden, never shown because absent or
--   is_included = false means excluded).
-- Revision: event 'updated', one revision per call with selection and override
--   before/after.
-- No-op: requested state already stored -> row returned, no bump, no revision.
-- Errors: 28000, 22023, P0002, 40001, 55000, 23503 (profile row missing), 23514.
-- ===========================================================================
CREATE FUNCTION public.persona_update_profile_field(
  p_persona_id uuid,
  p_expected_version integer,
  p_field_key text,
  p_is_included boolean DEFAULT NULL,
  p_is_highlighted boolean DEFAULT NULL,
  p_position integer DEFAULT NULL,
  p_override_action text DEFAULT 'keep',
  p_override_value text DEFAULT NULL
)
RETURNS public.personas
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_row public.personas;
  v_sel public.persona_profile_field_selections;
  v_ov public.persona_profile_overrides;
  v_sel_found boolean;
  v_ov_found boolean;
  v_new_included boolean;
  v_new_highlighted boolean;
  v_new_position integer;
  v_changed boolean := false;
  v_sel_before jsonb := 'null'::jsonb;
  v_sel_after jsonb := 'null'::jsonb;
  v_ov_before jsonb := 'null'::jsonb;
  v_ov_after jsonb := 'null'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_persona_id IS NULL OR p_expected_version IS NULL THEN
    RAISE EXCEPTION 'Persona id and expected version are required' USING ERRCODE = '22023';
  END IF;
  IF p_field_key IS NULL OR p_field_key NOT IN ('display_name', 'headline', 'summary',
       'location', 'website_url', 'linkedin_url', 'github_url') THEN
    RAISE EXCEPTION 'Unknown profile field' USING ERRCODE = '22023';
  END IF;
  IF p_override_action IS NULL OR p_override_action NOT IN ('keep', 'set', 'reset') THEN
    RAISE EXCEPTION 'Invalid override action' USING ERRCODE = '22023';
  END IF;
  IF p_override_action <> 'set' AND p_override_value IS NOT NULL THEN
    RAISE EXCEPTION 'Override value is only valid with action set' USING ERRCODE = '22023';
  END IF;
  IF p_position IS NOT NULL AND p_position < 0 THEN
    RAISE EXCEPTION 'Position must be non-negative' USING ERRCODE = '22023';
  END IF;
  IF p_is_included IS NULL AND p_is_highlighted IS NULL AND p_position IS NULL
     AND p_override_action = 'keep' THEN
    RAISE EXCEPTION 'No change requested' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.personas AS p
  WHERE p.id = p_persona_id AND p.account_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Persona not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.version <> p_expected_version THEN
    RAISE EXCEPTION 'Persona was changed by another request' USING ERRCODE = '40001';
  END IF;
  IF v_row.status <> 'active' THEN
    RAISE EXCEPTION 'Persona is archived' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_sel FROM public.persona_profile_field_selections AS s
  WHERE s.persona_id = v_row.id AND s.account_id = v_uid AND s.field_key = p_field_key
  FOR UPDATE;
  v_sel_found := FOUND;
  SELECT * INTO v_ov FROM public.persona_profile_overrides AS o
  WHERE o.persona_id = v_row.id AND o.account_id = v_uid AND o.field_key = p_field_key
  FOR UPDATE;
  v_ov_found := FOUND;

  -- Selection (inclusion / highlight / position)
  IF p_is_included IS NOT NULL OR p_is_highlighted IS NOT NULL OR p_position IS NOT NULL THEN
    v_new_included := COALESCE(p_is_included,
      CASE WHEN v_sel_found THEN v_sel.is_included ELSE false END);
    v_new_highlighted := COALESCE(p_is_highlighted,
      CASE WHEN v_sel_found THEN v_sel.is_highlighted ELSE false END);
    v_new_position := COALESCE(p_position,
      CASE WHEN v_sel_found THEN v_sel.position ELSE 0 END);
    IF NOT v_new_included THEN
      IF p_is_highlighted IS TRUE THEN
        RAISE EXCEPTION 'An excluded field cannot be highlighted' USING ERRCODE = '22023';
      END IF;
      v_new_highlighted := false;
    END IF;

    IF v_sel_found THEN
      v_sel_before := jsonb_build_object('included', v_sel.is_included,
        'highlighted', v_sel.is_highlighted, 'position', v_sel.position);
    END IF;
    v_sel_after := jsonb_build_object('included', v_new_included,
      'highlighted', v_new_highlighted, 'position', v_new_position);

    IF v_sel_found AND v_sel_before = v_sel_after THEN
      v_sel_after := v_sel_before;
    ELSIF v_sel_found THEN
      UPDATE public.persona_profile_field_selections AS s
      SET is_included = v_new_included, is_highlighted = v_new_highlighted,
          position = v_new_position, updated_at = now()
      WHERE s.persona_id = v_row.id AND s.account_id = v_uid AND s.field_key = p_field_key;
      v_changed := true;
    ELSE
      INSERT INTO public.persona_profile_field_selections
        (persona_id, account_id, field_key, is_included, position, is_highlighted)
      VALUES (v_row.id, v_uid, p_field_key, v_new_included, v_new_position, v_new_highlighted);
      v_changed := true;
    END IF;
  END IF;

  -- Override (set / reset)
  IF p_override_action <> 'keep' THEN
    IF v_ov_found THEN
      v_ov_before := jsonb_build_object('present', true, 'value', v_ov.override_value);
    ELSE
      v_ov_before := jsonb_build_object('present', false);
    END IF;

    IF p_override_action = 'set' THEN
      v_ov_after := jsonb_build_object('present', true, 'value', p_override_value);
      IF v_ov_found AND v_ov.override_value IS NOT DISTINCT FROM p_override_value THEN
        v_ov_after := v_ov_before;
      ELSIF v_ov_found THEN
        UPDATE public.persona_profile_overrides AS o
        SET override_value = p_override_value,
            override_version = o.override_version + 1,
            updated_at = now()
        WHERE o.persona_id = v_row.id AND o.account_id = v_uid AND o.field_key = p_field_key;
        v_changed := true;
      ELSE
        INSERT INTO public.persona_profile_overrides
          (persona_id, account_id, field_key, override_value)
        VALUES (v_row.id, v_uid, p_field_key, p_override_value);
        v_changed := true;
      END IF;
    ELSE -- reset
      v_ov_after := jsonb_build_object('present', false);
      IF v_ov_found THEN
        DELETE FROM public.persona_profile_overrides AS o
        WHERE o.persona_id = v_row.id AND o.account_id = v_uid AND o.field_key = p_field_key;
        v_changed := true;
      END IF;
    END IF;
  END IF;

  IF NOT v_changed THEN
    RETURN v_row;
  END IF;

  UPDATE public.personas AS p
  SET version = p.version + 1, updated_at = now()
  WHERE p.id = v_row.id AND p.account_id = v_uid
  RETURNING * INTO v_row;

  INSERT INTO public.persona_revisions
    (persona_id, account_id, actor_id, revision_number, event_type, configuration_payload)
  VALUES
    (v_row.id, v_uid, v_uid, v_row.version, 'updated',
     jsonb_build_object('change', 'profile_field', 'field_key', p_field_key,
       'selection', jsonb_build_object('before', v_sel_before, 'after', v_sel_after),
       'override', jsonb_build_object('before', v_ov_before, 'after', v_ov_after)));

  RETURN v_row;
END;
$fn$;

-- ===========================================================================
-- persona_upsert_section
-- Purpose: create or edit one layout section (label override, visibility) of
--   an active Persona. New sections are appended after the last position;
--   existing sections keep their position (use persona_reorder_sections).
-- Input validation: p_section_key trimmed, 1-80 characters; p_is_visible
--   required; p_label_override trimmed, blank -> NULL, max 100 by CHECK.
--   No defaults: omitted label would otherwise silently clear the label.
-- Ownership / version / lifecycle: as in the shared contract.
-- Mutation: INSERT or UPDATE persona_sections keyed by
--   (persona_id, section_key) (non-deferrable unique); Persona version + 1.
-- Revision: event 'updated', payload before/after of the section.
-- No-op: identical stored label and visibility -> no bump, no revision.
-- Errors: 28000, 22023, P0002, 40001, 55000, 23514.
-- ===========================================================================
CREATE FUNCTION public.persona_upsert_section(
  p_persona_id uuid,
  p_expected_version integer,
  p_section_key text,
  p_label_override text,
  p_is_visible boolean
)
RETURNS public.personas
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_key text := btrim(p_section_key);
  v_label text := NULLIF(btrim(p_label_override), '');
  v_row public.personas;
  v_sec public.persona_sections;
  v_sec_found boolean;
  v_before jsonb := 'null'::jsonb;
  v_after jsonb;
  v_next_position integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_persona_id IS NULL OR p_expected_version IS NULL OR p_is_visible IS NULL THEN
    RAISE EXCEPTION 'Persona id, expected version and visibility are required' USING ERRCODE = '22023';
  END IF;
  IF v_key IS NULL OR char_length(v_key) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Section key must be 1-80 characters' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.personas AS p
  WHERE p.id = p_persona_id AND p.account_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Persona not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.version <> p_expected_version THEN
    RAISE EXCEPTION 'Persona was changed by another request' USING ERRCODE = '40001';
  END IF;
  IF v_row.status <> 'active' THEN
    RAISE EXCEPTION 'Persona is archived' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_sec FROM public.persona_sections AS s
  WHERE s.persona_id = v_row.id AND s.account_id = v_uid AND s.section_key = v_key
  FOR UPDATE;
  v_sec_found := FOUND;
  v_after := jsonb_build_object('label_override', v_label, 'is_visible', p_is_visible);

  IF v_sec_found THEN
    v_before := jsonb_build_object('label_override', v_sec.label_override,
      'is_visible', v_sec.is_visible);
    IF v_before = v_after THEN
      RETURN v_row;
    END IF;
    UPDATE public.persona_sections AS s
    SET label_override = v_label, is_visible = p_is_visible, updated_at = now()
    WHERE s.persona_id = v_row.id AND s.account_id = v_uid AND s.section_key = v_key;
  ELSE
    SELECT COALESCE(MAX(s.position), -1) + 1 INTO v_next_position
    FROM public.persona_sections AS s WHERE s.persona_id = v_row.id;
    INSERT INTO public.persona_sections
      (persona_id, account_id, section_key, label_override, is_visible, position)
    VALUES (v_row.id, v_uid, v_key, v_label, p_is_visible, v_next_position);
  END IF;

  UPDATE public.personas AS p
  SET version = p.version + 1, updated_at = now()
  WHERE p.id = v_row.id AND p.account_id = v_uid
  RETURNING * INTO v_row;

  INSERT INTO public.persona_revisions
    (persona_id, account_id, actor_id, revision_number, event_type, configuration_payload)
  VALUES
    (v_row.id, v_uid, v_uid, v_row.version, 'updated',
     jsonb_build_object('change', 'section', 'section_key', v_key,
       'before', v_before, 'after', v_after));

  RETURN v_row;
END;
$fn$;

-- ===========================================================================
-- persona_delete_section
-- Purpose: remove one layout section from an active Persona. Remaining
--   positions are left as-is (gaps are allowed; order is preserved).
-- Input validation: p_section_key required.
-- Ownership / version / lifecycle: as in the shared contract.
-- Mutation: DELETE persona_sections row; Persona version + 1. Future selected
--   items that depend on a section will block this delete through their FKs.
-- Revision: event 'updated', payload records the removed section.
-- Errors: 28000, 22023, P0002 (Persona or section absent), 40001, 55000, 23503.
-- ===========================================================================
CREATE FUNCTION public.persona_delete_section(
  p_persona_id uuid,
  p_expected_version integer,
  p_section_key text
)
RETURNS public.personas
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_key text := btrim(p_section_key);
  v_row public.personas;
  v_sec public.persona_sections;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_persona_id IS NULL OR p_expected_version IS NULL OR v_key IS NULL OR v_key = '' THEN
    RAISE EXCEPTION 'Persona id, expected version and section key are required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.personas AS p
  WHERE p.id = p_persona_id AND p.account_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Persona not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.version <> p_expected_version THEN
    RAISE EXCEPTION 'Persona was changed by another request' USING ERRCODE = '40001';
  END IF;
  IF v_row.status <> 'active' THEN
    RAISE EXCEPTION 'Persona is archived' USING ERRCODE = '55000';
  END IF;

  DELETE FROM public.persona_sections AS s
  WHERE s.persona_id = v_row.id AND s.account_id = v_uid AND s.section_key = v_key
  RETURNING * INTO v_sec;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Section not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.personas AS p
  SET version = p.version + 1, updated_at = now()
  WHERE p.id = v_row.id AND p.account_id = v_uid
  RETURNING * INTO v_row;

  INSERT INTO public.persona_revisions
    (persona_id, account_id, actor_id, revision_number, event_type, configuration_payload)
  VALUES
    (v_row.id, v_uid, v_uid, v_row.version, 'updated',
     jsonb_build_object('change', 'section_removed', 'section_key', v_key,
       'before', jsonb_build_object('label_override', v_sec.label_override,
         'is_visible', v_sec.is_visible, 'position', v_sec.position),
       'after', 'null'::jsonb));

  RETURN v_row;
END;
$fn$;

-- ===========================================================================
-- persona_reorder_sections
-- Purpose: set the complete order of an active Persona's sections, including
--   swaps of any positions, in one atomic step. (Addition to the originally
--   listed RPC set, required by the section-ordering review; needs approval.)
-- Input validation: p_section_keys must be non-NULL, contain no NULL or
--   duplicate keys, and be exactly the Persona's current set of section keys.
-- Ownership / version / lifecycle: as in the shared contract.
-- Mutation: one UPDATE assigns position = index-1 (0-based) to every section
--   whose position changes. The position uniqueness constraint is DEFERRABLE
--   INITIALLY DEFERRED, so intermediate duplicate positions inside this
--   statement are legal; SET CONSTRAINTS ... IMMEDIATE then validates final
--   uniqueness inside the function, before the revision insert. Persona
--   version + 1.
-- Revision: event 'updated', payload before/after ordered key arrays.
-- No-op: order already identical -> no bump, no revision.
-- Errors: 28000, 22023, P0002, 40001, 55000, 23505 (cannot occur if the
--   inputs are valid; indicates a concurrent-writer bug).
-- ===========================================================================
CREATE FUNCTION public.persona_reorder_sections(
  p_persona_id uuid,
  p_expected_version integer,
  p_section_keys text[]
)
RETURNS public.personas
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_row public.personas;
  v_existing text[];
  v_before jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_persona_id IS NULL OR p_expected_version IS NULL OR p_section_keys IS NULL THEN
    RAISE EXCEPTION 'Persona id, expected version and section keys are required' USING ERRCODE = '22023';
  END IF;
  IF array_position(p_section_keys, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Section keys must not contain NULL' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT k) FROM unnest(p_section_keys) AS k)
       <> COALESCE(cardinality(p_section_keys), 0) THEN
    RAISE EXCEPTION 'Section keys must be unique' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.personas AS p
  WHERE p.id = p_persona_id AND p.account_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Persona not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.version <> p_expected_version THEN
    RAISE EXCEPTION 'Persona was changed by another request' USING ERRCODE = '40001';
  END IF;
  IF v_row.status <> 'active' THEN
    RAISE EXCEPTION 'Persona is archived' USING ERRCODE = '55000';
  END IF;

  SELECT COALESCE(array_agg(s.section_key ORDER BY s.position, s.section_key), ARRAY[]::text[])
  INTO v_existing
  FROM public.persona_sections AS s
  WHERE s.persona_id = v_row.id AND s.account_id = v_uid;

  IF cardinality(v_existing) <> COALESCE(cardinality(p_section_keys), 0)
     OR EXISTS (SELECT 1 FROM unnest(p_section_keys) AS k WHERE k <> ALL (v_existing)) THEN
    RAISE EXCEPTION 'Section keys must match the Persona''s existing sections exactly'
      USING ERRCODE = '22023';
  END IF;
  IF v_existing = p_section_keys THEN
    RETURN v_row;
  END IF;
  v_before := to_jsonb(v_existing);

  UPDATE public.persona_sections AS s
  SET position = o.ordinal - 1, updated_at = now()
  FROM unnest(p_section_keys) WITH ORDINALITY AS o(section_key, ordinal)
  WHERE s.persona_id = v_row.id AND s.account_id = v_uid
    AND s.section_key = o.section_key
    AND s.position IS DISTINCT FROM o.ordinal - 1;

  SET CONSTRAINTS public.persona_sections_persona_position_unique IMMEDIATE;

  UPDATE public.personas AS p
  SET version = p.version + 1, updated_at = now()
  WHERE p.id = v_row.id AND p.account_id = v_uid
  RETURNING * INTO v_row;

  INSERT INTO public.persona_revisions
    (persona_id, account_id, actor_id, revision_number, event_type, configuration_payload)
  VALUES
    (v_row.id, v_uid, v_uid, v_row.version, 'updated',
     jsonb_build_object('change', 'section_order', 'before', v_before,
       'after', to_jsonb(p_section_keys)));

  RETURN v_row;
END;
$fn$;

-- ===========================================================================
-- persona_set_default
-- Purpose: make an active Persona the account's single default, or clear its
--   default flag (p_is_default = false).
-- Input validation: p_is_default NOT NULL (default true).
-- Ownership / version / lifecycle: as in the shared contract; only an active
--   Persona may be default.
-- Mutation: a per-account advisory transaction lock serializes concurrent
--   switches. When switching, the previous default (a different Persona owned
--   by v_uid, locked FOR UPDATE) is cleared first (its version + 1), then the
--   target is set (version + 1). This order satisfies the immediate partial
--   unique index personas_one_active_default_per_account.
-- Revision: event 'default_changed' for each Persona changed, both written in
--   this same transaction. The previous default's expected version is not
--   supplied by the caller; its version bump may legitimately make a
--   concurrent editor of that Persona retry.
-- No-op: already in the requested state -> no bump, no revision.
-- Errors: 28000, 22023, P0002, 40001, 55000, 23505.
-- ===========================================================================
CREATE FUNCTION public.persona_set_default(
  p_persona_id uuid,
  p_expected_version integer,
  p_is_default boolean DEFAULT true
)
RETURNS public.personas
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_row public.personas;
  v_old public.personas;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_persona_id IS NULL OR p_expected_version IS NULL OR p_is_default IS NULL THEN
    RAISE EXCEPTION 'Persona id, expected version and default flag are required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('folioone.persona:' || v_uid::text, 0));

  SELECT * INTO v_row FROM public.personas AS p
  WHERE p.id = p_persona_id AND p.account_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Persona not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.version <> p_expected_version THEN
    RAISE EXCEPTION 'Persona was changed by another request' USING ERRCODE = '40001';
  END IF;
  IF v_row.status <> 'active' THEN
    RAISE EXCEPTION 'Persona is archived' USING ERRCODE = '55000';
  END IF;
  IF v_row.is_default = p_is_default THEN
    RETURN v_row;
  END IF;

  IF p_is_default THEN
    SELECT * INTO v_old FROM public.personas AS p
    WHERE p.account_id = v_uid AND p.is_default AND p.status = 'active' AND p.id <> v_row.id
    FOR UPDATE;
    IF FOUND THEN
      UPDATE public.personas AS p
      SET is_default = false, version = p.version + 1, updated_at = now()
      WHERE p.id = v_old.id AND p.account_id = v_uid
      RETURNING * INTO v_old;
      INSERT INTO public.persona_revisions
        (persona_id, account_id, actor_id, revision_number, event_type, configuration_payload)
      VALUES
        (v_old.id, v_uid, v_uid, v_old.version, 'default_changed',
         jsonb_build_object('is_default', jsonb_build_object('before', true, 'after', false),
           'replaced_by', v_row.id));
    END IF;
  END IF;

  UPDATE public.personas AS p
  SET is_default = p_is_default, version = p.version + 1, updated_at = now()
  WHERE p.id = v_row.id AND p.account_id = v_uid
  RETURNING * INTO v_row;

  INSERT INTO public.persona_revisions
    (persona_id, account_id, actor_id, revision_number, event_type, configuration_payload)
  VALUES
    (v_row.id, v_uid, v_uid, v_row.version, 'default_changed',
     jsonb_build_object('is_default',
       jsonb_build_object('before', NOT p_is_default, 'after', p_is_default),
       'replaced', v_old.id));

  RETURN v_row;
END;
$fn$;

-- ===========================================================================
-- persona_set_lifecycle
-- Purpose: archive an active Persona or restore an archived one.
-- Input validation: p_status must be 'archived' or 'active'.
-- Ownership / version: as in the shared contract. Lifecycle: operates on either
--   state; requesting the current state is a no-op.
-- Mutation: archive -> status 'archived', archived_at = now(), is_default =
--   false (archive always clears default); restore -> status 'active',
--   archived_at = NULL, is_default stays false (default is never restored
--   silently). Persona version + 1. Restore can raise 23505 if another active
--   Persona has the same name (case-insensitive) or the slug is in use.
-- Revision: event 'archived' or 'restored' with status/default before/after.
-- Errors: 28000, 22023, P0002, 40001, 23505.
-- ===========================================================================
CREATE FUNCTION public.persona_set_lifecycle(
  p_persona_id uuid,
  p_expected_version integer,
  p_status text
)
RETURNS public.personas
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_row public.personas;
  v_was_default boolean;
  v_before_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_persona_id IS NULL OR p_expected_version IS NULL THEN
    RAISE EXCEPTION 'Persona id and expected version are required' USING ERRCODE = '22023';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('active', 'archived') THEN
    RAISE EXCEPTION 'Status must be active or archived' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('folioone.persona:' || v_uid::text, 0));

  SELECT * INTO v_row FROM public.personas AS p
  WHERE p.id = p_persona_id AND p.account_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Persona not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.version <> p_expected_version THEN
    RAISE EXCEPTION 'Persona was changed by another request' USING ERRCODE = '40001';
  END IF;
  IF v_row.status = p_status THEN
    RETURN v_row;
  END IF;
  v_was_default := v_row.is_default;
  v_before_status := v_row.status;

  IF p_status = 'archived' THEN
    UPDATE public.personas AS p
    SET status = 'archived', archived_at = now(), is_default = false,
        version = p.version + 1, updated_at = now()
    WHERE p.id = v_row.id AND p.account_id = v_uid
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.personas AS p
    SET status = 'active', archived_at = NULL, is_default = false,
        version = p.version + 1, updated_at = now()
    WHERE p.id = v_row.id AND p.account_id = v_uid
    RETURNING * INTO v_row;
  END IF;

  INSERT INTO public.persona_revisions
    (persona_id, account_id, actor_id, revision_number, event_type, configuration_payload)
  VALUES
    (v_row.id, v_uid, v_uid, v_row.version,
     CASE WHEN p_status = 'archived' THEN 'archived' ELSE 'restored' END,
     jsonb_build_object('status', jsonb_build_object('before', v_before_status, 'after', p_status),
       'is_default', jsonb_build_object('before', v_was_default, 'after', false)));

  RETURN v_row;
END;
$fn$;

-- ===========================================================================
-- persona_duplicate
-- Purpose: copy a Persona's own configuration (metadata, sections, profile
--   field selections, overrides) into a NEW active, private, non-default
--   Persona. No canonical identity values are copied; slug and default status
--   are not copied.
-- Input validation: p_source_persona_id required; p_new_name required (trimmed,
--   non-blank); the new name must be unique among the account's active Personas.
-- Ownership: source must belong to v_uid (P0002 otherwise); every copied row is
--   inserted with account_id = v_uid.
-- Expected version: not applicable; the source is read under FOR SHARE and not
--   modified. Lifecycle: source may be active or archived.
-- Mutation: INSERT new personas row (position = max+1, serialized by the
--   per-account advisory lock); INSERT ... SELECT copies of the source's
--   persona_sections, persona_profile_field_selections and
--   persona_profile_overrides (override_version resets to its default of 1).
-- Revision: event 'duplicated', revision_number 1 for the NEW Persona, payload
--   with source id and copied row counts. The source gets no revision.
-- Errors: 28000, 22023, P0002, 23505, 23503, 23514.
-- ===========================================================================
CREATE FUNCTION public.persona_duplicate(
  p_source_persona_id uuid,
  p_new_name text
)
RETURNS public.personas
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_name text := btrim(p_new_name);
  v_src public.personas;
  v_row public.personas;
  v_next_position integer;
  v_sections integer;
  v_selections integer;
  v_overrides integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_source_persona_id IS NULL THEN
    RAISE EXCEPTION 'Source Persona id is required' USING ERRCODE = '22023';
  END IF;
  IF v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION 'Persona name is required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('folioone.persona:' || v_uid::text, 0));

  SELECT * INTO v_src FROM public.personas AS p
  WHERE p.id = p_source_persona_id AND p.account_id = v_uid FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Persona not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(MAX(p.position), -1) + 1 INTO v_next_position
  FROM public.personas AS p WHERE p.account_id = v_uid;

  INSERT INTO public.personas
    (account_id, name, description, audience, purpose, position)
  VALUES
    (v_uid, v_name, v_src.description, v_src.audience, v_src.purpose, v_next_position)
  RETURNING * INTO v_row;

  INSERT INTO public.persona_sections
    (persona_id, account_id, section_key, label_override, is_visible, position)
  SELECT v_row.id, v_uid, s.section_key, s.label_override, s.is_visible, s.position
  FROM public.persona_sections AS s
  WHERE s.persona_id = v_src.id AND s.account_id = v_uid;
  GET DIAGNOSTICS v_sections = ROW_COUNT;

  INSERT INTO public.persona_profile_field_selections
    (persona_id, account_id, field_key, is_included, position, is_highlighted)
  SELECT v_row.id, v_uid, f.field_key, f.is_included, f.position, f.is_highlighted
  FROM public.persona_profile_field_selections AS f
  WHERE f.persona_id = v_src.id AND f.account_id = v_uid;
  GET DIAGNOSTICS v_selections = ROW_COUNT;

  INSERT INTO public.persona_profile_overrides
    (persona_id, account_id, field_key, override_value)
  SELECT v_row.id, v_uid, o.field_key, o.override_value
  FROM public.persona_profile_overrides AS o
  WHERE o.persona_id = v_src.id AND o.account_id = v_uid;
  GET DIAGNOSTICS v_overrides = ROW_COUNT;

  INSERT INTO public.persona_revisions
    (persona_id, account_id, actor_id, revision_number, event_type, configuration_payload)
  VALUES
    (v_row.id, v_uid, v_uid, v_row.version, 'duplicated',
     jsonb_build_object('source_persona_id', v_src.id,
       'copied', jsonb_build_object('sections', v_sections,
         'profile_field_selections', v_selections, 'profile_field_overrides', v_overrides)));

  RETURN v_row;
END;
$fn$;

-- ===========================================================================
-- persona_delete
-- Purpose: permanently delete an ARCHIVED Persona and its own configuration
--   and history. Canonical identity data is never touched.
-- Input validation: p_persona_id and p_expected_version required.
-- Ownership: Persona must belong to v_uid (P0002 otherwise).
-- Expected version: 40001 when stale.  Lifecycle: status must be 'archived'
--   (55000 for active Personas; archive first).
-- Mutation: DELETE public.personas row. Child sections, selections, overrides
--   and revisions are removed by ON DELETE CASCADE foreign keys, which run as
--   the table owner and therefore need no DELETE privilege for authenticated
--   on selections or revisions (revision history stays append-only for every
--   other path). Future Portfolio/Card foreign keys are RESTRICT and raise
--   23503, aborting the delete atomically.
-- Revision: none retained (permanent deletion purges history by design).
-- Returns the deleted Persona id.
-- Errors: 28000, 22023, P0002, 40001, 55000, 23503.
-- ===========================================================================
CREATE FUNCTION public.persona_delete(
  p_persona_id uuid,
  p_expected_version integer
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_row public.personas;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_persona_id IS NULL OR p_expected_version IS NULL THEN
    RAISE EXCEPTION 'Persona id and expected version are required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.personas AS p
  WHERE p.id = p_persona_id AND p.account_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Persona not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.version <> p_expected_version THEN
    RAISE EXCEPTION 'Persona was changed by another request' USING ERRCODE = '40001';
  END IF;
  IF v_row.status <> 'archived' THEN
    RAISE EXCEPTION 'Persona must be archived before it can be deleted' USING ERRCODE = '55000';
  END IF;

  DELETE FROM public.personas AS p
  WHERE p.id = v_row.id AND p.account_id = v_uid;

  RETURN v_row.id;
END;
$fn$;

-- ===========================================================================
-- EXECUTE privileges: exact signatures only. CREATE FUNCTION grants EXECUTE to
-- PUBLIC by default and Supabase default privileges may add anon and
-- service_role; revoke all three, then grant authenticated.
-- ===========================================================================
REVOKE ALL ON FUNCTION
  public.persona_create(text, text, text, text, text),
  public.persona_update_metadata(uuid, integer, text, text, text, text, text),
  public.persona_update_profile_field(uuid, integer, text, boolean, boolean, integer, text, text),
  public.persona_upsert_section(uuid, integer, text, text, boolean),
  public.persona_delete_section(uuid, integer, text),
  public.persona_reorder_sections(uuid, integer, text[]),
  public.persona_set_default(uuid, integer, boolean),
  public.persona_set_lifecycle(uuid, integer, text),
  public.persona_duplicate(uuid, text),
  public.persona_delete(uuid, integer)
FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION
  public.persona_create(text, text, text, text, text),
  public.persona_update_metadata(uuid, integer, text, text, text, text, text),
  public.persona_update_profile_field(uuid, integer, text, boolean, boolean, integer, text, text),
  public.persona_upsert_section(uuid, integer, text, text, boolean),
  public.persona_delete_section(uuid, integer, text),
  public.persona_reorder_sections(uuid, integer, text[]),
  public.persona_set_default(uuid, integer, boolean),
  public.persona_set_lifecycle(uuid, integer, text),
  public.persona_duplicate(uuid, text),
  public.persona_delete(uuid, integer)
TO authenticated;

COMMIT;

-- Post-execution verification SQL (read-only):
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef AS security_definer, p.provolatile, p.proconfig,
       pg_get_userbyid(p.proowner) AS owner,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_exec,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_exec,
       EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
               WHERE a.grantee = 0) AS public_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'persona\_%'
ORDER BY p.proname;
-- Expected: eleven rows (ten mutation functions + persona_write_rpc_context),
-- security_definer false everywhere, proconfig {search_path=""}, owner postgres,
-- authenticated_exec true, and anon_exec, service_role_exec, public_exec false.
-- Catalog results do not establish runtime behavior: the gate, version, lifecycle
-- and atomic-rollback behavior require the separately approved hosted tests.
--
-- Rollback limitation: dropping the functions removes the only permitted write
-- path (direct writes stay blocked by the file-004 policies). Existing Persona
-- data is unaffected. Only with developer approval:
-- DROP FUNCTION public.persona_delete(uuid, integer);
-- DROP FUNCTION public.persona_duplicate(uuid, text);
-- DROP FUNCTION public.persona_set_lifecycle(uuid, integer, text);
-- DROP FUNCTION public.persona_set_default(uuid, integer, boolean);
-- DROP FUNCTION public.persona_reorder_sections(uuid, integer, text[]);
-- DROP FUNCTION public.persona_delete_section(uuid, integer, text);
-- DROP FUNCTION public.persona_upsert_section(uuid, integer, text, text, boolean);
-- DROP FUNCTION public.persona_update_profile_field(uuid, integer, text, boolean, boolean, integer, text, text);
-- DROP FUNCTION public.persona_update_metadata(uuid, integer, text, text, text, text, text);
-- DROP FUNCTION public.persona_create(text, text, text, text, text);
