-- TriplePoker: Rise - Fix economy_apply_transaction: global-counter UPDATE needs a WHERE clause
-- Run manually in Supabase SQL Editor.
--
-- Bug found during live Initiate testing (2026-08-12): the GENESIS/MINT/BURN branches update
-- economy_global_counters (a single-row table) with a bare `UPDATE ... SET ...` and no WHERE
-- clause. Running the SQL Editor directly (Genesis, Clean Reset) never hit this, but Supabase
-- rejects a WHERE-less UPDATE when the function is invoked via RPC from the server
-- (supabaseAdmin.rpc(...)) — "UPDATE requires a WHERE clause". Every MATCH_SETTLEMENT attempt
-- since then has failed and rolled back (no data corruption — the whole transaction aborts
-- atomically) but it means no match has ever actually settled through the ledger yet.
--
-- Fix: add `WHERE id` (economy_global_counters.id is the boolean singleton-row PK, always TRUE)
-- to all 3 counter UPDATEs. CREATE OR REPLACE keeps the same signature/grants — no other change.

CREATE OR REPLACE FUNCTION economy_apply_transaction(
  p_idempotency_key TEXT,
  p_type TEXT,
  p_reason TEXT,
  p_entries JSONB,
  p_metadata JSONB DEFAULT '{}'::JSONB,
  p_context JSONB DEFAULT '{}'::JSONB,
  p_created_by TEXT DEFAULT NULL
)
RETURNS TABLE(transaction_id BIGINT, replayed BOOLEAN) AS $$
DECLARE
  v_existing_id BIGINT;
  v_existing_type TEXT;
  v_existing_reason TEXT;
  v_existing_entries JSONB;
  v_entry JSONB;
  v_account_type TEXT;
  v_account_id TEXT;
  v_currency TEXT;
  v_wallet TEXT;
  v_amount BIGINT;
  v_token_sum BIGINT;
  v_crest_sum BIGINT;
  v_before BIGINT;
  v_after BIGINT;
  v_crown INTEGER;
  v_remainder SMALLINT;
  v_tx_id BIGINT;
  v_reversal_of BIGINT;
