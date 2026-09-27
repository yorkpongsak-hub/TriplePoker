CREATE TABLE IF NOT EXISTS public.tier_d_competition_score_credits (
  user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  league_id text NOT NULL,
  cycle_no integer NOT NULL CHECK (cycle_no > 0),
  level integer NOT NULL CHECK (level > 0),
  earned_score integer NOT NULL CHECK (earned_score >= 0),
  credited_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, league_id, cycle_no, level)
);
ALTER TABLE public.tier_d_competition_score_credits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tier_d_competition_score_credits FROM anon, authenticated;
GRANT ALL ON public.tier_d_competition_score_credits TO service_role;

-- PostgreSQL cannot change the existing migration-059 function from void to
-- jsonb with CREATE OR REPLACE. Only the function definition is replaced;
-- competition progress and previously accumulated scores remain untouched.
DROP FUNCTION IF EXISTS public.add_tier_d_competition_points(uuid,text,integer,integer,integer);
CREATE FUNCTION public.add_tier_d_competition_points(p_user_id uuid,p_league_id text,p_cycle_no integer,p_level integer,p_points integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE safe_points integer := GREATEST(0,p_points); previous_total integer := 0; new_total integer := 0; inserted_count integer := 0;
BEGIN
  SELECT league_points INTO previous_total FROM public.tier_d_competition_progress WHERE user_id=p_user_id AND league_id=p_league_id AND cycle_no=p_cycle_no FOR UPDATE;
  previous_total := COALESCE(previous_total,0);
  INSERT INTO public.tier_d_competition_score_credits(user_id,league_id,cycle_no,level,earned_score) VALUES(p_user_id,p_league_id,p_cycle_no,p_level,safe_points) ON CONFLICT(user_id,league_id,cycle_no,level) DO NOTHING;
  GET DIAGNOSTICS inserted_count=ROW_COUNT;
  IF inserted_count=1 THEN
    INSERT INTO public.tier_d_competition_progress(user_id,league_id,cycle_no,current_level,league_points) VALUES(p_user_id,p_league_id,p_cycle_no,p_level,safe_points)
      ON CONFLICT(user_id,league_id,cycle_no) DO UPDATE SET current_level=GREATEST(tier_d_competition_progress.current_level,EXCLUDED.current_level),league_points=tier_d_competition_progress.league_points+EXCLUDED.league_points,updated_at=now()
      RETURNING league_points INTO new_total;
  ELSE
    SELECT COALESCE(league_points,0) INTO new_total FROM public.tier_d_competition_progress WHERE user_id=p_user_id AND league_id=p_league_id AND cycle_no=p_cycle_no;
  END IF;
  RETURN jsonb_build_object('credited',inserted_count=1,'earnedScore',CASE WHEN inserted_count=1 THEN safe_points ELSE 0 END,'requestedScore',safe_points,'previousTotal',CASE WHEN inserted_count=1 THEN previous_total ELSE COALESCE(new_total,0) END,'newTotal',COALESCE(new_total,0));
END; $$;
REVOKE ALL ON FUNCTION public.add_tier_d_competition_points(uuid,text,integer,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_tier_d_competition_points(uuid,text,integer,integer,integer) TO service_role;
NOTIFY pgrst, 'reload schema';
