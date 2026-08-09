import fs from 'fs'
import path from 'path'

const migrationPath = path.resolve(__dirname, '../../../supabase/migrations/017_sovereign_foundation.sql')
const sql = fs.readFileSync(migrationPath, 'utf8')

describe('Arena Gate 10 Sovereign migration contract', () => {
  test('is a manual additive migration and keeps public tables behind RLS', () => {
    expect(sql).toContain('do not execute automatically')
    expect(sql).toContain('ALTER TABLE sovereign_cycles ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('ALTER TABLE sovereign_public_events ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'")
  })

  test('stores deterministic MSS and prevents duplicate monthly seats', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS sovereign_mss_entries')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS sovereign_ranking_snapshots')
    expect(sql).toContain('ON sovereign_seats(cycle_id, selected_user_id)')
    expect(sql).toContain('UNIQUE (cycle_id, match_id, user_id)')
  })

  test('tracks mixed-source Crown reservations without rake', () => {
    expect(sql).toContain('earned_crest INTEGER NOT NULL')
    expect(sql).toContain('purchased_crest INTEGER NOT NULL')
    expect(sql).toContain('CHECK (total_crest = earned_crest + purchased_crest)')
    expect(sql).toContain('required_reservation_crest INTEGER NOT NULL DEFAULT 360')
  })

  test('reserves CAELUM and permits only one active append-only reign', () => {
    expect(sql).toContain("VALUES ('CAELUM')")
    expect(sql).toContain('last_boss_single_active_reign_idx')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS last_boss_mandatory_renames')
    expect(sql).toContain('UNIQUE (normalized_throne_name)')
  })

  test('enforces delayed spectator persistence and 90-day review retention', () => {
    expect(sql).toContain("visible_at >= occurred_at + INTERVAL '30 seconds'")
    expect(sql).toContain("retain_until >= occurred_at + INTERVAL '90 days'")
    expect(sql).toContain('spectator_capacity INTEGER NOT NULL DEFAULT 100')
  })
})
