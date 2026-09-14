-- Leaderboard flags represent the language a player selected in TriplePoker,
-- not nationality or network location.
CREATE TABLE IF NOT EXISTS public.player_language_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.users(user_id) ON DELETE CASCADE,
  language_code text NOT NULL CHECK (language_code IN ('en','th','zh','ja','ko','vi','id','es','pt','fr')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.player_language_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.player_language_preferences FROM anon, authenticated;
GRANT ALL ON public.player_language_preferences TO service_role;
NOTIFY pgrst, 'reload schema';
