// ─────────────────────────────────────────────────────────────────────────────
// crownVaultService.test.ts — Unit Tests สำหรับ The Crown Vault (มติลุงเยาะ 2026-07-30)
// ครอบคลุม: Ascendant window transition (getAscendantStatus), Buy Ascendant Pass
// (windowed / Instant Pass / Crown ไม่พอ / ไม่ eligible), Arena Pass ทั้ง 2 เส้นทาง,
// Token→Crown Exchange atomic
// mock ascendantGate.checkAscendantEligibility + atomic purchase RPC แยกต่างหาก
// (isolate unit ของไฟล์นี้ — ไม่ทดสอบซ้ำ logic ที่ ascendantGate.test.ts คุมอยู่แล้ว)
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Mock supabase — queue-based .from() + rpc mock แยก ───────────────────────
let responseQueue: { data: any; error: any }[] = []
function nextResponse() {
  if (responseQueue.length === 0) return { data: null, error: null }
  if (responseQueue.length === 1) return responseQueue[0]
  return responseQueue.shift()!
}
function makeQueryBuilder(): any {
  const builder: any = {}
  const chain = () => builder
  builder.select = jest.fn(chain)
  builder.update = jest.fn(chain)
  builder.eq = jest.fn(chain)
  builder.single = jest.fn(chain)
  builder.then = (resolve: any, reject?: any) => Promise.resolve(nextResponse()).then(resolve, reject)
  return builder
}
const mockFrom = jest.fn(() => makeQueryBuilder())
const mockRpc = jest.fn()

jest.mock('../../src/config/supabase', () => ({
  supabase: { from: mockFrom },
  supabaseAdmin: { from: mockFrom, rpc: mockRpc },
}))

const mockCheckAscendantEligibility = jest.fn()
jest.mock('../../src/game/ascendantGate', () => ({
  checkAscendantEligibility: mockCheckAscendantEligibility,
}))

const mockConvert = jest.fn()
jest.mock('../../src/economy/economyService', () => ({
  economyService: { convert: (...args: unknown[]) => mockConvert(...args) },
}))

import {
  getAscendantStatus,
  buyAscendantPass,
  checkArenaPassEligibility,
  buyArenaPass,
  exchangeTokenToCrown,
} from '../../src/game/crownVaultService'

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

beforeEach(() => {
  responseQueue = []
  mockFrom.mockClear()
  mockRpc.mockReset()
  mockCheckAscendantEligibility.mockReset()
  mockRpc.mockResolvedValue({ data: 0, error: null })
  mockConvert.mockReset()
})

describe('getAscendantStatus', () => {
  test('status none — คืนตามเดิม ไม่ update', async () => {
    responseQueue = [{ data: { token_balance: 100, ascendant_status: { status: 'none', startedAt: null, expiresAt: null } }, error: null }]
    const result = await getAscendantStatus('u1')
    expect(result.status).toBe('none')
  })

  test('active + token >= 1M → เปลี่ยนเป็น passed ทันที (ไม่ต้องรอ 30 วัน)', async () => {
    responseQueue = [{
      data: { token_balance: 1_200_000, ascendant_status: { status: 'active', startedAt: daysAgo(5), expiresAt: daysAgo(-25) } },
      error: null,
    }, { data: null, error: null }] // update response
    const result = await getAscendantStatus('u1')
    expect(result.status).toBe('passed')
  })

  test('active + เลย expiresAt แล้ว + token < 1M → เปลี่ยนเป็น failed', async () => {
    responseQueue = [{
      data: { token_balance: 800_000, ascendant_status: { status: 'active', startedAt: daysAgo(31), expiresAt: daysAgo(1) } },
      error: null,
    }, { data: null, error: null }]
    const result = await getAscendantStatus('u1')
    expect(result.status).toBe('failed')
  })

  test('active + ยังไม่ครบ 30 วัน + token < 1M → คงเป็น active', async () => {
    responseQueue = [{
      data: { token_balance: 800_000, ascendant_status: { status: 'active', startedAt: daysAgo(5), expiresAt: daysAgo(-25) } },
      error: null,
    }]
    const result = await getAscendantStatus('u1')
    expect(result.status).toBe('active')
  })
})

