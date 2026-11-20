-- ============================================================
-- QA: เตรียมบัญชีเทส 2 บัญชีให้เข้า High Noble ได้ (Device QA v1.0)
-- รันบน Supabase SQL Editor (dashboard) เอง — Claude ไม่ได้รัน
-- Project ปัจจุบันของ dev env: aeinnlaxscikarzupprn (production) → ใช้กับ "บัญชีทดสอบของลุงเท่านั้น"
--
-- สิ่งที่สคริปต์นี้ทำ (ต่อบัญชี):
--   1. token_balance → เติมให้ถึง 200,000 ผ่าน Central Economy Ledger
--      (TRANSFER จาก SYSTEM_RESERVE → PLAYER, idempotency key คงที่ รันซ้ำไม่เติมซ้ำ)
--      ไม่เขียน token_balance ตรงๆ เพื่อให้ ledger/reconciliation ยังตรง
--   2. created_at → ถอยไป 91 วัน (เฉพาะถ้าบัญชีอายุน้อยกว่านั้น)
--   3. conquered_sentinels → ครบ 9 ตัว (รวมของเดิม ไม่ลบของที่มีอยู่)
--   4. tier_unlocked_max → 'highNoble' (เฉพาะถ้าต่ำกว่า ไม่ลด grandmaster)
--   ไม่แตะ vip_status / crown / iap / item ใดๆ
--
-- วิธีใช้:
--   ขั้น A  แก้ email 2 บรรทัดใน "ขั้น A" แล้วรันเฉพาะ SELECT นั้น → เก็บผลไว้ (เป็นค่าเดิมสำหรับคืนค่า)
--   ขั้น B  แก้ email 2 บรรทัดใน DO block แล้วรันทั้งบล็อก
--   ขั้น C  รัน SELECT ตรวจผล
--   ขั้น D  (หลัง QA เสร็จ ถ้าต้องการ) คืนค่า — ดูท้ายไฟล์
-- ============================================================


-- ─── ขั้น A: ดูค่าปัจจุบัน (read-only) — Copy ผลเก็บไว้ก่อนรันขั้น B ─────────
SELECT u.user_id, a.email, u.display_name, u.token_balance, u.created_at,
       u.tier_unlocked_max, u.conquered_sentinels, u.iap_token_total, u.vip_status
FROM public.users u
JOIN auth.users a ON a.id = u.user_id
WHERE a.email IN ('QA_EMAIL_A@example.com', 'QA_EMAIL_B@example.com');   -- ← แก้ email

-- ยอด SYSTEM_RESERVE ต้องพอเติม (สูงสุด 400,000 ถ้าทั้ง 2 บัญชีมี 0)
SELECT pool_key, token_balance FROM economy_pool_accounts WHERE pool_key = 'SYSTEM_RESERVE';


-- ─── ขั้น B: เตรียมบัญชี (ทั้งหมดอยู่ใน transaction เดียว — error ที่ไหน rollback ทั้งหมด) ───
DO $$
DECLARE
  v_emails   TEXT[] := ARRAY['QA_EMAIL_A@example.com', 'QA_EMAIL_B@example.com'];  -- ← แก้ email
  v_target   BIGINT := 200000;                         -- Buy-in High Noble 25,000 → เล่นได้หลายเกม
  v_sentinels JSONB := '["iron_wall","chivalry","war_lord","phantom","dark_shark","oracle","jester","phoenix","black_magic"]'::JSONB;
  v_email    TEXT;
  v_uid      UUID;
  v_balance  BIGINT;
  v_delta    BIGINT;
  v_tier     TEXT;
  v_order    TEXT[] := ARRAY['D','initiate','adept','mastermind','highNoble','grandmaster'];
