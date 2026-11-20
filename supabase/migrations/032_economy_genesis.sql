-- TriplePoker: Rise - Central Economy Genesis (Phase 4)
-- ⚠️ RUN MANUALLY ON SUPABASE DASHBOARD, AFTER 031_economy_clean_reset.sql.
-- Guarded by idempotency key 'ECONOMY:GENESIS:V1' inside economy_apply_transaction — safe to
-- re-run by accident (it will just replay the existing transaction, not double-mint).
--
-- Amounts per spec (do not change without re-confirming with ลุงเยาะ):
--   TOKEN GENESIS  = 100,000,000
--   CROWN GENESIS  = 20,000 Crown = 240,000 Crest (CREST_PER_CROWN = 12, server/src/arena/economy/crest.ts:1)
-- Both credited entirely to SYSTEM_RESERVE. No player/NPC opening balances are created here —
-- those come later as separate INITIAL_FUNDING transfers (Phase 6/7, not this script).

SELECT * FROM economy_apply_transaction(
  p_idempotency_key := 'ECONOMY:GENESIS:V1',
  p_type := 'GENESIS',
  p_reason := 'GENESIS',
  p_entries := '[
    {"accountType":"SYSTEM_RESERVE","accountId":"SYSTEM_RESERVE","currency":"TOKEN","amount":100000000},
    {"accountType":"SYSTEM_RESERVE","accountId":"SYSTEM_RESERVE","currency":"CREST","amount":240000}
  ]'::JSONB,
  p_metadata := '{"note":"TriplePoker: Rise Genesis - Token 100,000,000 / Crown 20,000 (240,000 Crest)"}'::JSONB,
  p_context := '{}'::JSONB,
  p_created_by := 'GENESIS_SCRIPT'
);

-- ─────────────────────────────────────────────
-- Verification — paste this result back. Both currencies must show difference = 0.
-- ─────────────────────────────────────────────

SELECT * FROM economy_reconciliation();
