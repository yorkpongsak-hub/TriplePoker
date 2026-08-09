-- TriplePoker — 7-day daily-play streak rewards
-- Reward is granted server-side after the first completed match of each Bangkok day.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS best_streak_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak_7days_badge BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_streak_count_7_day_cycle;

-- Existing production rows may contain an uncapped lifetime streak.
UPDATE public.users
SET
  best_streak_count = GREATEST(best_streak_count, LEAST(streak_count, 7)),
  streak_7days_badge = streak_7days_badge OR streak_count >= 7,
  streak_count = CASE
    WHEN streak_count <= 0 THEN 0
    ELSE ((streak_count - 1) % 7) + 1
  END;

ALTER TABLE public.users
  ADD CONSTRAINT users_streak_count_7_day_cycle
  CHECK (streak_count BETWEEN 0 AND 7);

COMMENT ON COLUMN public.users.streak_count IS
  'Current daily-play reward cycle day (0-7), reset to day 1 after completing day 7.';
COMMENT ON COLUMN public.users.best_streak_count IS
  'Best achieved daily-play cycle day; capped at 7 for this reward system.';
COMMENT ON COLUMN public.users.streak_7days_badge IS
  'Permanent Seven-Day Flame badge, unlocked on the first completed 7-day cycle.';

NOTIFY pgrst, 'reload schema';
