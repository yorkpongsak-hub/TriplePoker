-- TriplePoker: Rise - Fund 3 QA/debug test accounts (@triplepoker.dev)
-- Run manually in Supabase SQL Editor. Requires 030/031/032 to already be applied.
-- Per Economy spec §2 rule 2 / §13: even test-account funding must go through the Economy
-- Service (economy_apply_transaction), never a direct UPDATE on users.token_balance/crown_balance.
-- Amount confirmed with ลุงเยาะ (2026-08-10): Token 1,200,000 + Crown 50 (Earned) per account.

-- ─────────────────────────────────────────────
-- Step 1 — Preview first. Confirm this returns exactly the 3 accounts you expect before running
-- Step 2. public.users has no email column — email lives on auth.users, joined via user_id.
-- ─────────────────────────────────────────────

SELECT u.user_id, au.email, u.token_balance, u.crown_balance, u.crown_crest_remainder
FROM public.users u
JOIN auth.users au ON au.id = u.user_id
WHERE au.email ILIKE '%@triplepoker.dev'
ORDER BY au.email;

-- ─────────────────────────────────────────────
-- Step 2 — Fund exactly those accounts from SYSTEM_RESERVE, reason TEST_ACCOUNT_FUNDING.
-- Aborts loudly (no partial funding) if the count isn't exactly 3, so a typo in the domain or an
-- unexpected extra match can never silently fund the wrong set. Safe to re-run: each account's
-- idempotency key is stable, so re-running replays the existing transaction instead of double-funding.
-- ─────────────────────────────────────────────

DO $$
DECLARE
  v_user RECORD;
  v_count INTEGER;
  v_token_amount BIGINT := 1200000;
  v_crest_amount BIGINT := 600; -- 50 Crown * 12 Crest/Crown, no fractional remainder
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.users u JOIN auth.users au ON au.id = u.user_id
  WHERE au.email ILIKE '%@triplepoker.dev';

  IF v_count <> 3 THEN
    RAISE EXCEPTION 'EXPECTED_EXACTLY_3_ACCOUNTS_FOUND_%', v_count;
  END IF;

  FOR v_user IN
    SELECT u.user_id, au.email
    FROM public.users u JOIN auth.users au ON au.id = u.user_id
    WHERE au.email ILIKE '%@triplepoker.dev'
    ORDER BY au.email
  LOOP
    PERFORM economy_apply_transaction(
      p_idempotency_key := 'TEST_ACCOUNT_FUNDING:v1:' || v_user.user_id::TEXT,
      p_type := 'TRANSFER',
      p_reason := 'TEST_ACCOUNT_FUNDING',
      p_entries := jsonb_build_array(
        jsonb_build_object('accountType', 'SYSTEM_RESERVE', 'accountId', 'SYSTEM_RESERVE', 'currency', 'TOKEN', 'amount', -v_token_amount),
        jsonb_build_object('accountType', 'PLAYER', 'accountId', v_user.user_id::TEXT, 'currency', 'TOKEN', 'amount', v_token_amount),
        jsonb_build_object('accountType', 'SYSTEM_RESERVE', 'accountId', 'SYSTEM_RESERVE', 'currency', 'CREST', 'amount', -v_crest_amount),
        jsonb_build_object('accountType', 'PLAYER', 'accountId', v_user.user_id::TEXT, 'currency', 'CREST', 'wallet', 'EARNED', 'amount', v_crest_amount)
      ),
      p_metadata := jsonb_build_object('note', 'QA/debug funding for ' || v_user.email),
      p_context := jsonb_build_object('playerId', v_user.user_id::TEXT),
      p_created_by := 'MANUAL_TEST_ACCOUNT_FUNDING'
    );
    RAISE NOTICE 'Funded % (%): +% Token, +% Crown', v_user.email, v_user.user_id, v_token_amount, v_crest_amount / 12;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────
-- Step 3 — Verify: new balances + global reconciliation (must still show difference = 0).
-- ─────────────────────────────────────────────

SELECT u.user_id, au.email, u.token_balance, u.crown_balance, u.crown_crest_remainder
FROM public.users u JOIN auth.users au ON au.id = u.user_id
WHERE au.email ILIKE '%@triplepoker.dev'
ORDER BY au.email;

SELECT * FROM economy_reconciliation();
