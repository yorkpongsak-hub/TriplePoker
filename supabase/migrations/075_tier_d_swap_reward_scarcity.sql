-- Swap is a high-utility card-replacement Item. Keep all level-reward weights
-- in one configurable table and deliberately exclude Swap from level rewards.
BEGIN;

CREATE TABLE IF NOT EXISTS public.tier_d_item_reward_weights (
  reward_source text NOT NULL CHECK (reward_source IN ('level_random')),
  item_key text NOT NULL CHECK (item_key IN ('shuffle','swap','double_pile','freeze','auto_sort','undo')),
  weight integer NOT NULL CHECK (weight >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (reward_source, item_key)
);
ALTER TABLE public.tier_d_item_reward_weights ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tier_d_item_reward_weights FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tier_d_item_reward_weights TO service_role;

-- The zero makes the policy explicit: clearing a Level never increases Swap
-- supply. Rebalancing only requires editing these centralized rows.
INSERT INTO public.tier_d_item_reward_weights(reward_source,item_key,weight) VALUES
  ('level_random','undo',8),
  ('level_random','shuffle',14),
  ('level_random','double_pile',16),
  ('level_random','swap',0),
  ('level_random','auto_sort',26),
  ('level_random','freeze',32)
ON CONFLICT(reward_source,item_key) DO UPDATE
  SET weight=EXCLUDED.weight, updated_at=now();

CREATE OR REPLACE FUNCTION public.grant_tier_d_level_random_item(p_user_id uuid, p_level integer, p_quantity integer DEFAULT 1, p_is_vip boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE block_start integer := p_level - (p_level % 10); position integer := p_level % 10;
  chosen text; rewards jsonb;
BEGIN
  IF p_level < 1 THEN RAISE EXCEPTION 'INVALID_LEVEL'; END IF;
  IF position = 0 THEN
    chosen := 'undo';
  ELSIF (SELECT count(*) FROM public.tier_d_level_item_rewards WHERE user_id=p_user_id AND level BETWEEN block_start+1 AND block_start+9) >= 3 THEN
    RETURN jsonb_build_object('items','[]'::jsonb,'adBonusQuantity',0,'canWatchAd',false,'idempotent',false);
  ELSIF random() < 0.34 THEN
    SELECT item_key INTO chosen
      FROM public.tier_d_item_reward_weights
      WHERE reward_source='level_random' AND weight>0
      ORDER BY -ln(greatest(random(), 0.000001)) / weight
      LIMIT 1;
    IF chosen IS NULL THEN RAISE EXCEPTION 'LEVEL_REWARD_POOL_EMPTY'; END IF;
  ELSE
    RETURN jsonb_build_object('items','[]'::jsonb,'adBonusQuantity',0,'canWatchAd',false,'idempotent',false);
  END IF;
  INSERT INTO public.tier_d_level_item_rewards(user_id,level,reward_slot,item_key,granted_quantity,is_ad_bonus,claimed_at)
    VALUES(p_user_id,p_level,1,chosen,CASE WHEN position=0 THEN 1 ELSE p_quantity END,false,NULL)
    ON CONFLICT(user_id,level,reward_slot) DO NOTHING;
  SELECT coalesce(jsonb_agg(jsonb_build_object('itemKey',item_key,'quantity',granted_quantity)),'[]'::jsonb) INTO rewards
    FROM public.tier_d_level_item_rewards WHERE user_id=p_user_id AND level=p_level;
  RETURN jsonb_build_object('items',rewards,'adBonusQuantity',0,'canWatchAd',NOT p_is_vip,'idempotent',false);
END; $$;

REVOKE ALL ON FUNCTION public.grant_tier_d_level_random_item(uuid,integer,integer,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_tier_d_level_random_item(uuid,integer,integer,boolean) TO service_role;
COMMIT;
NOTIFY pgrst, 'reload schema';
