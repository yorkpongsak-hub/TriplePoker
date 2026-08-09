-- TriplePoker: Rise - Gate 10 Sovereign foundation
-- Canon: TriplePoker_Arena_TierSPlus_Canon_Addendum_v1_0.md
-- Additive schema only. Run manually in Supabase SQL Editor; do not execute automatically.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS crown_package_crest_remainder SMALLINT NOT NULL DEFAULT 0
    CHECK (crown_package_crest_remainder >= 0 AND crown_package_crest_remainder < 12),
  ADD COLUMN IF NOT EXISTS purchase_debt_crest BIGINT NOT NULL DEFAULT 0
    CHECK (purchase_debt_crest >= 0),
  ADD COLUMN IF NOT EXISTS ascendant_rookie_consumed_at TIMESTAMPTZ;

COMMENT ON COLUMN users.crown_package_balance IS
  'Purchased Crown. Fully spendable in Tier S/S+ economy, but never withdrawable, transferable, cash-redeemable, or convertible to an external asset.';
COMMENT ON COLUMN users.crown_package_crest_remainder IS
  'Purchased Crown fractional Arena balance in Crest (0..11).';
COMMENT ON COLUMN users.purchase_debt_crest IS
  'Non-cash purchase refund debt in Crest. Positive debt blocks paid Arena economy until resolved.';
COMMENT ON COLUMN users.ascendant_rookie_consumed_at IS
  'Set only when this account actually starts its one-time Last Boss match through Ascendant Rookie.';

CREATE TABLE IF NOT EXISTS sovereign_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month DATE NOT NULL UNIQUE CHECK (EXTRACT(DAY FROM year_month) = 1),
  timezone TEXT NOT NULL DEFAULT 'Asia/Bangkok' CHECK (timezone = 'Asia/Bangkok'),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','ACTIVE','COMPLETED','CANCELLED')),
  scoring_start_at TIMESTAMPTZ NOT NULL,
  scoring_end_at TIMESTAMPTZ NOT NULL,
  ranking_snapshot_at TIMESTAMPTZ,
  announcement_at TIMESTAMPTZ NOT NULL,
  confirmation_deadline_at TIMESTAMPTZ NOT NULL,
  config_snapshot_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  CHECK (scoring_start_at < scoring_end_at),
  CHECK (scoring_end_at <= announcement_at),
  CHECK (announcement_at < confirmation_deadline_at)
);

CREATE TABLE IF NOT EXISTS sovereign_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES sovereign_cycles(id) ON DELETE RESTRICT,
  event_day TEXT NOT NULL CHECK (event_day IN ('FRIDAY','SATURDAY','SUNDAY')),
  state TEXT NOT NULL DEFAULT 'DRAFT' CHECK (state IN (
    'DRAFT','PUBLISHED','CONFIRMATION_OPEN','CHECK_IN_PENDING','CHECK_IN_OPEN',
    'FILLING_SEATS','READY','IN_PROGRESS','COMPLETED','CANCELLED'
  )),
  scheduled_standby_open_at TIMESTAMPTZ NOT NULL,
  scheduled_check_in_open_at TIMESTAMPTZ NOT NULL,
  scheduled_check_in_close_at TIMESTAMPTZ NOT NULL,
  scheduled_start_at TIMESTAMPTZ NOT NULL,
  game_match_id TEXT,
  required_reservation_crest INTEGER NOT NULL DEFAULT 360 CHECK (required_reservation_crest = 360),
  entry_fee_crest INTEGER NOT NULL DEFAULT 36 CHECK (entry_fee_crest = 36),
  spectator_delay_ms INTEGER NOT NULL DEFAULT 30000 CHECK (spectator_delay_ms >= 30000),
  spectator_capacity INTEGER NOT NULL DEFAULT 100 CHECK (spectator_capacity = 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE (cycle_id, event_day),
  UNIQUE (id, cycle_id),
  UNIQUE (game_match_id),
  CHECK (scheduled_standby_open_at <= scheduled_check_in_open_at),
  CHECK (scheduled_check_in_open_at < scheduled_check_in_close_at),
  CHECK (scheduled_check_in_close_at <= scheduled_start_at)
);

CREATE TABLE IF NOT EXISTS sovereign_pool_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES sovereign_cycles(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  pool TEXT NOT NULL CHECK (pool IN ('MAIN','ASCENDANT')),
  eligibility_started_at TIMESTAMPTZ NOT NULL,
  eligibility_expires_at TIMESTAMPTZ,
  source_snapshot_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cycle_id, user_id)
);

CREATE TABLE IF NOT EXISTS sovereign_mss_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES sovereign_cycles(id) ON DELETE RESTRICT,
  match_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  pool TEXT NOT NULL CHECK (pool IN ('MAIN','ASCENDANT')),
  human_rank SMALLINT NOT NULL CHECK (human_rank BETWEEN 1 AND 3),
  score SMALLINT NOT NULL CHECK (score IN (0,3,6,10)),
  completed_by_bot BOOLEAN NOT NULL DEFAULT FALSE,
  is_eligible BOOLEAN NOT NULL DEFAULT TRUE,
  completed_at TIMESTAMPTZ NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cycle_id, match_id, user_id),
  CHECK (NOT completed_by_bot OR score = 0)
);

