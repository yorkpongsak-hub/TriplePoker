-- TriplePoker: Rise - Fix economy_apply_transaction: explicit burn override for match settlement
-- Run manually in Supabase SQL Editor. Requires 035 to already be applied.
--
-- Bug found during live Initiate testing (2026-08-12): match settlement was crediting the
-- human's PLAYER entry with their *net* result (finalStack - buyInAmount) instead of their full
-- finalStack. That was wrong because the buy-in was already deducted from their real
-- token_balance separately, by the untouched begin_match_escrow RPC, before the match even
-- started — crediting only the net at settlement effectively deducted the buy-in a second time,
-- shorting the player by exactly one buyInAmount. The fix is to credit the full finalStack.
--
-- But `finalStack` alone breaks the implicit burn-counter math this function previously relied
-- on (cumulative_burn += SUM(-amount) across all entries only equals the true rake burn when the
-- PLAYER entry is the *net* result — using finalStack throws that derivation off by exactly
-- buyInAmount, since finalStack effectively contains an untracked "returning" component the
-- ledger never saw leave in the first place).
--
-- Fix: add an optional `p_burn_override` param. The caller (which already knows the true rake
-- amount from tokenFlow.ts's own bookkeeping — state.feeRake) can supply it explicitly for BURN
-- transactions, decoupling "how much moves into each account" from "how much was actually
-- burned." When NULL (every other/future BURN caller, e.g. a simple Shop burn), falls back to
-- the original implicit SUM(-amount) calculation — unchanged behavior for anything simpler.

CREATE OR REPLACE FUNCTION economy_apply_transaction(
  p_idempotency_key TEXT,
  p_type TEXT,
  p_reason TEXT,
  p_entries JSONB,
  p_metadata JSONB DEFAULT '{}'::JSONB,
  p_context JSONB DEFAULT '{}'::JSONB,
  p_created_by TEXT DEFAULT NULL,
  p_burn_override JSONB DEFAULT NULL -- {"token": <bigint>, "crest": <bigint>} — BURN type only
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

  -- Genesis/Mint/Burn are intentionally single-sided (not TRANSFER) — update the global counters.
  -- GENESIS/MINT entries are positive (money appearing); their counters always derive from the
  -- entries' own SUM. BURN accepts an explicit p_burn_override (see header comment) because a
  -- match-settlement BURN's entries can legitimately include an untracked-money-returning
  -- component (the escrow buy-in) that must NOT be counted as burn.
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
    IF p_burn_override IS NOT NULL THEN
      UPDATE economy_global_counters SET
        cumulative_token_burn = cumulative_token_burn + COALESCE((p_burn_override->>'token')::BIGINT, 0),
        cumulative_crest_burn = cumulative_crest_burn + COALESCE((p_burn_override->>'crest')::BIGINT, 0),
        updated_at = NOW()
      WHERE id;
    ELSE
      UPDATE economy_global_counters SET
        cumulative_token_burn = cumulative_token_burn + COALESCE((SELECT SUM(-(item->>'amount')::BIGINT) FROM jsonb_array_elements(p_entries) item WHERE item->>'currency' = 'TOKEN'), 0),
        cumulative_crest_burn = cumulative_crest_burn + COALESCE((SELECT SUM(-(item->>'amount')::BIGINT) FROM jsonb_array_elements(p_entries) item WHERE item->>'currency' = 'CREST'), 0),
        updated_at = NOW()
      WHERE id;
    END IF;
  END IF;

  RETURN QUERY SELECT v_tx_id, FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Signature changed (new trailing param) — drop the old-signature grants first so PostgREST
-- doesn't keep two overloaded versions of this function around.
DROP FUNCTION IF EXISTS economy_apply_transaction(TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT);

REVOKE ALL ON FUNCTION economy_apply_transaction(TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION economy_apply_transaction(TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT, JSONB) TO service_role;

NOTIFY pgrst, 'reload schema';
