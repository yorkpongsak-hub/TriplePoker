-- Personal-best score from one Tier D match.  This is intentionally separate
-- from the three-match Level total used for progression and League points.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS tier_d_best_match_score integer NOT NULL DEFAULT 0
  CHECK (tier_d_best_match_score >= 0);

CREATE OR REPLACE FUNCTION public.record_tier_d_best_match_score(p_user_id uuid, p_score integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result integer;
BEGIN
  IF p_score < 0 THEN RAISE EXCEPTION 'INVALID_SCORE'; END IF;
  UPDATE public.users
  SET tier_d_best_match_score = GREATEST(tier_d_best_match_score, p_score)
  WHERE user_id = p_user_id
  RETURNING tier_d_best_match_score INTO result;
  RETURN result;
END; $$;

REVOKE ALL ON FUNCTION public.record_tier_d_best_match_score(uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_tier_d_best_match_score(uuid,integer) TO service_role;
NOTIFY pgrst, 'reload schema';
