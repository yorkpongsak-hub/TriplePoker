-- Telemetry only. No ledger/balance/inventory mutation added.
BEGIN;
ALTER TABLE public.telemetry_events DROP CONSTRAINT telemetry_events_event_name_check;
ALTER TABLE public.telemetry_events ADD CONSTRAINT telemetry_events_event_name_check CHECK(event_name IN (
'app_open','session_start','session_end','telemetry_upload_failure','game_start','game_end','tutorial_start','tutorial_step','tutorial_complete','first_game_complete','launch_step',
'token_balance_change','item_use','item_reward','ad_reward','vip_status'));
ALTER TABLE public.telemetry_events ADD CONSTRAINT telemetry_economy_authority_check CHECK(
 event_name NOT IN ('token_balance_change','item_use','item_reward','ad_reward') OR source='server');

-- Keep the canonical claim algorithm and original response fields unchanged.
-- Report which existing receipt slots actually transitioned inside its own lock.
-- The old idempotent field is always true after a successful claim; do not fix it
-- or infer new ad fulfilment from it. Internal metadata is stripped by the service.
CREATE OR REPLACE FUNCTION public.claim_tier_d_level_reward(p_user_id uuid, p_level integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  reward record;
  changed integer := 0;
  rewards jsonb;
  telemetry_claimed_slots jsonb := '[]'::jsonb;
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
      telemetry_claimed_slots := telemetry_claimed_slots || jsonb_build_array(reward.reward_slot);
    END IF;
  END LOOP;
  SELECT coalesce(jsonb_agg(jsonb_build_object('itemKey',item_key,'quantity',granted_quantity) ORDER BY item_key),'[]'::jsonb)
    INTO rewards FROM (SELECT item_key,sum(granted_quantity)::integer AS granted_quantity FROM public.tier_d_level_item_rewards WHERE user_id=p_user_id AND level=p_level GROUP BY item_key) AS totals;
  RETURN jsonb_build_object('items',rewards,'adBonusQuantity',0,'canWatchAd',false,'idempotent',NOT EXISTS(SELECT 1 FROM public.tier_d_level_item_rewards WHERE user_id=p_user_id AND level=p_level AND claimed_at IS NULL),
    '_telemetry_claimed_slots',telemetry_claimed_slots);
END; $$;
REVOKE ALL ON FUNCTION public.claim_tier_d_level_reward(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_tier_d_level_reward(uuid,integer) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
