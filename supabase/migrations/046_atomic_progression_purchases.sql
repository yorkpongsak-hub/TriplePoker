-- TriplePoker — Atomic Economy/Progression purchases (MVP hardening, 2026-08-15)
-- Run manually in Supabase SQL Editor after migrations 040, 044 and 045.
--
-- Both operations call economy_apply_transaction() inside the same PostgreSQL
-- transaction as the entitlement write. Any error rolls back BOTH money and
-- ownership/status, while the Central Economy Ledger remains reconcilable.

CREATE OR REPLACE FUNCTION purchase_badge_atomic(
  p_user_id UUID,
  p_badge_key TEXT,
  p_price BIGINT
)
RETURNS BIGINT AS $$
DECLARE
  v_balance BIGINT;
BEGIN
  IF p_price <= 0 OR p_badge_key IS NULL OR length(trim(p_badge_key)) = 0 THEN
    RAISE EXCEPTION 'INVALID_BADGE_PURCHASE';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('BADGE:' || p_user_id::TEXT || ':' || p_badge_key, 0));
  IF EXISTS (SELECT 1 FROM user_badges WHERE user_id = p_user_id AND badge_key = p_badge_key) THEN
    RAISE EXCEPTION 'ALREADY_OWNED';
  END IF;

  INSERT INTO user_badges(user_id, badge_key, price_paid)
  VALUES (p_user_id, p_badge_key, p_price);

  PERFORM economy_apply_transaction(
    p_idempotency_key := 'BADGE_PURCHASE:' || p_user_id::TEXT || ':' || p_badge_key,
    p_type := 'BURN',
    p_reason := 'SHOP_PURCHASE',
    p_entries := jsonb_build_array(jsonb_build_object(
      'accountType', 'PLAYER', 'accountId', p_user_id::TEXT,
      'currency', 'TOKEN', 'amount', -p_price
    )),
    p_metadata := jsonb_build_object('badgeKey', p_badge_key, 'pricePaid', p_price),
    p_context := jsonb_build_object('playerId', p_user_id::TEXT),
    p_created_by := 'badge_shop'
  );

  SELECT token_balance INTO v_balance FROM users WHERE user_id = p_user_id;
  RETURN v_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION purchase_ascendant_pass_atomic(
  p_user_id UUID,
  p_price_crest BIGINT,
  p_new_status JSONB
)
RETURNS INTEGER AS $$
DECLARE
  v_current_status TEXT;
  v_crown_balance INTEGER;
BEGIN
  IF p_price_crest <= 0 OR p_new_status IS NULL THEN
    RAISE EXCEPTION 'INVALID_ASCENDANT_PURCHASE';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('ASCENDANT_PASS:' || p_user_id::TEXT, 0));
  SELECT COALESCE(ascendant_status->>'status', 'none')
    INTO v_current_status
    FROM users WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'USER_NOT_FOUND'; END IF;
  IF v_current_status <> 'none' THEN RAISE EXCEPTION 'ASCENDANT_ALREADY_USED'; END IF;

  PERFORM economy_apply_transaction(
    p_idempotency_key := 'ASCENDANT_PASS:' || p_user_id::TEXT,
    p_type := 'BURN',
    p_reason := 'JOURNEY_PASS',
    p_entries := jsonb_build_array(jsonb_build_object(
      'accountType', 'PLAYER', 'accountId', p_user_id::TEXT,
      'currency', 'CREST', 'wallet', 'EARNED', 'amount', -p_price_crest
    )),
    p_metadata := jsonb_build_object('pass', 'ASCENDANT', 'priceCrest', p_price_crest),
    p_context := jsonb_build_object('playerId', p_user_id::TEXT),
    p_created_by := 'crown_vault'
  );

  UPDATE users SET ascendant_status = p_new_status WHERE user_id = p_user_id
  RETURNING crown_balance INTO v_crown_balance;
  RETURN v_crown_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION purchase_badge_atomic(UUID, TEXT, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION purchase_ascendant_pass_atomic(UUID, BIGINT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purchase_badge_atomic(UUID, TEXT, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION purchase_ascendant_pass_atomic(UUID, BIGINT, JSONB) TO service_role;

NOTIFY pgrst, 'reload schema';
