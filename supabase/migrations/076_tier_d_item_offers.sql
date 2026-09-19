-- Locked, server-authoritative Free/Lucky item offers.  The offered item is
-- selected once, before the ad is shown; a completion callback can never reroll it.
CREATE TABLE IF NOT EXISTS public.tier_d_item_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_key text NOT NULL CHECK (item_key IN ('shuffle','swap','double_pile','freeze','auto_sort','undo')),
  kind text NOT NULL CHECK (kind IN ('FREE','LUCKY')),
  placement text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  dismissed_at timestamptz,
  claimed_at timestamptz,
  claim_event_id text UNIQUE
);
CREATE UNIQUE INDEX IF NOT EXISTS tier_d_item_offers_one_open_per_user
  ON public.tier_d_item_offers(user_id) WHERE dismissed_at IS NULL AND claimed_at IS NULL;
CREATE INDEX IF NOT EXISTS tier_d_item_offers_user_created ON public.tier_d_item_offers(user_id, created_at DESC);
ALTER TABLE public.tier_d_item_offers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tier_d_item_offers FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tier_d_item_offers TO service_role;

CREATE OR REPLACE FUNCTION public.claim_tier_d_item_offer(
  p_user_id uuid, p_offer_id uuid, p_event_id text
) RETURNS TABLE(item_key text, quantity integer, idempotent boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE offer public.tier_d_item_offers%ROWTYPE;
BEGIN
  SELECT * INTO offer FROM public.tier_d_item_offers WHERE id=p_offer_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR offer.dismissed_at IS NOT NULL OR offer.expires_at < now() THEN RAISE EXCEPTION 'OFFER_NOT_AVAILABLE'; END IF;
  IF offer.claimed_at IS NOT NULL THEN
    IF offer.claim_event_id=p_event_id THEN RETURN QUERY SELECT offer.item_key,1,true; RETURN; END IF;
    RAISE EXCEPTION 'OFFER_ALREADY_CLAIMED';
  END IF;
  UPDATE public.tier_d_item_offers SET claimed_at=now(),claim_event_id=p_event_id WHERE id=offer.id;
  INSERT INTO public.tier_d_item_inventory(user_id,item_key,quantity) VALUES(p_user_id,offer.item_key,1)
  ON CONFLICT(user_id,item_key) DO UPDATE SET quantity=tier_d_item_inventory.quantity+1;
  RETURN QUERY SELECT offer.item_key,1,false;
END $$;
