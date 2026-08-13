-- TriplePoker: Rise - users.token_balance default 3000 -> 0
-- Run manually in Supabase SQL Editor.
--
-- Central Economy Ledger Phase 7 Round 8 (Welcome Bonus). Today's starting 3,000 Token comes purely
-- from this column's DEFAULT (003_starting_token_3000.sql), set by the Supabase Auth signup trigger
-- (not committed to this repo) — completely invisible to the ledger. Every signup ever has silently
-- drifted economy_reconciliation()'s TOKEN actual_supply away from expected_supply by 3,000.
--
-- Fix (paired with a code change in server/src/routes/auth.ts's POST /auth/register): the signup
-- trigger keeps creating the row (now starting at 0 Token), and POST /auth/register mints the
-- 3,000 Welcome Bonus through economyService.mint() right after the row is confirmed to exist —
-- a real, ledger-tracked, idempotent (per user_id) grant, closing this gap for every future signup.
--
-- Only affects NEW inserts — does not touch any existing user's current token_balance.

ALTER TABLE users ALTER COLUMN token_balance SET DEFAULT 0;

NOTIFY pgrst, 'reload schema';
