CREATE TABLE IF NOT EXISTS public.tier_d_mini_tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id text NOT NULL,
  level_anchor integer NOT NULL,
  start_at timestamptz NOT NULL DEFAULT now(),
  end_at timestamptz NOT NULL,
  locked_at timestamptz,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','LOCKED')),
  UNIQUE(league_id, level_anchor, start_at)
);
CREATE TABLE IF NOT EXISTS public.tier_d_mini_tournament_entries (
  tournament_id uuid NOT NULL REFERENCES public.tier_d_mini_tournaments(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  level integer NOT NULL,
  points integer NOT NULL DEFAULT 0,
  synthetic boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  final_rank integer,
  PRIMARY KEY(tournament_id,user_id)
);
CREATE INDEX IF NOT EXISTS tier_d_mini_tournament_entries_rank ON public.tier_d_mini_tournament_entries(tournament_id,points DESC,level DESC,updated_at,user_id);
ALTER TABLE public.tier_d_mini_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tier_d_mini_tournament_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tier_d_mini_tournaments, public.tier_d_mini_tournament_entries FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tier_d_mini_tournaments, public.tier_d_mini_tournament_entries TO service_role;
