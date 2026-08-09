// ─────────────────────────────────────────────────────────────────────────────
// ascendantGate.test.ts — Unit Tests สำหรับ Ascendant Tier Entry Gate
// (Arena Tier S+ Canon Addendum v1.0 — token>=600k + เคยปลด highNoble + ยังไม่เคยซื้อ
// Pass มาก่อน; ไม่บังคับ Monarch Slayer และไม่มี Account Age Gate ที่นี่)
// ใช้ gameConfig/progressionGate จริง (ไม่ mock) เพราะเป็น pure config เดียวกับที่ deploy จริง
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Mock supabase — queue-based (แต่ละ .from() call ดึงค่าถัดไปจากคิว) ───────────
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
  builder.eq = jest.fn(chain)
  builder.single = jest.fn(chain)
  builder.then = (resolve: any, reject?: any) => Promise.resolve(nextResponse()).then(resolve, reject)
  return builder
}
const mockFrom = jest.fn(() => makeQueryBuilder())

jest.mock('../../src/config/supabase', () => ({
  supabase: { from: mockFrom },
}))

import { checkAscendantEligibility } from '../../src/game/ascendantGate'

const ISO_ANY = new Date().toISOString()

describe('ascendantGate.checkAscendantEligibility', () => {
  beforeEach(() => {
    responseQueue = []
    mockFrom.mockClear()
  })

  test('eligible: ครบทุกเงื่อนไข', async () => {
    responseQueue = [{
      data: {
        token_balance: 700_000,
        created_at: ISO_ANY,
        monarch_victories: 1,
        tier_unlocked_max: 'highNoble',
        ascendant_status: { status: 'none', startedAt: null, expiresAt: null },
      },
      error: null,
    }]
    const result = await checkAscendantEligibility('u1')
    expect(result).toEqual({ eligible: true, reason: 'OK' })
  })

  test('ไม่มีเพดานบน token อีกแล้ว — token เกิน 1M ก็ยัง eligible (Spec v1.1)', async () => {
    responseQueue = [{
      data: {
        token_balance: 5_000_000,
        created_at: ISO_ANY,
        monarch_victories: 1,
        tier_unlocked_max: 'highNoble',
        ascendant_status: { status: 'none', startedAt: null, expiresAt: null },
      },
      error: null,
    }]
    const result = await checkAscendantEligibility('u1')
    expect(result).toEqual({ eligible: true, reason: 'OK' })
  })

  test('TOKEN_BELOW_MIN: token < 600,000', async () => {
    responseQueue = [{
      data: {
        token_balance: 500_000,
        created_at: ISO_ANY,
        monarch_victories: 1,
        tier_unlocked_max: 'highNoble',
        ascendant_status: { status: 'none', startedAt: null, expiresAt: null },
      },
      error: null,
    }]
    const result = await checkAscendantEligibility('u1')
    expect(result).toEqual({ eligible: false, reason: 'TOKEN_BELOW_MIN' })
  })

  test('ไม่บังคับ Monarch Slayer ตาม Canon ทางลัด 30 วัน', async () => {
    responseQueue = [{
      data: {
        token_balance: 700_000,
        created_at: ISO_ANY,
        monarch_victories: 0,
        tier_unlocked_max: 'highNoble',
        ascendant_status: { status: 'none', startedAt: null, expiresAt: null },
      },
      error: null,
    }]
    const result = await checkAscendantEligibility('u1')
    expect(result).toEqual({ eligible: true, reason: 'OK' })
  })

  test('TIER_REQUIRED: ยังไม่เคยปลด highNoble (ceiling ต่ำกว่า)', async () => {
    responseQueue = [{
      data: {
        token_balance: 700_000,
        created_at: ISO_ANY,
        monarch_victories: 1,
        tier_unlocked_max: 'mastermind',
        ascendant_status: { status: 'none', startedAt: null, expiresAt: null },
      },
      error: null,
    }]
    const result = await checkAscendantEligibility('u1')
    expect(result).toEqual({ eligible: false, reason: 'TIER_REQUIRED' })
  })

  test('ALREADY_USED: เคยซื้อ Ascendant Pass มาแล้ว (ครั้งเดียวต่อบัญชี)', async () => {
    responseQueue = [{
      data: {
        token_balance: 700_000,
        created_at: ISO_ANY,
        monarch_victories: 1,
        tier_unlocked_max: 'highNoble',
        ascendant_status: { status: 'active', startedAt: ISO_ANY, expiresAt: ISO_ANY },
      },
      error: null,
    }]
    const result = await checkAscendantEligibility('u1')
    expect(result).toEqual({ eligible: false, reason: 'ALREADY_USED' })
  })

  test('USER_NOT_FOUND: query ไม่เจอ user', async () => {
    responseQueue = [{ data: null, error: null }]
    const result = await checkAscendantEligibility('nope')
    expect(result).toEqual({ eligible: false, reason: 'USER_NOT_FOUND' })
  })
})
