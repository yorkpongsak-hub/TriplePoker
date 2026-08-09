-- ทำให้ฐานข้อมูลที่สร้างจาก schema รุ่นเก่าใช้ชื่อเดียวกับฐานข้อมูล Production ปัจจุบัน
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'last_login_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'last_login'
  ) THEN
    ALTER TABLE public.users RENAME COLUMN last_login_at TO last_login;
  END IF;
END $$;
