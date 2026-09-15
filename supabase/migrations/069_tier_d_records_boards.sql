-- Public Tier D record boards need a durable best clear per player and level.
CREATE TABLE IF NOT EXISTS public.tier_d_level_personal_bests (
  user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  level integer NOT NULL CHECK (level >= 1),
  elapsed_ms integer NOT NULL CHECK (elapsed_ms >= 0),
  achieved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, level)
);
CREATE INDEX IF NOT EXISTS tier_d_level_personal_bests_time_idx ON public.tier_d_level_personal_bests (elapsed_ms, achieved_at);
CREATE INDEX IF NOT EXISTS tier_d_level_personal_bests_level_time_idx ON public.tier_d_level_personal_bests (level, elapsed_ms, achieved_at);

CREATE OR REPLACE FUNCTION public.record_tier_d_level_clear_time(p_user_id uuid, p_level integer, p_elapsed_ms integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result integer;
BEGIN
  IF p_level < 1 OR p_elapsed_ms < 0 THEN RAISE EXCEPTION 'INVALID_RECORD'; END IF;
  INSERT INTO public.tier_d_level_personal_bests (user_id, level, elapsed_ms, achieved_at)
  VALUES (p_user_id, p_level, p_elapsed_ms, now())
  ON CONFLICT (user_id, level) DO UPDATE SET elapsed_ms = EXCLUDED.elapsed_ms, achieved_at = EXCLUDED.achieved_at
  WHERE EXCLUDED.elapsed_ms < public.tier_d_level_personal_bests.elapsed_ms;
  UPDATE public.users SET tier_d_best_level_clear_time_ms = CASE
    WHEN tier_d_best_level_clear_time_ms IS NULL OR p_elapsed_ms < tier_d_best_level_clear_time_ms THEN p_elapsed_ms
    ELSE tier_d_best_level_clear_time_ms END
  WHERE user_id = p_user_id RETURNING tier_d_best_level_clear_time_ms INTO result;
  RETURN result;
END; $$;

REVOKE ALL ON TABLE public.tier_d_level_personal_bests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_tier_d_level_clear_time(uuid,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_tier_d_level_clear_time(uuid,integer,integer) TO service_role;
NOTIFY pgrst, 'reload schema';
