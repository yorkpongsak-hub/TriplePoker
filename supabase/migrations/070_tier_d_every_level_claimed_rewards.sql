-- Every successful Tier D Solo level reserves one random reward.  The reward
-- is only credited when a VIP claims it or a free member completes its ad.
ALTER TABLE public.tier_d_level_item_rewards
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

CREATE OR REPLACE FUNCTION public.grant_tier_d_level_random_item(p_user_id uuid, p_level integer, p_quantity integer DEFAULT 1, p_is_vip boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  item_pool text[];
  slot_count integer := CASE WHEN p_level % 10 = 0 THEN 3 ELSE 1 END;
  quantity_per_item integer := CASE WHEN p_level % 10 = 0 THEN 2 ELSE 1 END;
  slot_no integer;
  inserted_count integer := 0;
  changed integer;
  rewards jsonb;
BEGIN
  IF p_level < 1 THEN RAISE EXCEPTION 'INVALID_LEVEL'; END IF;
  SELECT array_agg(item ORDER BY md5(p_user_id::text || ':' || p_level::text || ':' || item))
    INTO item_pool FROM unnest(ARRAY['shuffle','swap','double_pile','freeze','auto_sort','undo']) AS items(item);
  FOR slot_no IN 1..slot_count LOOP
    INSERT INTO public.tier_d_level_item_rewards(user_id,level,reward_slot,item_key,granted_quantity,is_ad_bonus,claimed_at)
      VALUES(p_user_id,p_level,slot_no,item_pool[slot_no],quantity_per_item,false,NULL)
      ON CONFLICT(user_id,level,reward_slot) DO NOTHING;
    GET DIAGNOSTICS changed = ROW_COUNT;
    inserted_count := inserted_count + changed;
  END LOOP;
  SELECT coalesce(jsonb_agg(jsonb_build_object('itemKey',item_key,'quantity',granted_quantity) ORDER BY item_key),'[]'::jsonb)
    INTO rewards FROM (
      SELECT item_key, sum(granted_quantity)::integer AS granted_quantity
      FROM public.tier_d_level_item_rewards WHERE user_id=p_user_id AND level=p_level GROUP BY item_key
    ) AS totals;
  RETURN jsonb_build_object('items',rewards,'adBonusQuantity',0,'canWatchAd',NOT p_is_vip,'idempotent',inserted_count=0);
END; $$;

CREATE OR REPLACE FUNCTION public.claim_tier_d_level_reward(p_user_id uuid, p_level integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  reward record;
  changed integer := 0;
  rewards jsonb;
BEGIN
  FOR reward IN SELECT reward_slot,item_key,granted_quantity FROM public.tier_d_level_item_rewards
    WHERE user_id=p_user_id AND level=p_level AND claimed_at IS NULL FOR UPDATE
  LOOP
    UPDATE public.tier_d_level_item_rewards SET claimed_at=now()
      WHERE user_id=p_user_id AND level=p_level AND reward_slot=reward.reward_slot AND claimed_at IS NULL;
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed = 1 THEN
      INSERT INTO public.tier_d_item_inventory(user_id,item_key,quantity) VALUES(p_user_id,reward.item_key,reward.granted_quantity)
        ON CONFLICT(user_id,item_key) DO UPDATE SET quantity=tier_d_item_inventory.quantity+EXCLUDED.quantity;
    END IF;
  END LOOP;
  SELECT coalesce(jsonb_agg(jsonb_build_object('itemKey',item_key,'quantity',granted_quantity) ORDER BY item_key),'[]'::jsonb)
    INTO rewards FROM (SELECT item_key,sum(granted_quantity)::integer AS granted_quantity FROM public.tier_d_level_item_rewards WHERE user_id=p_user_id AND level=p_level GROUP BY item_key) AS totals;
  RETURN jsonb_build_object('items',rewards,'adBonusQuantity',0,'canWatchAd',false,'idempotent',NOT EXISTS(SELECT 1 FROM public.tier_d_level_item_rewards WHERE user_id=p_user_id AND level=p_level AND claimed_at IS NULL));
END; $$;

CREATE OR REPLACE FUNCTION public.claim_tier_d_level_ad_bonus(p_user_id uuid, p_level integer)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT public.claim_tier_d_level_reward(p_user_id, p_level);
$$;

REVOKE ALL ON FUNCTION public.grant_tier_d_level_random_item(uuid,integer,integer,boolean), public.claim_tier_d_level_reward(uuid,integer), public.claim_tier_d_level_ad_bonus(uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_tier_d_level_random_item(uuid,integer,integer,boolean), public.claim_tier_d_level_reward(uuid,integer), public.claim_tier_d_level_ad_bonus(uuid,integer) TO service_role;
NOTIFY pgrst, 'reload schema';
