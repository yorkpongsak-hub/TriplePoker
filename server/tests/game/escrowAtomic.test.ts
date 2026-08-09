// escrowAtomic.test.ts — P0 regression tests สำหรับ RPC escrow แบบ transaction เดียว

const mockRpc = jest.fn()

function emptyQueryBuilder(): any {
  const builder: any = {}
  for (const method of ['update', 'eq', 'lt', 'select']) {
    builder[method] = jest.fn(() => builder)
  }
  builder.then = (resolve: (value: unknown) => void) => resolve({ data: [], error: null })
  return builder
}

jest.mock('../../src/config/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(() => emptyQueryBuilder()),
    rpc: mockRpc,
  },
}))

jest.mock('../../src/game/tierUnlockService', () => ({
  checkTierUnlock: jest.fn(async () => null),
}))

jest.mock('../../src/game/crownVaultService', () => ({
  getAscendantStatus: jest.fn(async () => ({ status: 'none' })),
}))

import { escrowBuyIn, settleEscrow, refundEscrow } from '../../src/game/gameLoop'
import { gameConfig } from '../../src/config/gameConfig'

describe('Atomic match escrow RPC', () => {
  beforeEach(() => mockRpc.mockReset())

  test.each([
    ['initiate', gameConfig.buyIn.initiate],
    ['adept', gameConfig.buyIn.adept],
    ['mastermind', gameConfig.buyIn.mastermind],
    ['highNoble', gameConfig.buyIn.highNoble],
  ])('begin %s ใช้ Buy-in จาก gameConfig และคืน escrow id', async (tier, buyIn) => {
    mockRpc.mockResolvedValueOnce({
      data: [{ escrow_id: `escrow-${tier}`, new_token_balance: 100_000 - buyIn }],
      error: null,
    })

    const result = await escrowBuyIn('user-1', 'room-1', tier)

    expect(result).toEqual({ ok: true, escrowId: `escrow-${tier}`, buyInAmount: buyIn })
    expect(mockRpc).toHaveBeenCalledWith('begin_match_escrow', {
      p_user_id: 'user-1',
      p_room_id: 'room-1',
      p_tier: tier,
      p_buyin_amount: buyIn,
    })
  })

  test('settle ส่ง final stack เข้า RPC atomic และใช้ยอด wallet ที่ DB คืนมา', async () => {
    mockRpc.mockResolvedValueOnce({ data: 123_456, error: null })

    await expect(settleEscrow('user-1', 'escrow-1', 1_234)).resolves.toBe(123_456)
    expect(mockRpc).toHaveBeenCalledWith('settle_match_escrow', {
      p_user_id: 'user-1',
      p_escrow_id: 'escrow-1',
      p_final_stack: 1_234,
    })
  })

  test('settle ซ้ำไม่ credit wallet ซ้ำ', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'ESCROW_NOT_ACTIVE' } })
    await expect(settleEscrow('user-1', 'escrow-1', 1_234)).resolves.toBeNull()
  })

  test('refund ใช้ยอด buy-in จาก escrow row ฝั่ง DB ไม่เชื่อค่าจาก client/server memory', async () => {
    mockRpc.mockResolvedValueOnce({ data: 100_000, error: null })
    await refundEscrow('user-1', 'escrow-1', 999_999)
    expect(mockRpc).toHaveBeenCalledWith('refund_match_escrow', {
      p_user_id: 'user-1',
      p_escrow_id: 'escrow-1',
    })
  })
})
