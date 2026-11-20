-- Auto Sort is a Tier D inventory item, never the legacy token-fee mechanic.
ALTER TABLE public.tier_d_item_inventory DROP CONSTRAINT IF EXISTS tier_d_item_inventory_item_key_check;
ALTER TABLE public.tier_d_runtime_item_uses DROP CONSTRAINT IF EXISTS tier_d_runtime_item_uses_item_key_check;
ALTER TABLE public.tier_d_level_item_rewards DROP CONSTRAINT IF EXISTS tier_d_level_item_rewards_item_key_check;
ALTER TABLE public.tier_d_runtime_item_ad_claims DROP CONSTRAINT IF EXISTS tier_d_runtime_item_ad_claims_item_key_check;

ALTER TABLE public.tier_d_item_inventory ADD CONSTRAINT tier_d_item_inventory_item_key_check CHECK (item_key IN ('shuffle','swap','double_pile','freeze','auto_sort','undo'));
ALTER TABLE public.tier_d_runtime_item_uses ADD CONSTRAINT tier_d_runtime_item_uses_item_key_check CHECK (item_key IN ('shuffle','swap','double_pile','freeze','auto_sort','undo'));
ALTER TABLE public.tier_d_level_item_rewards ADD CONSTRAINT tier_d_level_item_rewards_item_key_check CHECK (item_key IN ('shuffle','swap','double_pile','freeze','auto_sort','undo'));
ALTER TABLE public.tier_d_runtime_item_ad_claims ADD CONSTRAINT tier_d_runtime_item_ad_claims_item_key_check CHECK (item_key IN ('shuffle','swap','double_pile','freeze','auto_sort','undo'));

CREATE OR REPLACE FUNCTION public.claim_tier_d_runtime_item_ad(p_user_id uuid, p_item_key text, p_event_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE inserted_count integer;
BEGIN
  IF p_item_key NOT IN ('shuffle','swap','double_pile','freeze','auto_sort','undo') THEN RAISE EXCEPTION 'INVALID_ITEM_KEY'; END IF;
  IF length(trim(p_event_id)) < 12 THEN RAISE EXCEPTION 'INVALID_EVENT_ID'; END IF;
  INSERT INTO public.tier_d_runtime_item_ad_claims(event_id,user_id,item_key) VALUES(p_event_id,p_user_id,p_item_key) ON CONFLICT(event_id) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count = 1 THEN
    INSERT INTO public.tier_d_item_inventory(user_id,item_key,quantity) VALUES(p_user_id,p_item_key,1)
      ON CONFLICT(user_id,item_key) DO UPDATE SET quantity=tier_d_item_inventory.quantity+1;
  END IF;
  RETURN jsonb_build_object('itemKey',p_item_key,'quantity',1,'idempotent',inserted_count=0);
END; $$;

-- Include the sixth canonical item in future level-clear rewards. The existing
-- reward-slot/idempotency model remains unchanged.
CREATE OR REPLACE FUNCTION public.grant_tier_d_level_random_item(p_user_id uuid, p_level integer, p_quantity integer DEFAULT 1, p_is_vip boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item_pool text[]; base_slots integer; base_quantity integer; ad_quantity integer; slot_no integer; inserted_count integer := 0; changed integer; rewards jsonb;
BEGIN
  IF p_level < 1 THEN RAISE EXCEPTION 'INVALID_LEVEL'; END IF;
  IF p_level <= 150 THEN base_slots := 1; base_quantity := 1; ad_quantity := 1;
  ELSIF p_level <= 350 THEN base_slots := 2; base_quantity := 1; ad_quantity := 1;
  ELSIF p_level <= 1000 THEN base_slots := 2; ad_quantity := 2;
  ELSE base_slots := 3; base_quantity := 1; ad_quantity := 2; END IF;
  SELECT array_agg(item ORDER BY md5(p_user_id::text || ':' || p_level::text || ':' || item))
    INTO item_pool FROM unnest(ARRAY['shuffle','swap','double_pile','freeze','auto_sort','undo']) AS items(item);
  FOR slot_no IN 1..base_slots LOOP
    IF p_level BETWEEN 351 AND 1000 THEN base_quantity := 1 + (get_byte(decode(md5(p_user_id::text || ':' || p_level::text || ':' || slot_no::text),'hex'), 0) % 2); END IF;
    INSERT INTO public.tier_d_level_item_rewards(user_id,level,reward_slot,item_key,granted_quantity,is_ad_bonus)
      VALUES(p_user_id,p_level,slot_no,item_pool[slot_no],base_quantity,false) ON CONFLICT(user_id,level,reward_slot) DO NOTHING;
    GET DIAGNOSTICS changed = ROW_COUNT; inserted_count := inserted_count + changed;
    IF changed = 1 THEN INSERT INTO public.tier_d_item_inventory(user_id,item_key,quantity) VALUES(p_user_id,item_pool[slot_no],base_quantity) ON CONFLICT(user_id,item_key) DO UPDATE SET quantity=tier_d_item_inventory.quantity+EXCLUDED.quantity; END IF;
  END LOOP;
  IF p_is_vip THEN
    INSERT INTO public.tier_d_level_item_rewards(user_id,level,reward_slot,item_key,granted_quantity,is_ad_bonus,ad_bonus_claimed_at)
      VALUES(p_user_id,p_level,100,item_pool[CASE WHEN p_level <= 150 THEN 1 ELSE LEAST(base_slots+1,6) END],ad_quantity,true,now()) ON CONFLICT(user_id,level,reward_slot) DO NOTHING;
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed = 1 THEN INSERT INTO public.tier_d_item_inventory(user_id,item_key,quantity) VALUES(p_user_id,item_pool[LEAST(base_slots+1,6)],ad_quantity) ON CONFLICT(user_id,item_key) DO UPDATE SET quantity=tier_d_item_inventory.quantity+EXCLUDED.quantity; END IF;
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('itemKey',item_key,'quantity',granted_quantity) ORDER BY item_key),'[]'::jsonb) INTO rewards FROM (SELECT item_key,sum(granted_quantity)::integer AS granted_quantity FROM public.tier_d_level_item_rewards WHERE user_id=p_user_id AND level=p_level GROUP BY item_key) AS totals;
  RETURN jsonb_build_object('items',rewards,'adBonusQuantity',ad_quantity,'canWatchAd',NOT p_is_vip AND NOT EXISTS(SELECT 1 FROM public.tier_d_level_item_rewards WHERE user_id=p_user_id AND level=p_level AND is_ad_bonus),'idempotent',inserted_count=0);
