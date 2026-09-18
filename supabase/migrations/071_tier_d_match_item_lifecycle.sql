-- Additive Phase 2 migration. No balances/reward history are removed.
BEGIN;
ALTER TABLE public.tier_d_item_inventory ADD COLUMN IF NOT EXISTS freeze_durations integer[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.sync_tier_d_freeze_durations()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE durations integer[]; old_qty integer := 0;
BEGIN
  IF NEW.item_key <> 'freeze' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    durations := OLD.freeze_durations;
    old_qty := OLD.quantity;
    IF NEW.quantity < old_qty THEN durations := durations[(old_qty-NEW.quantity+1):cardinality(durations)]; END IF;
  ELSE durations := '{}'; END IF;
  durations := coalesce(durations, '{}');
  WHILE cardinality(durations) < NEW.quantity LOOP
    durations := array_append(durations, 15 + floor(random()*31)::integer);
  END LOOP;
  NEW.freeze_durations := durations[1:NEW.quantity];
  NEW.freeze_durations := coalesce(NEW.freeze_durations, '{}');
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS tier_d_freeze_durations ON public.tier_d_item_inventory;
CREATE TRIGGER tier_d_freeze_durations BEFORE INSERT OR UPDATE ON public.tier_d_item_inventory
  FOR EACH ROW EXECUTE FUNCTION public.sync_tier_d_freeze_durations();
-- Existing stock gets one stable random duration per unit, without changing quantity.
UPDATE public.tier_d_item_inventory SET quantity=quantity WHERE item_key='freeze';

CREATE TABLE IF NOT EXISTS public.tier_d_item_action_receipts (
  user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  game_id text NOT NULL, match_number integer NOT NULL, request_id text NOT NULL,
  item_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,game_id,match_number,request_id)
);
ALTER TABLE public.tier_d_item_action_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tier_d_item_action_receipts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tier_d_item_action_receipts TO service_role;

-- Inventory debit, replay receipt and post-action card/runtime snapshot commit together.
CREATE OR REPLACE FUNCTION public.commit_tier_d_item_action(
  p_user_id uuid, p_room_id text, p_item_key text, p_request_id text,
  p_persistent boolean, p_expected_revision integer, p_snapshot jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE previous jsonb; action_game_id text := p_snapshot->>'gameId'; match_no integer := (p_snapshot->>'matchNumber')::integer;
  receipt_item text; qty integer; duration integer;
BEGIN
  SELECT snapshot INTO previous FROM public.tier_d_active_match_snapshots WHERE user_id=p_user_id AND room_id=p_room_id FOR UPDATE;
  IF previous IS NULL OR action_game_id IS NULL OR previous->>'gameId' IS DISTINCT FROM action_game_id
    OR (previous->>'matchNumber')::integer IS DISTINCT FROM match_no THEN RETURN false; END IF;
  SELECT item_key INTO receipt_item FROM public.tier_d_item_action_receipts
    WHERE user_id=p_user_id AND tier_d_item_action_receipts.game_id=action_game_id AND match_number=match_no AND request_id=p_request_id;
  IF FOUND THEN RETURN receipt_item=p_item_key; END IF;
  IF coalesce((previous->>'itemRevision')::integer,0) <> p_expected_revision
    OR (p_snapshot->>'itemRevision')::integer <> p_expected_revision+1 THEN RETURN false; END IF;
  IF p_persistent THEN
    SELECT quantity, freeze_durations[1] INTO qty,duration FROM public.tier_d_item_inventory
      WHERE user_id=p_user_id AND item_key=p_item_key FOR UPDATE;
    IF qty IS NULL OR qty <= 0 THEN RETURN false; END IF;
    IF p_item_key='freeze' AND duration IS DISTINCT FROM (p_snapshot->>'lastFreezeDuration')::integer THEN RETURN false; END IF;
    IF NOT public.consume_tier_d_runtime_item(p_user_id,p_item_key,action_game_id||':'||match_no||':'||p_request_id) THEN RETURN false; END IF;
  ELSE
    IF coalesce((previous->'matchInventory'->>p_item_key)::integer,0) <= 0 THEN RETURN false; END IF;
    IF (p_snapshot->'matchInventory'->>p_item_key)::integer <> (previous->'matchInventory'->>p_item_key)::integer-1 THEN RETURN false; END IF;
  END IF;
  INSERT INTO public.tier_d_item_action_receipts(user_id,game_id,match_number,request_id,item_key)
    VALUES(p_user_id,action_game_id,match_no,p_request_id,p_item_key);
  UPDATE public.tier_d_active_match_snapshots SET snapshot=p_snapshot,updated_at=now() WHERE user_id=p_user_id;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.commit_tier_d_item_action(uuid,text,text,text,boolean,integer,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_tier_d_item_action(uuid,text,text,text,boolean,integer,jsonb) TO service_role;
COMMIT;
NOTIFY pgrst, 'reload schema';
