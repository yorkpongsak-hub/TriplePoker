-- Some existing environments applied the multi-item reward migration without
-- the earlier quantity ledger migration.  Restore the two prerequisite fields
-- so the 062 reward RPC can run safely on either history.
ALTER TABLE public.tier_d_level_item_rewards
  ADD COLUMN IF NOT EXISTS granted_quantity integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS ad_bonus_claimed_at timestamptz;

ALTER TABLE public.tier_d_level_item_rewards
  DROP CONSTRAINT IF EXISTS tier_d_level_item_rewards_granted_quantity_check;
ALTER TABLE public.tier_d_level_item_rewards
  ADD CONSTRAINT tier_d_level_item_rewards_granted_quantity_check
  CHECK (granted_quantity BETWEEN 1 AND 2);

NOTIFY pgrst, 'reload schema';
