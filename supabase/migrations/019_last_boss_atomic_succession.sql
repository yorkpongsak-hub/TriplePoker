-- TriplePoker: Rise - Gate 10.4 atomic Last Boss succession and mandatory rename
-- Run manually in Supabase SQL Editor; do not execute automatically.

ALTER TABLE last_boss_reigns
  ADD COLUMN IF NOT EXISTS succession_idempotency_key UUID UNIQUE;

ALTER TABLE last_boss_mandatory_renames
  ADD COLUMN IF NOT EXISTS completion_idempotency_key UUID UNIQUE;

CREATE TABLE IF NOT EXISTS sovereign_reward_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  entitlement_key TEXT NOT NULL,
  source_match_id UUID REFERENCES sovereign_matches(id) ON DELETE RESTRICT,
  source_reign_id UUID REFERENCES last_boss_reigns(id) ON DELETE RESTRICT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, entitlement_key, source_match_id)
);
ALTER TABLE sovereign_reward_entitlements ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION sovereign_activate_caelum(
  p_started_at TIMESTAMPTZ,
  p_idempotency_key UUID
)
RETURNS SETOF last_boss_reigns AS $$
DECLARE v_reign last_boss_reigns%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('LAST_BOSS_ACTIVE_REIGN', 0));
  SELECT * INTO v_reign FROM last_boss_reigns WHERE status = 'ACTIVE' FOR UPDATE;
  IF FOUND THEN RETURN NEXT v_reign; RETURN; END IF;
  INSERT INTO last_boss_reigns(
    reign_number, throne_name, status, started_at, aura_key, succession_idempotency_key
  ) VALUES (1, 'CAELUM', 'ACTIVE', p_started_at, 'last-boss-aura-1', p_idempotency_key)
  RETURNING * INTO v_reign;
  INSERT INTO last_boss_reserved_names(name, source_reign_id) VALUES ('CAELUM', v_reign.id)
    ON CONFLICT (normalized_name) DO UPDATE SET source_reign_id = COALESCE(last_boss_reserved_names.source_reign_id, EXCLUDED.source_reign_id);
  INSERT INTO reserved_names(name, reason) VALUES ('CAELUM', 'Tier S+ first Last Boss throne name')
    ON CONFLICT (normalized_name) DO NOTHING;
  RETURN NEXT v_reign;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION sovereign_begin_last_boss_succession(
  p_match_id UUID,
  p_conqueror_user_id UUID,
  p_idempotency_key UUID
)
RETURNS TABLE(defeated_reign_id UUID, next_reign_id UUID, mandatory_rename_id UUID) AS $$
DECLARE
  v_match sovereign_matches%ROWTYPE;
  v_current last_boss_reigns%ROWTYPE;
  v_next last_boss_reigns%ROWTYPE;
  v_name VARCHAR(50);
  v_rename last_boss_mandatory_renames%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('LAST_BOSS_ACTIVE_REIGN', 0));
  SELECT * INTO v_next FROM last_boss_reigns WHERE succession_idempotency_key = p_idempotency_key;
  IF FOUND THEN
    SELECT * INTO v_rename FROM last_boss_mandatory_renames WHERE next_reign_id = v_next.id;
    RETURN QUERY SELECT v_rename.defeated_reign_id, v_next.id, v_rename.id;
    RETURN;
  END IF;
  SELECT * INTO v_match FROM sovereign_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND OR v_match.state <> 'COMPLETED' THEN RAISE EXCEPTION 'MATCH_NOT_COMPLETED'; END IF;
  SELECT * INTO v_current FROM last_boss_reigns WHERE status = 'ACTIVE' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACTIVE_REIGN_NOT_FOUND'; END IF;
  SELECT display_name INTO v_name FROM users WHERE user_id = p_conqueror_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONQUEROR_NOT_FOUND'; END IF;
  IF EXISTS (SELECT 1 FROM last_boss_mandatory_renames WHERE user_id = p_conqueror_user_id AND status = 'REQUIRED') THEN
    RAISE EXCEPTION 'RENAME_ALREADY_REQUIRED';
  END IF;

  UPDATE last_boss_reigns SET status = 'CLOSED', ended_at = NOW(), defeated_match_id = p_match_id,
    conqueror_user_id = p_conqueror_user_id, conqueror_name_at_victory = v_name, updated_at = NOW()
  WHERE id = v_current.id;
  INSERT INTO last_boss_reigns(
    reign_number, throne_name, status, started_at, source_match_id, aura_key, succession_idempotency_key
  ) VALUES (
    v_current.reign_number + 1, v_name, 'ACTIVE', NOW(), p_match_id,
    'last-boss-aura-' || (((v_current.reign_number) % 12) + 1)::TEXT, p_idempotency_key
  ) RETURNING * INTO v_next;
  INSERT INTO last_boss_reserved_names(name, source_reign_id) VALUES (v_name, v_next.id);
  INSERT INTO reserved_names(name, reason) VALUES (v_name, 'Last Boss throne succession')
    ON CONFLICT (normalized_name) DO NOTHING;
  INSERT INTO last_boss_mandatory_renames(
    idempotency_key, user_id, defeated_reign_id, next_reign_id, former_name, required_at
  ) VALUES (p_idempotency_key, p_conqueror_user_id, v_current.id, v_next.id, v_name, NOW())
  RETURNING * INTO v_rename;

  INSERT INTO sovereign_reward_entitlements(user_id, entitlement_key, source_match_id, source_reign_id, metadata_json)
  VALUES
    (p_conqueror_user_id, 'THRONEBREAKER', p_match_id, v_current.id, jsonb_build_object('defeatedThroneName', v_current.throne_name)),
    (p_conqueror_user_id, 'LAST_BOSS_TABLE_SKIN', p_match_id, v_current.id, '{}'::JSONB),
    (p_conqueror_user_id, 'CONQUEROR_OF:' || v_current.normalized_throne_name, p_match_id, v_current.id,
      jsonb_build_object('label', 'Conqueror of ' || v_current.throne_name))
  ON CONFLICT (user_id, entitlement_key, source_match_id) DO NOTHING;
  RETURN QUERY SELECT v_current.id, v_next.id, v_rename.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION sovereign_complete_mandatory_rename(
  p_user_id UUID,
  p_new_name VARCHAR(50),
  p_idempotency_key UUID
)
RETURNS TABLE(user_id UUID, display_name VARCHAR(50), rename_status TEXT) AS $$
DECLARE
  v_rename last_boss_mandatory_renames%ROWTYPE;
  v_trimmed VARCHAR(50) := TRIM(p_new_name);
  v_normalized VARCHAR(50);
