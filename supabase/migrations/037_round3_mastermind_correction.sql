-- TriplePoker: Rise - Phase 7 Round 3 close-out: correct the TOKEN reconciliation drift caused by
-- 3 live Mastermind test matches that left mid-round while a real code bug existed (both found and
-- fixed same day, 2026-08-13, in server/src/game/gameLoop.ts's buildSoloLedgerArg()):
--   1. usesLedgerSettlement('mastermind') briefly returned false at runtime despite the TYPE
--      already widened to allow it (tsc/jest both stayed green because a type predicate doesn't
--      force the runtime body to match) — routed the first 2 test matches through the legacy RPC
--      entirely, never touching the Ledger at all.
--   2. Once (1) was fixed, settling a match mid-round via disconnect/player_leave still didn't
--      account for state.pot (Ante already collected into the current round's pot bucket, but the
--      round never resolved to redistribute it) — that pot money vanished from actual_supply
--      without ever being recorded as burn.
-- Both are fixed in code going forward, confirmed via a clean live re-test after the pot fix
-- landed: a fresh mid-round player_leave added ZERO further drift (cumulative_burn moved by
-- exactly the same amount actual_supply dropped by). This migration only corrects the historical
-- drift those 3 already-settled test matches left behind — it does not touch any real player or
-- NPC pool balance (the money was never misdirected to a wrong account; it simply was never
-- recorded as destroyed). Amount confirmed from economy_reconciliation() run live by ลุงเยาะ on
-- 2026-08-13: TOKEN difference = 12,369. CREST difference was already 0 throughout, untouched here.
--
-- Run manually in Supabase SQL Editor. Requires 030-036 to already be applied. Safe to re-run —
-- guarded by idempotency_key, a second run is a no-op.

DO $$
DECLARE
  v_key TEXT := 'ECONOMY:CORRECTION:ROUND3_MASTERMIND_PRETEST_LEAK:2026-08-13';
  v_amount BIGINT := 12369;
  v_tx_id BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM economy_transactions WHERE idempotency_key = v_key) THEN
    RAISE NOTICE 'Already applied, skipping (idempotency_key=%).', v_key;
    RETURN;
  END IF;

  -- entries := '[]' on purpose — no real account is debited/credited here. The 12,369 TOKEN never
  -- landed anywhere (not a player, not an NPC pool); it just never got recorded as destroyed at
  -- the time. economy_apply_transaction()'s RPC requires a non-empty entries array (by design, for
  -- every normal caller), so this correction writes directly to the ledger tables instead — same
  -- precedent as migrations 031/032's manual Clean Reset / Genesis SQL.
  INSERT INTO economy_transactions(
    idempotency_key, type, reason, status, entries, metadata, created_by
  ) VALUES (
    v_key, 'ADMIN_ADJUSTMENT', 'ADMIN_ADJUSTMENT', 'COMPLETED', '[]'::jsonb,
    jsonb_build_object(
      'note', 'Backfill correction for Phase 7 Round 3 (Mastermind) pretest TOKEN drift',
      'tokenAmount', v_amount,
      'cause', 'usesLedgerSettlement runtime gap + missing state.pot burn on mid-round leave, both fixed same day in gameLoop.ts',
      'confirmedVia', 'economy_reconciliation() live check, 2026-08-13'
    ),
    'MANUAL_ROUND3_MASTERMIND_CORRECTION'
  ) RETURNING id INTO v_tx_id;

  UPDATE economy_global_counters SET
    cumulative_token_burn = cumulative_token_burn + v_amount,
    updated_at = NOW()
  WHERE id;

  RAISE NOTICE 'Applied correction tx % : +% TOKEN burn', v_tx_id, v_amount;
END $$;

-- Verify: TOKEN difference should now be back to 0.
SELECT * FROM economy_reconciliation();
