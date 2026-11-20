CREATE TABLE IF NOT EXISTS public.tier_d_ranking_score_totals (
  user_id uuid PRIMARY KEY REFERENCES public.users(user_id) ON DELETE CASCADE,
  total_score bigint NOT NULL DEFAULT 0 CHECK (total_score >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tier_d_ranking_score_credits (
  user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  level integer NOT NULL CHECK (level > 0),
  earned_score integer NOT NULL CHECK (earned_score >= 0),
  credited_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, level)
);

ALTER TABLE public.tier_d_ranking_score_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tier_d_ranking_score_credits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tier_d_ranking_score_totals, public.tier_d_ranking_score_credits FROM anon, authenticated;
GRANT ALL ON public.tier_d_ranking_score_totals, public.tier_d_ranking_score_credits TO service_role;

-- Preserve every existing valid score. best_match_score is a conservative
-- lower bound for players whose clears happened outside competition windows.
INSERT INTO public.tier_d_ranking_score_totals(user_id,total_score)
SELECT u.user_id,
       GREATEST(COALESCE(p.competition_score,0),COALESCE(u.tier_d_best_match_score,0))
FROM public.users u
LEFT JOIN (
  SELECT user_id,SUM(league_points)::bigint AS competition_score
  FROM public.tier_d_competition_progress GROUP BY user_id
) p ON p.user_id=u.user_id
WHERE COALESCE(p.competition_score,0)>0 OR COALESCE(u.tier_d_best_match_score,0)>0
ON CONFLICT(user_id) DO UPDATE
SET total_score=GREATEST(tier_d_ranking_score_totals.total_score,EXCLUDED.total_score),updated_at=now();

CREATE OR REPLACE FUNCTION public.commit_tier_d_ranking_score(p_user_id uuid,p_level integer,p_earned_score integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE safe_score integer:=GREATEST(0,p_earned_score); previous_total bigint:=0; new_total bigint:=0; inserted_count integer:=0;
BEGIN
  INSERT INTO public.tier_d_ranking_score_totals(user_id,total_score) VALUES(p_user_id,0) ON CONFLICT(user_id) DO NOTHING;
  SELECT total_score INTO previous_total FROM public.tier_d_ranking_score_totals WHERE user_id=p_user_id FOR UPDATE;
  INSERT INTO public.tier_d_ranking_score_credits(user_id,level,earned_score) VALUES(p_user_id,p_level,safe_score) ON CONFLICT(user_id,level) DO NOTHING;
  GET DIAGNOSTICS inserted_count=ROW_COUNT;
  IF inserted_count=1 THEN
    UPDATE public.tier_d_ranking_score_totals SET total_score=total_score+safe_score,updated_at=now() WHERE user_id=p_user_id RETURNING total_score INTO new_total;
  ELSE
    new_total:=previous_total;
  END IF;
  RETURN jsonb_build_object('credited',inserted_count=1,'earnedScore',CASE WHEN inserted_count=1 THEN safe_score ELSE 0 END,'requestedScore',safe_score,'previousTotal',previous_total,'newTotal',new_total);
END; $$;

REVOKE ALL ON FUNCTION public.commit_tier_d_ranking_score(uuid,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_tier_d_ranking_score(uuid,integer,integer) TO service_role;
NOTIFY pgrst, 'reload schema';
