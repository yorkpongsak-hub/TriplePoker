-- TriplePoker — Reserve NPC boss/persona names (Multiplayer Audit Fix, 2026-07-17)
-- รันไฟล์นี้บน Supabase SQL Editor (dashboard) เอง — ห้าม execute อัตโนมัติ
--
-- สาเหตุ: nameValidator.ts Layer 1 ("bosses" table) เก็บแค่ snapshot ของ Human จริงที่เคยเป็น
-- Last Boss เท่านั้น (bosses.user_id NOT NULL REFERENCES users) ไม่ใช่ที่เก็บรายชื่อ NPC ตายตัว —
-- ชื่อบอส/บุคลิก NPC ในเกม (Four Gods, Monarch, Nine Sentinels, Bot คงที่ของ Adept) ต้องกันซ้ำผ่าน
-- Layer 3 (reserved_names) แทน เหมือนที่ "I am York" ถูกกันไว้ตั้งแต่ migration 002 แล้ว
--
-- normalized_name เป็น GENERATED column (lowercase+trim+collapse-space อัตโนมัติ) — ไม่ต้อง insert
-- หลาย variant ตัวพิมพ์เล็ก/ใหญ่/เว้นวรรคเอง เพราะ validateDisplayName() normalize input ก่อนเทียบอยู่แล้ว
-- ON CONFLICT DO NOTHING กันรันซ้ำ/ชื่อไหนมีอยู่แล้วไม่ error

INSERT INTO reserved_names (name, reason) VALUES
  ('Reaper',      'Four Gods — High Noble Boss'),
  ('Crag',        'Four Gods — High Noble Boss'),
  ('Cortex',      'Four Gods — High Noble Boss'),
  ('Cipher',      'Four Gods — High Noble Boss'),
  ('Monarch',     'High Noble secret Boss'),
  ('Iron Wall',   'Nine Sentinels — Mastermind Boss'),
  ('Chivalry',    'Nine Sentinels — Mastermind Boss'),
  ('War Lord',    'Nine Sentinels — Mastermind Boss'),
  ('Phantom',     'Nine Sentinels — Mastermind Boss'),
  ('Dark Shark',  'Nine Sentinels — Mastermind Boss'),
  ('Oracle',      'Nine Sentinels — Mastermind Boss'),
  ('Jester',      'Nine Sentinels — Mastermind Boss'),
  ('Phoenix',     'Nine Sentinels — Mastermind Boss'),
  ('Black Magic', 'Nine Sentinels — Mastermind Boss'),
  ('Uncle York',  'Founder persona name'),
  ('The Sage',    'Adept fixed Bot'),
  ('The Ghost',   'Adept fixed Bot'),
  ('The Rokket',  'Adept fixed Bot')
ON CONFLICT (normalized_name) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- Known Bug #4: หลัง ALTER TABLE ต้องรัน NOTIFY เสมอ ให้ PostgREST reload schema
-- (ไฟล์นี้ไม่มี ALTER TABLE จริง แต่ใส่ไว้ตามธรรมเนียมเดิม ปลอดภัยรันซ้ำได้)
-- ─────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
