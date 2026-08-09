-- TriplePoker — Merch Shop (เสื้อ/ถ้วย/เหรียญรางวัลจริง จ่ายด้วย Earned Crown, gate ตาม Tier)
-- รันไฟล์นี้บน Supabase SQL Editor (dashboard) เอง — ห้าม execute อัตโนมัติ
--
-- มติลุงเยาะ 2026-08-04: ใช้ Earned Crown เท่านั้น (ไม่ใช่ Crown Package — ตาม Legal/Economy Rule #1
-- ที่ล็อกว่า Crown Package ใช้ได้เฉพาะ Crown Vault cosmetics เท่านั้น) จัดส่งในประเทศไทยเท่านั้น
-- ไม่มี admin panel ในโปรเจค — ลุงเยาะอัปเดตสถานะออเดอร์ (status) ตรงนี้ผ่าน Supabase Table Editor เอง
--
-- Catalog (item×tier×ราคา) เป็น config-driven อยู่ที่ server/src/config/gameConfig.ts (merchConfig)
-- ตารางนี้เก็บ snapshot ของชื่อ/ราคา ณ ตอนซื้อ ไม่ query catalog ย้อนหลัง กันราคาที่โชว์ในออเดอร์เก่าเปลี่ยนไป
-- ถ้าลุงเยาะแก้ราคาใน gameConfig.ts ทีหลัง

CREATE TABLE IF NOT EXISTS merch_orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

  item_key         TEXT NOT NULL,
  item_type        TEXT NOT NULL CHECK (item_type IN ('medal', 'trophy', 'shirt')),
  item_name        TEXT NOT NULL,
  tier             TEXT NOT NULL,
  price_crown      INTEGER NOT NULL CHECK (price_crown > 0),

  recipient_name   TEXT NOT NULL,
  phone            TEXT NOT NULL,
  address_line     TEXT NOT NULL,
  subdistrict      TEXT NOT NULL,
  district         TEXT NOT NULL,
  province         TEXT NOT NULL,
  postal_code      TEXT NOT NULL,

  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merch_orders_user_id ON merch_orders(user_id);

ALTER TABLE merch_orders ENABLE ROW LEVEL SECURITY;

-- No client write policy: reads/writes go through authenticated server endpoints (routes/merch.ts)
-- ซึ่งใช้ supabaseAdmin (service role, bypass RLS) เท่านั้น — ผู้เล่นไม่มีสิทธิ์เขียนตรงเข้าตารางนี้เอง

COMMENT ON TABLE merch_orders IS
  'ออเดอร์สินค้าจริง (เสื้อ/ถ้วย/เหรียญรางวัล) จ่ายด้วย Earned Crown เท่านั้น จัดส่งในประเทศไทยเท่านั้น
   ไม่มี admin panel — ลุงเยาะอัปเดตคอลัมน์ status ตรงนี้ผ่าน Supabase Table Editor เอง';

NOTIFY pgrst, 'reload schema';
