-- Tier D Solo is separate from legacy solo_endless_level (047), whose +1/+2
-- cosmetic semantics must remain intact for existing Initiate/Mastermind users.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS tier_d_solo_level INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tier_d_current_win_streak INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tier_d_best_win_streak INTEGER NOT NULL DEFAULT 0;

UPDATE public.users
SET tier_d_solo_level = GREATEST(1, COALESCE(tier_d_solo_level, 1)),
    tier_d_current_win_streak = GREATEST(0, COALESCE(tier_d_current_win_streak, 0)),
    tier_d_best_win_streak = GREATEST(tier_d_current_win_streak, COALESCE(tier_d_best_win_streak, 0));

CREATE OR REPLACE FUNCTION public.settle_tier_d_solo_level(p_user_id UUID, p_won BOOLEAN)
RETURNS JSONB AS $$
DECLARE result JSONB;
BEGIN
  UPDATE public.users
  SET tier_d_solo_level = CASE WHEN p_won THEN tier_d_solo_level + 1 ELSE tier_d_solo_level END,
      tier_d_current_win_streak = CASE WHEN p_won THEN tier_d_current_win_streak + 1 ELSE 0 END,
      tier_d_best_win_streak = CASE WHEN p_won THEN GREATEST(tier_d_best_win_streak, tier_d_current_win_streak + 1) ELSE tier_d_best_win_streak END
  WHERE user_id = p_user_id
  RETURNING jsonb_build_object('level', tier_d_solo_level, 'currentWinStreak', tier_d_current_win_streak, 'bestWinStreak', tier_d_best_win_streak) INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
