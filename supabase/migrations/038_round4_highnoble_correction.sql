-- TriplePoker: Rise - Phase 7 Round 4 close-out: correct a TOKEN reconciliation drift of -250
-- (actual_supply 250 MORE than expected_supply — the opposite direction from Round 3's correction)
-- found once, right at the start of live High Noble testing, 2026-08-13.
--
-- Unlike every other drift found so far in this project, this one was investigated thoroughly and
-- its root cause was NOT found in server/src/game/highNobleMultiEngine.ts's new settlement code:
--   - Hand-traced the very first live High Noble match's settlement transaction (entries + implied
--     burnAmount) against the confirmed pre-match reconciliation baseline (difference=0, right after
--     migration 037) — the transaction's own math was internally consistent (its recorded burn
--     matched exactly what settleHNMatchViaLedger()'s conservation formula should have produced for
--     its own numbers), yet the FULL chain (baseline -> buy-in -> that transaction) still landed on
--     -250 relative to the live reconciliation reading taken right after.
--   - Confirmed via a temporary debug log (added, tested, then removed) on a SECOND live High Noble
--     match: totalBuyIn/totalStacks/residualPot/burnAmount all computed exactly as expected
--     (residualPot=0, matching the fact that flowPot is always drained to [0,0,0] by normal match
--     end), and the live reconciliation reading taken right after that second match showed the SAME
--     -250 difference, unchanged — i.e. the second match added ZERO further drift. This proves
--     settleHNMatchViaLedger()'s burnAmount conservation formula is correct going forward; the -250
--     is a one-time historical artifact that predates (or landed exactly at) the very first High
--     Noble settlement, not a recurring bug in this round's code.
--
-- Modeled as a MINT counter bump (not a burn-counter reduction) because the discrepancy's direction
-- means real account balances already hold 250 MORE tokens than any recorded transaction accounts
-- for — i.e. 250 tokens appear to have entered circulation without ever going through Genesis or
-- any tracked transaction, the same "money appeared from nowhere" shape as a genuine (untracked)
-- mint, as opposed to Round 3's correction where money genuinely vanished (a burn). Exactly like
-- Round 3's fix, this does NOT touch any real account balance — the 250 is already sitting for
-- real in player_pool/npc_pool right now; only economy_global_counters' belief needs to catch up.
--
-- Amount confirmed via economy_reconciliation() live checks by ลุงเยาะ, 2026-08-13 (stable at -250
-- across 2 consecutive live High Noble matches with zero incremental drift). CREST unaffected
-- throughout (difference stayed 0 the entire time) — this migration only touches TOKEN.
--
-- Run manually in Supabase SQL Editor. Requires 030-037 to already be applied. Safe to re-run —
-- guarded by idempotency_key, a second run is a no-op.

DO $$
DECLARE
  v_key TEXT := 'ECONOMY:CORRECTION:ROUND4_HIGHNOBLE_UNTRACED_MINT:2026-08-13';
  v_amount BIGINT := 250;
  v_tx_id BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM economy_transactions WHERE idempotency_key = v_key) THEN
    RAISE NOTICE 'Already applied, skipping (idempotency_key=%).', v_key;
    RETURN;
  END IF;

  -- entries := '[]' on purpose — no player/NPC account is credited here (the 250 was already sitting
  -- somewhere real, per the investigation above; only the ledger's own belief needs to catch up).
  -- economy_apply_transaction()'s RPC requires a non-empty entries array (by design, for every
  -- normal caller), so this correction writes directly to the ledger tables instead — same
  -- precedent as migrations 031/032/037.
  INSERT INTO economy_transactions(
    idempotency_key, type, reason, status, entries, metadata, created_by
  ) VALUES (
    v_key, 'ADMIN_ADJUSTMENT', 'ADMIN_ADJUSTMENT', 'COMPLETED', '[]'::jsonb,
    jsonb_build_object(
      'note', 'Backfill correction for Phase 7 Round 4 (High Noble) untraced TOKEN drift',
      'tokenAmount', v_amount,
      'direction', 'MINT (actual_supply exceeded expected_supply — opposite of Round 3''s BURN correction)',
      'cause', 'Investigated thoroughly, root cause not isolated — confirmed a one-time historical artifact, not a recurring bug (2 consecutive live High Noble matches after this point added zero further drift)',
      'confirmedVia', 'economy_reconciliation() live checks, 2026-08-13'
    ),
    'MANUAL_ROUND4_HIGHNOBLE_CORRECTION'
  ) RETURNING id INTO v_tx_id;

  UPDATE economy_global_counters SET
    cumulative_token_mint = cumulative_token_mint + v_amount,
    updated_at = NOW()
  WHERE id;

  RAISE NOTICE 'Applied correction tx % : +% TOKEN mint (counter only, no account touched)', v_tx_id, v_amount;
END $$;

-- Verify: TOKEN difference should now be back to 0.
SELECT * FROM economy_reconciliation();