CREATE INDEX IF NOT EXISTS sovereign_mss_entries_ranking_idx
  ON sovereign_mss_entries(cycle_id, pool, user_id, score DESC, completed_at);

CREATE TABLE IF NOT EXISTS sovereign_ranking_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES sovereign_cycles(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  pool TEXT NOT NULL CHECK (pool IN ('MAIN','ASCENDANT')),
  rank INTEGER NOT NULL CHECK (rank > 0),
  eligible_match_count INTEGER NOT NULL CHECK (eligible_match_count >= 0),
  best_ten_score INTEGER NOT NULL CHECK (best_ten_score >= 0),
  all_eligible_match_score INTEGER NOT NULL CHECK (all_eligible_match_score >= 0),
  first_place_finishes INTEGER NOT NULL CHECK (first_place_finishes >= 0),
  best_ten_achieved_at TIMESTAMPTZ NOT NULL,
  bot_takeover_count INTEGER NOT NULL CHECK (bot_takeover_count >= 0),
  tie_break_json JSONB NOT NULL,
  snapshot_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cycle_id, pool, user_id),
  UNIQUE (cycle_id, pool, rank)
);

CREATE TABLE IF NOT EXISTS sovereign_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES sovereign_cycles(id) ON DELETE RESTRICT,
  match_id UUID NOT NULL,
  seat_no SMALLINT NOT NULL CHECK (seat_no BETWEEN 1 AND 3),
  planned_path TEXT NOT NULL CHECK (planned_path IN ('VETERAN','RISING_STAR','ASCENDANT_ROOKIE')),
  selection_source TEXT NOT NULL DEFAULT 'PRIMARY' CHECK (selection_source IN (
    'PRIMARY','FALLBACK_RANKING','PRE_EVENT_RESERVE','LIVE_STANDBY','BOT'
  )),
  selected_user_id UUID REFERENCES users(user_id) ON DELETE RESTRICT,
  active_user_id UUID REFERENCES users(user_id) ON DELETE RESTRICT,
  ranking_snapshot_id UUID REFERENCES sovereign_ranking_snapshots(id) ON DELETE RESTRICT,
  confirmation_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (confirmation_status IN (
    'PENDING','CONFIRMED','DECLINED','CONFIRMATION_EXPIRED'
  )),
  check_in_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (check_in_status IN ('PENDING','CHECKED_IN','NO_SHOW')),
  confirmed_at TIMESTAMPTZ,
  checked_in_at TIMESTAMPTZ,
  no_show_at TIMESTAMPTZ,
  rookie_consumed_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (match_id, seat_no),
  FOREIGN KEY (match_id, cycle_id) REFERENCES sovereign_matches(id, cycle_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS sovereign_seats_selected_user_cycle_idx
  ON sovereign_seats(cycle_id, selected_user_id)
  WHERE selected_user_id IS NOT NULL AND selection_source IN ('PRIMARY','FALLBACK_RANKING','PRE_EVENT_RESERVE');

CREATE UNIQUE INDEX IF NOT EXISTS sovereign_seats_active_user_match_idx
  ON sovereign_seats(match_id, active_user_id) WHERE active_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS sovereign_reserve_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seat_id UUID NOT NULL REFERENCES sovereign_seats(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  priority INTEGER NOT NULL CHECK (priority > 0),
  status TEXT NOT NULL DEFAULT 'OFFERED' CHECK (status IN ('OFFERED','ACCEPTED','DECLINED','EXPIRED','CANCELLED')),
  offered_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (seat_id, user_id),
  UNIQUE (seat_id, priority),
  CHECK (offered_at < expires_at),
  CHECK (expires_at <= offered_at + INTERVAL '6 hours')
);

CREATE TABLE IF NOT EXISTS sovereign_wallet_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key UUID NOT NULL UNIQUE,
  match_id UUID NOT NULL REFERENCES sovereign_matches(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  reason TEXT NOT NULL CHECK (reason IN ('CHECK_IN','STANDBY','PROMOTION','MATCH_ENTRY')),
  total_crest INTEGER NOT NULL CHECK (total_crest > 0),
  earned_crest INTEGER NOT NULL CHECK (earned_crest >= 0),
  purchased_crest INTEGER NOT NULL CHECK (purchased_crest >= 0),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SETTLED','RELEASED','EXPIRED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  metadata_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  CHECK (total_crest = earned_crest + purchased_crest)
);

CREATE UNIQUE INDEX IF NOT EXISTS sovereign_wallet_reservations_active_user_match_idx
  ON sovereign_wallet_reservations(match_id, user_id) WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS sovereign_standby_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES sovereign_matches(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  queue_sequence BIGINT NOT NULL,
  joined_at_server TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN (
    'QUEUED','GRACE','CLAIMED','PROMOTED','SKIPPED','LEFT','EXPIRED'
  )),
  reservation_id UUID NOT NULL REFERENCES sovereign_wallet_reservations(id) ON DELETE RESTRICT,
  last_presence_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  grace_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (match_id, queue_sequence)
);

