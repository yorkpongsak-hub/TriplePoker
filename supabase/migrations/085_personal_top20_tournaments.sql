ALTER TABLE public.tier_d_mini_tournaments
  ADD COLUMN IF NOT EXISTS last_seen_rank integer,
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS final_owner_rank integer;

ALTER TABLE public.tier_d_mini_tournament_entries
  ADD COLUMN IF NOT EXISTS baseline_score bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_score bigint,
  ADD COLUMN IF NOT EXISTS mock_update_slot integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.tier_d_personal_tournament_rolls (
  user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  level integer NOT NULL CHECK(level>0),
  roll_value double precision NOT NULL CHECK(roll_value>=0 AND roll_value<1),
  triggered boolean NOT NULL,
  tournament_id uuid REFERENCES public.tier_d_mini_tournaments(id) ON DELETE SET NULL,
  rolled_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,level)
);

ALTER TABLE public.tier_d_personal_tournament_rolls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tier_d_personal_tournament_rolls FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tier_d_personal_tournament_rolls TO service_role;
CREATE INDEX IF NOT EXISTS tier_d_personal_tournament_owner_history ON public.tier_d_mini_tournaments(owner_user_id,start_at DESC);
CREATE INDEX IF NOT EXISTS tier_d_personal_tournament_real_members ON public.tier_d_mini_tournament_entries(user_id) WHERE synthetic=false;

-- Preserve the visible score of any legacy open personal event while moving it
-- from incremented entry points to authoritative lifetime-score deltas.
UPDATE public.tier_d_mini_tournament_entries e
SET baseline_score=GREATEST(0,t.total_score-e.points)
FROM public.tier_d_ranking_score_totals t, public.tier_d_mini_tournaments mt
WHERE e.tournament_id=mt.id AND mt.status='OPEN' AND e.synthetic=false
  AND e.user_id=t.user_id::text AND e.baseline_score=0;

NOTIFY pgrst, 'reload schema';
