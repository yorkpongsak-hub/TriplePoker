-- Tier D ranked data is private-by-default. All reads/writes are server-side
-- service-role operations; client rank or points are never accepted.
CREATE TABLE IF NOT EXISTS public.tier_d_league_progress (
  user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  league_id text NOT NULL,
  current_level integer NOT NULL CHECK (current_level > 0),
  league_points integer NOT NULL DEFAULT 0 CHECK (league_points >= 0),
  ranked_eligible boolean NOT NULL DEFAULT false,
  finalized_at timestamptz,
  final_rank integer CHECK (final_rank IS NULL OR final_rank > 0),
  final_points integer CHECK (final_points IS NULL OR final_points >= 0),
  reward_eligible boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, league_id)
);
CREATE TABLE IF NOT EXISTS public.tier_d_league_finalizations (
  user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  league_id text NOT NULL,
  final_level integer NOT NULL,
  final_points integer NOT NULL CHECK (final_points >= 0),
  final_rank integer NOT NULL CHECK (final_rank > 0),
  trophy_eligible boolean NOT NULL,
  finalized_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, league_id)
);
CREATE INDEX IF NOT EXISTS tier_d_league_progress_snapshot_idx ON public.tier_d_league_progress (league_id, ranked_eligible, current_level DESC, league_points DESC, updated_at ASC);
CREATE INDEX IF NOT EXISTS tier_d_league_finalizations_rank_idx ON public.tier_d_league_finalizations (league_id, final_rank);
ALTER TABLE public.tier_d_league_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tier_d_league_finalizations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tier_d_league_progress, public.tier_d_league_finalizations FROM anon, authenticated;
GRANT ALL ON public.tier_d_league_progress, public.tier_d_league_finalizations TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_tier_d_league(p_user_id uuid, p_league_id text, p_final_level integer, p_final_points integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE existing public.tier_d_league_finalizations%ROWTYPE; assigned_rank integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_league_id));
  SELECT * INTO existing FROM public.tier_d_league_finalizations WHERE user_id = p_user_id AND league_id = p_league_id;
  IF FOUND THEN RETURN jsonb_build_object('finalRank', existing.final_rank, 'finalPoints', existing.final_points, 'trophyEligible', existing.trophy_eligible, 'finalizedAt', existing.finalized_at); END IF;
  SELECT COALESCE(MAX(final_rank), 0) + 1 INTO assigned_rank FROM public.tier_d_league_finalizations WHERE league_id = p_league_id;
  INSERT INTO public.tier_d_league_finalizations (user_id, league_id, final_level, final_points, final_rank, trophy_eligible) VALUES (p_user_id, p_league_id, p_final_level, GREATEST(p_final_points, 0), assigned_rank, assigned_rank <= 3);
  UPDATE public.tier_d_league_progress SET finalized_at = now(), final_rank = assigned_rank, final_points = GREATEST(p_final_points, 0), reward_eligible = assigned_rank <= 3, updated_at = now() WHERE user_id = p_user_id AND league_id = p_league_id;
  RETURN jsonb_build_object('finalRank', assigned_rank, 'finalPoints', GREATEST(p_final_points, 0), 'trophyEligible', assigned_rank <= 3, 'finalizedAt', now());
END; $$;
REVOKE ALL ON FUNCTION public.finalize_tier_d_league(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_tier_d_league(uuid, text, integer, integer) TO service_role;
NOTIFY pgrst, 'reload schema';
