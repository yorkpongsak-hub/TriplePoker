-- TriplePoker: Streak Milestone Bonus (มติลุงเยาะ 2026-08-14)
--
-- New milestone-claim Streak system (day 1/3/5/7, Token bonus 300/500/1000, claimed manually from a
-- new /streak page — free members must watch an ad first, VIP skips) replaces the OLD automatic
-- per-day TOKEN grant that used to fire silently inside matchStatsService.ts on every match-end
-- (100/150/200/250/300/400/700 Token per day 1-7, no ad, no page). XP-per-day auto-granting is left
-- completely untouched — only the TOKEN portion of the old mechanic is superseded.
--
-- streak_count/best_streak_count/streak_shields/streak_7days_badge/last_played_date (all existing
-- columns from earlier migrations) are unchanged and still computed by the same
-- computeDailyPlayStreak() pure function — this migration only adds ONE new column to track which
-- milestone (0/3/5/7) has already been claimed in the CURRENT 7-day cycle, so the same milestone
-- can't be claimed twice. Resets to 0 automatically whenever the cycle wraps back to day 1.
--
-- Run manually in Supabase SQL Editor.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS streak_claimed_milestone INTEGER NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';
