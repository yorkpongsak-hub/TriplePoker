ALTER TABLE public.users ADD COLUMN IF NOT EXISTS tier_d_table_play_unlocked_at timestamptz;
CREATE TABLE IF NOT EXISTS public.tier_d_milestone_history (user_id uuid NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE, milestone_key text NOT NULL, token_reward integer NOT NULL, granted_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,milestone_key));
ALTER TABLE public.tier_d_milestone_history ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public.tier_d_milestone_history FROM anon, authenticated; GRANT ALL ON public.tier_d_milestone_history TO service_role;
NOTIFY pgrst, 'reload schema';
