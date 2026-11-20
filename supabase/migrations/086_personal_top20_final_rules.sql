ALTER TABLE public.tier_d_mini_tournaments
  ADD COLUMN IF NOT EXISTS reward_band jsonb,
  ADD COLUMN IF NOT EXISTS intro_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS reward_seen_at timestamptz;

ALTER TABLE public.tier_d_mini_tournament_rewards
  ADD COLUMN IF NOT EXISTS token_reward integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trophy_type text,
  ADD COLUMN IF NOT EXISTS champion boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.award_tier_d_personal_tournament(
  p_tournament_id uuid,p_user_id uuid,p_league_id text,p_rank integer,
  p_item_key text,p_token_reward integer,p_trophy_type text,p_champion boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE inserted integer;
BEGIN
  INSERT INTO public.tier_d_mini_tournament_rewards(tournament_id,user_id,final_rank,item_key,mini_trophy_edition,token_reward,trophy_type,champion)
  VALUES(p_tournament_id,p_user_id::text,p_rank,p_item_key,NULLIF(p_trophy_type,''),GREATEST(0,p_token_reward),NULLIF(p_trophy_type,''),p_champion)
  ON CONFLICT(tournament_id,user_id) DO NOTHING;
  GET DIAGNOSTICS inserted=ROW_COUNT;
  IF inserted=0 THEN RETURN false; END IF;
  INSERT INTO public.tier_d_item_inventory(user_id,item_key,quantity) VALUES(p_user_id,p_item_key,1)
    ON CONFLICT(user_id,item_key) DO UPDATE SET quantity=tier_d_item_inventory.quantity+1;
  IF p_rank<=3 THEN
    INSERT INTO public.tier_d_league_trophies(user_id,league_id,best_rank) VALUES(p_user_id,p_league_id,p_rank)
      ON CONFLICT(user_id,league_id) DO UPDATE SET best_rank=LEAST(tier_d_league_trophies.best_rank,EXCLUDED.best_rank),earned_at=CASE WHEN EXCLUDED.best_rank<tier_d_league_trophies.best_rank THEN now() ELSE tier_d_league_trophies.earned_at END;
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.award_tier_d_personal_tournament(uuid,uuid,text,integer,text,integer,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.award_tier_d_personal_tournament(uuid,uuid,text,integer,text,integer,text,boolean) TO service_role;
NOTIFY pgrst, 'reload schema';
