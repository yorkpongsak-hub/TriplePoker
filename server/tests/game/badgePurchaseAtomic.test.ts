const mockRpc = jest.fn()

const userRow = {
  tier_unlocked_max: 'initiate', ascendant_status: { status: 'none' },
  monarch_victories: 0, streak_7days_badge: false, crown_balance: 0,
}

function queryResult(data: any) {
  const builder: any = {
    select: jest.fn(() => builder), eq: jest.fn(() => builder),
    single: jest.fn(() => Promise.resolve({ data, error: null })),
    then: (resolve: any, reject?: any) => Promise.resolve({ data, error: null }).then(resolve, reject),
  }
  return builder
}

const mockFrom = jest.fn((table: string) => queryResult(table === 'users' ? userRow : []))

jest.mock('../../src/config/supabase', () => ({
  supabaseAdmin: { from: mockFrom, rpc: mockRpc },
}))

import { buyBadge } from '../../src/game/badgeUnlockService'

beforeEach(() => {
  mockFrom.mockClear()
  mockRpc.mockReset().mockResolvedValue({ data: 9000, error: null })
})

describe('buyBadge — atomic Central Economy purchase', () => {
  test('ซื้อ badge ผ่าน purchase_badge_atomic RPC ครั้งเดียว', async () => {
    const result = await buyBadge('user-1', 'initiate')
    expect(result).toEqual({ success: true, newBalance: 9000 })
    expect(mockRpc).toHaveBeenCalledWith('purchase_badge_atomic', {
      p_user_id: 'user-1', p_badge_key: 'initiate', p_price: 1000,
    })
  })

  test('RPC ปฏิเสธยอดไม่พอโดยไม่ทำ client-side rollback หลายขั้น', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'INSUFFICIENT_TOKEN_BALANCE' } })
    expect(await buyBadge('user-1', 'initiate')).toEqual({ success: false, error: 'INSUFFICIENT_TOKENS' })
  })

  test('คำขอซื้อซ้ำคืน ALREADY_OWNED', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'ALREADY_OWNED' } })
    expect(await buyBadge('user-1', 'initiate')).toEqual({ success: false, error: 'ALREADY_OWNED' })
  })
})
