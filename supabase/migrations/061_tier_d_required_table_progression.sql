-- New members progress into the legacy tables through Tier D Solo. Existing
-- higher table entitlements are never reduced by this migration or settlement.
CREATE OR REPLACE FUNCTION public.settle_tier_d_solo_level(p_user_id UUID, p_won BOOLEAN)
RETURNS JSONB AS $$
DECLARE result JSONB;
BEGIN
  UPDATE public.users
  SET tier_d_solo_level = CASE WHEN p_won THEN tier_d_solo_level + 1 ELSE tier_d_solo_level END,
      tier_d_current_win_streak = CASE WHEN p_won THEN tier_d_current_win_streak + 1 ELSE 0 END,
      tier_d_best_win_streak = CASE WHEN p_won THEN GREATEST(tier_d_best_win_streak, tier_d_current_win_streak + 1) ELSE tier_d_best_win_streak END,
      tier_unlocked_max = CASE
        WHEN tier_unlocked_max = 'grandmaster' THEN 'grandmaster'
        WHEN tier_unlocked_max = 'highNoble' OR (p_won AND tier_d_solo_level + 1 >= 1001) THEN 'highNoble'
        WHEN tier_unlocked_max = 'mastermind' OR (p_won AND tier_d_solo_level + 1 >= 701) THEN 'mastermind'
        WHEN tier_unlocked_max = 'adept' OR (p_won AND tier_d_solo_level + 1 >= 501) THEN 'adept'
        WHEN tier_unlocked_max = 'initiate' OR (p_won AND tier_d_solo_level + 1 >= 251) THEN 'initiate'
        ELSE 'D'
      END
  WHERE user_id = p_user_id
  RETURNING jsonb_build_object(
    'level', tier_d_solo_level,
    'currentWinStreak', tier_d_current_win_streak,
    'bestWinStreak', tier_d_best_win_streak,
    'tierUnlockedMax', tier_unlocked_max
  ) INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
