import fs from 'fs'
import path from 'path'

const mockRpc = jest.fn()
jest.mock('../../src/config/supabase', () => ({ supabaseAdmin: { rpc: (...args: any[]) => mockRpc(...args) } }))
import { finalizeTierDLeagueAfterLevelWin } from '../../src/game/tierDLeaderboardService'

describe('Tier D League finalization migration', () => {
  const sql = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/050_tier_d_league_leaderboard.sql'), 'utf8')
  test('serializes same-League finalizations and makes retries idempotent', () => {
    expect(sql).toContain('pg_advisory_xact_lock(hashtext(p_league_id))')
    expect(sql).toContain('PRIMARY KEY (user_id, league_id)')
    expect(sql).toContain('IF FOUND THEN RETURN')
  })
  test('persists status/history and assigns trophies only to ranks 1–3', () => {
    expect(sql).toContain('tier_d_league_finalizations')
    expect(sql).toContain('finalized_at = now()')
    expect(sql).toContain('reward_eligible = assigned_rank <= 3')
    expect(sql).toContain('assigned_rank <= 3')
  })
  test('keeps tables private and includes leaderboard indexes', () => {
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('GRANT ALL ON public.tier_d_league_progress, public.tier_d_league_finalizations TO service_role')
    expect(sql).toContain('tier_d_league_progress_snapshot_idx')
  })
  test('only a successful League final-level settlement dispatches finalization', async () => {
    mockRpc.mockReset()
    await expect(finalizeTierDLeagueAfterLevelWin('u1', 49, 30)).resolves.toBeNull()
    expect(mockRpc).not.toHaveBeenCalled()
    mockRpc.mockResolvedValueOnce({ data: { finalRank: 1 }, error: null }).mockResolvedValueOnce({ data: { medalGranted: true }, error: null })
    await expect(finalizeTierDLeagueAfterLevelWin('u1', 50, 40)).resolves.toEqual({ finalRank: 1 })
    expect(mockRpc).toHaveBeenCalledWith('finalize_tier_d_league', { p_user_id: 'u1', p_league_id: 'tier-d-league-1', p_final_level: 50, p_final_points: 40 })
    expect(mockRpc).toHaveBeenCalledWith('grant_tier_d_league_awards', { p_user_id: 'u1', p_league_id: 'tier-d-league-1' })
  })
})
