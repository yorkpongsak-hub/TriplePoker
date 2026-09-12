-- Live Tier D consumables and a private personal-best time.  These records are
-- server-only: a client may request an action but cannot decrement inventory or
-- claim an additional level reward by retrying a socket event.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS tier_d_best_match_time_ms integer;

CREATE TABLE IF NOT EXISTS public.tier_d_runtime_item_uses (
  user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  item_key text NOT NULL CHECK (item_key IN ('single_card_swap','full_redraw','bomb_defuser')),
  scope_key text NOT NULL,
  used_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_key, scope_key)
);

CREATE TABLE IF NOT EXISTS public.tier_d_level_item_rewards (
  user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  level integer NOT NULL CHECK (level > 0),
  item_key text NOT NULL CHECK (item_key IN ('single_card_swap','full_redraw','bomb_defuser')),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, level)
);

ALTER TABLE public.tier_d_runtime_item_uses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tier_d_level_item_rewards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tier_d_runtime_item_uses, public.tier_d_level_item_rewards FROM anon, authenticated;
GRANT ALL ON public.tier_d_runtime_item_uses, public.tier_d_level_item_rewards TO service_role;

CREATE OR REPLACE FUNCTION public.consume_tier_d_runtime_item(p_user_id uuid, p_item_key text, p_scope_key text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.tier_d_runtime_item_uses(user_id,item_key,scope_key)
  VALUES(p_user_id,p_item_key,p_scope_key) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.tier_d_item_inventory SET quantity=quantity-1
    WHERE user_id=p_user_id AND item_key=p_item_key AND quantity>0;
  IF NOT FOUND THEN
    DELETE FROM public.tier_d_runtime_item_uses WHERE user_id=p_user_id AND item_key=p_item_key AND scope_key=p_scope_key;
    RETURN false;
  END IF;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.grant_tier_d_level_random_item(p_user_id uuid, p_level integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE chosen text; reward public.tier_d_level_item_rewards%ROWTYPE; inserted_count integer;
BEGIN
  -- Deterministic per player/level means retries and concurrent settlement can
  -- never select a second reward, while the distribution remains varied.
  chosen := (ARRAY['single_card_swap','bomb_defuser','full_redraw'])[1 + mod(abs(hashtext(p_user_id::text || ':' || p_level::text)), 3)];
  INSERT INTO public.tier_d_level_item_rewards(user_id,level,item_key) VALUES(p_user_id,p_level,chosen)
    ON CONFLICT(user_id,level) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  SELECT * INTO reward FROM public.tier_d_level_item_rewards WHERE user_id=p_user_id AND level=p_level;
  IF inserted_count = 1 THEN
    INSERT INTO public.tier_d_item_inventory(user_id,item_key,quantity) VALUES(p_user_id,reward.item_key,1)
      ON CONFLICT(user_id,item_key) DO UPDATE SET quantity=tier_d_item_inventory.quantity+1;
  END IF;
  RETURN jsonb_build_object('itemKey',reward.item_key,'quantity',1,'idempotent',inserted_count=0);
END; $$;

CREATE OR REPLACE FUNCTION public.record_tier_d_personal_best(p_user_id uuid, p_elapsed_ms integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result integer;
BEGIN
  IF p_elapsed_ms < 0 THEN RAISE EXCEPTION 'INVALID_TIME'; END IF;
  UPDATE public.users SET tier_d_best_match_time_ms = CASE
    WHEN tier_d_best_match_time_ms IS NULL OR p_elapsed_ms < tier_d_best_match_time_ms THEN p_elapsed_ms
    ELSE tier_d_best_match_time_ms END
  WHERE user_id=p_user_id RETURNING tier_d_best_match_time_ms INTO result;
  RETURN result;
END; $$;

REVOKE ALL ON FUNCTION public.consume_tier_d_runtime_item(uuid,text,text), public.grant_tier_d_level_random_item(uuid,integer), public.record_tier_d_personal_best(uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_tier_d_runtime_item(uuid,text,text), public.grant_tier_d_level_random_item(uuid,integer), public.record_tier_d_personal_best(uuid,integer) TO service_role;
NOTIFY pgrst, 'reload schema';
