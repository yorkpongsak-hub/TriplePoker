-- TriplePoker Initial Schema
-- Sprint 1 — The Sage Unicorn Studio

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name     VARCHAR(50) NOT NULL,
  avatar_url       TEXT DEFAULT NULL,
  provider         VARCHAR(20) NOT NULL,
  token_balance    BIGINT NOT NULL DEFAULT 1000,
  subscription     VARCHAR(10) NOT NULL DEFAULT 'free',
  level            INTEGER NOT NULL DEFAULT 1,
  xp               INTEGER NOT NULL DEFAULT 0,
  streak_count     INTEGER NOT NULL DEFAULT 0,
  streak_shield    INTEGER NOT NULL DEFAULT 0,
  last_login_at    TIMESTAMPTZ DEFAULT NOW(),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Games table
CREATE TABLE IF NOT EXISTS games (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier             VARCHAR(20) NOT NULL,
  status           VARCHAR(20) NOT NULL DEFAULT 'waiting',
  winner_id        UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  ended_at         TIMESTAMPTZ DEFAULT NULL
);

-- Game rounds table
CREATE TABLE IF NOT EXISTS game_rounds (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id          UUID NOT NULL REFERENCES games(id),
  round_number     INTEGER NOT NULL,
  winner_id        UUID REFERENCES users(id),
  pot_amount       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Token transactions table
CREATE TABLE IF NOT EXISTS token_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id),
  amount           BIGINT NOT NULL,
  ref_type         VARCHAR(30) NOT NULL,
  ref_id           UUID DEFAULT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Bosses table
CREATE TABLE IF NOT EXISTS bosses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id),
  defeated_by      UUID REFERENCES users(id),
  reign_start      TIMESTAMPTZ DEFAULT NOW(),
  reign_end        TIMESTAMPTZ DEFAULT NULL
);

-- Graveyard table
CREATE TABLE IF NOT EXISTS graveyard (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id),
  epitaph          TEXT DEFAULT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Activity log table
CREATE TABLE IF NOT EXISTS activity_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id),
  event_type       VARCHAR(30) NOT NULL,
  payload          JSONB DEFAULT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Shop items table
CREATE TABLE IF NOT EXISTS shop_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_key         VARCHAR(50) UNIQUE NOT NULL,
  name             VARCHAR(100) NOT NULL,
  category         VARCHAR(20) NOT NULL,
  base_price       INTEGER NOT NULL,
  is_permanent     BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- User inventory table
CREATE TABLE IF NOT EXISTS user_inventory (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id),
  item_id          UUID NOT NULL REFERENCES shop_items(id),
  quantity         INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, item_id)
);

-- Shop transactions table
CREATE TABLE IF NOT EXISTS shop_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id),
  item_id          UUID NOT NULL REFERENCES shop_items(id),
  quantity         INTEGER NOT NULL DEFAULT 1,
  price_paid       INTEGER NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Token economy snapshot table
CREATE TABLE IF NOT EXISTS token_economy_snapshot (
  snapshot_date         DATE UNIQUE NOT NULL,
  total_token_in_system BIGINT NOT NULL,
  avg_token_per_player  NUMERIC(12,2) NOT NULL,
  token_earned_today    BIGINT NOT NULL,
  token_burned_today    BIGINT NOT NULL,
  burn_ratio            NUMERIC(6,4) NOT NULL,
  velocity              NUMERIC(6,4) NOT NULL,
  inflation_rate        NUMERIC(6,4) NOT NULL
);
