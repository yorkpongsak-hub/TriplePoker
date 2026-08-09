-- TriplePoker — scalable per-player Boss statistics
-- Run manually in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS player_boss_stats (
  user_id            UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  boss_id            TEXT NOT NULL,
  encounters         INTEGER NOT NULL DEFAULT 0 CHECK (encounters >= 0),
  victories          INTEGER NOT NULL DEFAULT 0 CHECK (victories >= 0),
  first_defeated_at  TIMESTAMPTZ,
  last_encountered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_defeated_at   TIMESTAMPTZ,
  best_hand          JSONB,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, boss_id)
);

CREATE INDEX IF NOT EXISTS idx_player_boss_stats_user
  ON player_boss_stats (user_id, updated_at DESC);

-- Preserve Monarch totals earned before this normalized table existed. Exact
-- historical dates were not stored, so they intentionally remain unknown.
INSERT INTO player_boss_stats (user_id, boss_id, encounters, victories, last_encountered_at)
SELECT user_id, 'monarch', monarch_encounters, monarch_victories, NOW()
FROM users
WHERE COALESCE(monarch_encounters, 0) > 0 OR COALESCE(monarch_victories, 0) > 0
ON CONFLICT (user_id, boss_id) DO UPDATE SET
  encounters = GREATEST(player_boss_stats.encounters, EXCLUDED.encounters),
  victories = GREATEST(player_boss_stats.victories, EXCLUDED.victories),
  updated_at = NOW();

ALTER TABLE player_boss_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Boss stats are publicly readable" ON player_boss_stats;
CREATE POLICY "Boss stats are publicly readable"
  ON player_boss_stats FOR SELECT
  USING (TRUE);

-- One transaction updates the generic Boss record and the legacy Monarch counters
-- still used by Ascendant Gate. Future bosses need no users-table columns.
CREATE OR REPLACE FUNCTION record_boss_result(
  p_user_id UUID,
  p_boss_id TEXT,
  p_won BOOLEAN,
  p_best_hand JSONB DEFAULT NULL
)
RETURNS player_boss_stats
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result player_boss_stats;
BEGIN
  IF p_boss_id IS NULL OR BTRIM(p_boss_id) = '' THEN
    RAISE EXCEPTION 'boss_id is required';
  END IF;

  INSERT INTO player_boss_stats (
    user_id, boss_id, encounters, victories, first_defeated_at,
    last_encountered_at, last_defeated_at, best_hand, updated_at
  ) VALUES (
    p_user_id, LOWER(BTRIM(p_boss_id)), 1, CASE WHEN p_won THEN 1 ELSE 0 END,
    CASE WHEN p_won THEN NOW() ELSE NULL END, NOW(),
    CASE WHEN p_won THEN NOW() ELSE NULL END,
    CASE WHEN p_won THEN p_best_hand ELSE NULL END, NOW()
  )
  ON CONFLICT (user_id, boss_id) DO UPDATE SET
    encounters = player_boss_stats.encounters + 1,
    victories = player_boss_stats.victories + CASE WHEN p_won THEN 1 ELSE 0 END,
    first_defeated_at = CASE
      WHEN p_won THEN COALESCE(player_boss_stats.first_defeated_at, NOW())
      ELSE player_boss_stats.first_defeated_at
    END,
    last_encountered_at = NOW(),
    last_defeated_at = CASE WHEN p_won THEN NOW() ELSE player_boss_stats.last_defeated_at END,
    best_hand = CASE
      WHEN p_won AND p_best_hand IS NOT NULL THEN p_best_hand
      ELSE player_boss_stats.best_hand
    END,
    updated_at = NOW()
  RETURNING * INTO v_result;

  IF LOWER(BTRIM(p_boss_id)) = 'monarch' THEN
    UPDATE users SET
      monarch_encounters = COALESCE(monarch_encounters, 0) + 1,
      monarch_victories = COALESCE(monarch_victories, 0) + CASE WHEN p_won THEN 1 ELSE 0 END
    WHERE user_id = p_user_id;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION record_boss_result(UUID, TEXT, BOOLEAN, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_boss_result(UUID, TEXT, BOOLEAN, JSONB) TO service_role;

NOTIFY pgrst, 'reload schema';
