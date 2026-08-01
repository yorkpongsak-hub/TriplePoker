-- TriplePoker: Rise - Gate 10.3 atomic mixed-source Crown reservation and standby promotion
-- Run manually in Supabase SQL Editor; do not execute automatically.

ALTER TABLE sovereign_wallet_reservations
  ADD COLUMN IF NOT EXISTS settled_spent_crest INTEGER CHECK (settled_spent_crest >= 0),
  ADD COLUMN IF NOT EXISTS refund_earned_crest INTEGER CHECK (refund_earned_crest >= 0),
  ADD COLUMN IF NOT EXISTS refund_purchased_crest INTEGER CHECK (refund_purchased_crest >= 0),
  ADD COLUMN IF NOT EXISTS settlement_idempotency_key UUID UNIQUE;

ALTER TABLE sovereign_seats
  ADD COLUMN IF NOT EXISTS promotion_idempotency_key UUID UNIQUE;

CREATE TABLE IF NOT EXISTS sovereign_wallet_source_ledger (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  reservation_id UUID NOT NULL REFERENCES sovereign_wallet_reservations(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  source TEXT NOT NULL CHECK (source IN ('EARNED','PURCHASED')),
  action TEXT NOT NULL CHECK (action IN ('RESERVE','SETTLE','RELEASE','REFUND')),
  delta_available_crest INTEGER NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sovereign_wallet_source_ledger ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION sovereign_reserve_crown(
  p_user_id UUID,
  p_match_id UUID,
  p_reason TEXT,
  p_required_crest INTEGER,
  p_idempotency_key UUID
)
RETURNS SETOF sovereign_wallet_reservations AS $$
DECLARE
  v_existing sovereign_wallet_reservations%ROWTYPE;
  v_crown INTEGER;
  v_remainder SMALLINT;
  v_package INTEGER;
  v_package_remainder SMALLINT;
  v_purchase_debt BIGINT;
  v_earned BIGINT;
  v_purchased BIGINT;
  v_take_earned INTEGER;
  v_take_purchased INTEGER;
  v_reservation sovereign_wallet_reservations%ROWTYPE;
BEGIN
  IF p_required_crest <= 0 THEN RAISE EXCEPTION 'REQUIRED_CREST_MUST_BE_POSITIVE'; END IF;
  IF p_reason NOT IN ('CHECK_IN','STANDBY','PROMOTION','MATCH_ENTRY') THEN RAISE EXCEPTION 'INVALID_RESERVATION_REASON'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key::TEXT, 0));

  SELECT * INTO v_existing FROM sovereign_wallet_reservations WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.user_id <> p_user_id OR v_existing.match_id <> p_match_id
      OR v_existing.total_crest <> p_required_crest OR v_existing.reason <> p_reason THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT';
    END IF;
    RETURN NEXT v_existing;
    RETURN;
  END IF;

  SELECT crown_balance, crown_crest_remainder, crown_package_balance,
    crown_package_crest_remainder, purchase_debt_crest
  INTO v_crown, v_remainder, v_package, v_package_remainder, v_purchase_debt
  FROM users WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'USER_NOT_FOUND'; END IF;
  IF v_purchase_debt > 0 THEN RAISE EXCEPTION 'PURCHASE_DEBT_ACTIVE'; END IF;

  v_earned := v_crown::BIGINT * 12 + v_remainder;
  v_purchased := v_package::BIGINT * 12 + v_package_remainder;
  IF v_earned + v_purchased < p_required_crest THEN RAISE EXCEPTION 'INSUFFICIENT_CROWN'; END IF;
  v_take_earned := LEAST(v_earned, p_required_crest)::INTEGER;
  v_take_purchased := p_required_crest - v_take_earned;

  UPDATE users SET
    crown_balance = ((v_earned - v_take_earned) / 12)::INTEGER,
    crown_crest_remainder = ((v_earned - v_take_earned) % 12)::SMALLINT,
    crown_package_balance = ((v_purchased - v_take_purchased) / 12)::INTEGER,
    crown_package_crest_remainder = ((v_purchased - v_take_purchased) % 12)::SMALLINT
  WHERE user_id = p_user_id;

  INSERT INTO sovereign_wallet_reservations(
    idempotency_key, match_id, user_id, reason, total_crest, earned_crest, purchased_crest
  ) VALUES (
    p_idempotency_key, p_match_id, p_user_id, p_reason, p_required_crest, v_take_earned, v_take_purchased
  ) RETURNING * INTO v_reservation;

  IF v_take_earned > 0 THEN
    INSERT INTO sovereign_wallet_source_ledger(
      idempotency_key, reservation_id, user_id, source, action, delta_available_crest
    ) VALUES (p_idempotency_key::TEXT || ':EARNED:RESERVE', v_reservation.id, p_user_id, 'EARNED', 'RESERVE', -v_take_earned);
  END IF;
  IF v_take_purchased > 0 THEN
    INSERT INTO sovereign_wallet_source_ledger(
      idempotency_key, reservation_id, user_id, source, action, delta_available_crest
    ) VALUES (p_idempotency_key::TEXT || ':PURCHASED:RESERVE', v_reservation.id, p_user_id, 'PURCHASED', 'RESERVE', -v_take_purchased);
  END IF;

  RETURN NEXT v_reservation;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION sovereign_settle_crown_reservation(
  p_reservation_id UUID,
  p_actual_spent_crest INTEGER,
  p_idempotency_key UUID
)
RETURNS SETOF sovereign_wallet_reservations AS $$
DECLARE
  v_res sovereign_wallet_reservations%ROWTYPE;
  v_spent_earned INTEGER;
  v_spent_purchased INTEGER;
  v_refund_earned INTEGER;
  v_refund_purchased INTEGER;
  v_earned_total BIGINT;
  v_purchased_total BIGINT;
