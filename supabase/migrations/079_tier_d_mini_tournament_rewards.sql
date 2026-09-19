CREATE TABLE IF NOT EXISTS public.tier_d_mini_tournament_rewards (
  tournament_id uuid NOT NULL REFERENCES public.tier_d_mini_tournaments(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  final_rank integer NOT NULL CHECK(final_rank BETWEEN 1 AND 20),
  item_key text NOT NULL,
  mini_trophy_edition text,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tournament_id,user_id)
);
ALTER TABLE public.tier_d_mini_tournament_rewards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tier_d_mini_tournament_rewards FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tier_d_mini_tournament_rewards TO service_role;
