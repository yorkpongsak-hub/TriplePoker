-- A retry must return the original server-selected Item, rather than trusting a
-- newly drawn client/server argument for an already-recorded rewarded-ad event.
CREATE OR REPLACE FUNCTION public.claim_tier_d_runtime_item_ad(
  p_user_id uuid,
  p_item_key text,
  p_event_id text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE inserted_count integer;
DECLARE resolved_item text;
BEGIN
  IF p_item_key NOT IN ('shuffle','swap','double_pile','freeze','auto_sort','undo') THEN RAISE EXCEPTION 'INVALID_ITEM_KEY'; END IF;
  IF length(trim(p_event_id)) < 12 THEN RAISE EXCEPTION 'INVALID_EVENT_ID'; END IF;

  INSERT INTO public.tier_d_runtime_item_ad_claims(event_id,user_id,item_key)
    VALUES(p_event_id,p_user_id,p_item_key) ON CONFLICT(event_id) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  SELECT item_key INTO resolved_item
    FROM public.tier_d_runtime_item_ad_claims
    WHERE event_id=p_event_id AND user_id=p_user_id;
  IF resolved_item IS NULL THEN RAISE EXCEPTION 'EVENT_ID_BELONGS_TO_ANOTHER_USER'; END IF;

  IF inserted_count = 1 THEN
    INSERT INTO public.tier_d_item_inventory(user_id,item_key,quantity) VALUES(p_user_id,resolved_item,1)
      ON CONFLICT(user_id,item_key) DO UPDATE SET quantity=tier_d_item_inventory.quantity+1;
  END IF;
  RETURN jsonb_build_object('itemKey',resolved_item,'quantity',1,'idempotent',inserted_count=0);
END; $$;

REVOKE ALL ON FUNCTION public.claim_tier_d_runtime_item_ad(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_tier_d_runtime_item_ad(uuid,text,text) TO service_role;
NOTIFY pgrst, 'reload schema';
