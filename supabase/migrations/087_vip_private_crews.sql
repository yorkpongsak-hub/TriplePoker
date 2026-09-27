-- VIP Private Crew Table: points-only social sessions. No economy columns or RPCs.
CREATE TABLE IF NOT EXISTS vip_private_crews (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vip_private_crew_members (
  owner_id uuid NOT NULL REFERENCES vip_private_crews(owner_id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, player_id),
  CHECK (owner_id <> player_id)
);
CREATE INDEX IF NOT EXISTS vip_private_crew_members_player_idx ON vip_private_crew_members(player_id);

CREATE TABLE IF NOT EXISTS vip_private_crew_invites (
  token_hash text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES vip_private_crews(owner_id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vip_private_crew_sessions (
  session_id text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES vip_private_crews(owner_id) ON DELETE RESTRICT,
  phase text NOT NULL CHECK (phase IN ('WAITING_FOR_DEAL','ARRANGING','REVEALING','ENDED')),
  state jsonb NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS vip_private_crew_one_active_owner_idx
  ON vip_private_crew_sessions(owner_id) WHERE phase <> 'ENDED';

CREATE TABLE IF NOT EXISTS vip_private_crew_match_results (
  session_id text NOT NULL REFERENCES vip_private_crew_sessions(session_id) ON DELETE CASCADE,
  match_number integer NOT NULL CHECK (match_number > 0),
  result jsonb NOT NULL,
  completed_at timestamptz NOT NULL,
  PRIMARY KEY (session_id, match_number)
);

CREATE TABLE IF NOT EXISTS vip_private_crew_score_ledger (
  session_id text NOT NULL REFERENCES vip_private_crew_sessions(session_id) ON DELETE CASCADE,
  match_number integer NOT NULL,
  player_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  points integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, match_number, player_id),
  FOREIGN KEY (session_id, match_number) REFERENCES vip_private_crew_match_results(session_id, match_number) ON DELETE CASCADE
);

ALTER TABLE vip_private_crews ENABLE ROW LEVEL SECURITY;
ALTER TABLE vip_private_crew_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE vip_private_crew_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE vip_private_crew_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vip_private_crew_match_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE vip_private_crew_score_ledger ENABLE ROW LEVEL SECURITY;

-- Writes and PIN/session state are intentionally service-role only. Owners may
-- inspect their crew membership; participants receive session projections over
-- authenticated sockets and never read another player's private cards from DB.
CREATE POLICY vip_private_crews_owner_read ON vip_private_crews FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY vip_private_crew_members_owner_read ON vip_private_crew_members FOR SELECT USING (auth.uid() = owner_id);

CREATE OR REPLACE FUNCTION accept_vip_private_crew_invite(
  p_token_hash text,
  p_player_id uuid,
  p_display_name text,
  p_now timestamptz DEFAULT now()
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner_id uuid;
  v_count integer;
BEGIN
  SELECT owner_id INTO v_owner_id
  FROM vip_private_crew_invites
  WHERE token_hash = p_token_hash AND accepted_at IS NULL AND expires_at >= p_now
  FOR UPDATE;
  IF v_owner_id IS NULL THEN RAISE EXCEPTION 'INVITE_INVALID_OR_EXPIRED'; END IF;
  IF v_owner_id = p_player_id THEN RAISE EXCEPTION 'OWNER_IS_IMPLICIT_MEMBER'; END IF;
  SELECT count(*) INTO v_count FROM vip_private_crew_members WHERE owner_id = v_owner_id;
  IF v_count >= 10 THEN RAISE EXCEPTION 'CREW_FULL'; END IF;
  INSERT INTO vip_private_crew_members(owner_id, player_id, display_name, added_at)
  VALUES (v_owner_id, p_player_id, p_display_name, p_now)
  ON CONFLICT (owner_id, player_id) DO UPDATE SET display_name = EXCLUDED.display_name;
  UPDATE vip_private_crew_invites SET accepted_by = p_player_id, accepted_at = p_now WHERE token_hash = p_token_hash;
  RETURN v_owner_id;
END;
$$;
REVOKE ALL ON FUNCTION accept_vip_private_crew_invite(text,uuid,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION accept_vip_private_crew_invite(text,uuid,text,timestamptz) TO service_role;
