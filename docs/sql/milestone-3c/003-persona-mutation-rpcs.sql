-- M3C-PERSONA-003 — Persona mutation functions (nine RPCs).
--
-- STATUS: PROPOSAL. Not executed. Not approved for execution. Supersedes
-- milestone-3a/005-persona-mutation-rpcs.sql.
--
-- Purpose and scope
--   Install the nine PostgREST-callable mutation functions the application's
--   repository calls. Each is PL/pgSQL, VOLATILE, SECURITY INVOKER with
--   SET search_path = '' (NO SECURITY DEFINER anywhere), derives the owner only
--   from auth.uid() (no account parameter exists), repeats the owner predicate in
--   every WHERE in addition to RLS, checks the caller's expected version, and
--   writes exactly one revision per mutation in the same transaction. A failure at
--   any step, including the revision INSERT, aborts the transaction and rolls the
--   whole mutation back (there is no EXCEPTION block anywhere, hence no
--   subtransaction that could swallow an error).
--
-- The nine mutation functions (plus the read-only persona_detail_json helper)
--   persona_create_with_configuration   NEW                  createWithConfiguration
--   persona_update_metadata             from 005, unchanged  updateMetadata
--   persona_apply_profile_field_changes NEW                  applyProfileFieldChanges
--   persona_upsert_section              from 005, unchanged  upsertSection
--   persona_reorder_sections            from 005, unchanged  reorderSections
--   persona_set_default                 from 005, unchanged  setDefault
--   persona_set_lifecycle               from 005, unchanged  setLifecycle
--   persona_duplicate                   from 005, unchanged  duplicate
--   persona_delete                      from 005, unchanged  delete
-- Read-only helper: persona_detail_json(uuid) (see its header below).
-- Not deployed (no caller; every endpoint widens the write surface): the
-- milestone-3a persona_create, persona_update_profile_field and
-- persona_delete_section.
--
-- RETURN CONTRACT (approved change from the first M3C draft)
--   Every mutation except persona_delete RETURNS jsonb: the complete resulting
--   Persona state, built INSIDE the same transaction by public.persona_detail_json
--   after the last write. It has the same shape the application reads with one
--   PostgREST select: the personas columns (id, name, description, audience,
--   purpose, status, is_default, position, version, created_at, updated_at,
--   archived_at) plus persona_sections, persona_profile_field_selections,
--   persona_profile_overrides (arrays) and persona_revisions as [{"count": N}].
--   The application therefore needs NO second request after a mutation, and the
--   returned state (including the new version and revision count) is exactly the
--   state that committed. persona_delete returns the deleted id. A no-op returns
--   the current state with no bump and no revision.
--
-- Shared contract (unchanged from milestone-3a/005)
--   28000 unauthenticated; P0002 not found (also for a foreign Persona: no
--   ownership leak); 40001 stale expected version; 55000 wrong lifecycle state;
--   22023 invalid input; 23505 unique violation; 23503 FK violation; 23514 check
--   violation. No-op requests return the current state (the same JSON as any mutation) with
--   no version bump and no revision.
--   Every successful change increments personas.version by exactly 1 and writes
--   one revision whose revision_number equals the new version.
--
-- Preconditions (enforced; failure aborts and creates nothing)
--   - 001 and 002 executed: five Persona tables with RLS enabled and forced, the
--     gate helper, and exactly 16 policies.
--   - No function named persona_* exists in schema public except
--     persona_write_rpc_context().
-- Execution order: 3 of 3. Run in the same session as 001 and 002 (the tables are
--   not usable for writes until this file exists).
-- Repeatability: ONE-TIME. Plain CREATE FUNCTION (no OR REPLACE) so existing
--   objects stop the script. Single transaction: a failure leaves nothing behind.
-- Expected outcome: nine mutation functions, the gate helper and persona_detail_json; EXECUTE only for
--   authenticated, revoked from PUBLIC, anon and service_role on each exact
--   signature. Verification: verify-catalog.sql, sections 4-5.
-- Rollback / recovery: see rollback.sql. Dropping the functions removes the only
--   permitted write path; direct writes stay blocked by 002.

BEGIN;

