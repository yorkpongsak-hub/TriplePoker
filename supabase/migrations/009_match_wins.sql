-- TriplePoker — Match Win History (มติลุงเยาะ 2026-07-26)
-- รันไฟล์นี้บน Supabase SQL Editor (dashboard) เอง — ห้าม execute อัตโนมัติ
--
-- ตารางใหม่ทั้งหมด (ไม่เคยมี match history แบบ list มาก่อน — ของเดิมมีแต่ค่าสะสม
-- games_played/games_won/best_hands บน users ที่เขียนทับ ไม่ใช่ list) เก็บทุกครั้งที่ human
-- ชนะอันดับ 1 จบแมตช์เท่านั้น (ไม่นับ AI/Bot ชนะ, ไม่นับ leave กลางเกม) ไม่จำกัดจำนวน/ไม่มี
-- retention — เก็บตลอดกาลตามมติลุงเยาะ หน้า Player Profile Viewer ฝั่ง client ดึงมาโชว์แค่
-- 20 รายการล่าสุด (LIMIT ที่ query ฝั่ง server เท่านั้น ไม่ใช่ cap ที่ตารางนี้)
--
-- Insert จาก server/src/game/matchWinsService.ts เรียกจาก 4 จุด match_end เดียวกับที่
-- server_activity broadcast ใช้อยู่แล้ว (2026-07-26 patch): gameLoop.ts (Initiate solo /
-- Adept multiplayer / Mastermind) + highNobleMultiEngine.ts (High Noble)
--
-- ใช้ users(user_id) เป็น FK ตาม schema จริงบน Supabase (users.user_id คือ PK จริง — ไม่ใช่
-- users(id) ที่ migrations/001_initial_schema.sql เขียนไว้ผิด ดู comment เดียวกันใน
-- 002_name_protection.sql)

CREATE TABLE IF NOT EXISTS match_wins (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  tier            VARCHAR(20) NOT NULL,
  mode            VARCHAR(20) NOT NULL,
  won_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tokens_won      BIGINT NOT NULL DEFAULT 0,
  is_triple_sweep BOOLEAN NOT NULL DEFAULT FALSE,
  best_hand       JSONB,
  opponents       JSONB NOT NULL DEFAULT '[]'::jsonb
);

COMMENT ON TABLE match_wins IS
  'ประวัติชนะอันดับ 1 ของ human ทุกคน ทุก Tier — ไม่มี cap/retention (มติลุงเยาะ: เก็บตลอดกาล) ใช้แสดงในหน้า Player Profile Viewer (public, GET /stats/player/:userId/history)';
COMMENT ON COLUMN match_wins.mode IS
  '''solo'' = Initiate/Mastermind (1 human + AI), ''multiplayer'' = Adept/HighNoble (หลาย human ในโต๊ะเดียวกัน)';
COMMENT ON COLUMN match_wins.tokens_won IS
  'net token delta ของแมตช์นั้น (final stack ลบ buy-in ตอนต้น) ไม่ใช่ final stack เต็ม';
COMMENT ON COLUMN match_wins.best_hand IS
  'มือที่ดีที่สุดของผู้เล่นในแมตช์นี้ — shape เดียวกับ users.best_hands[tier] ({rank,label,score,cards,pile,won})';
COMMENT ON COLUMN match_wins.opponents IS
  'array คู่แข่งทั้งหมดในแมตช์นี้ (ไม่รวมผู้ชนะเอง) รูปแบบ [{name, isHuman}] ครอบคลุมทั้ง Boss/AI (solo) และ human อื่น (multiplayer) ในฟิลด์เดียว ไม่ต้องแยกคอลัมน์ตาม Tier';

-- Query pattern หลัก: ดึงประวัติล่าสุดของผู้เล่นคนเดียว เรียงเวลาล่าสุดก่อน (หน้า Player Profile LIMIT 20)
CREATE INDEX IF NOT EXISTS idx_match_wins_user_won_at ON match_wins (user_id, won_at DESC);

-- Known Bug #4: หลัง CREATE TABLE/ALTER TABLE ต้องรัน NOTIFY เสมอ ให้ PostgREST reload schema
NOTIFY pgrst, 'reload schema';
