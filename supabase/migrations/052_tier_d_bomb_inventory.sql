CREATE TABLE IF NOT EXISTS public.tier_d_item_inventory (
  user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  item_key text NOT NULL CHECK (item_key IN ('single_card_swap','full_redraw','bomb_defuser')),
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  PRIMARY KEY (user_id,item_key)
);
CREATE TABLE IF NOT EXISTS public.tier_d_bomb_defuser_uses (
  user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  bomb_event_id text NOT NULL,
  used_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,bomb_event_id)
);
ALTER TABLE public.tier_d_item_inventory ENABLE ROW LEVEL SECURITY; ALTER TABLE public.tier_d_bomb_defuser_uses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tier_d_item_inventory, public.tier_d_bomb_defuser_uses FROM anon, authenticated; GRANT ALL ON public.tier_d_item_inventory, public.tier_d_bomb_defuser_uses TO service_role;
CREATE OR REPLACE FUNCTION public.consume_tier_d_bomb_defuser(p_user_id uuid,p_bomb_event_id text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tier_d_bomb_defuser_uses WHERE user_id=p_user_id AND bomb_event_id=p_bomb_event_id) THEN RETURN true; END IF;
  UPDATE public.tier_d_item_inventory SET quantity=quantity-1 WHERE user_id=p_user_id AND item_key='bomb_defuser' AND quantity>0;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.tier_d_bomb_defuser_uses(user_id,bomb_event_id) VALUES(p_user_id,p_bomb_event_id) ON CONFLICT DO NOTHING;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.consume_tier_d_bomb_defuser(uuid,text) FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION public.consume_tier_d_bomb_defuser(uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.fulfill_tier_d_item_reward(p_user_id uuid,p_event_id text,p_item_key text,p_quantity integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE grant_row public.tier_d_item_reward_grants%ROWTYPE; inserted_count integer;
BEGIN
  INSERT INTO public.tier_d_item_reward_grants (user_id,event_id,item_key,quantity) VALUES (p_user_id,p_event_id,p_item_key,CASE WHEN p_quantity=2 THEN 2 ELSE 1 END) ON CONFLICT (user_id,event_id,item_key) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  SELECT * INTO grant_row FROM public.tier_d_item_reward_grants WHERE user_id=p_user_id AND event_id=p_event_id AND item_key=p_item_key;
  IF inserted_count = 1 THEN INSERT INTO public.tier_d_item_inventory(user_id,item_key,quantity) VALUES(p_user_id,p_item_key,grant_row.quantity) ON CONFLICT(user_id,item_key) DO UPDATE SET quantity=tier_d_item_inventory.quantity + EXCLUDED.quantity; END IF;
  RETURN jsonb_build_object('itemKey',grant_row.item_key,'quantity',grant_row.quantity,'idempotent',inserted_count=0);
END; $$;
NOTIFY pgrst, 'reload schema';