BEGIN
  IF p_actual_spent_crest < 0 THEN RAISE EXCEPTION 'INVALID_ACTUAL_SPENT_CREST'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key::TEXT, 0));
  SELECT * INTO v_res FROM sovereign_wallet_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESERVATION_NOT_FOUND'; END IF;
  IF v_res.status = 'SETTLED' THEN
    IF v_res.settlement_idempotency_key <> p_idempotency_key OR v_res.settled_spent_crest <> p_actual_spent_crest THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT';
    END IF;
    RETURN NEXT v_res;
    RETURN;
  END IF;
  IF v_res.status <> 'ACTIVE' THEN RAISE EXCEPTION 'RESERVATION_NOT_ACTIVE'; END IF;
  IF p_actual_spent_crest > v_res.total_crest THEN RAISE EXCEPTION 'SPEND_EXCEEDS_RESERVATION'; END IF;

  v_spent_earned := LEAST(v_res.earned_crest, p_actual_spent_crest);
  v_spent_purchased := p_actual_spent_crest - v_spent_earned;
  v_refund_earned := v_res.earned_crest - v_spent_earned;
  v_refund_purchased := v_res.purchased_crest - v_spent_purchased;

  SELECT crown_balance::BIGINT * 12 + crown_crest_remainder,
    crown_package_balance::BIGINT * 12 + crown_package_crest_remainder
  INTO v_earned_total, v_purchased_total FROM users WHERE user_id = v_res.user_id FOR UPDATE;

  UPDATE users SET
    crown_balance = ((v_earned_total + v_refund_earned) / 12)::INTEGER,
    crown_crest_remainder = ((v_earned_total + v_refund_earned) % 12)::SMALLINT,
    crown_package_balance = ((v_purchased_total + v_refund_purchased) / 12)::INTEGER,
    crown_package_crest_remainder = ((v_purchased_total + v_refund_purchased) % 12)::SMALLINT
  WHERE user_id = v_res.user_id;

  UPDATE sovereign_wallet_reservations SET status = 'SETTLED', settled_at = NOW(),
    settled_spent_crest = p_actual_spent_crest, refund_earned_crest = v_refund_earned,
    refund_purchased_crest = v_refund_purchased, settlement_idempotency_key = p_idempotency_key
  WHERE id = p_reservation_id RETURNING * INTO v_res;

  INSERT INTO sovereign_wallet_source_ledger(
    idempotency_key, reservation_id, user_id, source, action, delta_available_crest, metadata_json
  ) VALUES
    (p_idempotency_key::TEXT || ':EARNED:SETTLE', v_res.id, v_res.user_id, 'EARNED', 'SETTLE', v_refund_earned,
      jsonb_build_object('spentCrest', v_spent_earned)),
    (p_idempotency_key::TEXT || ':PURCHASED:SETTLE', v_res.id, v_res.user_id, 'PURCHASED', 'SETTLE', v_refund_purchased,
      jsonb_build_object('spentCrest', v_spent_purchased));

  RETURN NEXT v_res;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION sovereign_release_crown_reservation(
  p_reservation_id UUID,
  p_idempotency_key UUID
)
RETURNS SETOF sovereign_wallet_reservations AS $$
DECLARE
  v_res sovereign_wallet_reservations%ROWTYPE;
  v_earned_total BIGINT;
  v_purchased_total BIGINT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key::TEXT, 0));
  SELECT * INTO v_res FROM sovereign_wallet_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESERVATION_NOT_FOUND'; END IF;
  IF v_res.status = 'RELEASED' THEN RETURN NEXT v_res; RETURN; END IF;
  IF v_res.status <> 'ACTIVE' THEN RAISE EXCEPTION 'RESERVATION_NOT_ACTIVE'; END IF;

  SELECT crown_balance::BIGINT * 12 + crown_crest_remainder,
    crown_package_balance::BIGINT * 12 + crown_package_crest_remainder
  INTO v_earned_total, v_purchased_total FROM users WHERE user_id = v_res.user_id FOR UPDATE;
  UPDATE users SET
    crown_balance = ((v_earned_total + v_res.earned_crest) / 12)::INTEGER,
    crown_crest_remainder = ((v_earned_total + v_res.earned_crest) % 12)::SMALLINT,
    crown_package_balance = ((v_purchased_total + v_res.purchased_crest) / 12)::INTEGER,
    crown_package_crest_remainder = ((v_purchased_total + v_res.purchased_crest) % 12)::SMALLINT
  WHERE user_id = v_res.user_id;

  UPDATE sovereign_wallet_reservations SET status = 'RELEASED', released_at = NOW(),
    refund_earned_crest = earned_crest, refund_purchased_crest = purchased_crest,
    settlement_idempotency_key = p_idempotency_key
  WHERE id = p_reservation_id RETURNING * INTO v_res;
  INSERT INTO sovereign_wallet_source_ledger(
    idempotency_key, reservation_id, user_id, source, action, delta_available_crest
  ) VALUES
    (p_idempotency_key::TEXT || ':EARNED:RELEASE', v_res.id, v_res.user_id, 'EARNED', 'RELEASE', v_res.earned_crest),
    (p_idempotency_key::TEXT || ':PURCHASED:RELEASE', v_res.id, v_res.user_id, 'PURCHASED', 'RELEASE', v_res.purchased_crest);
  RETURN NEXT v_res;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION sovereign_claim_first_standby(
  p_match_id UUID,
  p_seat_id UUID,
  p_idempotency_key UUID
)
RETURNS TABLE(entry_id UUID, user_id UUID, queue_sequence BIGINT) AS $$
DECLARE
  v_seat sovereign_seats%ROWTYPE;
  v_entry sovereign_standby_entries%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_match_id::TEXT || ':' || p_seat_id::TEXT, 0));
  SELECT * INTO v_seat FROM sovereign_seats WHERE id = p_seat_id AND match_id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SEAT_NOT_FOUND'; END IF;
  IF v_seat.promotion_idempotency_key = p_idempotency_key AND v_seat.active_user_id IS NOT NULL THEN
    SELECT * INTO v_entry FROM sovereign_standby_entries
    WHERE match_id = p_match_id AND user_id = v_seat.active_user_id AND status = 'PROMOTED';
    RETURN QUERY SELECT v_entry.id, v_entry.user_id, v_entry.queue_sequence;
    RETURN;
  END IF;
  IF v_seat.active_user_id IS NOT NULL THEN RAISE EXCEPTION 'SEAT_ALREADY_FILLED'; END IF;

  SELECT entry.* INTO v_entry
  FROM sovereign_standby_entries entry
  JOIN sovereign_wallet_reservations reservation ON reservation.id = entry.reservation_id
  WHERE entry.match_id = p_match_id AND entry.status = 'QUEUED' AND reservation.status = 'ACTIVE'
  ORDER BY entry.joined_at_server, entry.queue_sequence
  FOR UPDATE OF entry SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE sovereign_standby_entries SET status = 'PROMOTED' WHERE id = v_entry.id;
  UPDATE sovereign_seats SET active_user_id = v_entry.user_id, selection_source = 'LIVE_STANDBY',
    promotion_idempotency_key = p_idempotency_key, updated_at = NOW()
  WHERE id = p_seat_id;
  RETURN QUERY SELECT v_entry.id, v_entry.user_id, v_entry.queue_sequence;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION sovereign_reserve_crown(UUID,UUID,TEXT,INTEGER,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION sovereign_settle_crown_reservation(UUID,INTEGER,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION sovereign_release_crown_reservation(UUID,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION sovereign_claim_first_standby(UUID,UUID,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sovereign_reserve_crown(UUID,UUID,TEXT,INTEGER,UUID) TO service_role;
GRANT EXECUTE ON FUNCTION sovereign_settle_crown_reservation(UUID,INTEGER,UUID) TO service_role;
GRANT EXECUTE ON FUNCTION sovereign_release_crown_reservation(UUID,UUID) TO service_role;
GRANT EXECUTE ON FUNCTION sovereign_claim_first_standby(UUID,UUID,UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
