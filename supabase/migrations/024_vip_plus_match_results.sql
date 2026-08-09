-- VIP Plus five-player match audit metrics.
-- Feature activation remains controlled by the disabled-by-default server flag.

CREATE TABLE IF NOT EXISTS public.vip_plus_match_results (
  room_id text NOT NULL,
  player_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seat text NOT NULL CHECK (seat IN ('H1', 'H2', 'H3', 'H4', 'H5')),
  wager_option text NOT NULL CHECK (wager_option IN ('INITIATE_WAGER', 'ADEPT_WAGER', 'MASTERMIND_WAGER')),
  net_token integer NOT NULL,
  total_group_wins integer NOT NULL CHECK (total_group_wins >= 0),
  g3_wins integer NOT NULL CHECK (g3_wins >= 0),
  final_stack integer NOT NULL,
  final_rank integer NOT NULL CHECK (final_rank BETWEEN 1 AND 5),
  is_joint_winner boolean NOT NULL DEFAULT false,
  auction_burn_total integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, player_id)
);

ALTER TABLE public.vip_plus_match_results ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS vip_plus_match_results_player_created_idx
  ON public.vip_plus_match_results (player_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
