-- A completed rewarded ad can replenish the exact Tier D item that was selected.
-- event_id makes provider callback retries idempotent.
CREATE TABLE IF NOT EXISTS public.tier_d_runtime_item_ad_claims (
  event_id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  item_key text NOT NULL CHECK (item_key IN ('shuffle','swap','double_pile','freeze','undo')),
  claimed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tier_d_runtime_item_ad_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tier_d_runtime_item_ad_claims FROM anon, authenticated;
GRANT ALL ON public.tier_d_runtime_item_ad_claims TO service_role;

CREATE OR REPLACE FUNCTION public.claim_tier_d_runtime_item_ad(
  p_user_id uuid,
  p_item_key text,
  p_event_id text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE inserted_count integer;
BEGIN
  IF p_item_key NOT IN ('shuffle','swap','double_pile','freeze','undo') THEN RAISE EXCEPTION 'INVALID_ITEM_KEY'; END IF;
  IF length(trim(p_event_id)) < 12 THEN RAISE EXCEPTION 'INVALID_EVENT_ID'; END IF;
  INSERT INTO public.tier_d_runtime_item_ad_claims(event_id,user_id,item_key) VALUES(p_event_id,p_user_id,p_item_key) ON CONFLICT(event_id) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count = 1 THEN
    INSERT INTO public.tier_d_item_inventory(user_id,item_key,quantity) VALUES(p_user_id,p_item_key,1)
      ON CONFLICT(user_id,item_key) DO UPDATE SET quantity=tier_d_item_inventory.quantity+1;
  END IF;
  RETURN jsonb_build_object('itemKey',p_item_key,'quantity',1,'idempotent',inserted_count=0);
END; $$;

REVOKE ALL ON FUNCTION public.claim_tier_d_runtime_item_ad(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_tier_d_runtime_item_ad(uuid,text,text) TO service_role;
NOTIFY pgrst, 'reload schema';
