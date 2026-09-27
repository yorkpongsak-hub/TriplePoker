-- Every cleared Tier D Level reserves one normal Item. A deterministic retry-safe
-- rare second slot is added on a 20% roll; a Level therefore displays one or two
-- Items, never more. Swap remains excluded from all Level rewards.
BEGIN;

CREATE OR REPLACE FUNCTION public.grant_tier_d_level_random_item(p_user_id uuid, p_level integer, p_quantity integer DEFAULT 1, p_is_vip boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  normal_item text;
  include_rare boolean;
  rewards jsonb;
  existing_count integer;
BEGIN
  IF p_level < 1 THEN RAISE EXCEPTION 'INVALID_LEVEL'; END IF;

  -- Existing reservations are authoritative. Never reroll them on reconnect or retry.
  SELECT count(*) INTO existing_count FROM public.tier_d_level_item_rewards WHERE user_id=p_user_id AND level=p_level;
  IF existing_count = 0 THEN
    SELECT item_key INTO normal_item
      FROM public.tier_d_item_reward_weights
      WHERE reward_source='level_random' AND weight>0 AND item_key <> 'undo'
      ORDER BY -ln(greatest(random(), 0.000001)) / weight
      LIMIT 1;
    IF normal_item IS NULL THEN RAISE EXCEPTION 'LEVEL_REWARD_POOL_EMPTY'; END IF;

    INSERT INTO public.tier_d_level_item_rewards(user_id,level,reward_slot,item_key,granted_quantity,is_ad_bonus,claimed_at)
      VALUES(p_user_id,p_level,1,normal_item,CASE WHEN p_quantity=2 THEN 2 ELSE 1 END,false,NULL);

    include_rare := random() < 0.20;
    IF include_rare THEN
      -- Undo is the established rare Level-reward Item and remains scarce.
      INSERT INTO public.tier_d_level_item_rewards(user_id,level,reward_slot,item_key,granted_quantity,is_ad_bonus,claimed_at)
        VALUES(p_user_id,p_level,2,'undo',1,false,NULL);
    END IF;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('itemKey',item_key,'quantity',granted_quantity) ORDER BY reward_slot),'[]'::jsonb)
    INTO rewards FROM public.tier_d_level_item_rewards WHERE user_id=p_user_id AND level=p_level;
  RETURN jsonb_build_object('items',rewards,'adBonusQuantity',0,'canWatchAd',NOT p_is_vip,'idempotent',existing_count>0);
END; $$;

REVOKE ALL ON FUNCTION public.grant_tier_d_level_random_item(uuid,integer,integer,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_tier_d_level_random_item(uuid,integer,integer,boolean) TO service_role;
COMMIT;
NOTIFY pgrst, 'reload schema';
