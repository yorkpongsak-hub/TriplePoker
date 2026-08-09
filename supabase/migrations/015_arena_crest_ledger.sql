-- TriplePoker: Rise - Arena Crest ledger (Gate 2)
-- Additive compatibility migration: existing Crown Vault keeps whole Crown.
-- Run manually in Supabase SQL Editor; do not execute automatically.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS crown_crest_remainder SMALLINT NOT NULL DEFAULT 0
  CHECK (crown_crest_remainder >= 0 AND crown_crest_remainder < 12);

COMMENT ON COLUMN users.crown_crest_remainder IS
  'Arena fractional Earned Crown in Crest (0..11). Arena balance = crown_balance * 12 + this value. Crown Package is excluded.';

CREATE TABLE IF NOT EXISTS arena_crown_ledger (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  idempotency_key UUID NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  match_id TEXT,
  reason TEXT NOT NULL CHECK (reason IN (
    'MATCH_RESERVE', 'ANTE', 'AUCTION', 'CALL', 'BOSS_FEE',
    'POT_PAYOUT', 'BATTLE_REWARD', 'REFUND', 'CROWN_SINK'
  )),
  delta_crest INTEGER NOT NULL CHECK (delta_crest <> 0),
  balance_before_crest BIGINT NOT NULL CHECK (balance_before_crest >= 0),
  balance_after_crest BIGINT NOT NULL CHECK (balance_after_crest >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS arena_crown_ledger_user_created_idx
  ON arena_crown_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS arena_crown_ledger_match_idx
  ON arena_crown_ledger(match_id) WHERE match_id IS NOT NULL;

ALTER TABLE arena_crown_ledger ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION arena_apply_crest_delta(
  p_user_id UUID,
  p_delta_crest INTEGER,
  p_reason TEXT,
  p_idempotency_key UUID,
  p_match_id TEXT DEFAULT NULL
)
RETURNS TABLE(new_crown_balance INTEGER, new_crest_remainder SMALLINT, new_total_crest BIGINT) AS $$
DECLARE
  v_crown INTEGER;
  v_remainder SMALLINT;
  v_before BIGINT;
  v_after BIGINT;
  v_existing arena_crown_ledger%ROWTYPE;
BEGIN
  IF p_delta_crest = 0 THEN RAISE EXCEPTION 'DELTA_CREST_MUST_NOT_BE_ZERO'; END IF;

  -- ทำให้ retry พร้อมกันของ key เดียวกันเรียงลำดับก่อนเช็ค ledger
  PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key::TEXT, 0));

  SELECT * INTO v_existing
  FROM arena_crown_ledger
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.user_id <> p_user_id OR v_existing.delta_crest <> p_delta_crest OR v_existing.reason <> p_reason THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT';
    END IF;
    RETURN QUERY SELECT
      (v_existing.balance_after_crest / 12)::INTEGER,
      (v_existing.balance_after_crest % 12)::SMALLINT,
      v_existing.balance_after_crest;
    RETURN;
  END IF;

  SELECT crown_balance, crown_crest_remainder
  INTO v_crown, v_remainder
  FROM users
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'USER_NOT_FOUND'; END IF;

  v_before := v_crown::BIGINT * 12 + v_remainder;
  v_after := v_before + p_delta_crest;
  IF v_after < 0 THEN RAISE EXCEPTION 'INSUFFICIENT_CREST'; END IF;

  UPDATE users
  SET crown_balance = (v_after / 12)::INTEGER,
      crown_crest_remainder = (v_after % 12)::SMALLINT
  WHERE user_id = p_user_id;

  INSERT INTO arena_crown_ledger(
    idempotency_key, user_id, match_id, reason, delta_crest,
    balance_before_crest, balance_after_crest
  ) VALUES (
    p_idempotency_key, p_user_id, p_match_id, p_reason, p_delta_crest,
    v_before, v_after
  );

  RETURN QUERY SELECT
    (v_after / 12)::INTEGER,
    (v_after % 12)::SMALLINT,
    v_after;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION arena_apply_crest_delta(UUID, INTEGER, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION arena_apply_crest_delta(UUID, INTEGER, TEXT, UUID, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
