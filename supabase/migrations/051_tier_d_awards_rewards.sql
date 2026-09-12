-- Tier D collectible achievements and consumable reward grants are separate:
-- only consumables may be doubled.
CREATE TABLE IF NOT EXISTS public.tier_d_league_awards (
  user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  league_id text NOT NULL,
  award_type text NOT NULL CHECK (award_type IN ('medal','trophy')),
  final_rank integer NOT NULL,
  final_points integer NOT NULL,
  league_name text NOT NULL,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, league_id, award_type)
);
CREATE TABLE IF NOT EXISTS public.tier_d_item_reward_grants (
  user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  event_id text NOT NULL,
  item_key text NOT NULL CHECK (item_key IN ('single_card_swap','full_redraw','bomb_defuser')),
  quantity integer NOT NULL CHECK (quantity IN (1,2)),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id, item_key)
);
ALTER TABLE public.tier_d_league_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tier_d_item_reward_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tier_d_league_awards, public.tier_d_item_reward_grants FROM anon, authenticated;
GRANT ALL ON public.tier_d_league_awards, public.tier_d_item_reward_grants TO service_role;

CREATE OR REPLACE FUNCTION public.grant_tier_d_league_awards(p_user_id uuid, p_league_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE final_row public.tier_d_league_finalizations%ROWTYPE;
BEGIN
  SELECT * INTO final_row FROM public.tier_d_league_finalizations WHERE user_id=p_user_id AND league_id=p_league_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'LEAGUE_NOT_FINALIZED'; END IF;
  INSERT INTO public.tier_d_league_awards (user_id,league_id,award_type,final_rank,final_points,league_name) VALUES (p_user_id,p_league_id,'medal',final_row.final_rank,final_row.final_points,replace(initcap(replace(p_league_id,'-',' ')),'Tier D ','League ')) ON CONFLICT DO NOTHING;
  IF final_row.trophy_eligible THEN INSERT INTO public.tier_d_league_awards (user_id,league_id,award_type,final_rank,final_points,league_name) VALUES (p_user_id,p_league_id,'trophy',final_row.final_rank,final_row.final_points,replace(initcap(replace(p_league_id,'-',' ')),'Tier D ','League ')) ON CONFLICT DO NOTHING; END IF;
  RETURN jsonb_build_object('medalGranted',true,'trophyGranted',final_row.trophy_eligible);
END; $$;
CREATE OR REPLACE FUNCTION public.fulfill_tier_d_item_reward(p_user_id uuid,p_event_id text,p_item_key text,p_quantity integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE grant_row public.tier_d_item_reward_grants%ROWTYPE;
BEGIN
  INSERT INTO public.tier_d_item_reward_grants (user_id,event_id,item_key,quantity) VALUES (p_user_id,p_event_id,p_item_key,CASE WHEN p_quantity=2 THEN 2 ELSE 1 END) ON CONFLICT (user_id,event_id,item_key) DO NOTHING;
  SELECT * INTO grant_row FROM public.tier_d_item_reward_grants WHERE user_id=p_user_id AND event_id=p_event_id AND item_key=p_item_key;
  RETURN jsonb_build_object('itemKey',grant_row.item_key,'quantity',grant_row.quantity,'idempotent',grant_row.granted_at < now());
END; $$;
REVOKE ALL ON FUNCTION public.grant_tier_d_league_awards(uuid,text), public.fulfill_tier_d_item_reward(uuid,text,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_tier_d_league_awards(uuid,text), public.fulfill_tier_d_item_reward(uuid,text,text,integer) TO service_role;
NOTIFY pgrst, 'reload schema';
