-- TriplePoker — Atomic Match Escrow Settlement (P0 release readiness)
-- รันไฟล์นี้บน Supabase SQL Editor (dashboard) เอง — ห้าม execute อัตโนมัติ
--
-- แก้ช่องว่างเดิมที่ server update match_escrow และ users.token_balance คนละคำสั่ง:
-- ถ้าคำสั่งที่สองล้ม escrow จะถูก mark ว่า settled แต่เงินไม่กลับ wallet และ retry ไม่ได้

CREATE TABLE IF NOT EXISTS public.match_escrow (
  escrow_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.users(user_id),
  room_id       TEXT NOT NULL,
  tier          TEXT NOT NULL,
  buyin_amount  INTEGER NOT NULL CHECK (buyin_amount > 0),
  status        TEXT NOT NULL DEFAULT 'in_match'
                CHECK (status IN ('in_match', 'settled', 'refunded')),
  final_stack   INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_match_escrow_user_status
  ON public.match_escrow(user_id, status);
CREATE INDEX IF NOT EXISTS idx_match_escrow_room
  ON public.match_escrow(room_id);

-- ต้องมี active escrow ได้ไม่เกินหนึ่งรายการต่อผู้เล่น ปิด race จากการกดเข้าโต๊ะพร้อมกันสอง client
CREATE UNIQUE INDEX IF NOT EXISTS uq_match_escrow_one_active_per_user
  ON public.match_escrow(user_id)
  WHERE status = 'in_match';

CREATE OR REPLACE FUNCTION public.begin_match_escrow(
  p_user_id UUID,
  p_room_id TEXT,
  p_tier TEXT,
  p_buyin_amount INTEGER
)
RETURNS TABLE(escrow_id UUID, new_token_balance BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_escrow_id UUID;
  v_new_balance BIGINT;
BEGIN
  IF p_buyin_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_BUYIN';
  END IF;

  UPDATE public.users
  SET token_balance = token_balance - p_buyin_amount
  WHERE user_id = p_user_id
    AND token_balance >= p_buyin_amount
  RETURNING token_balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'INSUFFICIENT_TOKENS';
  END IF;

  INSERT INTO public.match_escrow (user_id, room_id, tier, buyin_amount, status)
  VALUES (p_user_id, p_room_id, p_tier, p_buyin_amount, 'in_match')
  RETURNING match_escrow.escrow_id INTO v_escrow_id;

  RETURN QUERY SELECT v_escrow_id, v_new_balance;
EXCEPTION
  WHEN unique_violation THEN
    -- PostgreSQL rollback ทั้ง function statement อัตโนมัติ เงินที่หักด้านบนจึงไม่สูญหาย
    RAISE EXCEPTION 'ACTIVE_MATCH_EXISTS';
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_match_escrow(
  p_user_id UUID,
  p_escrow_id UUID,
  p_final_stack INTEGER
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance BIGINT;
BEGIN
  IF p_final_stack < 0 THEN
    RAISE EXCEPTION 'INVALID_FINAL_STACK';
  END IF;

  UPDATE public.match_escrow
  SET status = 'settled',
      final_stack = p_final_stack,
      settled_at = now()
  WHERE escrow_id = p_escrow_id
    AND user_id = p_user_id
    AND status = 'in_match';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ESCROW_NOT_ACTIVE';
  END IF;

  UPDATE public.users
  SET token_balance = token_balance + p_final_stack
  WHERE user_id = p_user_id
  RETURNING token_balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;

  RETURN v_new_balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_match_escrow(
  p_user_id UUID,
  p_escrow_id UUID
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_buyin INTEGER;
  v_new_balance BIGINT;
BEGIN
  UPDATE public.match_escrow
  SET status = 'refunded',
      settled_at = now()
  WHERE escrow_id = p_escrow_id
    AND user_id = p_user_id
    AND status = 'in_match'
  RETURNING buyin_amount INTO v_buyin;

  IF v_buyin IS NULL THEN
    RAISE EXCEPTION 'ESCROW_NOT_ACTIVE';
  END IF;

  UPDATE public.users
  SET token_balance = token_balance + v_buyin
  WHERE user_id = p_user_id
  RETURNING token_balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;

  RETURN v_new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_match_escrow(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settle_match_escrow(UUID, UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refund_match_escrow(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.begin_match_escrow(UUID, TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_match_escrow(UUID, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_match_escrow(UUID, UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
