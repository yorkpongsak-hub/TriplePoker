-- Ad/reward refactor.  Additive: historical level rewards remain intact.
BEGIN;

ALTER TABLE public.user_ad_policy_state
  ADD COLUMN IF NOT EXISTS interstitials_shown_session integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_ad_kind text;

CREATE TABLE IF NOT EXISTS public.tier_d_second_deal_inventory (
  user_id uuid PRIMARY KEY REFERENCES public.users(user_id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tier_d_second_deal_inventory ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tier_d_second_deal_inventory FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tier_d_second_deal_inventory TO service_role;

-- Replaces the every-level reservation introduced by migration 070.  xx1–xx9
-- can reserve at most three rewards per block; xx0 always reserves one rare item.
CREATE OR REPLACE FUNCTION public.grant_tier_d_level_random_item(p_user_id uuid, p_level integer, p_quantity integer DEFAULT 1, p_is_vip boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE block_start integer := p_level - (p_level % 10); position integer := p_level % 10;
  already_reserved integer; chosen text; rewards jsonb;
BEGIN
  IF p_level < 1 THEN RAISE EXCEPTION 'INVALID_LEVEL'; END IF;
  IF position = 0 THEN
    chosen := 'undo'; -- rare normal item; Second Deal is intentionally absent from this pool
  ELSIF (SELECT count(*) FROM public.tier_d_level_item_rewards WHERE user_id=p_user_id AND level BETWEEN block_start+1 AND block_start+9) >= 3 THEN
    RETURN jsonb_build_object('items','[]'::jsonb,'adBonusQuantity',0,'canWatchAd',false,'idempotent',false);
  ELSIF random() < 0.34 THEN
    SELECT item INTO chosen FROM unnest(ARRAY['undo','shuffle','double_pile','swap','auto_sort','freeze']) AS item ORDER BY random() LIMIT 1;
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

-- VIP members get one stored recovery item at the end of their eight-day cycle.
CREATE OR REPLACE FUNCTION public.grant_second_deal_for_daily_cycle(p_user_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.tier_d_second_deal_inventory(user_id,quantity) VALUES(p_user_id,1)
    ON CONFLICT(user_id) DO UPDATE SET quantity=tier_d_second_deal_inventory.quantity+1,updated_at=now();
END; $$;
REVOKE ALL ON FUNCTION public.grant_second_deal_for_daily_cycle(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_second_deal_for_daily_cycle(uuid) TO service_role;
COMMIT;
NOTIFY pgrst, 'reload schema';