BEGIN
  IF array_length(v_emails, 1) <> 2 OR 'QA_EMAIL_A@example.com' = ANY(v_emails) OR 'QA_EMAIL_B@example.com' = ANY(v_emails) THEN
    RAISE EXCEPTION 'แก้ email ใน v_emails ก่อนรัน';
  END IF;

  FOREACH v_email IN ARRAY v_emails LOOP
    SELECT a.id INTO v_uid FROM auth.users a WHERE lower(a.email) = lower(v_email);
    IF v_uid IS NULL THEN RAISE EXCEPTION 'ไม่พบบัญชี email %', v_email; END IF;

    SELECT token_balance, tier_unlocked_max INTO v_balance, v_tier
      FROM public.users WHERE user_id = v_uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ไม่พบแถว public.users ของ %', v_email; END IF;

    -- 1) เติม Token ผ่าน ledger (เฉพาะส่วนที่ขาด)
    v_delta := v_target - COALESCE(v_balance, 0);
    IF v_delta > 0 THEN
      PERFORM economy_apply_transaction(
        'QA_HN_TOPUP:' || v_uid::TEXT || ':2026-11-20',
        'TRANSFER',
        'QA_TEST_GRANT',
        jsonb_build_array(
          jsonb_build_object('accountType','SYSTEM_RESERVE','accountId','SYSTEM_RESERVE','currency','TOKEN','amount', -v_delta),
          jsonb_build_object('accountType','PLAYER','accountId', v_uid::TEXT,'currency','TOKEN','amount', v_delta)
        ),
        jsonb_build_object('purpose','High Noble device QA test account'),
        jsonb_build_object('playerId', v_uid::TEXT, 'tier', 'highNoble'),
        'owner-manual-sql'
      );
    END IF;

    -- 2) อายุบัญชี ≥ 90 วัน  3) Sentinels ครบ 9  4) ceiling ≥ highNoble
    UPDATE public.users SET
      created_at = LEAST(created_at, NOW() - INTERVAL '91 days'),
      conquered_sentinels = (
        SELECT COALESCE(jsonb_agg(DISTINCT s), '[]'::JSONB)
        FROM jsonb_array_elements_text(COALESCE(conquered_sentinels, '[]'::JSONB) || v_sentinels) s
      ),
      tier_unlocked_max = CASE
        WHEN array_position(v_order, COALESCE(tier_unlocked_max, 'D')) >= array_position(v_order, 'highNoble')
          THEN tier_unlocked_max
        ELSE 'highNoble' END
    WHERE user_id = v_uid;

    RAISE NOTICE 'OK % (user_id %) — เติม Token % ', v_email, v_uid, GREATEST(v_delta, 0);
  END LOOP;
END $$;


-- ─── ขั้น C: ตรวจผล ─────────────────────────────────────────
-- ต้องได้: token_balance ≥ 200000 · days_old ≥ 90 · sentinels = 9 · tier_unlocked_max = highNoble (หรือ grandmaster)
SELECT a.email, u.token_balance,
       date_part('day', NOW() - u.created_at)::INT AS days_old,
       jsonb_array_length(u.conquered_sentinels) AS sentinels,
       u.tier_unlocked_max
FROM public.users u
JOIN auth.users a ON a.id = u.user_id
WHERE a.email IN ('QA_EMAIL_A@example.com', 'QA_EMAIL_B@example.com');   -- ← แก้ email

-- รายการใน ledger ที่สคริปต์นี้สร้าง
SELECT id, idempotency_key, type, reason, created_at
FROM economy_transactions WHERE idempotency_key LIKE 'QA_HN_TOPUP:%' ORDER BY id;


-- ─── ขั้น D (ทางเลือก — หลัง QA เสร็จ): คืนค่าเดิม ─────────────
-- ใช้ค่าที่จดไว้จากขั้น A แทนที่ <...> แล้วรันทีละบัญชี
-- Token: โอนกลับเข้า SYSTEM_RESERVE ผ่าน ledger (ห้าม UPDATE token_balance ตรงๆ)
--   คืนเท่ายอดที่เติมในขั้น B เท่านั้น และต้องไม่เกินยอดที่เหลือจริง (ถ้าเล่นเสียไปแล้ว คืนเท่าที่มี)
--
-- SELECT economy_apply_transaction(
--   'QA_HN_RETURN:<user_id>:2026-11-20', 'TRANSFER', 'QA_TEST_GRANT_RETURN',
--   jsonb_build_array(
--     jsonb_build_object('accountType','PLAYER','accountId','<user_id>','currency','TOKEN','amount', -<amount>),
--     jsonb_build_object('accountType','SYSTEM_RESERVE','accountId','SYSTEM_RESERVE','currency','TOKEN','amount', <amount>)
--   ),
--   '{"purpose":"return High Noble QA grant"}'::JSONB,
--   jsonb_build_object('playerId','<user_id>'),
--   'owner-manual-sql'
-- );
--
-- UPDATE public.users SET
--   created_at = '<created_at เดิม>',
--   conquered_sentinels = '<conquered_sentinels เดิม>'::JSONB,
--   tier_unlocked_max = '<tier_unlocked_max เดิม>'
-- WHERE user_id = '<user_id>';
