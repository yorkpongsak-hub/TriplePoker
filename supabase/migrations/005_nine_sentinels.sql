-- TriplePoker — Add users.conquered_sentinels for Mastermind Conquest Mode
-- รันไฟล์นี้บน Supabase SQL Editor (dashboard) เอง — ห้าม execute อัตโนมัติ
--
-- Patch (2026-07-17): เช็ค live schema จริงแล้วพบว่าคอลัมน์ conquered_sentinels
-- มีอยู่แล้วบน DB จริง (เห็นจาก CREATE TABLE ที่ลุงแชร์มาตอนตรวจ streak_count)
-- น่าจะรันไฟล์นี้ไปแล้วในอดีต หรือเพิ่มผ่าน dashboard ตรงๆ — ไม่ต้องรันซ้ำก็ได้
-- (มี IF NOT EXISTS กันไว้ ถ้ารันซ้ำก็ปลอดภัย ไม่มีผลข้างเคียง) blocker ที่เหลือจริงๆ
-- ก่อนเทส Nine Sentinels คือ asset รูป boss_[id].png (pending #4) เท่านั้น
--
-- ใช้เก็บรายชื่อ Nine Sentinels (bossId) ที่ผู้เล่นพิชิตแล้ว (อันดับ 1 ครบ 5 รอบ
-- ใน Mastermind tier) — jsonb array ของ string เช่น ["iron_wall", "oracle"]
-- อ่าน/เขียนที่ client/app/game/mastermind/select.tsx และ server/src/game/gameLoop.ts
-- (finalizeGrandFinale match_end block) เสมอด้วย .eq('user_id', ...) ตาม Known Bug #3

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS conquered_sentinels JSONB NOT NULL DEFAULT '[]';

COMMENT ON COLUMN users.conquered_sentinels IS
  'Nine Sentinels (Mastermind Conquest) ที่ผู้เล่นพิชิตแล้ว — jsonb array ของ bossId string, dedup ที่ฝั่ง server ก่อน update เสมอ';

-- ─────────────────────────────────────────────────────────────────────────
-- Known Bug #4: หลัง ALTER TABLE ต้องรัน NOTIFY เสมอ ให้ PostgREST reload schema
-- ─────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
