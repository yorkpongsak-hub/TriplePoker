-- TriplePoker — Ascendant Tier + Crown Vault (TriplePoker_Ascendant_Spec_v1_1 + มติลุงเยาะ 2026-07-30)
-- รันไฟล์นี้บน Supabase SQL Editor (dashboard) เอง — ห้าม execute อัตโนมัติ
--
-- อ่าน/เขียนที่ server/src/game/ascendantGate.ts (eligibility), server/src/game/crownVaultService.ts
-- (buy pass / exchange), server/src/items/shopAPI.ts (deductTokens/creditCrown/deductCrown)
-- เสมอด้วย .eq('user_id', ...) ตาม Known Bug #3

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS ascendant_status      JSONB   NOT NULL DEFAULT '{"status":"none","startedAt":null,"expiresAt":null}',
  ADD COLUMN IF NOT EXISTS crown_balance         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS crown_package_balance INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS arena_unlocked        BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN users.ascendant_status IS
  'สถานะ Ascendant Tier — jsonb {status, startedAt, expiresAt}. status: none (ยังไม่เคยซื้อ Pass) |
   active (ซื้อ Ascendant Pass แล้ว กำลังนับ 30 วัน) | passed (token ถึง 1M แล้ว ไม่ว่าจะ instant หรือระหว่างนับ) |
   failed (ครบ 30 วัน token ยังไม่ถึง 1M — สิทธิ์ใช้แล้วครั้งเดียวต่อบัญชี ไม่มีทางกลับมา active ได้อีก)';

COMMENT ON COLUMN users.crown_balance IS
  'Earned Crown — แลกจาก Token (1 Crown = 5,000 Token, ปลดล็อกที่ Tier HighNoble) ใช้ Match Stake
   ใน Arena และซื้อ Ascendant Pass / Arena Pass ได้ — คนละก้อนกับ crown_package_balance ห้ามปนกันเด็ดขาด';

COMMENT ON COLUMN users.crown_package_balance IS
  'Crown Package — ซื้อด้วยเงินจริง (IAP) ใช้ได้เฉพาะ The Crown Vault cosmetics เท่านั้น
   ห้ามใช้ Match Stake และห้ามใช้ซื้อ Ascendant Pass / Arena Pass เด็ดขาด (Legal/Economy Rule #1)';

COMMENT ON COLUMN users.arena_unlocked IS
  'true = ซื้อ Arena Pass แล้ว ปลดล็อกเข้า Tier S / The Arena ถาวร — entitlement flag เท่านั้น
   game logic จริงของ Arena อยู่ในแอปแยก (Architecture Rule #5) ห้ามเอา logic มาปนใน Main App';

-- ─────────────────────────────────────────────────────────────────────────
-- Atomic RPC functions — guarded UPDATE...RETURNING ในทรานแซกชันเดียว กัน race condition
-- (สอง client กดปุ่มซื้อพร้อมกัน / network retry ซ้ำ) ไม่ใช้ SELECT-then-UPDATE 2 จังหวะ
-- ตั้งชื่อแยกจาก RPC เก่า `deduct_tokens` (หา source ไม่เจอในโปรเจค ไม่ reuse ตามมติลุงเยาะ)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION deduct_user_tokens(p_user_id UUID, p_amount BIGINT)
RETURNS BIGINT AS $$
DECLARE
  v_new_balance BIGINT;
BEGIN
  UPDATE users
  SET token_balance = token_balance - p_amount
  WHERE user_id = p_user_id AND token_balance >= p_amount
  RETURNING token_balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'INSUFFICIENT_TOKENS';
  END IF;

  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION credit_user_crown(p_user_id UUID, p_amount INTEGER)
RETURNS INTEGER AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  UPDATE users
  SET crown_balance = crown_balance + p_amount
  WHERE user_id = p_user_id
  RETURNING crown_balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;

  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION deduct_user_crown(p_user_id UUID, p_amount INTEGER)
RETURNS INTEGER AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  UPDATE users
  SET crown_balance = crown_balance - p_amount
  WHERE user_id = p_user_id AND crown_balance >= p_amount
  RETURNING crown_balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'INSUFFICIENT_CROWN';
  END IF;

  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql;

-- Token → Crown exchange: หัก token + เพิ่ม crown ในทรานแซกชันเดียว (กันเงินหายถ้า credit ล้มเหลวหลัง deduct สำเร็จ)
CREATE OR REPLACE FUNCTION exchange_token_to_crown(p_user_id UUID, p_crown_amount INTEGER, p_token_cost BIGINT)
RETURNS TABLE(new_token_balance BIGINT, new_crown_balance INTEGER) AS $$
DECLARE
  v_token BIGINT;
  v_crown INTEGER;
BEGIN
  UPDATE users
  SET token_balance = token_balance - p_token_cost,
      crown_balance  = crown_balance + p_crown_amount
  WHERE user_id = p_user_id AND token_balance >= p_token_cost
  RETURNING token_balance, crown_balance INTO v_token, v_crown;

  IF v_token IS NULL THEN
    RAISE EXCEPTION 'INSUFFICIENT_TOKENS';
  END IF;

  RETURN QUERY SELECT v_token, v_crown;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────
-- Known Bug #4: หลัง ALTER TABLE ต้องรัน NOTIFY เสมอ ให้ PostgREST reload schema
-- ─────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
