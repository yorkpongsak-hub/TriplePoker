-- Match streak is separate from the existing Level-clear streak.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS tier_d_match_win_streak INTEGER NOT NULL DEFAULT 0
  CHECK (tier_d_match_win_streak >= 0);
