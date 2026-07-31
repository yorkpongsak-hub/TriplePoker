-- TriplePoker — Royal Relic Collection (Monarch v2.2 Batch 3D)
-- รันไฟล์นี้บน Supabase SQL Editor (dashboard) เอง — ห้าม execute อัตโนมัติ
--
-- เก็บ Royal Relic ที่ผู้เล่นเก็บได้จากการชนะ Monarch — jsonb array ของ relicId string
-- เช่น ["blank_crest", "refused_crown"] ไม่ซ้ำกัน dedup ที่ฝั่ง server ก่อน update เสมอ
-- (pattern เดียวกับ conquered_sentinels — ดู 005_nine_sentinels.sql)
-- อ่าน/เขียนที่ server/src/game/monarchSpawn.ts (rollAndRecordMonarchRelic) เสมอด้วย
-- .eq('user_id', ...) ตาม Known Bug #3

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS monarch_relics JSONB NOT NULL DEFAULT '[]';

COMMENT ON COLUMN users.monarch_relics IS
  'Royal Relic ที่ผู้เล่นเก็บได้จากการชนะ Monarch — jsonb array ของ relicId string ไม่ซ้ำกัน (pool MVP 6 ชิ้น: blank_crest/refused_crown/zero_mark/monarchs_witness/the_unbowed/faceless_joker), dedup ที่ฝั่ง server ก่อน update เสมอ';

-- ─────────────────────────────────────────────────────────────────────────
-- Known Bug #4: หลัง ALTER TABLE ต้องรัน NOTIFY เสมอ ให้ PostgREST reload schema
-- ─────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
