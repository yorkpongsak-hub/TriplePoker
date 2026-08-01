-- TriplePoker: Rise - Gate 10.7 unified permanent Tier S unlock
-- Manual execution only. arena_unlocked is deliberately ignored and grants no grandfather access.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS grandmaster_unlocked_at TIMESTAMPTZ;

COMMENT ON COLUMN users.grandmaster_unlocked_at IS
  'First time the account crossed token_balance > 1,000,000. Tier S remains permanently unlocked afterward.';

CREATE OR REPLACE FUNCTION sync_permanent_grandmaster_unlock()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.token_balance > 1000000 AND NEW.tier_unlocked_max IS DISTINCT FROM 'grandmaster' THEN
    NEW.tier_unlocked_max := 'grandmaster';
    NEW.grandmaster_unlocked_at := COALESCE(NEW.grandmaster_unlocked_at, NOW());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS users_sync_permanent_grandmaster_unlock ON users;
CREATE TRIGGER users_sync_permanent_grandmaster_unlock
BEFORE INSERT OR UPDATE OF token_balance ON users
FOR EACH ROW EXECUTE FUNCTION sync_permanent_grandmaster_unlock();

-- Backfill only accounts that meet the current Token rule. arena_unlocked is intentionally not used.
UPDATE users
SET tier_unlocked_max = 'grandmaster',
    grandmaster_unlocked_at = COALESCE(grandmaster_unlocked_at, NOW())
WHERE token_balance > 1000000
  AND tier_unlocked_max IS DISTINCT FROM 'grandmaster';

NOTIFY pgrst, 'reload schema';
