CREATE OR REPLACE FUNCTION public.award_tier_d_mini_tournament(p_tournament_id uuid,p_user_id text,p_rank integer,p_item_key text,p_trophy text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE inserted integer;
BEGIN
  INSERT INTO public.tier_d_mini_tournament_rewards(tournament_id,user_id,final_rank,item_key,mini_trophy_edition) VALUES(p_tournament_id,p_user_id,p_rank,p_item_key,NULLIF(p_trophy,'')) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted=ROW_COUNT;
  IF inserted=0 THEN RETURN false; END IF;
  INSERT INTO public.tier_d_item_inventory(user_id,item_key,quantity) VALUES(p_user_id,p_item_key,1) ON CONFLICT(user_id,item_key) DO UPDATE SET quantity=tier_d_item_inventory.quantity+1;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.award_tier_d_mini_tournament(uuid,text,integer,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_tier_d_mini_tournament(uuid,text,integer,text,text) TO service_role;