describe('buyAscendantPass', () => {
  test('ไม่ eligible → NOT_ELIGIBLE, ไม่เรียก atomic purchase RPC', async () => {
    mockCheckAscendantEligibility.mockResolvedValue({ eligible: false, reason: 'TOKEN_BELOW_MIN' })
    const result = await buyAscendantPass('u1')
    expect(result).toEqual({ success: false, error: 'NOT_ELIGIBLE', errorDetail: 'TOKEN_BELOW_MIN' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  test('eligible แต่ Crown ไม่พอ → INSUFFICIENT_CROWN', async () => {
    mockCheckAscendantEligibility.mockResolvedValue({ eligible: true, reason: 'OK' })
    responseQueue = [{ data: { token_balance: 700_000 }, error: null }]
    mockRpc.mockResolvedValue({ data: null, error: { message: 'INSUFFICIENT_CREST_BALANCE' } })
    const result = await buyAscendantPass('u1')
    expect(result.success).toBe(false)
    expect(result.error).toBe('INSUFFICIENT_CROWN')
  })

  test('eligible + Crown พอ + token < 1M → เปิด window 30 วัน (active)', async () => {
    mockCheckAscendantEligibility.mockResolvedValue({ eligible: true, reason: 'OK' })
    responseQueue = [{ data: { token_balance: 700_000 }, error: null }]
    const result = await buyAscendantPass('u1')
    expect(result.success).toBe(true)
    expect(result.status?.status).toBe('active')
    expect(result.status?.expiresAt).not.toBeNull()
    expect(mockRpc).toHaveBeenCalledWith('purchase_ascendant_pass_atomic', expect.objectContaining({
      p_user_id: 'u1', p_price_crest: 240,
    }))
  })

  test('eligible + Crown พอ + token >= 1M → Instant Pass (passed ทันที)', async () => {
    mockCheckAscendantEligibility.mockResolvedValue({ eligible: true, reason: 'OK' })
    responseQueue = [{ data: { token_balance: 1_500_000 }, error: null }]
    const result = await buyAscendantPass('u1')
    expect(result.success).toBe(true)
    expect(result.status?.status).toBe('passed')
  })
})

describe('checkArenaPassEligibility', () => {
  // Gate 10.7 retires every legacy eligibility path; retained cases prove none can charge/unlock.
  test('ascendant_status passed → eligible ผ่านทาง Ascendant', async () => {
    responseQueue = [{
      data: { token_balance: 900_000, created_at: daysAgo(10), ascendant_status: { status: 'passed', startedAt: null, expiresAt: null } },
      error: null,
    }]
    const result = await checkArenaPassEligibility('u1')
    expect(result).toEqual({ eligible: false, viaAscendant: false })
  })

  test('เส้นทางสำรอง: token >= 1M + account age >= 180 วัน → eligible', async () => {
    responseQueue = [{
      data: { token_balance: 1_000_000, created_at: daysAgo(200), ascendant_status: { status: 'none', startedAt: null, expiresAt: null } },
      error: null,
    }]
    const result = await checkArenaPassEligibility('u1')
    expect(result).toEqual({ eligible: false, viaAscendant: false })
  })

  test('token >= 1M แต่ account อายุยังไม่ถึง 180 วัน → ไม่ eligible', async () => {
    responseQueue = [{
      data: { token_balance: 1_000_000, created_at: daysAgo(30), ascendant_status: { status: 'none', startedAt: null, expiresAt: null } },
      error: null,
    }]
    const result = await checkArenaPassEligibility('u1')
    expect(result).toEqual({ eligible: false, viaAscendant: false })
  })
})

describe('buyArenaPass', () => {
  test('ปลดล็อกไปแล้ว → ALREADY_UNLOCKED', async () => {
    responseQueue = [{ data: { arena_unlocked: true }, error: null }]
    const result = await buyArenaPass('u1')
    expect(result).toEqual({ success: false, error: 'NOT_ELIGIBLE' })
  })

  test('ไม่ eligible → NOT_ELIGIBLE', async () => {
    responseQueue = [
      { data: { arena_unlocked: false }, error: null },
      { data: { token_balance: 100, created_at: daysAgo(1), ascendant_status: { status: 'none', startedAt: null, expiresAt: null } }, error: null },
    ]
    const result = await buyArenaPass('u1')
    expect(result).toEqual({ success: false, error: 'NOT_ELIGIBLE' })
  })

  test('eligible แต่ Crown ไม่พอ → INSUFFICIENT_CROWN', async () => {
    responseQueue = [
      { data: { arena_unlocked: false }, error: null },
      { data: { token_balance: 1_000_000, created_at: daysAgo(200), ascendant_status: { status: 'none', startedAt: null, expiresAt: null } }, error: null },
    ]
    const result = await buyArenaPass('u1')
    expect(result).toEqual({ success: false, error: 'NOT_ELIGIBLE' })
  })

  test('eligible + Crown พอ → สำเร็จ ตั้ง arena_unlocked = true', async () => {
    responseQueue = [
      { data: { arena_unlocked: false }, error: null },
      { data: { token_balance: 1_000_000, created_at: daysAgo(200), ascendant_status: { status: 'none', startedAt: null, expiresAt: null } }, error: null },
      { data: null, error: null }, // update response
    ]
    const result = await buyArenaPass('u1')
    expect(result).toEqual({ success: false, error: 'NOT_ELIGIBLE' })
    expect(mockRpc).not.toHaveBeenCalled()
  })
})

describe('exchangeTokenToCrown — Central Economy Ledger Phase 7 Round 7 (economyService.convert)', () => {
  test('ยังไม่ถึง HighNoble → TIER_REQUIRED, ไม่เรียก convert', async () => {
    responseQueue = [{ data: { tier_unlocked_max: 'mastermind' }, error: null }]
    const result = await exchangeTokenToCrown('u1', 10)
    expect(result).toEqual({ success: false, error: 'TIER_REQUIRED' })
    expect(mockConvert).not.toHaveBeenCalled()
  })

  test('ถึง HighNoble แล้ว + token พอ → แลกสำเร็จ atomic ผ่าน Ledger (burn TOKEN + mint CREST wallet EARNED)', async () => {
    responseQueue = [
      { data: { tier_unlocked_max: 'highNoble' }, error: null }, // tier check
      { data: { token_balance: 900_000, crown_balance: 10 }, error: null }, // post-convert re-read
    ]
    mockConvert.mockResolvedValue({ transactionId: 1, replayed: false })
    const result = await exchangeTokenToCrown('u1', 10, 'req-123')
    expect(result).toEqual({ success: true, newTokenBalance: 900_000, newCrownBalance: 10 })
    expect(mockConvert).toHaveBeenCalledWith(expect.objectContaining({
      account: { accountType: 'PLAYER', accountId: 'u1' },
      from: { currency: 'TOKEN', amount: 50_000 },
      to: { currency: 'CREST', amount: 120, wallet: 'EARNED' }, // 10 Crown * 12 Crest/Crown
      reason: 'TOKEN_TO_CROWN',
      idempotencyKey: 'TOKEN_TO_CROWN:u1:req-123',
    }))
  })

  test('token ไม่พอ → INSUFFICIENT_TOKENS', async () => {
    responseQueue = [{ data: { tier_unlocked_max: 'highNoble' }, error: null }]
    mockConvert.mockRejectedValue(new Error('INSUFFICIENT_TOKEN_BALANCE'))
    const result = await exchangeTokenToCrown('u1', 999)
    expect(result).toEqual({ success: false, error: 'INSUFFICIENT_TOKENS' })
  })
})