BEGIN
  IF p_type NOT IN ('GENESIS', 'TRANSFER', 'BURN', 'MINT', 'REVERSAL', 'ADMIN_ADJUSTMENT') THEN
    RAISE EXCEPTION 'INVALID_TRANSACTION_TYPE';
  END IF;
  IF jsonb_typeof(p_entries) <> 'array' OR jsonb_array_length(p_entries) = 0 THEN
    RAISE EXCEPTION 'ENTRIES_MUST_BE_NONEMPTY_ARRAY';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));

  SELECT id, type, reason, entries INTO v_existing_id, v_existing_type, v_existing_reason, v_existing_entries
  FROM economy_transactions WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing_type <> p_type OR v_existing_reason <> p_reason OR v_existing_entries <> p_entries THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT';
    END IF;
    RETURN QUERY SELECT v_existing_id, TRUE;
    RETURN;
  END IF;

  -- ล็อก pool rows และ user rows ตามลำดับคงที่ (pool_key / user_id) ป้องกัน deadlock ระหว่าง transaction พร้อมกัน
  PERFORM 1 FROM economy_pool_accounts
  WHERE pool_key IN (
    SELECT DISTINCT item->>'accountId' FROM jsonb_array_elements(p_entries) item WHERE item->>'accountType' <> 'PLAYER'
  )
  ORDER BY pool_key FOR UPDATE;

  PERFORM 1 FROM users
  WHERE user_id IN (
    SELECT DISTINCT (item->>'accountId')::UUID FROM jsonb_array_elements(p_entries) item WHERE item->>'accountType' = 'PLAYER'
  )
  ORDER BY user_id FOR UPDATE;

  IF p_type = 'TRANSFER' THEN
    SELECT
      COALESCE(SUM((item->>'amount')::BIGINT) FILTER (WHERE item->>'currency' = 'TOKEN'), 0),
      COALESCE(SUM((item->>'amount')::BIGINT) FILTER (WHERE item->>'currency' = 'CREST'), 0)
    INTO v_token_sum, v_crest_sum
    FROM jsonb_array_elements(p_entries) item;
    IF v_token_sum <> 0 OR v_crest_sum <> 0 THEN
      RAISE EXCEPTION 'TRANSFER_ENTRIES_MUST_SUM_TO_ZERO';
    END IF;
  END IF;

  v_reversal_of := NULLIF(p_context->>'reversalOfTransactionId', '')::BIGINT;
  IF p_type = 'REVERSAL' AND v_reversal_of IS NULL THEN
    RAISE EXCEPTION 'REVERSAL_REQUIRES_REVERSAL_OF_TRANSACTION_ID';
  END IF;

  INSERT INTO economy_transactions(
    idempotency_key, type, reason, status, match_id, table_id, round_id, player_id,
    tier, npc_group, boss_id, entries, metadata, reversal_of_transaction_id, created_by
  ) VALUES (
    p_idempotency_key, p_type, p_reason, 'COMPLETED',
    p_context->>'matchId', p_context->>'tableId', p_context->>'roundId',
    NULLIF(p_context->>'playerId', '')::UUID,
    p_context->>'tier', p_context->>'npcGroup', p_context->>'bossId',
    p_entries, p_metadata, v_reversal_of, p_created_by
  ) RETURNING id INTO v_tx_id;

  IF v_reversal_of IS NOT NULL THEN
    UPDATE economy_transactions SET status = 'REVERSED' WHERE id = v_reversal_of;
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    v_account_type := v_entry->>'accountType';
    v_account_id   := v_entry->>'accountId';
    v_currency     := v_entry->>'currency';
    v_wallet       := v_entry->>'wallet';
    v_amount       := (v_entry->>'amount')::BIGINT;

    IF v_account_type NOT IN ('PLAYER', 'NPC_POOL', 'SYSTEM_RESERVE') THEN RAISE EXCEPTION 'INVALID_ACCOUNT_TYPE'; END IF;
    IF v_currency NOT IN ('TOKEN', 'CREST') THEN RAISE EXCEPTION 'INVALID_CURRENCY'; END IF;
    IF v_amount = 0 THEN RAISE EXCEPTION 'ENTRY_AMOUNT_MUST_NOT_BE_ZERO'; END IF;

    IF v_account_type = 'PLAYER' THEN
      IF v_currency = 'TOKEN' THEN
        SELECT token_balance INTO v_before FROM users WHERE users.user_id = v_account_id::UUID;
        IF NOT FOUND THEN RAISE EXCEPTION 'PLAYER_NOT_FOUND'; END IF;
        v_after := v_before + v_amount;
        IF v_after < 0 AND p_reason NOT IN ('DEBT_CARRY', 'ADMIN_CORRECTION') THEN
          RAISE EXCEPTION 'INSUFFICIENT_TOKEN_BALANCE';
        END IF;
        UPDATE users SET token_balance = v_after WHERE users.user_id = v_account_id::UUID;
      ELSIF v_wallet = 'PURCHASED' THEN
        SELECT crown_package_balance, crown_package_crest_remainder INTO v_crown, v_remainder
          FROM users WHERE users.user_id = v_account_id::UUID;
        IF NOT FOUND THEN RAISE EXCEPTION 'PLAYER_NOT_FOUND'; END IF;
        v_before := v_crown::BIGINT * 12 + v_remainder;
        v_after := v_before + v_amount;
        IF v_after < 0 THEN RAISE EXCEPTION 'INSUFFICIENT_CREST_BALANCE'; END IF;
        UPDATE users SET crown_package_balance = (v_after / 12)::INTEGER,
          crown_package_crest_remainder = (v_after % 12)::SMALLINT
        WHERE users.user_id = v_account_id::UUID;
      ELSE
        SELECT crown_balance, crown_crest_remainder INTO v_crown, v_remainder
          FROM users WHERE users.user_id = v_account_id::UUID;
        IF NOT FOUND THEN RAISE EXCEPTION 'PLAYER_NOT_FOUND'; END IF;
        v_before := v_crown::BIGINT * 12 + v_remainder;
        v_after := v_before + v_amount;
        IF v_after < 0 THEN RAISE EXCEPTION 'INSUFFICIENT_CREST_BALANCE'; END IF;
        UPDATE users SET crown_balance = (v_after / 12)::INTEGER,
          crown_crest_remainder = (v_after % 12)::SMALLINT
        WHERE users.user_id = v_account_id::UUID;
      END IF;
    ELSE -- NPC_POOL or SYSTEM_RESERVE
      IF v_currency = 'TOKEN' THEN
        SELECT token_balance INTO v_before FROM economy_pool_accounts WHERE pool_key = v_account_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'POOL_NOT_FOUND'; END IF;
        v_after := v_before + v_amount;
        IF v_after < 0 THEN RAISE EXCEPTION 'INSUFFICIENT_POOL_TOKEN_BALANCE'; END IF;
        UPDATE economy_pool_accounts SET token_balance = v_after, updated_at = NOW() WHERE pool_key = v_account_id;
      ELSE
        SELECT crest_balance INTO v_before FROM economy_pool_accounts WHERE pool_key = v_account_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'POOL_NOT_FOUND'; END IF;
        v_after := v_before + v_amount;
        IF v_after < 0 THEN RAISE EXCEPTION 'INSUFFICIENT_POOL_CREST_BALANCE'; END IF;
        UPDATE economy_pool_accounts SET crest_balance = v_after, updated_at = NOW() WHERE pool_key = v_account_id;
      END IF;
    END IF;

    INSERT INTO economy_ledger_entries(
      transaction_id, account_type, account_id, currency, wallet, amount, balance_before, balance_after
    ) VALUES (
      v_tx_id, v_account_type, v_account_id, v_currency, v_wallet, v_amount, v_before, v_after
    );
  END LOOP;

  -- Genesis/Mint/Burn are intentionally single-sided (not TRANSFER) — update the global counters
  -- from the signed entry amounts: GENESIS/MINT entries are positive (money appearing), BURN
  -- entries are negative (money leaving the debited account).
  -- FIX (035): economy_global_counters is a single-row table but Supabase still requires a WHERE
  -- clause on UPDATE when invoked via RPC (not an issue when run directly in the SQL Editor,
  -- which is why Genesis/Clean Reset never hit this) — `WHERE id` targets the one boolean PK row.
  IF p_type = 'GENESIS' THEN
    UPDATE economy_global_counters SET
      token_genesis = token_genesis + COALESCE((SELECT SUM((item->>'amount')::BIGINT) FROM jsonb_array_elements(p_entries) item WHERE item->>'currency' = 'TOKEN'), 0),
      crest_genesis = crest_genesis + COALESCE((SELECT SUM((item->>'amount')::BIGINT) FROM jsonb_array_elements(p_entries) item WHERE item->>'currency' = 'CREST'), 0),
      updated_at = NOW()
    WHERE id;
  ELSIF p_type = 'MINT' THEN
    UPDATE economy_global_counters SET
      cumulative_token_mint = cumulative_token_mint + COALESCE((SELECT SUM((item->>'amount')::BIGINT) FROM jsonb_array_elements(p_entries) item WHERE item->>'currency' = 'TOKEN'), 0),
      cumulative_crest_mint = cumulative_crest_mint + COALESCE((SELECT SUM((item->>'amount')::BIGINT) FROM jsonb_array_elements(p_entries) item WHERE item->>'currency' = 'CREST'), 0),
      updated_at = NOW()
    WHERE id;
  ELSIF p_type = 'BURN' THEN
    UPDATE economy_global_counters SET
      cumulative_token_burn = cumulative_token_burn + COALESCE((SELECT SUM(-(item->>'amount')::BIGINT) FROM jsonb_array_elements(p_entries) item WHERE item->>'currency' = 'TOKEN'), 0),
      cumulative_crest_burn = cumulative_crest_burn + COALESCE((SELECT SUM(-(item->>'amount')::BIGINT) FROM jsonb_array_elements(p_entries) item WHERE item->>'currency' = 'CREST'), 0),
      updated_at = NOW()
    WHERE id;
  END IF;

  RETURN QUERY SELECT v_tx_id, FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION economy_apply_transaction(TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION economy_apply_transaction(TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
