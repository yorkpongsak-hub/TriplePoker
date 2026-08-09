-- TriplePoker: fix "column reference user_id is ambiguous" in arena_apply_crest_batch
-- Root cause: RETURNS TABLE(user_id UUID, ...) declares an implicit OUT parameter named
-- user_id, which collides with the unqualified `user_id` column reference inside the
-- advisory-lock PERFORM/ORDER BY block. Every other reference in the function already
-- qualifies with `users.user_id` — this block was the one spot that didn't, so every
-- Arena settlement transaction (Ante/Auction/Call/BossFee/PilePayout/Sweep/EndMatch)
-- has been failing to persist since 016 first shipped.
-- Run manually in Supabase SQL Editor; do not execute automatically.

CREATE OR REPLACE FUNCTION arena_apply_crest_batch(
  p_transaction_key TEXT,
  p_match_id TEXT,
  p_reason TEXT,
  p_entries JSONB,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE(user_id UUID, total_crest BIGINT) AS $$
DECLARE
  v_entry JSONB;
  v_user UUID;
  v_delta INTEGER;
  v_crown INTEGER;
  v_remainder SMALLINT;
  v_before BIGINT;
  v_after BIGINT;
  v_results JSONB := '[]'::JSONB;
  v_existing arena_settlement_transactions%ROWTYPE;
  v_row_key UUID;
BEGIN
  IF jsonb_typeof(p_entries) <> 'array' THEN RAISE EXCEPTION 'BATCH_ENTRIES_MUST_BE_ARRAY'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_transaction_key::TEXT, 0));

  SELECT * INTO v_existing FROM arena_settlement_transactions WHERE transaction_key = p_transaction_key;
  IF FOUND THEN
    IF v_existing.match_id <> p_match_id OR v_existing.reason <> p_reason OR v_existing.entries <> p_entries OR v_existing.metadata <> p_metadata THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT';
    END IF;
    RETURN QUERY SELECT (item->>'userId')::UUID, (item->>'totalCrest')::BIGINT
      FROM jsonb_array_elements(v_existing.result_balances) item;
    RETURN;
  END IF;

  -- ล็อก user rows ตาม UUID order ป้องกัน deadlock ระหว่าง batch พร้อมกัน
  -- (แก้: qualify เป็น users.user_id กัน ambiguous กับ OUT parameter user_id ของ RETURNS TABLE)
  PERFORM 1 FROM users
  WHERE users.user_id IN (SELECT DISTINCT (item->>'userId')::UUID FROM jsonb_array_elements(p_entries) item)
  ORDER BY users.user_id FOR UPDATE;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    v_user := (v_entry->>'userId')::UUID;
    v_delta := (v_entry->>'deltaCrest')::INTEGER;
    IF v_delta = 0 THEN RAISE EXCEPTION 'DELTA_CREST_MUST_NOT_BE_ZERO'; END IF;

    SELECT crown_balance, crown_crest_remainder INTO v_crown, v_remainder
    FROM users WHERE users.user_id = v_user;
    IF NOT FOUND THEN RAISE EXCEPTION 'USER_NOT_FOUND'; END IF;

    v_before := v_crown::BIGINT * 12 + v_remainder;
    v_after := v_before + v_delta;
    IF v_after < 0 THEN RAISE EXCEPTION 'INSUFFICIENT_CREST'; END IF;

    UPDATE users SET crown_balance = (v_after / 12)::INTEGER,
      crown_crest_remainder = (v_after % 12)::SMALLINT
    WHERE users.user_id = v_user;

    v_row_key := md5(p_transaction_key::TEXT || ':' || v_user::TEXT)::UUID;
    INSERT INTO arena_crown_ledger(
      idempotency_key, user_id, match_id, reason, delta_crest,
      balance_before_crest, balance_after_crest
    ) VALUES (v_row_key, v_user, p_match_id, p_reason, v_delta, v_before, v_after);

    v_results := v_results || jsonb_build_array(jsonb_build_object('userId', v_user, 'totalCrest', v_after));
  END LOOP;

  INSERT INTO arena_settlement_transactions(transaction_key, match_id, reason, entries, metadata, result_balances)
  VALUES (p_transaction_key, p_match_id, p_reason, p_entries, p_metadata, v_results);

  RETURN QUERY SELECT (item->>'userId')::UUID, (item->>'totalCrest')::BIGINT
    FROM jsonb_array_elements(v_results) item;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION arena_apply_crest_batch(TEXT, TEXT, TEXT, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION arena_apply_crest_batch(TEXT, TEXT, TEXT, JSONB, JSONB) TO service_role;

NOTIFY pgrst, 'reload schema';
