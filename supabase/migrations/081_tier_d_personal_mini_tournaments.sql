ALTER TABLE public.tier_d_mini_tournaments
  ADD COLUMN IF NOT EXISTS owner_user_id text;

CREATE UNIQUE INDEX IF NOT EXISTS tier_d_one_open_personal_tournament
  ON public.tier_d_mini_tournaments(owner_user_id)
  WHERE status='OPEN' AND owner_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.tier_d_personal_tournament_progress (
  user_id text PRIMARY KEY,
  qualifying_level_count integer NOT NULL DEFAULT 0 CHECK(qualifying_level_count>=0),
  trigger_at integer NOT NULL DEFAULT 5 CHECK(trigger_at BETWEEN 5 AND 6),
  cycle_no integer NOT NULL DEFAULT 1 CHECK(cycle_no>=1),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tier_d_personal_tournament_progress ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tier_d_personal_tournament_progress FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tier_d_personal_tournament_progress TO service_role;
