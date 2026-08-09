export interface SovereignMatchView {
  id: string
  event_day: 'FRIDAY' | 'SATURDAY' | 'SUNDAY'
  state: string
  scheduled_standby_open_at: string
  scheduled_check_in_open_at: string
  scheduled_check_in_close_at: string
  scheduled_start_at: string
}

export interface SovereignStatusResponse {
  serverNow: string
  featureEnabled: boolean
  cycle: null | { id: string; year_month: string; status: string; confirmation_deadline_at: string }
  matches: SovereignMatchView[]
  membership: null | { pool: 'MAIN' | 'ASCENDANT'; eligibility_expires_at: string | null }
  ranking: null | { pool: string; rank: number; eligible_match_count: number; best_ten_score: number }
  seat: null | { id: string; match_id: string; seat_no: number; planned_path: string; confirmation_status: string; check_in_status: string }
  standby: null | { match_id: string; queue_sequence: number; status: string; grace_expires_at: string | null }
  mandatoryRename: null | { id: string; former_name: string; required_at: string; status: 'REQUIRED' }
  lastBoss: null | { id: string; reign_number: number; throne_name: string; started_at: string; aura_key: string; avatarKind: 'DARK_SILHOUETTE' }
  config: { spectatorDelaySeconds: 30; spectatorCapacity: 100; requiredCrown: 30 }
}

export interface SovereignArchiveResponse {
  cycles: Array<{ id: string; year_month: string; status: string; completed_at: string | null }>
  graveyard: Array<{ id: string; reign_number: number; throne_name: string; status: string; started_at: string; ended_at: string | null; conqueror_name_at_victory: string | null; conqueror_new_name: string | null; aura_key: string }>
}

export interface SovereignPublicEventWire {
  id: string
  match_id: string
  sequence: number
  event_type: string
  public_payload_json: Record<string, unknown>
  occurred_at: string
  visible_at: string
  schema_version: number
}
