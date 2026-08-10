-- TriplePoker: Rise - Central Economy Clean Reset (Phase 3)
-- ⚠️ RUN MANUALLY ON SUPABASE DASHBOARD. RUN EXACTLY ONCE. RUN THIS BEFORE 032_economy_genesis.sql.
-- ⚠️ Only safe because there are currently no real player accounts — every users row today is a
--    Developer/Test account (confirmed by ลุงเยาะ before this script was written). Do NOT run this
--    after real players exist.
-- Requires 030_central_economy_schema.sql to already be applied.
--
-- What this does:
--   1. Backs up current currency data (for rollback/debug) into *_backup_pre_economy_reset tables.
--   2. Zeroes token/crown/crest balances on every users row (test accounts only).
--   3. Truncates test/unused economy tables that cannot coexist with the new ledger's idempotency
--      keys (match_escrow, the old Arena/Sovereign crest ledgers, and the pre-existing but never-used
--      token_transactions/shop_transactions tables).
--   4. Re-zeroes the new economy_pool_accounts / economy_global_counters tables so 032's Genesis
--      starts from a clean, known state (safe to re-run this file if you need to redo Genesis in dev).
--
-- What this deliberately does NOT touch: profiles/progression columns, match_wins,
-- player_boss_stats, merch_orders, conquered_sentinels, monarch_pity_counter/monarch_victories,
-- streak columns — none of these are currency, no need to reset them.

-- ─────────────────────────────────────────────
-- 1. Backup (safe to run even if a same-named backup already exists from a prior attempt).
-- ─────────────────────────────────────────────

DROP TABLE IF EXISTS users_currency_backup_pre_economy_reset;
CREATE TABLE users_currency_backup_pre_economy_reset AS
  SELECT user_id, token_balance, crown_balance, crown_package_balance,
         crown_crest_remainder, crown_package_crest_remainder, purchase_debt_crest
  FROM users;

DROP TABLE IF EXISTS arena_crown_ledger_backup_pre_economy_reset;
CREATE TABLE arena_crown_ledger_backup_pre_economy_reset AS SELECT * FROM arena_crown_ledger;

DROP TABLE IF EXISTS arena_settlement_transactions_backup_pre_economy_reset;
CREATE TABLE arena_settlement_transactions_backup_pre_economy_reset AS SELECT * FROM arena_settlement_transactions;

DROP TABLE IF EXISTS arena_match_logs_backup_pre_economy_reset;
CREATE TABLE arena_match_logs_backup_pre_economy_reset AS SELECT * FROM arena_match_logs;

DROP TABLE IF EXISTS sovereign_wallet_source_ledger_backup_pre_economy_reset;
CREATE TABLE sovereign_wallet_source_ledger_backup_pre_economy_reset AS SELECT * FROM sovereign_wallet_source_ledger;

-- sovereign_standby_entries.reservation_id references sovereign_wallet_reservations(id) — must be
-- backed up and truncated before the table it references, or the TRUNCATE below fails with
-- "cannot truncate a table referenced in a foreign key constraint".
DROP TABLE IF EXISTS sovereign_standby_entries_backup_pre_economy_reset;
CREATE TABLE sovereign_standby_entries_backup_pre_economy_reset AS SELECT * FROM sovereign_standby_entries;

DROP TABLE IF EXISTS sovereign_wallet_reservations_backup_pre_economy_reset;
CREATE TABLE sovereign_wallet_reservations_backup_pre_economy_reset AS SELECT * FROM sovereign_wallet_reservations;

DROP TABLE IF EXISTS match_escrow_backup_pre_economy_reset;
CREATE TABLE match_escrow_backup_pre_economy_reset AS SELECT * FROM match_escrow;

-- ─────────────────────────────────────────────
-- 2. Reset player currency (test accounts only — no opening balance created, per spec §1).
-- ─────────────────────────────────────────────

UPDATE users SET
  token_balance = 0,
  crown_balance = 0,
  crown_package_balance = 0,
  crown_crest_remainder = 0,
  crown_package_crest_remainder = 0,
  purchase_debt_crest = 0;

-- ─────────────────────────────────────────────
-- 3. Clear obsolete/test economy data that cannot carry forward into the new ledger.
-- ─────────────────────────────────────────────

TRUNCATE TABLE match_escrow;
TRUNCATE TABLE arena_crown_ledger;
TRUNCATE TABLE arena_settlement_transactions;
TRUNCATE TABLE arena_match_logs;
-- Postgres requires every table with an FK pointing at sovereign_wallet_reservations to be
-- truncated in the SAME TRUNCATE command (sequential separate statements still fail even if the
-- child is truncated first — the constraint check isn't about row count, it's about the command).
TRUNCATE TABLE sovereign_wallet_source_ledger, sovereign_standby_entries, sovereign_wallet_reservations;
TRUNCATE TABLE token_transactions;   -- confirmed unused by any code path (audit 2026-08-10)
TRUNCATE TABLE shop_transactions;    -- confirmed unused by any code path (audit 2026-08-10)

-- ─────────────────────────────────────────────
-- 4. Re-zero the new central ledger tables (in case this is a redo before Genesis has run).
-- ─────────────────────────────────────────────

TRUNCATE TABLE economy_ledger_entries, economy_transactions;
UPDATE economy_pool_accounts SET token_balance = 0, crest_balance = 0, updated_at = NOW();
UPDATE economy_global_counters SET
  token_genesis = 0, crest_genesis = 0,
  cumulative_token_mint = 0, cumulative_crest_mint = 0,
  cumulative_token_burn = 0, cumulative_crest_burn = 0,
  updated_at = NOW();

-- ─────────────────────────────────────────────
-- 5. Verify: everything should read zero. Paste this result back if anything is non-zero.
-- ─────────────────────────────────────────────

SELECT
  (SELECT COALESCE(SUM(token_balance), 0) FROM users) AS player_token_total,
  (SELECT COALESCE(SUM(crown_balance::BIGINT * 12 + crown_crest_remainder + crown_package_balance::BIGINT * 12 + crown_package_crest_remainder), 0) FROM users) AS player_crest_total,
  (SELECT COALESCE(SUM(token_balance), 0) FROM economy_pool_accounts) AS pool_token_total,
  (SELECT COALESCE(SUM(crest_balance), 0) FROM economy_pool_accounts) AS pool_crest_total,
  (SELECT COUNT(*) FROM economy_transactions) AS transaction_count;
