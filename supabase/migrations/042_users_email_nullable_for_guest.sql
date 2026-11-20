-- TriplePoker: Guest Play — allow public.users.email to be NULL
--
-- Root cause of "Database error creating anonymous user" (Supabase Auth error) found live
-- 2026-08-14: the signup trigger (dashboard-managed, not in this repo) does
--   INSERT INTO public.users (user_id, email, display_name, avatar_config)
--   VALUES (NEW.id, NEW.email, 'user_' || substring(NEW.id::text FROM 1 FOR 8), NULL)
-- Anonymous sign-ins (supabase.auth.signInAnonymously()) never have an email — NEW.email is
-- NULL for them. Real (Google/dev email) signups always have one, so this never surfaced until
-- Guest Play started calling signInAnonymously(). If public.users.email is NOT NULL, that INSERT
-- throws for every anonymous signup, which Supabase Auth surfaces as this generic error.
--
-- Fix: allow NULL on email — safe, does not touch any existing row's data, and matches the
-- trigger's own already-correct handling of NULL avatar_config.
--
-- Run manually in Supabase SQL Editor.

ALTER TABLE public.users
  ALTER COLUMN email DROP NOT NULL;

NOTIFY pgrst, 'reload schema';

-- Verify: should show is_nullable = 'YES' for email now.
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'email';
