-- TriplePoker: Rise - NPC Pool Initial Funding (fixes INSUFFICIENT_POOL_TOKEN_BALANCE)
-- Run manually in Supabase SQL Editor. Requires 030-033 to already be applied.
--
-- Root cause found during Adept live testing (2026-08-10): every NPC pool starts at Genesis
-- with 0 Token/Crest (by design — pools only earn from real AI wins). But the very first time an
-- AI LOSES before it has ever won, economy_apply_transaction correctly refuses to let the pool go
-- negative (INSUFFICIENT_POOL_TOKEN_BALANCE) and the whole match-settlement transaction rolls
-- back. That leaves the match's match_escrow rows stuck 'in_match' (never marked settled), which
-- later triggers the old stale-escrow auto-refund path (bypasses the ledger entirely) — this is
-- what actually produced the reconciliation gap you saw, not the initial_funding SQL itself.
--
-- Fix: give every NPC pool a starting buffer via a real TRANSFER from SYSTEM_RESERVE (spec §12
-- "Initial Funding"), so pools can absorb early losses before they've won anything yet.
-- Amount confirmed with ลุงเยาะ (2026-08-10): 500,000 Token + 5,000 Crest per pool (7 pools).

-- ─────────────────────────────────────────────
-- Step 1 — Diagnostic: any match_escrow rows currently stuck 'in_match'? (Expected: none, if the
-- earlier failed Adept match's escrow already got auto-refunded per the log you shared. If this
-- returns rows, that explains part of the reconciliation gap on its own — those players have
-- money sitting in escrow, not yet reflected in token_balance OR any pool. Note this for later;
-- it does not block Step 2.)
-- ─────────────────────────────────────────────

SELECT escrow_id, user_id, room_id, tier, buyin_amount, status, created_at
FROM match_escrow
WHERE status = 'in_match'
ORDER BY created_at;

-- ─────────────────────────────────────────────
-- Step 2 — Fund all 7 NPC pools from SYSTEM_RESERVE, reason NPC_INITIAL_FUNDING. One transaction
-- per pool (not batched into one) so each has its own clean idempotency key and audit trail.
-- Safe to re-run: idempotency key is stable per pool, re-running replays instead of double-funding.
-- ─────────────────────────────────────────────

DO $$
DECLARE
  v_pool TEXT;
  v_token_amount BIGINT := 500000;
  v_crest_amount BIGINT := 5000;
BEGIN
  FOREACH v_pool IN ARRAY ARRAY['BOT_POOL','MINION_POOL','NINE_SENTINELS_POOL','FOUR_GODS_POOL','MONARCH_POOL','SOREN_VEYL_POOL','CAELUM_POOL']
  LOOP
    PERFORM economy_apply_transaction(
      p_idempotency_key := 'NPC_INITIAL_FUNDING:v1:' || v_pool,
      p_type := 'TRANSFER',
      p_reason := 'NPC_INITIAL_FUNDING',
      p_entries := jsonb_build_array(
        jsonb_build_object('accountType', 'SYSTEM_RESERVE', 'accountId', 'SYSTEM_RESERVE', 'currency', 'TOKEN', 'amount', -v_token_amount),
        jsonb_build_object('accountType', 'NPC_POOL', 'accountId', v_pool, 'currency', 'TOKEN', 'amount', v_token_amount),
        jsonb_build_object('accountType', 'SYSTEM_RESERVE', 'accountId', 'SYSTEM_RESERVE', 'currency', 'CREST', 'amount', -v_crest_amount),
        jsonb_build_object('accountType', 'NPC_POOL', 'accountId', v_pool, 'currency', 'CREST', 'amount', v_crest_amount)
      ),
      p_metadata := jsonb_build_object('note', 'Initial buffer so pool can pay out before it has ever won'),
      p_context := jsonb_build_object('npcGroup', v_pool),
      p_created_by := 'MANUAL_NPC_INITIAL_FUNDING'
    );
    RAISE NOTICE 'Funded % : +% Token, +% Crest', v_pool, v_token_amount, v_crest_amount;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────
-- Step 3 — Verify: npc_pool should now show 3,500,000 Token / 35,000 Crest (7 x 500,000 / 7 x
-- 5,000), system_reserve reduced by the same amount, difference should be back to 0 for both
-- currencies UNLESS Step 1 found stuck escrow rows (in which case the leftover gap = the sum of
-- those buyin_amounts, and that needs a separate look before considering any admin correction —
-- do not paper over it with a MINT without confirming the cause first).
-- ─────────────────────────────────────────────

SELECT * FROM economy_reconciliation();