CREATE UNIQUE INDEX IF NOT EXISTS sovereign_standby_active_user_match_idx
  ON sovereign_standby_entries(match_id, user_id)
  WHERE status IN ('QUEUED','GRACE','CLAIMED');

CREATE TABLE IF NOT EXISTS last_boss_reserved_names (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL,
  normalized_name VARCHAR(50) GENERATED ALWAYS AS (
    LOWER(TRIM(REGEXP_REPLACE(name, '\s+', ' ', 'g')))
  ) STORED,
  source_reign_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (normalized_name)
);

CREATE TABLE IF NOT EXISTS last_boss_reigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reign_number INTEGER NOT NULL UNIQUE CHECK (reign_number > 0),
  throne_name VARCHAR(50) NOT NULL,
  normalized_throne_name VARCHAR(50) GENERATED ALWAYS AS (
    LOWER(TRIM(REGEXP_REPLACE(throne_name, '\s+', ' ', 'g')))
  ) STORED,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','CLOSED','ANNULLED')),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  source_match_id UUID REFERENCES sovereign_matches(id) ON DELETE RESTRICT,
  defeated_match_id UUID REFERENCES sovereign_matches(id) ON DELETE RESTRICT,
  conqueror_user_id UUID REFERENCES users(user_id) ON DELETE RESTRICT,
  conqueror_name_at_victory VARCHAR(50),
  conqueror_new_name VARCHAR(50),
  conqueror_avatar_snapshot_url TEXT,
  avatar_opted_out BOOLEAN NOT NULL DEFAULT FALSE,
  aura_key TEXT NOT NULL,
  annulled_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (normalized_throne_name),
  CHECK ((status = 'ACTIVE' AND ended_at IS NULL) OR (status <> 'ACTIVE' AND ended_at IS NOT NULL)),
  CHECK (status <> 'ANNULLED' OR annulled_reason IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS last_boss_single_active_reign_idx
  ON last_boss_reigns((status)) WHERE status = 'ACTIVE';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'last_boss_reserved_names_source_reign_fk'
  ) THEN
    ALTER TABLE last_boss_reserved_names
      ADD CONSTRAINT last_boss_reserved_names_source_reign_fk
      FOREIGN KEY (source_reign_id) REFERENCES last_boss_reigns(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS last_boss_mandatory_renames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key UUID NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  defeated_reign_id UUID NOT NULL REFERENCES last_boss_reigns(id) ON DELETE RESTRICT,
  next_reign_id UUID NOT NULL REFERENCES last_boss_reigns(id) ON DELETE RESTRICT,
  former_name VARCHAR(50) NOT NULL,
  status TEXT NOT NULL DEFAULT 'REQUIRED' CHECK (status IN ('REQUIRED','COMPLETED','ADMIN_RESOLVED')),
  required_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  new_name VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS last_boss_one_required_rename_per_user_idx
  ON last_boss_mandatory_renames(user_id) WHERE status = 'REQUIRED';

CREATE TABLE IF NOT EXISTS sovereign_public_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES sovereign_matches(id) ON DELETE RESTRICT,
  sequence BIGINT NOT NULL CHECK (sequence > 0),
  event_type TEXT NOT NULL,
  public_payload_json JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  visible_at TIMESTAMPTZ NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  retain_until TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (match_id, sequence),
  CHECK (visible_at >= occurred_at + INTERVAL '30 seconds'),
  CHECK (retain_until >= occurred_at + INTERVAL '90 days')
);

CREATE INDEX IF NOT EXISTS sovereign_public_events_visible_idx
  ON sovereign_public_events(match_id, visible_at, sequence);

CREATE TABLE IF NOT EXISTS sovereign_audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cycle_id UUID REFERENCES sovereign_cycles(id) ON DELETE RESTRICT,
  match_id UUID REFERENCES sovereign_matches(id) ON DELETE RESTRICT,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('SYSTEM','USER','ADMIN')),
  actor_id UUID,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  before_json JSONB,
  after_json JSONB,
  reason TEXT,
  idempotency_key UUID UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO last_boss_reserved_names(name)
VALUES ('CAELUM')
ON CONFLICT (normalized_name) DO NOTHING;

INSERT INTO reserved_names(name, reason)
VALUES ('CAELUM', 'Tier S+ first Last Boss throne name')
ON CONFLICT (normalized_name) DO NOTHING;

ALTER TABLE sovereign_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sovereign_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE sovereign_pool_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE sovereign_mss_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE sovereign_ranking_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE sovereign_seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE sovereign_reserve_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sovereign_wallet_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sovereign_standby_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE last_boss_reserved_names ENABLE ROW LEVEL SECURITY;
ALTER TABLE last_boss_reigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE last_boss_mandatory_renames ENABLE ROW LEVEL SECURITY;
ALTER TABLE sovereign_public_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sovereign_audit_logs ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
