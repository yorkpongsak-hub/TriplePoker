-- Tier S charges the same 1-Crown entry fee to every seat at match settlement.
ALTER TABLE arena_crown_ledger
  DROP CONSTRAINT IF EXISTS arena_crown_ledger_reason_check;

ALTER TABLE arena_crown_ledger
  ADD CONSTRAINT arena_crown_ledger_reason_check CHECK (reason IN (
    'MATCH_RESERVE', 'ENTRY_FEE', 'ANTE', 'AUCTION', 'CALL', 'BOSS_FEE',
    'POT_PAYOUT', 'BATTLE_REWARD', 'REFUND', 'CROWN_SINK'
  ));
