-- TriplePoker — Starting Token Balance 1000 -> 3000
-- รันไฟล์นี้บน Supabase SQL Editor (dashboard) เอง — ห้าม execute อัตโนมัติ
--
-- ที่มา: migrations/001_initial_schema.sql ตั้ง column DEFAULT ของ
-- users.token_balance ไว้ที่ 1000 — DB trigger ที่สร้าง row ใหม่เข้า
-- public.users ตอน Supabase Auth signup (ไม่ได้ commit อยู่ใน repo นี้
-- สร้างตรงบน dashboard) ปล่อยผ่านไม่ระบุ token_balance เอง เลยได้ค่า
-- จาก column default นี้เสมอ
--
-- ขอบเขต: เปลี่ยนแค่ DEFAULT สำหรับผู้สมัครใหม่จากนี้ไป — ไม่แตะ
-- token_balance ของ user ที่มีอยู่แล้วในระบบ (ไม่มี UPDATE ย้อนหลัง)
--
-- ⚠️ ก่อนรัน: ช่วยเปิดดู trigger function ที่ INSERT เข้า public.users
-- ตอน signup ด้วยว่ามันระบุ token_balance ตรงๆ ใน INSERT statement
-- หรือไม่ (เช่น INSERT INTO users (..., token_balance) VALUES (..., 1000))
-- ถ้าระบุตรงๆ แบบนั้น ต้องแก้ใน trigger function เองด้วย เพราะ ALTER
-- COLUMN DEFAULT ด้านล่างจะไม่มีผลอะไรเลยถ้า INSERT ระบุค่าเองอยู่แล้ว

ALTER TABLE users
  ALTER COLUMN token_balance SET DEFAULT 3000;

-- ─────────────────────────────────────────────────────────────────────────
-- Known Bug #4: หลัง ALTER TABLE ต้องรัน NOTIFY เสมอ ให้ PostgREST reload schema
-- ─────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
