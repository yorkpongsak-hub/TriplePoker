-- TriplePoker — Badge Shop (มติลุงเยาะ 2026-08-15)
-- รันไฟล์นี้บน Supabase SQL Editor (dashboard) เอง — ห้าม execute อัตโนมัติ
--
-- ตารางใหม่ทั้งหมด — เก็บ badge ที่ผู้เล่นซื้อแล้วผ่าน Badge Shop (แท็บ BADGES ใน Shop)
-- ซื้อได้เฉพาะ badge ที่ปลดล็อคแล้วเท่านั้น (เช็คจริงฝั่ง server ใน badgeUnlockService.ts —
-- ไม่ได้เช็คที่ตารางนี้) จ่ายด้วย Token เท่านั้น หักผ่าน RPC deduct_user_tokens เดิม
-- ราคา/เกณฑ์ปลดล็อคทั้งหมดเป็น canon อยู่ที่ server/src/game/badgeConfig.ts — ตารางนี้แค่เก็บ
-- ว่าใครเป็นเจ้าของ badge ไหนแล้ว (ซื้อครั้งเดียวเป็นเจ้าของถาวร ไม่มีวันหมดอายุ)

CREATE TABLE IF NOT EXISTS user_badges (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  badge_key     TEXT NOT NULL,
  price_paid    INTEGER NOT NULL CHECK (price_paid >= 0),
  purchased_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, badge_key)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges(user_id);

ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;

-- No client write policy: reads/writes go through server (routes/badges.ts) ซึ่งใช้ supabaseAdmin
-- (service role, bypass RLS) เท่านั้น — ผู้เล่นไม่มีสิทธิ์เขียนตรงเข้าตารางนี้เอง (pattern เดียวกับ
-- merch_orders — ดู 026_merch_orders.sql)

COMMENT ON TABLE user_badges IS
  'Badge ที่ผู้เล่นซื้อแล้วผ่าน Badge Shop — ซื้อได้เฉพาะ badge ที่ปลดล็อค (unlock condition เช็คจริง
   ใน badgeUnlockService.ts) จ่าย Token เท่านั้น เป็นเจ้าของถาวรไม่มีวันหมดอายุ price_paid เก็บ snapshot
   ราคา ณ ตอนซื้อ (กันราคาที่โชว์ในประวัติเปลี่ยนไปถ้า badgeConfig.ts แก้ราคาทีหลัง — pattern เดียวกับ
   merch_orders.price_crown)';

NOTIFY pgrst, 'reload schema';
