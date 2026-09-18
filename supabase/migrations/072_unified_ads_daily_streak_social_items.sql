-- Unified advertising policy, eight-day Daily Streak and Pro Plus social items.
-- Additive migration: legacy milestone fields and historical item rewards remain intact.
BEGIN;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS streak_protections_used integer NOT NULL DEFAULT 0;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_streak_count_7_day_cycle;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_streak_count_8_day_cycle;
ALTER TABLE public.users ADD CONSTRAINT users_streak_count_8_day_cycle CHECK (streak_count BETWEEN 0 AND 8);

CREATE TABLE IF NOT EXISTS public.user_ad_policy_state (
  user_id uuid PRIMARY KEY REFERENCES public.users(user_id) ON DELETE CASCADE,
  last_forced_interstitial_at timestamptz,
  rewarded_grace_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_ad_policy_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_ad_policy_state FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.user_ad_policy_state TO service_role;

CREATE TABLE IF NOT EXISTS public.social_item_inventory (
  user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  item_key text NOT NULL CHECK (item_key IN ('heart','rose')),
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,item_key)
);
ALTER TABLE public.social_item_inventory ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.social_item_inventory FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.social_item_inventory TO service_role;

CREATE TABLE IF NOT EXISTS public.daily_streak_reward_claims (
  user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  claim_day date NOT NULL,
  cycle_day integer NOT NULL CHECK (cycle_day BETWEEN 1 AND 8),
  membership_at_claim text NOT NULL CHECK (membership_at_claim IN ('none','vip','vip_pro')),
  item_rewards jsonb NOT NULL DEFAULT '[]'::jsonb,
  token_amount integer NOT NULL CHECK (token_amount >= 0),
  social_item text CHECK (social_item IN ('heart','rose')),
  ad_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,claim_day)
);
ALTER TABLE public.daily_streak_reward_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_streak_reward_claims FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.daily_streak_reward_claims TO service_role;

-- This transaction owns the claim marker, normal weighted item draws, Token,
-- and the optional Pro Plus social inventory increment. A duplicate callback
-- returns the original receipt without changing any balance or inventory.
CREATE OR REPLACE FUNCTION public.claim_unified_daily_streak_reward(
  p_user_id uuid, p_daily_base_token integer, p_ad_verified boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u record; today date := (now() AT TIME ZONE 'Asia/Bangkok')::date;
  multiplier integer; draw_count integer; slot integer; roll integer; chosen text;
  social text := null; rewards jsonb := '[]'::jsonb; token_total integer; existing jsonb;
BEGIN
  IF p_daily_base_token < 0 THEN RAISE EXCEPTION 'INVALID_DAILY_BASE_TOKEN'; END IF;
  SELECT user_id,vip_status,streak_count,last_played_date INTO u FROM public.users WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'USER_NOT_FOUND'; END IF;
  SELECT jsonb_build_object('cycleDay',cycle_day,'items',item_rewards,'tokenAmount',token_amount,
    'socialItem',social_item,'requiresRewardedAd',membership_at_claim='none','idempotent',true)
    INTO existing FROM public.daily_streak_reward_claims WHERE user_id=p_user_id AND claim_day=today;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  IF u.last_played_date IS NULL OR u.last_played_date::date <> today OR u.streak_count NOT BETWEEN 1 AND 8 THEN
    RAISE EXCEPTION 'DAILY_STREAK_NOT_ELIGIBLE';
  END IF;
  IF coalesce(u.vip_status,'none')='none' AND NOT p_ad_verified THEN RAISE EXCEPTION 'REWARDED_AD_REQUIRED'; END IF;
  multiplier := (ARRAY[1,1,2,1,2,1,2,3])[u.streak_count];
  draw_count := multiplier; token_total := p_daily_base_token * multiplier;
  FOR slot IN 1..draw_count LOOP
    roll := floor(random()*100)::integer;
    chosen := CASE WHEN roll < 5 THEN 'undo' WHEN roll < 13 THEN 'shuffle' WHEN roll < 25 THEN 'double_pile'
      WHEN roll < 43 THEN 'swap' WHEN roll < 70 THEN 'auto_sort' ELSE 'freeze' END;
    INSERT INTO public.tier_d_item_inventory(user_id,item_key,quantity) VALUES(p_user_id,chosen,1)
      ON CONFLICT(user_id,item_key) DO UPDATE SET quantity=tier_d_item_inventory.quantity+1;
    rewards := rewards || jsonb_build_array(jsonb_build_object('itemKey',chosen,'quantity',1));
  END LOOP;
  IF u.vip_status='vip_pro' THEN
    social := CASE WHEN random() < .5 THEN 'heart' ELSE 'rose' END;
    INSERT INTO public.social_item_inventory(user_id,item_key,quantity) VALUES(p_user_id,social,1)
      ON CONFLICT(user_id,item_key) DO UPDATE SET quantity=social_item_inventory.quantity+1,updated_at=now();
  END IF;
  UPDATE public.users SET token_balance=token_balance+token_total,
    streak_count=CASE WHEN streak_count=8 THEN 0 ELSE streak_count END,
    streak_protections_used=CASE WHEN streak_count=8 THEN 0 ELSE streak_protections_used END
    WHERE user_id=p_user_id;
  INSERT INTO public.daily_streak_reward_claims(user_id,claim_day,cycle_day,membership_at_claim,item_rewards,token_amount,social_item,ad_verified)
    VALUES(p_user_id,today,u.streak_count,coalesce(u.vip_status,'none'),rewards,token_total,social,p_ad_verified);
  RETURN jsonb_build_object('cycleDay',u.streak_count,'items',rewards,'tokenAmount',token_total,
    'socialItem',social,'requiresRewardedAd',coalesce(u.vip_status,'none')='none','idempotent',false);
END; $$;
REVOKE ALL ON FUNCTION public.claim_unified_daily_streak_reward(uuid,integer,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_unified_daily_streak_reward(uuid,integer,boolean) TO service_role;
COMMIT;
NOTIFY pgrst, 'reload schema';
