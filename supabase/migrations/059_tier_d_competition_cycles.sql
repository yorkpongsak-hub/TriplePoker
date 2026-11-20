-- Full 20-Level League competition rounds.  These tables are intentionally
-- separate from legacy League-finalization records.
CREATE TABLE IF NOT EXISTS public.tier_d_competition_progress (
  user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  league_id text NOT NULL,
  cycle_no integer NOT NULL CHECK (cycle_no > 0),
  current_level integer NOT NULL CHECK (current_level > 0),
  league_points integer NOT NULL DEFAULT 0 CHECK (league_points >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, league_id, cycle_no)
);
CREATE TABLE IF NOT EXISTS public.tier_d_competition_rewards (
  user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  league_id text NOT NULL,
  cycle_no integer NOT NULL CHECK (cycle_no > 0),
  final_rank integer NOT NULL CHECK (final_rank BETWEEN 1 AND 20),
  item_keys jsonb NOT NULL,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, league_id, cycle_no)
);
CREATE TABLE IF NOT EXISTS public.tier_d_league_trophies (
  user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  league_id text NOT NULL,
  best_rank integer NOT NULL CHECK (best_rank BETWEEN 1 AND 3),
  earned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, league_id)
);
ALTER TABLE public.tier_d_competition_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tier_d_competition_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tier_d_league_trophies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tier_d_competition_progress, public.tier_d_competition_rewards, public.tier_d_league_trophies FROM anon, authenticated;
GRANT ALL ON public.tier_d_competition_progress, public.tier_d_competition_rewards, public.tier_d_league_trophies TO service_role;

CREATE OR REPLACE FUNCTION public.add_tier_d_competition_points(p_user_id uuid,p_league_id text,p_cycle_no integer,p_level integer,p_points integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.tier_d_competition_progress(user_id,league_id,cycle_no,current_level,league_points)
    VALUES(p_user_id,p_league_id,p_cycle_no,p_level,GREATEST(0,p_points))
    ON CONFLICT(user_id,league_id,cycle_no) DO UPDATE SET current_level=GREATEST(tier_d_competition_progress.current_level,EXCLUDED.current_level),league_points=tier_d_competition_progress.league_points+EXCLUDED.league_points,updated_at=now();
END; $$;
CREATE OR REPLACE FUNCTION public.award_tier_d_competition(p_user_id uuid,p_league_id text,p_cycle_no integer,p_rank integer,p_item_keys jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item text; inserted_count integer;
BEGIN
  INSERT INTO public.tier_d_competition_rewards(user_id,league_id,cycle_no,final_rank,item_keys) VALUES(p_user_id,p_league_id,p_cycle_no,p_rank,p_item_keys) ON CONFLICT(user_id,league_id,cycle_no) DO NOTHING;
  GET DIAGNOSTICS inserted_count=ROW_COUNT;
  IF inserted_count=0 THEN RETURN false; END IF;
  FOR item IN SELECT jsonb_array_elements_text(p_item_keys) LOOP
    INSERT INTO public.tier_d_item_inventory(user_id,item_key,quantity) VALUES(p_user_id,item,1) ON CONFLICT(user_id,item_key) DO UPDATE SET quantity=tier_d_item_inventory.quantity+1;
  END LOOP;
  IF p_rank<=3 THEN
    INSERT INTO public.tier_d_league_trophies(user_id,league_id,best_rank) VALUES(p_user_id,p_league_id,p_rank)
      ON CONFLICT(user_id,league_id) DO UPDATE SET best_rank=LEAST(tier_d_league_trophies.best_rank,EXCLUDED.best_rank),earned_at=CASE WHEN EXCLUDED.best_rank<tier_d_league_trophies.best_rank THEN now() ELSE tier_d_league_trophies.earned_at END;
  END IF;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.add_tier_d_competition_points(uuid,text,integer,integer,integer), public.award_tier_d_competition(uuid,text,integer,integer,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_tier_d_competition_points(uuid,text,integer,integer,integer), public.award_tier_d_competition(uuid,text,integer,integer,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
