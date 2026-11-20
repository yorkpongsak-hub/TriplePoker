CREATE OR REPLACE FUNCTION public.add_tier_d_mini_tournament_points(p_tournament_id uuid,p_user_id text,p_points integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE changed integer;
BEGIN
  UPDATE public.tier_d_mini_tournament_entries e SET points=e.points+GREATEST(0,p_points),updated_at=now()
  FROM public.tier_d_mini_tournaments t
  WHERE e.tournament_id=p_tournament_id AND e.user_id=p_user_id AND t.id=e.tournament_id AND t.status='OPEN' AND t.end_at>now();
  GET DIAGNOSTICS changed=ROW_COUNT; RETURN changed=1;
END $$;
REVOKE ALL ON FUNCTION public.add_tier_d_mini_tournament_points(uuid,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_tier_d_mini_tournament_points(uuid,text,integer) TO service_role;
