-- M3C-PERSONA-004 — Stale-version conflicts must not use SQLSTATE 40001.
--
-- STATUS: PROPOSAL (forward fix). Not executed. Authored after runtime evidence
-- from the first hosted integration run against the development project; it needs
-- independent review and the developer's explicit execution. Nothing in this
-- repository has run it.
--
-- WHY (runtime evidence, development project, 2026-11-09)
--   003 raises SQLSTATE 40001 (serialization_failure) when the caller's expected
--   version is stale. Through PostgREST/Supabase a request that fails with 40001
--   NEVER RETURNS: a raw POST to /rest/v1/rpc/persona_update_metadata with a stale
--   version was still pending after 20 seconds, while the same functions return
--   promptly for every other error class (P0002 not found: HTTP 500 in 162 ms;
--   55000 not archived: HTTP 500 in 237 ms). This is consistent with the platform
--   treating 40001 as retryable and re-running a request that fails
--   deterministically; it has not been confirmed from platform logs. Either way a
--   stale version is an ordinary, expected user event, so as deployed it hangs the
--   request and may keep re-running it. It must not be signalled with 40001.
--
-- WHAT
--   Redeploys the SEVEN functions that check an expected version, changing ONLY
--   the SQLSTATE of the stale-version error from 40001 to PT409 (a PostgreSQL
--   five-character SQLSTATE in PostgREST's custom "PTxyz" range, which PostgREST
--   returns with HTTP 409 and the code intact). Message text, logic, signatures,
--   return types, SECURITY INVOKER and SET search_path are unchanged byte for
--   byte apart from that one literal. The application maps PT409 (and still 40001)
--   to its version_conflict error.
--   persona_create_with_configuration, persona_duplicate, persona_detail_json and
--   persona_write_rpc_context are not touched.
--
-- WHAT IT DOES NOT TOUCH
--   No table, index, constraint, policy or grant. CREATE OR REPLACE keeps each
--   function's owner and EXECUTE privileges; the assertions below verify that.
--   identity_profiles is not referenced. No SECURITY DEFINER is introduced.
--
-- Preconditions (enforced; failure aborts and changes nothing)
--   - Run as postgres in the SQL Editor, development project.
--   - 001-003 executed: the eleven persona_* functions exist.
--   - Each of the seven functions currently raises 40001 and does not yet contain
--     PT409 (so a second run aborts instead of silently re-applying).
-- Execution order: 4 (after 001-003). Single transaction.
-- Repeatability: ONE-TIME by precondition (a rerun aborts).
-- Expected outcome: the seven functions raise PT409 for a stale version and no
--   persona_* function mentions 40001; privileges and settings are unchanged.
-- Verification: verify-catalog.sql section 4b, then the hosted suite
--   (tests/hosted/persona-persistence.hosted.ts), whose four stale-version tests
--   currently hang and must pass.
-- Rollback / recovery: re-running the corresponding function definitions from 003
--   restores 40001 and with it the hang described above, so it is NOT a safe
--   rollback. The safe recovery if PT409 misbehaves is to keep PERSONA_STORAGE=
--   fixture and report; do not re-enable 40001.

BEGIN;

DO $preflight$
DECLARE
  target text;
  signature text;
