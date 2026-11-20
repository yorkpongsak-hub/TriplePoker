-- TriplePoker — Badge Equip (มติลุงเยาะ 2026-08-15)
-- รันไฟล์นี้บน Supabase SQL Editor (dashboard) เอง — ห้าม execute อัตโนมัติ
--
-- ต่อจาก 044_badge_shop.sql (user_badges = badge ที่ซื้อแล้ว) — คอลัมน์นี้เก็บว่า badge ใบไหน
-- (ถ้ามี) ที่ผู้เล่นเลือก "ใช้งาน" อยู่ตอนนี้ (equip ได้ทีละ 1 ใบ, NULL = ไม่ได้ equip อะไร)
-- แสดงผลจริงที่ Hero Avatar ในหน้า Profile ของตัวเองเท่านั้น (MVP — ยังไม่โชว์ให้คนอื่นเห็น)
-- ไม่มี FK ไปตาราง badge ใดๆ เพราะ badge catalog เป็น config-driven อยู่ที่
-- server/src/game/badgeConfig.ts ไม่ใช่ตาราง DB — validate ความถูกต้อง (มีอยู่จริง+เป็นเจ้าของ)
-- ที่ badgeUnlockService.ts's setEquippedBadge() ก่อนเขียนเสมอ

ALTER TABLE users ADD COLUMN IF NOT EXISTS equipped_badge_key TEXT;

COMMENT ON COLUMN users.equipped_badge_key IS
  'Badge key (ตรงกับ BADGE_CATALOG ใน badgeConfig.ts) ที่ผู้เล่นเลือก equip อยู่ตอนนี้ — NULL = ไม่ได้
   equip อะไร equip ได้ทีละ 1 ใบ ต้องเป็นเจ้าของ (มีแถวใน user_badges) ก่อนเสมอ';

NOTIFY pgrst, 'reload schema';
