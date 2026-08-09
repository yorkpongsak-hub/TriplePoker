-- TriplePoker — VIP table skin preference
-- Entitlements are derived server-side from users.vip_status + tier_unlocked_max.

CREATE TABLE IF NOT EXISTS user_table_skins (
  user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  active_skin INTEGER NOT NULL DEFAULT 1 CHECK (active_skin BETWEEN 1 AND 4),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_table_skins ENABLE ROW LEVEL SECURITY;

-- No client write policy: reads/writes go through authenticated server endpoints,
-- which validate current VIP status and progression before selecting a skin.

NOTIFY pgrst, 'reload schema';
