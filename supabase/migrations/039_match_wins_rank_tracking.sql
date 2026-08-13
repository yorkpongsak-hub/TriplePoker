-- TriplePoker — Top10 Leaderboard rank tracking (มติลุงเยาะ 2026-08-13)
-- รันไฟล์นี้บน Supabase SQL Editor (dashboard) เอง — ห้าม execute อัตโนมัติ
--
-- เพิ่ม 2 คอลัมน์บน match_wins ที่มีอยู่แล้ว (ดู 009_match_wins.sql) — เก็บ "อันดับก่อน/หลัง"
-- ของผู้เล่นในแท็บ Top10 (C/B/A/A+) เฉพาะแถวที่เป็นสถิติดีที่สุดใหม่ของผู้เล่นคนนั้นและติด
-- Top 10 เท่านั้น (คำนวณครั้งเดียวตอน INSERT ใน matchWinsService.ts ไม่ใช่คำนวณสดตอนโหลดหน้า)
-- NULL ทั้งคู่ = แถวนี้ไม่ใช่สถิติที่ทำให้อันดับเปลี่ยน (ไม่ต้องโชว์ badge)

ALTER TABLE match_wins ADD COLUMN IF NOT EXISTS rank_before SMALLINT;
ALTER TABLE match_wins ADD COLUMN IF NOT EXISTS rank_after SMALLINT;

COMMENT ON COLUMN match_wins.rank_before IS
  'อันดับ Top10 (per tier, จัดจาก personal-best tokens_won) ของผู้เล่นก่อนแมตช์นี้ — NULL ถ้ายังไม่เคยติดอันดับ หรือแถวนี้ไม่ใช่สถิติใหม่ที่ทำให้อันดับเปลี่ยน';
COMMENT ON COLUMN match_wins.rank_after IS
  'อันดับ Top10 ของผู้เล่นหลังแมตช์นี้ — มีค่าเฉพาะแถวที่เป็นสถิติที่ดีที่สุดใหม่และติด Top 10 (1-10) เท่านั้น';

-- เร่ง computeRank() (ต้อง SELECT ทุกแถวของ tier เดียวกัน sort ตาม tokens_won) และ query ของหน้า
-- Top10 endpoint (GET /stats/top10) ที่ pattern เดียวกันทุกประการ
CREATE INDEX IF NOT EXISTS idx_match_wins_tier_tokens_won ON match_wins (tier, tokens_won DESC);

-- Known Bug #4: หลัง ALTER TABLE ต้องรัน NOTIFY เสมอ ให้ PostgREST reload schema
NOTIFY pgrst, 'reload schema';