DO $preflight$
BEGIN
  IF session_user <> 'postgres' OR current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Run as postgres in the SQL Editor';
  END IF;
  IF (SELECT count(*) FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND c.relname IN ('personas', 'persona_sections',
          'persona_profile_field_selections', 'persona_profile_overrides',
          'persona_revisions')
        AND c.relrowsecurity AND c.relforcerowsecurity) <> 5 THEN
    RAISE EXCEPTION '001 must be executed first';
  END IF;
  IF to_regprocedure('public.persona_write_rpc_context()') IS NULL
     OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
         AND tablename IN ('personas', 'persona_sections',
           'persona_profile_field_selections', 'persona_profile_overrides',
           'persona_revisions')) <> 16 THEN
    RAISE EXCEPTION '002 must be executed first (gate helper and 16 policies)';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname LIKE 'persona\_%'
               AND p.proname <> 'persona_write_rpc_context') THEN
    RAISE EXCEPTION 'persona_* functions already exist; this file is one-time';
  END IF;
END;
$preflight$;

-- ===========================================================================
-- persona_detail_json  (READ-ONLY helper; not a mutation, NOT on the gate allowlist)
-- Purpose: build the Persona's complete state as jsonb for the caller, or NULL
--   when the Persona does not exist or is not the caller's. Called by every
--   mutation as its last step so the response is read inside the mutation's own
--   transaction (it sees that transaction's writes). It is SECURITY INVOKER, so
--   RLS and the explicit owner predicates below both apply: it can only ever
--   return the caller's own data. It writes nothing. It is VOLATILE only so that
--   every call takes a fresh snapshot (a STABLE function would reuse the calling
--   statement's snapshot); this does not make it a write path. Because it is
--   callable as an RPC, it is exposed read-only exactly like a SELECT on the
--   caller's own rows; the verification queries list it.
-- ===========================================================================
CREATE FUNCTION public.persona_detail_json(p_persona_id uuid)
RETURNS jsonb
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $fn$
  SELECT jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'description', p.description,
    'audience', p.audience,
    'purpose', p.purpose,
    'status', p.status,
    'is_default', p.is_default,
    'position', p.position,
    'version', p.version,
    'created_at', p.created_at,
    'updated_at', p.updated_at,
    'archived_at', p.archived_at,
    'persona_sections', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'section_key', s.section_key, 'label_override', s.label_override,
               'is_visible', s.is_visible, 'position', s.position)
             ORDER BY s.position, s.section_key)
      FROM public.persona_sections AS s
      WHERE s.persona_id = p.id AND s.account_id = (SELECT auth.uid())), '[]'::jsonb),
    'persona_profile_field_selections', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'field_key', f.field_key, 'is_included', f.is_included,
               'is_highlighted', f.is_highlighted, 'position', f.position)
             ORDER BY f.position, f.field_key)
      FROM public.persona_profile_field_selections AS f
      WHERE f.persona_id = p.id AND f.account_id = (SELECT auth.uid())), '[]'::jsonb),
    'persona_profile_overrides', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'field_key', o.field_key, 'override_value', o.override_value,
               'override_version', o.override_version)
             ORDER BY o.field_key)
      FROM public.persona_profile_overrides AS o
      WHERE o.persona_id = p.id AND o.account_id = (SELECT auth.uid())), '[]'::jsonb),
    'persona_revisions', jsonb_build_array(jsonb_build_object('count', (
      SELECT count(*) FROM public.persona_revisions AS r
      WHERE r.persona_id = p.id AND r.account_id = (SELECT auth.uid()))))
  )
  FROM public.personas AS p
  WHERE p.id = p_persona_id AND p.account_id = (SELECT auth.uid());
$fn$;

