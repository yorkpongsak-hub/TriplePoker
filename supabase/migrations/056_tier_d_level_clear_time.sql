-- Canon League statistic: wall-clock time from Level start through the clear
-- of Match 3. This is deliberately distinct from the legacy per-match time.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS tier_d_best_level_clear_time_ms integer;

CREATE OR REPLACE FUNCTION public.record_tier_d_level_clear_time(p_user_id uuid, p_elapsed_ms integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result integer;
BEGIN
  IF p_elapsed_ms < 0 THEN RAISE EXCEPTION 'INVALID_TIME'; END IF;
  UPDATE public.users SET tier_d_best_level_clear_time_ms = CASE
    WHEN tier_d_best_level_clear_time_ms IS NULL OR p_elapsed_ms < tier_d_best_level_clear_time_ms THEN p_elapsed_ms
    ELSE tier_d_best_level_clear_time_ms END
  WHERE user_id=p_user_id RETURNING tier_d_best_level_clear_time_ms INTO result;
  RETURN result;
END; $$;

REVOKE ALL ON FUNCTION public.record_tier_d_level_clear_time(uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_tier_d_level_clear_time(uuid,integer) TO service_role;
NOTIFY pgrst, 'reload schema';
