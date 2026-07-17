-- ============================================================
-- match_escrow — TriplePoker_BuyIn_Spec_v1_0.md Section 4
-- รันเองบน Supabase Dashboard (SQL Editor) — ห้าม server execute ตรง
-- ============================================================

CREATE TABLE IF NOT EXISTS public.match_escrow (
  escrow_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.users(user_id),
  -- room_id: เพิ่มจากคอลัมน์ที่ Spec §4 ระบุไว้ — จำเป็นเพื่อผูก escrow row กับแมตช์ที่ถูกต้อง
  -- (server crash recovery ต้องรู้ว่า escrow status='in_match' นี้เป็นของห้องไหน)
  room_id       text NOT NULL,
  tier          text NOT NULL,
  buyin_amount  integer NOT NULL,
  status        text NOT NULL DEFAULT 'in_match' CHECK (status IN ('in_match', 'settled', 'refunded')),
  final_stack   integer,
  created_at    timestamptz NOT NULL DEFAULT now(),
  settled_at    timestamptz
);

-- หา escrow ที่ยังค้าง in_match ของ user คนหนึ่ง (recovery / debug)
CREATE INDEX IF NOT EXISTS idx_match_escrow_user_status ON public.match_escrow(user_id, status);
-- หา escrow ทั้งหมดของห้องหนึ่ง
CREATE INDEX IF NOT EXISTS idx_match_escrow_room ON public.match_escrow(room_id);

NOTIFY pgrst, 'reload schema';