BEGIN
  v_normalized := LOWER(REGEXP_REPLACE(v_trimmed, '\s+', ' ', 'g'));
  IF CHAR_LENGTH(v_trimmed) < 3 OR CHAR_LENGTH(v_trimmed) > 9
    OR v_trimmed !~ '^[a-zA-Z0-9ก-๙ _-]+$' THEN RAISE EXCEPTION 'INVALID_DISPLAY_NAME'; END IF;
  SELECT * INTO v_rename FROM last_boss_mandatory_renames
  WHERE user_id = p_user_id AND status = 'REQUIRED' FOR UPDATE;
  IF NOT FOUND THEN
    SELECT * INTO v_rename FROM last_boss_mandatory_renames
    WHERE user_id = p_user_id AND status = 'COMPLETED' AND completion_idempotency_key = p_idempotency_key;
    IF FOUND THEN RETURN QUERY SELECT p_user_id, v_rename.new_name, v_rename.status; RETURN; END IF;
    RAISE EXCEPTION 'MANDATORY_RENAME_NOT_FOUND';
  END IF;
  IF EXISTS (SELECT 1 FROM reserved_names WHERE normalized_name = v_normalized)
    OR EXISTS (SELECT 1 FROM last_boss_reserved_names WHERE normalized_name = v_normalized)
    OR EXISTS (SELECT 1 FROM users WHERE user_id <> p_user_id AND LOWER(TRIM(REGEXP_REPLACE(display_name, '\s+', ' ', 'g'))) = v_normalized)
  THEN RAISE EXCEPTION 'DISPLAY_NAME_UNAVAILABLE'; END IF;

  UPDATE users SET display_name = v_trimmed WHERE users.user_id = p_user_id;
  UPDATE last_boss_mandatory_renames SET status = 'COMPLETED', completed_at = NOW(), new_name = v_trimmed,
    completion_idempotency_key = p_idempotency_key
  WHERE id = v_rename.id;
  UPDATE last_boss_reigns SET conqueror_new_name = v_trimmed, updated_at = NOW()
  WHERE id = v_rename.defeated_reign_id;
  RETURN QUERY SELECT p_user_id, v_trimmed, 'COMPLETED'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION sovereign_activate_caelum(TIMESTAMPTZ,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION sovereign_begin_last_boss_succession(UUID,UUID,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION sovereign_complete_mandatory_rename(UUID,VARCHAR,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sovereign_activate_caelum(TIMESTAMPTZ,UUID) TO service_role;
GRANT EXECUTE ON FUNCTION sovereign_begin_last_boss_succession(UUID,UUID,UUID) TO service_role;
GRANT EXECUTE ON FUNCTION sovereign_complete_mandatory_rename(UUID,VARCHAR,UUID) TO service_role;
NOTIFY pgrst, 'reload schema';
