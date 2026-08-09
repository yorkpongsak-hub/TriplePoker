-- Atomic dual-track PS increment. Prevents lost updates when the same user
-- completes overlapping matches on different server workers.
CREATE OR REPLACE FUNCTION public.increment_performance_score(
  p_user_id UUID,
  p_delta INTEGER
)
RETURNS TABLE (performance_score INTEGER, ps_season INTEGER)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE public.users
  SET
    performance_score = performance_score + GREATEST(p_delta, 0),
    ps_season = ps_season + GREATEST(p_delta, 0)
  WHERE user_id = p_user_id
  RETURNING users.performance_score, users.ps_season;
$$;

REVOKE ALL ON FUNCTION public.increment_performance_score(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_performance_score(UUID, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.increment_performance_score(UUID, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_performance_score(UUID, INTEGER) TO service_role;
