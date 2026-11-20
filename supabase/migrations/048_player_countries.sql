-- Cosmetic country representation, independent from score history and language.
CREATE TABLE IF NOT EXISTS public.player_countries (
  user_id uuid PRIMARY KEY REFERENCES public.users(user_id) ON DELETE CASCADE,
  country_code text CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  source text NOT NULL CHECK (source IN ('network','manual','hidden')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((source = 'hidden' AND country_code IS NULL) OR (source <> 'hidden' AND country_code IS NOT NULL))
);
ALTER TABLE public.player_countries ENABLE ROW LEVEL SECURITY;
-- All reads/writes go through authenticated server routes / public leaderboard projection.
REVOKE ALL ON public.player_countries FROM anon, authenticated;
GRANT ALL ON public.player_countries TO service_role;
NOTIFY pgrst, 'reload schema';
