-- TriplePoker — Add missing users.streak_count column
-- รันไฟล์นี้บน Supabase SQL Editor (dashboard) เอง — ห้าม execute อัตโนมัติ
--
-- Patch (2026-07-17): ยืนยันแล้วว่าคอลัมน์นี้ (รวมถึง last_played_date, streak_shields
-- ที่ matchStatsService.ts ใช้ด้วย) มีอยู่จริงบน live DB แล้ว — ไฟล์นี้น่าจะรันไปแล้วในอดีต
-- (หรือเพิ่มผ่าน dashboard ตรงๆ) เก็บไว้เป็นประวัติ ไม่ต้องรันซ้ำอีก (มี IF NOT EXISTS กันไว้แล้ว)
--
-- สาเหตุ: migrations/001_initial_schema.sql define streak_count ไว้ แต่ live
-- schema จริงบน Supabase ไม่มีคอลัมน์นี้อยู่จริง (ยืนยันจาก error ตรงๆ ตอน query:
-- "column users.streak_count does not exist", Postgres code 42703) — เป็น
-- schema drift แบบเดียวกับที่ migrations/002_name_protection.sql เคยเจอมาก่อน
--
-- ผลกระทบก่อนแก้: client เคย SELECT คอลัมน์นี้รวมอยู่ในคำสั่งเดียวกับฟิลด์อื่นๆ
-- (display_name, avatar_url, token_balance ฯลฯ) ทำให้ query ทั้งชุดพังไปด้วย —
-- authStore.profile กลายเป็น null ตลอด แม้ query ปกติอย่างอื่นจะสำเร็จ (แก้ฝั่ง
-- client แล้วด้วยการเอา streak_count ออกจาก SELECT ไปก่อน ไม่ต้องรอ migration นี้)
--
-- ไฟล์นี้เป็น optional — รันเมื่อพร้อมทำ STREAK stat ใน Profile screen ให้เป็นข้อมูลจริง

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS streak_count INTEGER NOT NULL DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────────────
-- Known Bug #4: หลัง ALTER TABLE ต้องรัน NOTIFY เสมอ ให้ PostgREST reload schema
-- ─────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
