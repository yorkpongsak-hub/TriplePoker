-- TriplePoker: Rise - Central Economy Ledger (Token / Crown / Crest)
-- Unifies Token + Crown/Crest accounting (Player, NPC pools, System Reserve) behind one
-- atomic, idempotent, double-entry ledger. Supersedes arena_crown_ledger /
-- arena_settlement_transactions / sovereign_wallet_source_ledger going forward (Phase 7,
-- a later migration, will port the Arena/Sovereign call sites onto this schema — those old
-- tables are left in place for now as historical read-only data, not dropped).
-- Run manually in Supabase SQL Editor; do not execute automatically.

-- ─────────────────────────────────────────────
-- 1. Pool accounts (NPC sub-pools + System Reserve). Player accounts stay on users(user_id).
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS economy_pool_accounts (
  pool_key TEXT PRIMARY KEY CHECK (pool_key IN (
    'SYSTEM_RESERVE', 'BOT_POOL', 'MINION_POOL', 'NINE_SENTINELS_POOL',
    'FOUR_GODS_POOL', 'MONARCH_POOL', 'SOREN_VEYL_POOL', 'CAELUM_POOL'
  )),
  token_balance BIGINT NOT NULL DEFAULT 0 CHECK (token_balance >= 0),
  crest_balance BIGINT NOT NULL DEFAULT 0 CHECK (crest_balance >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE economy_pool_accounts IS
  'NPC_POOL = SUM of all rows except SYSTEM_RESERVE. Genesis funds SYSTEM_RESERVE only; NPC pools start at 0 and only move via real TRANSFER (see design note: NPC pools receive/pay the net match result at settlement, not a per-match buy-in draw-down).';

ALTER TABLE economy_pool_accounts ENABLE ROW LEVEL SECURITY;

INSERT INTO economy_pool_accounts (pool_key) VALUES
  ('SYSTEM_RESERVE'), ('BOT_POOL'), ('MINION_POOL'), ('NINE_SENTINELS_POOL'),
  ('FOUR_GODS_POOL'), ('MONARCH_POOL'), ('SOREN_VEYL_POOL'), ('CAELUM_POOL')
ON CONFLICT (pool_key) DO NOTHING;

-- ─────────────────────────────────────────────
-- 2. Global counters (single row) — backs Expected Supply reconciliation.
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS economy_global_counters (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  token_genesis BIGINT NOT NULL DEFAULT 0,
  crest_genesis BIGINT NOT NULL DEFAULT 0,
  cumulative_token_mint BIGINT NOT NULL DEFAULT 0,
  cumulative_crest_mint BIGINT NOT NULL DEFAULT 0,
  cumulative_token_burn BIGINT NOT NULL DEFAULT 0,
  cumulative_crest_burn BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE economy_global_counters ENABLE ROW LEVEL SECURITY;

INSERT INTO economy_global_counters (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────
-- 3. Transactions + double-entry ledger lines.
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS economy_transactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('GENESIS', 'TRANSFER', 'BURN', 'MINT', 'REVERSAL', 'ADMIN_ADJUSTMENT')),
  -- reason: app-layer allowlist (server/src/economy/economyTypes.ts), not a DB CHECK — must stay
  -- extensible without a migration (spec requirement), unlike arena_crown_ledger.reason.
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'REVERSED')),
  match_id TEXT,
  table_id TEXT,
  round_id TEXT,
  player_id UUID REFERENCES users(user_id) ON DELETE RESTRICT,
  tier TEXT,
  npc_group TEXT,
  boss_id TEXT,
  entries JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  reversal_of_transaction_id BIGINT REFERENCES economy_transactions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS economy_transactions_created_at_idx ON economy_transactions(created_at);
CREATE INDEX IF NOT EXISTS economy_transactions_player_idx ON economy_transactions(player_id) WHERE player_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS economy_transactions_match_idx ON economy_transactions(match_id) WHERE match_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS economy_transactions_type_idx ON economy_transactions(type);
CREATE INDEX IF NOT EXISTS economy_transactions_reason_idx ON economy_transactions(reason);

ALTER TABLE economy_transactions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS economy_ledger_entries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  transaction_id BIGINT NOT NULL REFERENCES economy_transactions(id) ON DELETE RESTRICT,
  account_type TEXT NOT NULL CHECK (account_type IN ('PLAYER', 'NPC_POOL', 'SYSTEM_RESERVE')),
  account_id TEXT NOT NULL, -- users.user_id (as text) when PLAYER, else economy_pool_accounts.pool_key
  currency TEXT NOT NULL CHECK (currency IN ('TOKEN', 'CREST')),
  wallet TEXT CHECK (wallet IS NULL OR wallet IN ('EARNED', 'PURCHASED')), -- only meaningful for CREST + PLAYER
  amount BIGINT NOT NULL CHECK (amount <> 0),
  balance_before BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS economy_ledger_entries_tx_idx ON economy_ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS economy_ledger_entries_account_idx ON economy_ledger_entries(account_type, account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS economy_ledger_entries_currency_idx ON economy_ledger_entries(currency);

ALTER TABLE economy_ledger_entries ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────
-- 4. economy_apply_transaction — single atomic choke point for every balance mutation.
--    Pattern mirrors arena_apply_crest_batch (015/016): advisory lock on the idempotency
--    key, ORDER BY ... FOR UPDATE across all touched accounts to avoid cross-transaction
--    deadlocks, idempotent replay-on-conflict.
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION economy_apply_transaction(
  p_idempotency_key TEXT,
  p_type TEXT,
  p_reason TEXT,
  p_entries JSONB, -- [{accountType, accountId, currency, wallet, amount}, ...]
  p_metadata JSONB DEFAULT '{}'::JSONB,
  p_context JSONB DEFAULT '{}'::JSONB, -- {matchId, tableId, roundId, playerId, tier, npcGroup, bossId, reversalOfTransactionId}
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
  IF p_type = 'GENESIS' THEN
    UPDATE economy_global_counters SET
      token_genesis = token_genesis + COALESCE((SELECT SUM((item->>'amount')::BIGINT) FROM jsonb_array_elements(p_entries) item WHERE item->>'currency' = 'TOKEN'), 0),
      crest_genesis = crest_genesis + COALESCE((SELECT SUM((item->>'amount')::BIGINT) FROM jsonb_array_elements(p_entries) item WHERE item->>'currency' = 'CREST'), 0),
      updated_at = NOW();
  ELSIF p_type = 'MINT' THEN
    UPDATE economy_global_counters SET
      cumulative_token_mint = cumulative_token_mint + COALESCE((SELECT SUM((item->>'amount')::BIGINT) FROM jsonb_array_elements(p_entries) item WHERE item->>'currency' = 'TOKEN'), 0),
      cumulative_crest_mint = cumulative_crest_mint + COALESCE((SELECT SUM((item->>'amount')::BIGINT) FROM jsonb_array_elements(p_entries) item WHERE item->>'currency' = 'CREST'), 0),
      updated_at = NOW();
  ELSIF p_type = 'BURN' THEN
    UPDATE economy_global_counters SET
      cumulative_token_burn = cumulative_token_burn + COALESCE((SELECT SUM(-(item->>'amount')::BIGINT) FROM jsonb_array_elements(p_entries) item WHERE item->>'currency' = 'TOKEN'), 0),
      cumulative_crest_burn = cumulative_crest_burn + COALESCE((SELECT SUM(-(item->>'amount')::BIGINT) FROM jsonb_array_elements(p_entries) item WHERE item->>'currency' = 'CREST'), 0),
      updated_at = NOW();
  END IF;

  RETURN QUERY SELECT v_tx_id, FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION economy_apply_transaction(TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION economy_apply_transaction(TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, TEXT) TO service_role;

-- ─────────────────────────────────────────────
-- 5. economy_reconciliation — read-only Expected vs Actual per currency (spec §24/§25/§36).
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION economy_reconciliation()
RETURNS TABLE(
  currency TEXT,
  genesis BIGINT,
  cumulative_mint BIGINT,
  cumulative_burn BIGINT,
  expected_supply BIGINT,
  player_pool BIGINT,
  npc_pool BIGINT,
  system_reserve BIGINT,
  actual_supply BIGINT,
  difference BIGINT
) AS $$
DECLARE
  v_counters economy_global_counters%ROWTYPE;
  v_token_player BIGINT;
  v_crest_player BIGINT;
  v_token_npc BIGINT;
  v_crest_npc BIGINT;
  v_token_reserve BIGINT;
  v_crest_reserve BIGINT;
BEGIN
  SELECT * INTO v_counters FROM economy_global_counters LIMIT 1;

  SELECT COALESCE(SUM(token_balance), 0) INTO v_token_player FROM users;
  SELECT COALESCE(SUM(
    crown_balance::BIGINT * 12 + crown_crest_remainder
    + crown_package_balance::BIGINT * 12 + crown_package_crest_remainder
  ), 0) INTO v_crest_player FROM users;

  SELECT COALESCE(SUM(token_balance), 0) INTO v_token_npc FROM economy_pool_accounts WHERE pool_key <> 'SYSTEM_RESERVE';
  SELECT COALESCE(SUM(crest_balance), 0) INTO v_crest_npc FROM economy_pool_accounts WHERE pool_key <> 'SYSTEM_RESERVE';

  SELECT COALESCE(token_balance, 0) INTO v_token_reserve FROM economy_pool_accounts WHERE pool_key = 'SYSTEM_RESERVE';
  SELECT COALESCE(crest_balance, 0) INTO v_crest_reserve FROM economy_pool_accounts WHERE pool_key = 'SYSTEM_RESERVE';

  RETURN QUERY
  SELECT 'TOKEN'::TEXT, v_counters.token_genesis, v_counters.cumulative_token_mint, v_counters.cumulative_token_burn,
    v_counters.token_genesis + v_counters.cumulative_token_mint - v_counters.cumulative_token_burn,
    v_token_player, v_token_npc, v_token_reserve,
    v_token_player + v_token_npc + v_token_reserve,
    (v_counters.token_genesis + v_counters.cumulative_token_mint - v_counters.cumulative_token_burn) - (v_token_player + v_token_npc + v_token_reserve)
  UNION ALL
  SELECT 'CREST'::TEXT, v_counters.crest_genesis, v_counters.cumulative_crest_mint, v_counters.cumulative_crest_burn,
    v_counters.crest_genesis + v_counters.cumulative_crest_mint - v_counters.cumulative_crest_burn,
    v_crest_player, v_crest_npc, v_crest_reserve,
    v_crest_player + v_crest_npc + v_crest_reserve,
    (v_counters.crest_genesis + v_counters.cumulative_crest_mint - v_counters.cumulative_crest_burn) - (v_crest_player + v_crest_npc + v_crest_reserve);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION economy_reconciliation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION economy_reconciliation() TO service_role;

NOTIFY pgrst, 'reload schema';
