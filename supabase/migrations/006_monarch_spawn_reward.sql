-- TriplePoker — Monarch Spawn & Reward System + Dual-Track PS (Monarch_Spec_v1_3)
-- รันไฟล์นี้บน Supabase SQL Editor (dashboard) เอง — ห้าม execute อัตโนมัติ
--
-- ใช้กับบอสลับ Monarch (Tier A+ / High Noble) — spawn 3% base + pity counter ต่อผู้เล่น
-- อ่าน/เขียนที่ server/src/game/monarchSpawn.ts (pity), server/src/game/highNobleMultiEngine.ts
-- (finalizeHNGrandFinale settlement), server/src/game/psEngine.ts เสมอด้วย .eq('user_id', ...)
-- ตาม Known Bug #3

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS monarch_pity_counter INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monarch_encounters   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monarch_victories    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ps_season            INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN users.monarch_pity_counter IS
  'จำนวนเกม High Noble ต่อเนื่องที่ไม่เจอ Monarch — reset เป็น 0 ทันทีที่เจอ (ไม่ว่าแพ้หรือชนะ)';
COMMENT ON COLUMN users.monarch_encounters IS
  'จำนวนครั้งที่เจอ Monarch ทั้งหมด (แพ้+ชนะ)';
COMMENT ON COLUMN users.monarch_victories IS
  'จำนวนครั้งที่ชนะ Monarch — ใช้แสดง Badge "Monarch Slayer" (>=1) และเป็นเงื่อนไขเข้า Ascendant Tier (Spec v1.3 §5)';
COMMENT ON COLUMN users.ps_season IS
  'Season PS — เกณฑ์แข่งขันทั้งหมด (Ascendant Star, leaderboard, tournament seeding) รีเซ็ตตามรอบ tournament — ต้อง archive ค่าก่อน reset เสมอ (Spec v1.3 §4.2)';

-- ─────────────────────────────────────────────────────────────────────────
-- performance_score: Monarch_Spec_v1_3 §6 อ้างว่ามีอยู่แล้วตาม MasterPlan §10 — ใช้เป็น Career PS
-- (lifetime, ห้ามรีเซ็ต) ไม่ rename เพื่อลด migration risk (ADD COLUMN IF NOT EXISTS แบบ defensive
-- ไว้เผื่อ schema drift — ไม่พบร่องรอยคอลัมน์นี้ในโค้ด/migration ไหนเลยตอนสำรวจจริง คำสั่งนี้ไม่กระทบ
-- ข้อมูลถ้ามีคอลัมน์อยู่แล้ว ปลอดภัยรันซ้ำได้)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS performance_score INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN users.performance_score IS
  'Career PS (lifetime) — active ตั้งแต่ Tier A+ ขึ้นไป สะสมตลอดชีพ ห้ามรีเซ็ตทุกกรณี (ดู psConfig ใน gameConfig.ts, ps_season คือ track คู่กันที่ใช้แข่งขัน)';

-- ─────────────────────────────────────────────────────────────────────────
-- Known Bug #4: หลัง ALTER TABLE ต้องรัน NOTIFY เสมอ ให้ PostgREST reload schema
-- ─────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
