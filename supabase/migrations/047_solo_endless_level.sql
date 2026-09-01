-- TriplePoker — Solo Mode "Endless Level" progression (2026-09-01)
-- Run manually in Supabase SQL Editor.
--
-- Cosmetic-only lifetime counter for Initiate/Mastermind (solo tiers): +2 per
-- match won, +1 per match completed (even on loss). Never resets, no
-- gameplay effect — separate from the existing users.xp accumulator (which
-- feeds a different, still-unsurfaced system) and from the dead users.level
-- column in 001_initial_schema.sql (never read/written anywhere in the
-- codebase — do not repurpose it, its semantics don't match).

ALTER TABLE users ADD COLUMN IF NOT EXISTS solo_endless_level INTEGER NOT NULL DEFAULT 1;

-- Atomic increment (same pattern as credit_user_crown/deduct_user_tokens) —
-- avoids a read-then-write race if a player somehow triggers two match-end
-- settlements concurrently.
CREATE OR REPLACE FUNCTION increment_solo_endless_level(p_user_id UUID, p_delta INT)
RETURNS INT AS $$
DECLARE
  new_level INT;
BEGIN
  UPDATE users SET solo_endless_level = solo_endless_level + p_delta
  WHERE user_id = p_user_id
  RETURNING solo_endless_level INTO new_level;
  RETURN new_level;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
