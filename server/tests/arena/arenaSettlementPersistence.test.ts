const mockRpc = jest.fn()
const mockUpsert = jest.fn()
const mockFrom = jest.fn(() => ({ upsert: mockUpsert }))

jest.mock('../../src/config/supabase', () => ({
  supabaseAdmin: { rpc: mockRpc, from: mockFrom },
}))

import { ArenaSettlementPersistence } from '../../src/arena/settlement/arenaSettlementPersistence'

describe('Gate 6 - settlement persistence boundary', () => {
  beforeEach(() => {
    mockRpc.mockReset()
    mockUpsert.mockReset()
    mockFrom.mockClear()
  })

  test('ส่งเฉพาะ Human persisted entries เข้า atomic DB batch', async () => {
    mockRpc.mockResolvedValue({ data: [{ user_id: 'human-id', total_crest: 97 }], error: null })
    const persistence = new ArenaSettlementPersistence()
    const result = await persistence.persistTransaction('m1', {
      commandId: 'm1:g1:ante:p1',
      reason: 'ANTE',
      entries: [
        { userId: 'human-id', deltaCrest: -3, persisted: true },
        { userId: 'ai:REAPER', deltaCrest: -3, persisted: false },
      ],
      potDeltaCrest: { 1: 6 },
      battleRewardsDeltaCrest: 0,
      crownSinkDeltaCrest: 0,
    })
    expect(mockRpc).toHaveBeenCalledWith('arena_apply_crest_batch', expect.objectContaining({
      p_transaction_key: 'm1:g1:ante:p1',
      p_entries: [{ userId: 'human-id', deltaCrest: -3 }],
    }))
    expect(result).toEqual([{ userId: 'human-id', totalCrest: 97 }])
  })

  test('Match Log ใช้ insert-once semantics ไม่เขียนทับ log เดิม', async () => {
    mockUpsert.mockResolvedValue({ error: null })
    const persistence = new ArenaSettlementPersistence()
    await persistence.persistMatchLog('m1', [{ sequence: 1, at: 1, kind: 'PHASE_CHANGED', phase: 'MATCH_RESULT' }], { winner: 'p1' })
    expect(mockFrom).toHaveBeenCalledWith('arena_match_logs')
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ match_id: 'm1' }), {
      onConflict: 'match_id', ignoreDuplicates: true,
    })
  })
})
