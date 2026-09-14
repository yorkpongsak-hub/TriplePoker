-- Drop the old restrictions before changing legacy row values. PostgreSQL
-- validates UPDATEs immediately, so this order is required for a safe rename.
ALTER TABLE public.tier_d_item_inventory DROP CONSTRAINT IF EXISTS tier_d_item_inventory_item_key_check;
ALTER TABLE public.tier_d_runtime_item_uses DROP CONSTRAINT IF EXISTS tier_d_runtime_item_uses_item_key_check;
ALTER TABLE public.tier_d_level_item_rewards DROP CONSTRAINT IF EXISTS tier_d_level_item_rewards_item_key_check;

-- Preserve existing consumables while renaming them to the League Canon keys.
UPDATE public.tier_d_item_inventory SET item_key = CASE item_key
  WHEN 'full_redraw' THEN 'shuffle' WHEN 'single_card_swap' THEN 'swap'
  WHEN 'bomb_defuser' THEN 'freeze' ELSE item_key END;
UPDATE public.tier_d_runtime_item_uses SET item_key = CASE item_key
  WHEN 'full_redraw' THEN 'shuffle' WHEN 'single_card_swap' THEN 'swap'
  WHEN 'bomb_defuser' THEN 'freeze' ELSE item_key END;
UPDATE public.tier_d_level_item_rewards SET item_key = CASE item_key
  WHEN 'full_redraw' THEN 'shuffle' WHEN 'single_card_swap' THEN 'swap'
  WHEN 'bomb_defuser' THEN 'freeze' ELSE item_key END;

ALTER TABLE public.tier_d_item_inventory ADD CONSTRAINT tier_d_item_inventory_item_key_check CHECK (item_key IN ('shuffle','swap','double_pile','freeze','undo'));
ALTER TABLE public.tier_d_runtime_item_uses ADD CONSTRAINT tier_d_runtime_item_uses_item_key_check CHECK (item_key IN ('shuffle','swap','double_pile','freeze','undo'));
ALTER TABLE public.tier_d_level_item_rewards ADD CONSTRAINT tier_d_level_item_rewards_item_key_check CHECK (item_key IN ('shuffle','swap','double_pile','freeze','undo'));

CREATE OR REPLACE FUNCTION public.grant_tier_d_level_random_item(p_user_id uuid, p_level integer, p_quantity integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE chosen text; reward public.tier_d_level_item_rewards%ROWTYPE; inserted_count integer; qty integer := CASE WHEN p_quantity=2 THEN 2 ELSE 1 END;
BEGIN
  chosen := (ARRAY['shuffle','swap','double_pile','freeze','undo'])[1 + mod(abs(hashtext(p_user_id::text || ':' || p_level::text)), 5)];
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

REVOKE ALL ON FUNCTION public.grant_tier_d_level_random_item(uuid,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_tier_d_level_random_item(uuid,integer,integer) TO service_role;
NOTIFY pgrst, 'reload schema';