-- ===========================================================================
-- persona_create_with_configuration  (NEW in M3C; no milestone-3a equivalent)
-- Purpose: the four-step create flow as ONE atomic operation. Creates an active,
--   private Persona with its complete configuration: metadata, one selection
--   row for every allowlisted profile field (absent fields default to excluded),
--   Persona-specific overrides, section layout, and optionally makes it the
--   single default. One transaction, one revision (event 'created', number 1).
--   Replaces persona_create + N x persona_update_profile_field + section calls,
--   which are not atomic together and would bump the version once per call.
-- Input (jsonb arrays; keys are snake_case):
--   p_fields    [{field_key, is_included, is_highlighted, position}]
--   p_overrides [{field_key, value}]          value NULL = intentional blank
--   p_sections  [{section_key, label, is_visible, position}]
--   Unknown or repeated keys, a highlight on an excluded field, duplicate
--   section positions and over-long arrays raise 22023.
-- Ownership: account_id is auth.uid(); no account parameter exists.
-- Account anchor: inserts the caller's own public.accounts row if absent
--   (id = auth.uid(); allowed by the Milestone 2 accounts_insert_own policy).
--   This writes only the ownership anchor, never Master Identity content.
--   (Decision D-8 in the M3C decision document.)
-- Locking: per-account advisory transaction lock (position, single default).
-- Default: p_make_default clears the previous default first (its version + 1
--   and a 'default_changed' revision), then sets this one WITHOUT a version
--   bump, so the new Persona is still version 1.
-- Errors: 28000, 22023, 23505 (active name exists), 23503, 23514.
-- ===========================================================================
CREATE FUNCTION public.persona_create_with_configuration(
  p_name text,
  p_description text,
  p_audience text,
  p_purpose text,
  p_fields jsonb,
  p_overrides jsonb,
  p_sections jsonb,
  p_make_default boolean DEFAULT false
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
  v_keys constant text[] := ARRAY['display_name', 'headline', 'summary',
    'location', 'website_url', 'linkedin_url', 'github_url'];
  v_fields jsonb := COALESCE(p_fields, '[]'::jsonb);
  v_overrides jsonb := COALESCE(p_overrides, '[]'::jsonb);
  v_sections jsonb := COALESCE(p_sections, '[]'::jsonb);
  v_row public.personas;
  v_old public.personas;
  v_next_position integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION 'Persona name is required' USING ERRCODE = '22023';
  END IF;
  IF p_make_default IS NULL THEN
    RAISE EXCEPTION 'Default flag is required' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(v_fields) <> 'array' OR jsonb_typeof(v_overrides) <> 'array'
     OR jsonb_typeof(v_sections) <> 'array' THEN
    RAISE EXCEPTION 'Fields, overrides and sections must be arrays' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(v_fields) > 7 OR jsonb_array_length(v_overrides) > 7
     OR jsonb_array_length(v_sections) > 50 THEN
    RAISE EXCEPTION 'Too many entries' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(v_fields)
      AS f(field_key text, is_included boolean, is_highlighted boolean, position integer)
    WHERE f.field_key IS NULL OR f.field_key <> ALL (v_keys)
       OR f.is_included IS NULL OR f.is_highlighted IS NULL
       OR f.position IS NULL OR f.position < 0
       OR (f.is_highlighted AND NOT f.is_included)
  ) THEN
    RAISE EXCEPTION 'Invalid profile field selection' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) <> count(DISTINCT f.field_key)
      FROM jsonb_to_recordset(v_fields) AS f(field_key text)) THEN
    RAISE EXCEPTION 'Each profile field may appear once' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(v_overrides) AS o(field_key text)
    WHERE o.field_key IS NULL OR o.field_key <> ALL (v_keys)
  ) THEN
    RAISE EXCEPTION 'Unknown profile field in overrides' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) <> count(DISTINCT o.field_key)
      FROM jsonb_to_recordset(v_overrides) AS o(field_key text)) THEN
    RAISE EXCEPTION 'Each override field may appear once' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(v_sections)
      AS s(section_key text, label text, is_visible boolean, position integer)
    WHERE s.section_key IS NULL OR char_length(btrim(s.section_key)) NOT BETWEEN 1 AND 80
       OR s.is_visible IS NULL OR s.position IS NULL OR s.position < 0
  ) THEN
    RAISE EXCEPTION 'Invalid section' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) <> count(DISTINCT btrim(s.section_key))
        OR count(*) <> count(DISTINCT s.position)
      FROM jsonb_to_recordset(v_sections) AS s(section_key text, position integer)) THEN
    RAISE EXCEPTION 'Section keys and positions must be unique' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('folioone.persona:' || v_uid::text, 0));

  INSERT INTO public.accounts (id) VALUES (v_uid) ON CONFLICT (id) DO NOTHING;

  SELECT COALESCE(MAX(p.position), -1) + 1 INTO v_next_position
  FROM public.personas AS p WHERE p.account_id = v_uid;

  INSERT INTO public.personas
    (account_id, name, slug, description, audience, purpose, position)
  VALUES
    (v_uid, v_name, NULL, NULLIF(btrim(p_description), ''),
     NULLIF(btrim(p_audience), ''), NULLIF(btrim(p_purpose), ''), v_next_position)
  RETURNING * INTO v_row;

  INSERT INTO public.persona_profile_field_selections
    (persona_id, account_id, field_key, is_included, position, is_highlighted)
  SELECT v_row.id, v_uid, k.field_key,
         COALESCE(f.is_included, false),
         COALESCE(f.position, k.ordinal::integer - 1),
         COALESCE(f.is_highlighted, false)
  FROM unnest(v_keys) WITH ORDINALITY AS k(field_key, ordinal)
  LEFT JOIN jsonb_to_recordset(v_fields)
    AS f(field_key text, is_included boolean, is_highlighted boolean, position integer)
    ON f.field_key = k.field_key;

  INSERT INTO public.persona_profile_overrides
    (persona_id, account_id, field_key, override_value)
  SELECT v_row.id, v_uid, o.field_key, o.value
  FROM jsonb_to_recordset(v_overrides) AS o(field_key text, value text);

  INSERT INTO public.persona_sections
    (persona_id, account_id, section_key, label_override, is_visible, position)
  SELECT v_row.id, v_uid, btrim(s.section_key), NULLIF(btrim(s.label), ''),
         s.is_visible, s.position
  FROM jsonb_to_recordset(v_sections)
    AS s(section_key text, label text, is_visible boolean, position integer);

  IF p_make_default THEN
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
    UPDATE public.personas AS p
    SET is_default = true
    WHERE p.id = v_row.id AND p.account_id = v_uid
    RETURNING * INTO v_row;
  END IF;

  INSERT INTO public.persona_revisions
    (persona_id, account_id, actor_id, revision_number, event_type, configuration_payload)
  VALUES
    (v_row.id, v_uid, v_uid, v_row.version, 'created',
     jsonb_build_object(
       'metadata', jsonb_build_object('name', v_row.name, 'description', v_row.description,
         'audience', v_row.audience, 'purpose', v_row.purpose),
       'is_default', v_row.is_default,
       'profile_fields', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'field_key', s.field_key, 'included', s.is_included,
            'highlighted', s.is_highlighted, 'position', s.position)
            ORDER BY s.position, s.field_key), '[]'::jsonb)
          FROM public.persona_profile_field_selections AS s
          WHERE s.persona_id = v_row.id AND s.account_id = v_uid),
       'overrides', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'field_key', o.field_key, 'value', o.override_value)
            ORDER BY o.field_key), '[]'::jsonb)
          FROM public.persona_profile_overrides AS o
          WHERE o.persona_id = v_row.id AND o.account_id = v_uid),
       'sections', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'section_key', c.section_key, 'label', c.label_override,
            'is_visible', c.is_visible, 'position', c.position)
            ORDER BY c.position), '[]'::jsonb)
          FROM public.persona_sections AS c
          WHERE c.persona_id = v_row.id AND c.account_id = v_uid)));

  RETURN public.persona_detail_json(v_row.id);