BEGIN
  IF session_user <> 'postgres' OR current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Run as postgres in the SQL Editor';
  END IF;
  IF (SELECT count(*) FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'persona\_%') <> 11 THEN
    RAISE EXCEPTION '001-003 must be executed first: expected exactly eleven persona_* functions';
  END IF;
  FOREACH signature IN ARRAY ARRAY[
    'public.persona_update_metadata(uuid, integer, text, text, text, text, text)',
    'public.persona_apply_profile_field_changes(uuid, integer, jsonb)',
    'public.persona_upsert_section(uuid, integer, text, text, boolean)',
    'public.persona_reorder_sections(uuid, integer, text[])',
    'public.persona_set_default(uuid, integer, boolean)',
    'public.persona_set_lifecycle(uuid, integer, text)',
    'public.persona_delete(uuid, integer)'
  ] LOOP
    IF to_regprocedure(signature) IS NULL THEN
      RAISE EXCEPTION 'Missing function %', signature;
    END IF;
    SELECT p.prosrc INTO target FROM pg_proc AS p WHERE p.oid = to_regprocedure(signature);
    IF target NOT LIKE '%40001%' OR target LIKE '%PT409%' THEN
      RAISE EXCEPTION '% is not in the expected pre-004 state (must raise 40001 and not mention PT409)', signature;
    END IF;
  END LOOP;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.persona_update_metadata(
  p_persona_id uuid,
  p_expected_version integer,
  p_name text,
  p_slug text,
  p_description text,
  p_audience text,
  p_purpose text
)
RETURNS jsonb
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
    RAISE EXCEPTION 'Persona was changed by another request' USING ERRCODE = 'PT409';
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
    RETURN public.persona_detail_json(v_row.id);
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

  RETURN public.persona_detail_json(v_row.id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.persona_apply_profile_field_changes(
  p_persona_id uuid,
  p_expected_version integer,
  p_changes jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_keys constant text[] := ARRAY['display_name', 'headline', 'summary',
    'location', 'website_url', 'linkedin_url', 'github_url'];
  v_row public.personas;
  v_change jsonb;
  v_key text;
  v_seen text[] := ARRAY[]::text[];
  v_action text;
  v_has_inc boolean;
  v_has_hl boolean;
  v_has_pos boolean;
  v_inc_req boolean;
  v_hl_req boolean;
  v_pos_req integer;
  v_sel public.persona_profile_field_selections;
  v_sel_found boolean;
  v_ov public.persona_profile_overrides;
  v_ov_found boolean;
  v_new_inc boolean;
  v_new_hl boolean;
  v_new_pos integer;
  v_new_value text;
  v_sel_before jsonb;
  v_sel_after jsonb;
  v_sel_audit jsonb;
  v_ov_audit jsonb;
  v_audit jsonb := '[]'::jsonb;
  v_changed boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_persona_id IS NULL OR p_expected_version IS NULL OR p_changes IS NULL THEN
    RAISE EXCEPTION 'Persona id, expected version and changes are required' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_changes) <> 'array' OR jsonb_array_length(p_changes) NOT BETWEEN 1 AND 7 THEN
    RAISE EXCEPTION 'Changes must be an array of 1-7 entries' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.personas AS p
  WHERE p.id = p_persona_id AND p.account_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Persona not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.version <> p_expected_version THEN
    RAISE EXCEPTION 'Persona was changed by another request' USING ERRCODE = 'PT409';
  END IF;
  IF v_row.status <> 'active' THEN
    RAISE EXCEPTION 'Persona is archived' USING ERRCODE = '55000';
  END IF;

  FOR v_change IN SELECT e.value FROM jsonb_array_elements(p_changes) AS e(value) LOOP
    IF jsonb_typeof(v_change) <> 'object' THEN
      RAISE EXCEPTION 'Each change must be an object' USING ERRCODE = '22023';
    END IF;
    v_key := v_change ->> 'field_key';
    IF v_key IS NULL OR v_key <> ALL (v_keys) THEN
      RAISE EXCEPTION 'Unknown profile field' USING ERRCODE = '22023';
    END IF;
    IF v_key = ANY (v_seen) THEN
      RAISE EXCEPTION 'Each field may appear once per request' USING ERRCODE = '22023';
    END IF;
    v_seen := array_append(v_seen, v_key);

    v_action := COALESCE(v_change ->> 'override_action', 'keep');
    IF v_action NOT IN ('keep', 'set', 'reset') THEN
      RAISE EXCEPTION 'Invalid override action' USING ERRCODE = '22023';
    END IF;
    IF v_action <> 'set' AND v_change ? 'override_value' THEN
      RAISE EXCEPTION 'Override value is only valid with action set' USING ERRCODE = '22023';
    END IF;

    v_has_inc := v_change ? 'is_included';
    v_has_hl := v_change ? 'is_highlighted';
    v_has_pos := v_change ? 'position';
    IF (v_has_inc AND jsonb_typeof(v_change -> 'is_included') <> 'boolean')
       OR (v_has_hl AND jsonb_typeof(v_change -> 'is_highlighted') <> 'boolean')
       OR (v_has_pos AND jsonb_typeof(v_change -> 'position') <> 'number') THEN
      RAISE EXCEPTION 'Invalid selection value' USING ERRCODE = '22023';
    END IF;
    IF NOT (v_has_inc OR v_has_hl OR v_has_pos) AND v_action = 'keep' THEN
      RAISE EXCEPTION 'No change requested' USING ERRCODE = '22023';
    END IF;
    v_inc_req := CASE WHEN v_has_inc THEN (v_change ->> 'is_included')::boolean END;
    v_hl_req := CASE WHEN v_has_hl THEN (v_change ->> 'is_highlighted')::boolean END;
    v_pos_req := CASE WHEN v_has_pos THEN (v_change ->> 'position')::integer END;
    IF v_pos_req IS NOT NULL AND v_pos_req < 0 THEN
      RAISE EXCEPTION 'Position must be non-negative' USING ERRCODE = '22023';
    END IF;

    v_sel_audit := NULL;
    v_ov_audit := NULL;

    IF v_has_inc OR v_has_hl OR v_has_pos THEN
      SELECT * INTO v_sel FROM public.persona_profile_field_selections AS s
      WHERE s.persona_id = v_row.id AND s.account_id = v_uid AND s.field_key = v_key
      FOR UPDATE;
      v_sel_found := FOUND;
      v_new_inc := COALESCE(v_inc_req, CASE WHEN v_sel_found THEN v_sel.is_included ELSE false END);
      v_new_hl := COALESCE(v_hl_req, CASE WHEN v_sel_found THEN v_sel.is_highlighted ELSE false END);
      v_new_pos := COALESCE(v_pos_req, CASE WHEN v_sel_found THEN v_sel.position ELSE 0 END);
      IF NOT v_new_inc THEN
        IF v_hl_req IS TRUE THEN
          RAISE EXCEPTION 'An excluded field cannot be highlighted' USING ERRCODE = '22023';
        END IF;
        v_new_hl := false;
      END IF;
      v_sel_before := CASE WHEN v_sel_found
        THEN jsonb_build_object('included', v_sel.is_included,
               'highlighted', v_sel.is_highlighted, 'position', v_sel.position)
        ELSE 'null'::jsonb END;
      v_sel_after := jsonb_build_object('included', v_new_inc,
        'highlighted', v_new_hl, 'position', v_new_pos);
      IF v_sel_before IS DISTINCT FROM v_sel_after THEN
        IF v_sel_found THEN
          UPDATE public.persona_profile_field_selections AS s
          SET is_included = v_new_inc, is_highlighted = v_new_hl,
              position = v_new_pos, updated_at = now()
          WHERE s.persona_id = v_row.id AND s.account_id = v_uid AND s.field_key = v_key;
        ELSE
          INSERT INTO public.persona_profile_field_selections
            (persona_id, account_id, field_key, is_included, position, is_highlighted)
          VALUES (v_row.id, v_uid, v_key, v_new_inc, v_new_pos, v_new_hl);
        END IF;
        v_changed := true;
        v_sel_audit := jsonb_build_object('before', v_sel_before, 'after', v_sel_after);
      END IF;
    END IF;

    IF v_action <> 'keep' THEN
      SELECT * INTO v_ov FROM public.persona_profile_overrides AS o
      WHERE o.persona_id = v_row.id AND o.account_id = v_uid AND o.field_key = v_key
      FOR UPDATE;
      v_ov_found := FOUND;
      IF v_action = 'set' THEN
        v_new_value := v_change ->> 'override_value';
        IF NOT (v_ov_found AND v_ov.override_value IS NOT DISTINCT FROM v_new_value) THEN
          IF v_ov_found THEN
            UPDATE public.persona_profile_overrides AS o
            SET override_value = v_new_value,
                override_version = o.override_version + 1,
                updated_at = now()
            WHERE o.persona_id = v_row.id AND o.account_id = v_uid AND o.field_key = v_key;
          ELSE
            INSERT INTO public.persona_profile_overrides
              (persona_id, account_id, field_key, override_value)
            VALUES (v_row.id, v_uid, v_key, v_new_value);
          END IF;
          v_changed := true;
          v_ov_audit := jsonb_build_object(
            'before', CASE WHEN v_ov_found
              THEN jsonb_build_object('present', true, 'value', v_ov.override_value)
              ELSE jsonb_build_object('present', false) END,
            'after', jsonb_build_object('present', true, 'value', v_new_value));
        END IF;
      ELSIF v_ov_found THEN
        DELETE FROM public.persona_profile_overrides AS o
        WHERE o.persona_id = v_row.id AND o.account_id = v_uid AND o.field_key = v_key;
        v_changed := true;
        v_ov_audit := jsonb_build_object(
          'before', jsonb_build_object('present', true, 'value', v_ov.override_value),
          'after', jsonb_build_object('present', false));
      END IF;
    END IF;

    IF v_sel_audit IS NOT NULL OR v_ov_audit IS NOT NULL THEN
      v_audit := v_audit || jsonb_build_array(jsonb_build_object(
        'field_key', v_key, 'selection', v_sel_audit, 'override', v_ov_audit));
    END IF;
  END LOOP;

  IF NOT v_changed THEN
    RETURN public.persona_detail_json(v_row.id);
  END IF;

  UPDATE public.personas AS p
  SET version = p.version + 1, updated_at = now()
  WHERE p.id = v_row.id AND p.account_id = v_uid
  RETURNING * INTO v_row;

  INSERT INTO public.persona_revisions
    (persona_id, account_id, actor_id, revision_number, event_type, configuration_payload)
  VALUES
    (v_row.id, v_uid, v_uid, v_row.version, 'updated',
     jsonb_build_object('change', 'profile_fields', 'fields', v_audit));

  RETURN public.persona_detail_json(v_row.id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.persona_upsert_section(
  p_persona_id uuid,
  p_expected_version integer,
  p_section_key text,
  p_label_override text,
  p_is_visible boolean
)
RETURNS jsonb
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
    RAISE EXCEPTION 'Persona was changed by another request' USING ERRCODE = 'PT409';
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
      RETURN public.persona_detail_json(v_row.id);
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

  RETURN public.persona_detail_json(v_row.id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.persona_reorder_sections(
  p_persona_id uuid,
  p_expected_version integer,
  p_section_keys text[]
)
RETURNS jsonb
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
    RAISE EXCEPTION 'Persona was changed by another request' USING ERRCODE = 'PT409';
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
    RETURN public.persona_detail_json(v_row.id);
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

  RETURN public.persona_detail_json(v_row.id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.persona_set_default(
  p_persona_id uuid,
  p_expected_version integer,
  p_is_default boolean DEFAULT true
)
RETURNS jsonb
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
    RAISE EXCEPTION 'Persona was changed by another request' USING ERRCODE = 'PT409';
  END IF;
  IF v_row.status <> 'active' THEN
    RAISE EXCEPTION 'Persona is archived' USING ERRCODE = '55000';
  END IF;
  IF v_row.is_default = p_is_default THEN
    RETURN public.persona_detail_json(v_row.id);
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

  RETURN public.persona_detail_json(v_row.id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.persona_set_lifecycle(
  p_persona_id uuid,
  p_expected_version integer,
  p_status text
)
RETURNS jsonb
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
    RAISE EXCEPTION 'Persona was changed by another request' USING ERRCODE = 'PT409';
  END IF;
  IF v_row.status = p_status THEN
    RETURN public.persona_detail_json(v_row.id);
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

  RETURN public.persona_detail_json(v_row.id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.persona_delete(
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
    RAISE EXCEPTION 'Persona was changed by another request' USING ERRCODE = 'PT409';
  END IF;
  IF v_row.status <> 'archived' THEN
    RAISE EXCEPTION 'Persona must be archived before it can be deleted' USING ERRCODE = '55000';
  END IF;

  DELETE FROM public.personas AS p
  WHERE p.id = v_row.id AND p.account_id = v_uid;

  RETURN v_row.id;
END;
$fn$;

-- Assert the outcome before committing: any failure rolls everything back.
DO $assert$
DECLARE
  signature text;
  src text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.persona_update_metadata(uuid, integer, text, text, text, text, text)',
    'public.persona_apply_profile_field_changes(uuid, integer, jsonb)',
    'public.persona_upsert_section(uuid, integer, text, text, boolean)',
    'public.persona_reorder_sections(uuid, integer, text[])',
    'public.persona_set_default(uuid, integer, boolean)',
    'public.persona_set_lifecycle(uuid, integer, text)',
    'public.persona_delete(uuid, integer)'
  ] LOOP
    SELECT p.prosrc INTO src FROM pg_proc AS p WHERE p.oid = to_regprocedure(signature);
    IF src NOT LIKE '%PT409%' OR src LIKE '%40001%' THEN
      RAISE EXCEPTION '% must raise PT409 and no longer mention 40001', signature;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname LIKE 'persona\_%' AND p.prosrc LIKE '%40001%') THEN
    RAISE EXCEPTION 'A persona_* function still raises 40001';
  END IF;
  -- Configuration and privileges are exactly as in 003 (CREATE OR REPLACE kept them).
  IF (SELECT count(*) FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'persona\_%') <> 11 THEN
    RAISE EXCEPTION 'Expected exactly eleven persona_* functions';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname LIKE 'persona\_%'
               AND (p.prosecdef
                 OR p.proconfig IS NULL
                 OR NOT ('search_path=""' = ANY (p.proconfig))
                 OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
                 OR has_function_privilege('anon', p.oid, 'EXECUTE')
                 OR has_function_privilege('service_role', p.oid, 'EXECUTE')
                 OR EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS a
                            WHERE a.grantee = 0)
                 OR p.prosrc ILIKE '%identity_profiles%')) THEN
    RAISE EXCEPTION 'Function configuration, privileges or Master Identity references changed unexpectedly';
  END IF;
END;
$assert$;

COMMIT;

-- Post-execution: run verify-catalog.sql section 4b (expected: zero functions mention
-- 40001; seven mention PT409), then the hosted suite. Catalog results do not show runtime
-- behaviour: only the hosted tests show that a stale version now returns promptly.
