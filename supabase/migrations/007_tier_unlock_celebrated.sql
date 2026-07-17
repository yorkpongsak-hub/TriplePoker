-- TriplePoker — Tier Unlock Celebration flag (LobbyMatchmaking_Spec_v1_0 §1.3)
-- รันไฟล์นี้บน Supabase SQL Editor (dashboard) เอง — ห้าม execute อัตโนมัติ
--
-- เก็บรายชื่อ Tier ที่ผู้เล่นเคยได้เห็น celebration animation แล้ว (กัน replay ซ้ำเมื่อเปลี่ยนเครื่อง —
-- เก็บใน Supabase แทน AsyncStorage ตาม spec) — jsonb array ของ tier key เช่น ["adept", "mastermind"]
-- อ่าน/เขียนที่ server/src/routes/profile.ts (POST /profile/celebrate-tier) เสมอด้วย .eq('user_id', ...)
-- ตาม Known Bug #3

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tier_unlock_celebrated JSONB NOT NULL DEFAULT '[]';

COMMENT ON COLUMN users.tier_unlock_celebrated IS
  'Tier ที่เคยแสดง Unlock Celebration แล้ว (กัน replay) — jsonb array ของ tier key: initiate/adept/mastermind/high_noble/last_boss';

-- ─────────────────────────────────────────────────────────────────────────
-- Known Bug #4: หลัง ALTER TABLE ต้องรัน NOTIFY pgrst, 'reload schema'; เสมอ
-- ─────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
