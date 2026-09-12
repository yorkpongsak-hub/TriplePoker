-- Tier D level reward fulfilment: VIP/No-Ads receives x2 immediately;
-- Freemium receives x1 then may claim exactly one verified ad bonus (+1).
ALTER TABLE public.tier_d_level_item_rewards
  ADD COLUMN IF NOT EXISTS granted_quantity integer NOT NULL DEFAULT 1 CHECK (granted_quantity IN (1,2)),
  ADD COLUMN IF NOT EXISTS ad_bonus_claimed_at timestamptz;

CREATE OR REPLACE FUNCTION public.grant_tier_d_level_random_item(p_user_id uuid, p_level integer, p_quantity integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE chosen text; reward public.tier_d_level_item_rewards%ROWTYPE; inserted_count integer; qty integer := CASE WHEN p_quantity=2 THEN 2 ELSE 1 END;
BEGIN
  chosen := (ARRAY['single_card_swap','bomb_defuser','full_redraw'])[1 + mod(abs(hashtext(p_user_id::text || ':' || p_level::text)), 3)];
  INSERT INTO public.tier_d_level_item_rewards(user_id,level,item_key,granted_quantity)
    VALUES(p_user_id,p_level,chosen,qty) ON CONFLICT(user_id,level) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  SELECT * INTO reward FROM public.tier_d_level_item_rewards WHERE user_id=p_user_id AND level=p_level;
  IF inserted_count = 1 THEN
    INSERT INTO public.tier_d_item_inventory(user_id,item_key,quantity) VALUES(p_user_id,reward.item_key,reward.granted_quantity)
      ON CONFLICT(user_id,item_key) DO UPDATE SET quantity=tier_d_item_inventory.quantity+EXCLUDED.quantity;
  END IF;
  RETURN jsonb_build_object('itemKey',reward.item_key,'quantity',reward.granted_quantity,'canWatchAd',reward.granted_quantity=1 AND reward.ad_bonus_claimed_at IS NULL,'idempotent',inserted_count=0);
END; $$;

CREATE OR REPLACE FUNCTION public.claim_tier_d_level_ad_bonus(p_user_id uuid, p_level integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE reward public.tier_d_level_item_rewards%ROWTYPE; changed integer;
BEGIN
  SELECT * INTO reward FROM public.tier_d_level_item_rewards WHERE user_id=p_user_id AND level=p_level FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LEVEL_REWARD_NOT_FOUND'; END IF;
  IF reward.granted_quantity >= 2 OR reward.ad_bonus_claimed_at IS NOT NULL THEN
    RETURN jsonb_build_object('itemKey',reward.item_key,'quantity',reward.granted_quantity,'idempotent',true);
  END IF;
  UPDATE public.tier_d_level_item_rewards SET granted_quantity=2,ad_bonus_claimed_at=now()
    WHERE user_id=p_user_id AND level=p_level AND ad_bonus_claimed_at IS NULL;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed = 1 THEN
    INSERT INTO public.tier_d_item_inventory(user_id,item_key,quantity) VALUES(p_user_id,reward.item_key,1)
      ON CONFLICT(user_id,item_key) DO UPDATE SET quantity=tier_d_item_inventory.quantity+1;
  END IF;
  SELECT * INTO reward FROM public.tier_d_level_item_rewards WHERE user_id=p_user_id AND level=p_level;
  RETURN jsonb_build_object('itemKey',reward.item_key,'quantity',reward.granted_quantity,'idempotent',changed=0);
END; $$;

REVOKE ALL ON FUNCTION public.grant_tier_d_level_random_item(uuid,integer,integer), public.claim_tier_d_level_ad_bonus(uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_tier_d_level_random_item(uuid,integer,integer), public.claim_tier_d_level_ad_bonus(uuid,integer) TO service_role;
NOTIFY pgrst, 'reload schema';
