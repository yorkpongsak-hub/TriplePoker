-- TriplePoker — Monarch Spawn & Reward System (Monarch_Spec_v1_2)
-- รันไฟล์นี้บน Supabase SQL Editor (dashboard) เอง — ห้าม execute อัตโนมัติ
--
-- ใช้กับบอสลับ Monarch (Tier A+ / High Noble) — spawn 3% base + pity counter ต่อผู้เล่น
-- อ่าน/เขียนที่ server/src/game/monarchSpawn.ts (pity), server/src/game/highNobleMultiEngine.ts
-- (finalizeHNGrandFinale settlement), server/src/game/psEngine.ts เสมอด้วย .eq('user_id', ...)
-- ตาม Known Bug #3

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS monarch_pity_counter INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monarch_encounters   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monarch_victories    INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN users.monarch_pity_counter IS
  'จำนวนเกม High Noble ต่อเนื่องที่ไม่เจอ Monarch — reset เป็น 0 ทันทีที่เจอ (ไม่ว่าแพ้หรือชนะ)';
COMMENT ON COLUMN users.monarch_encounters IS
  'จำนวนครั้งที่เจอ Monarch ทั้งหมด (แพ้+ชนะ)';
COMMENT ON COLUMN users.monarch_victories IS
  'จำนวนครั้งที่ชนะ Monarch — ใช้แสดง Badge "Monarch Slayer" (>=1) และเป็นเงื่อนไขเข้า Ascendant Tier (Spec v1.2 §5)';

-- ─────────────────────────────────────────────────────────────────────────
-- performance_score: Monarch_Spec_v1_2 §6 อ้างว่ามีอยู่แล้วตาม MasterPlan §10
-- (ADD COLUMN IF NOT EXISTS แบบ defensive ไว้เผื่อ schema drift — ไม่พบร่องรอยคอลัมน์นี้ในโค้ด/
-- migration ไหนเลยตอนสำรวจจริง คำสั่งนี้ไม่กระทบข้อมูลถ้ามีคอลัมน์อยู่แล้ว ปลอดภัยรันซ้ำได้)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS performance_score INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN users.performance_score IS
  'Performance Score — active ตั้งแต่ Tier A+ ขึ้นไป ใช้คัดเลือก Ascendant Star (ดู psConfig ใน gameConfig.ts)';

-- ─────────────────────────────────────────────────────────────────────────
-- Known Bug #4: หลัง ALTER TABLE ต้องรัน NOTIFY เสมอ ให้ PostgREST reload schema
-- ─────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
