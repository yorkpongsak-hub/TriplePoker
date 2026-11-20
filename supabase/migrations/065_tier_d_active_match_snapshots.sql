-- Durable recovery point for an unfinished Tier D Solo level.  The server is
-- the only reader/writer; clients never receive or submit a raw snapshot.
CREATE TABLE IF NOT EXISTS public.tier_d_active_match_snapshots (
  user_id uuid PRIMARY KEY REFERENCES public.users(user_id) ON DELETE CASCADE,
  room_id text NOT NULL,
  snapshot jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tier_d_active_match_snapshots_updated_idx
  ON public.tier_d_active_match_snapshots (updated_at);

ALTER TABLE public.tier_d_active_match_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tier_d_active_match_snapshots FROM anon, authenticated;
GRANT ALL ON public.tier_d_active_match_snapshots TO service_role;

NOTIFY pgrst, 'reload schema';
