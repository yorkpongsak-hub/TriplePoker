-- TriplePoker — Name Protection Spec v1.0
-- อ้างอิง: docs/TriplePoker_NameProtection_Spec_v1_0.md
-- รันไฟล์นี้บน Supabase SQL Editor (dashboard) เอง — ห้าม execute อัตโนมัติ
--
-- หมายเหตุ: schema จริงบน Supabase (users.user_id เป็น PK) ต่างจาก
-- migrations/001_initial_schema.sql ที่ commit ไว้ (มีแต่ id/user_id บน bosses,graveyard
-- ไม่มี display_name) เพราะมี migration อื่นที่รันตรงบน dashboard ไม่ได้ commit ไว้
-- ไฟล์นี้จึงเพิ่ม display_name เป็น snapshot ชื่อถาวรบน bosses/graveyard เอง

-- ─────────────────────────────────────────────────────────────────────────
-- 1) bosses — เพิ่ม display_name (snapshot ชื่อ ณ ตอนเป็น Boss) + normalized_name
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE bosses
  ADD COLUMN IF NOT EXISTS display_name VARCHAR(50);

UPDATE bosses b
SET display_name = u.display_name
FROM users u
WHERE b.user_id = u.user_id AND b.display_name IS NULL;

ALTER TABLE bosses
  ADD COLUMN IF NOT EXISTS normalized_name VARCHAR(50) GENERATED ALWAYS AS (
    LOWER(TRIM(REGEXP_REPLACE(display_name, '\s+', ' ', 'g')))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_bosses_normalized ON bosses (normalized_name);

-- ─────────────────────────────────────────────────────────────────────────
-- 2) graveyard — เพิ่ม display_name (snapshot ชื่อถาวร) + normalized_name
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE graveyard
  ADD COLUMN IF NOT EXISTS display_name VARCHAR(50);

UPDATE graveyard g
SET display_name = u.display_name
FROM users u
WHERE g.user_id = u.user_id AND g.display_name IS NULL;

ALTER TABLE graveyard
  ADD COLUMN IF NOT EXISTS normalized_name VARCHAR(50) GENERATED ALWAYS AS (
    LOWER(TRIM(REGEXP_REPLACE(display_name, '\s+', ' ', 'g')))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_graveyard_normalized ON graveyard (normalized_name);

-- ─────────────────────────────────────────────────────────────────────────
-- 3) reserved_names — ตารางใหม่ทั้งหมด (Admin blacklist)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reserved_names (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(50) NOT NULL,
  normalized_name VARCHAR(50) NOT NULL GENERATED ALWAYS AS (
    LOWER(TRIM(REGEXP_REPLACE(name, '\s+', ' ', 'g')))
  ) STORED,
  reason          VARCHAR(100) DEFAULT NULL,
  added_by        UUID REFERENCES users(user_id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (normalized_name)
);

CREATE INDEX IF NOT EXISTS idx_reserved_names_normalized ON reserved_names (normalized_name);

-- ─────────────────────────────────────────────────────────────────────────
-- 4) Seed: First Last Boss — "I am York" (ตาม spec §7)
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO reserved_names (name, reason) VALUES
  ('I am York',  'First Last Boss — Founder'),
  ('IamYork',    'Variation of First Last Boss'),
  ('I m York',   'Variation of First Last Boss')
ON CONFLICT (normalized_name) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- Known Bug #4: หลัง ALTER TABLE ต้องรัน NOTIFY เสมอ ให้ PostgREST reload schema
-- ─────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