END;
$fn$;

-- ===========================================================================
-- persona_apply_profile_field_changes  (NEW in M3C; generalises
--   persona_update_profile_field, which is not deployed)
-- Purpose: change SEVERAL profile fields of an active Persona in one atomic
--   step: inclusion, highlight, position and Persona-specific overrides (set,
--   intentional blank, reset). Backs bulk actions, field reordering and the
--   Presentation tab's multi-field save. Exactly one version bump and one
--   revision per call; any invalid entry rolls the whole call back.
-- Input: p_changes jsonb array of 1-7 objects, one per field:
--   {field_key, is_included?, is_highlighted?, position?,
--    override_action? 'keep'|'set'|'reset', override_value?}
--   An omitted selection key leaves the stored value unchanged. override_value
--   is allowed only with action 'set' (JSON null = intentional blank). An entry
--   that requests nothing raises 22023. Excluding a field clears its highlight;
--   highlighting an excluded field raises 22023.
-- Ownership / version / lifecycle: as in the shared contract (P0002, 40001, 55000).
-- No-op: when nothing would change the row is returned unchanged, with no bump
--   and no revision.
-- Errors: 28000, 22023, P0002, 40001, 55000, 23514 (override value invalid).
-- ===========================================================================
CREATE FUNCTION public.persona_apply_profile_field_changes(
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
    RAISE EXCEPTION 'Persona was changed by another request' USING ERRCODE = '40001';
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
-- No-op: identical values return the current state unchanged (no version, no revision).
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
    RAISE EXCEPTION 'Persona was changed by another request' USING ERRCODE = '40001';
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
    RAISE EXCEPTION 'Persona was changed by another request' USING ERRCODE = '40001';
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
RETURNS jsonb
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

  RETURN public.persona_detail_json(v_row.id);
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
-- Returns the deleted Persona id (there is no resulting state to return).
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
  public.persona_detail_json(uuid),
  public.persona_create_with_configuration(text, text, text, text, jsonb, jsonb, jsonb, boolean),
  public.persona_update_metadata(uuid, integer, text, text, text, text, text),
  public.persona_apply_profile_field_changes(uuid, integer, jsonb),
  public.persona_upsert_section(uuid, integer, text, text, boolean),
  public.persona_reorder_sections(uuid, integer, text[]),
  public.persona_set_default(uuid, integer, boolean),
  public.persona_set_lifecycle(uuid, integer, text),
  public.persona_duplicate(uuid, text),
  public.persona_delete(uuid, integer)
FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION
  public.persona_detail_json(uuid),
  public.persona_create_with_configuration(text, text, text, text, jsonb, jsonb, jsonb, boolean),
  public.persona_update_metadata(uuid, integer, text, text, text, text, text),
  public.persona_apply_profile_field_changes(uuid, integer, jsonb),
  public.persona_upsert_section(uuid, integer, text, text, boolean),
  public.persona_reorder_sections(uuid, integer, text[]),
  public.persona_set_default(uuid, integer, boolean),
  public.persona_set_lifecycle(uuid, integer, text),
  public.persona_duplicate(uuid, text),
  public.persona_delete(uuid, integer)
TO authenticated;

-- Assert the outcome before committing: any failure rolls everything back.
DO $assert$
DECLARE
  gate_def text;
  gate_names text[];
  function_names text[];
  bad text;
BEGIN
  SELECT array_agg(p.proname::text ORDER BY p.proname) INTO function_names
  FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname LIKE 'persona\_%'
    AND p.proname NOT IN ('persona_write_rpc_context', 'persona_detail_json');
  IF cardinality(function_names) <> 9 THEN
    RAISE EXCEPTION 'Expected exactly nine persona_* mutation functions, found %', function_names;
  END IF;
  IF to_regprocedure('public.persona_detail_json(uuid)') IS NULL THEN
    RAISE EXCEPTION 'persona_detail_json(uuid) is missing';
  END IF;
  IF (SELECT count(*) FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'persona\_%') <> 11 THEN
    RAISE EXCEPTION 'Expected exactly eleven persona_* functions (nine mutations, the gate helper and persona_detail_json)';
  END IF;
  -- No Persona function may reference Master Identity profile data.
  IF EXISTS (SELECT 1 FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname LIKE 'persona\_%'
               AND p.prosrc ILIKE '%identity_profiles%') THEN
    RAISE EXCEPTION 'A Persona function references identity_profiles';
  END IF;
  -- The only write to public.accounts is the single anchor insert in the create RPC.
  IF EXISTS (SELECT 1 FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname LIKE 'persona\_%'
               AND p.proname <> 'persona_create_with_configuration'
               AND p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+public\.accounts') THEN
    RAISE EXCEPTION 'Only persona_create_with_configuration may write public.accounts';
  END IF;

  -- The gate allowlist and the deployed functions must be the same set.
  SELECT pg_get_functiondef('public.persona_write_rpc_context()'::regprocedure) INTO gate_def;
  SELECT array_agg(m[1] ORDER BY m[1]) INTO gate_names
  FROM regexp_matches(gate_def, '/rpc/(persona_[a-z_]+)', 'g') AS m;
  IF gate_names IS DISTINCT FROM function_names THEN
    RAISE EXCEPTION 'Gate allowlist % does not match deployed functions %', gate_names, function_names;
  END IF;

  SELECT string_agg(p.proname, ', ') INTO bad
  FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname LIKE 'persona\_%'
    AND (p.prosecdef
      OR p.proconfig IS NULL
      OR NOT ('search_path=""' = ANY (p.proconfig))
      OR (p.proname <> 'persona_write_rpc_context' AND p.provolatile <> 'v')
      OR (p.proname NOT IN ('persona_delete', 'persona_write_rpc_context')
          AND p.prorettype <> 'jsonb'::regtype)
      OR (p.proname = 'persona_delete' AND p.prorettype <> 'uuid'::regtype)
      OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
      OR has_function_privilege('anon', p.oid, 'EXECUTE')
      OR has_function_privilege('service_role', p.oid, 'EXECUTE')
      OR EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS a
                 WHERE a.grantee = 0));
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Function configuration or privileges are wrong for: %', bad;
  END IF;
END;
$assert$;

COMMIT;

-- Post-execution verification: verify-catalog.sql (read-only). Catalog results do
-- not establish runtime behaviour (the gate, version checks, rollback, isolation);
-- those require the hosted two-user tests, which need an explicit stage approval.
