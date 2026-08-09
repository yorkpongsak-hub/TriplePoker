-- Allow VIP members to explicitly return to the built-in table artwork.
-- active_skin = 0 means client TABLE_SKINS[0] / table_default.png.

ALTER TABLE user_table_skins
  DROP CONSTRAINT IF EXISTS user_table_skins_active_skin_check;

ALTER TABLE user_table_skins
  ADD CONSTRAINT user_table_skins_active_skin_check
  CHECK (active_skin BETWEEN 0 AND 4);

NOTIFY pgrst, 'reload schema';