END; $$;

CREATE OR REPLACE FUNCTION public.claim_tier_d_level_ad_bonus(p_user_id uuid, p_level integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item_pool text[]; base_slots integer; ad_quantity integer; changed integer; rewards jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.tier_d_level_item_rewards WHERE user_id=p_user_id AND level=p_level AND reward_slot=1) THEN RAISE EXCEPTION 'LEVEL_REWARD_NOT_FOUND'; END IF;
  IF p_level <= 150 THEN base_slots := 1; ad_quantity := 1; ELSIF p_level <= 350 THEN base_slots := 2; ad_quantity := 1; ELSIF p_level <= 1000 THEN base_slots := 2; ad_quantity := 2; ELSE base_slots := 3; ad_quantity := 2; END IF;
  SELECT array_agg(item ORDER BY md5(p_user_id::text || ':' || p_level::text || ':' || item)) INTO item_pool FROM unnest(ARRAY['shuffle','swap','double_pile','freeze','auto_sort','undo']) AS items(item);
  INSERT INTO public.tier_d_level_item_rewards(user_id,level,reward_slot,item_key,granted_quantity,is_ad_bonus,ad_bonus_claimed_at)
    VALUES(p_user_id,p_level,100,item_pool[CASE WHEN p_level <= 150 THEN 1 ELSE LEAST(base_slots+1,6) END],ad_quantity,true,now()) ON CONFLICT(user_id,level,reward_slot) DO NOTHING;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed = 1 THEN INSERT INTO public.tier_d_item_inventory(user_id,item_key,quantity) VALUES(p_user_id,item_pool[LEAST(base_slots+1,6)],ad_quantity) ON CONFLICT(user_id,item_key) DO UPDATE SET quantity=tier_d_item_inventory.quantity+EXCLUDED.quantity; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('itemKey',item_key,'quantity',granted_quantity) ORDER BY item_key),'[]'::jsonb) INTO rewards FROM (SELECT item_key,sum(granted_quantity)::integer AS granted_quantity FROM public.tier_d_level_item_rewards WHERE user_id=p_user_id AND level=p_level GROUP BY item_key) AS totals;
  RETURN jsonb_build_object('items',rewards,'adBonusQuantity',ad_quantity,'canWatchAd',false,'idempotent',changed=0);
END; $$;

REVOKE ALL ON FUNCTION public.claim_tier_d_runtime_item_ad(uuid,text,text), public.grant_tier_d_level_random_item(uuid,integer,integer,boolean), public.claim_tier_d_level_ad_bonus(uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_tier_d_runtime_item_ad(uuid,text,text), public.grant_tier_d_level_random_item(uuid,integer,integer,boolean), public.claim_tier_d_level_ad_bonus(uuid,integer) TO service_role;
NOTIFY pgrst, 'reload schema';
