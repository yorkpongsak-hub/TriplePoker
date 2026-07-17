// ─────────────────────────────────────────────────────────────────────────────
// psEngine.test.ts — Unit Tests สำหรับ psEngine (Monarch_Spec_v1_3 §4 — Dual-Track PS)
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────

let mockResolvedValue: { data: any; error: any } = { data: null, error: null }
function makeQueryBuilder(): any {
  const builder: any = {}
  const chain = () => builder
  builder.select = jest.fn(chain)
  builder.upsert = jest.fn(chain)
  builder.in = jest.fn(chain)
  builder.then = (resolve: any, reject?: any) => Promise.resolve(mockResolvedValue).then(resolve, reject)
  return builder
}
let currentBuilder = makeQueryBuilder()
const mockFrom = jest.fn(() => currentBuilder)

jest.mock('../../src/config/supabase', () => ({
  supabase: { from: mockFrom },
  supabaseAdmin: { from: mockFrom },
}))

jest.mock('../../src/config/gameConfig', () => ({
  gameConfig: {
    psConfig: {
      highNobleWin: 5,
      highNobleMonarchWin: 10,
      ascendantWin: 7,
      ascendantMonarchWin: 14,
      notWinNonNegative: 2,
      negative: 0,
      monarchMultiplier: 2,
    },
  },
}))

import { awardPerformanceScore } from '../../src/game/psEngine'

describe('psEngine.awardPerformanceScore — Dual-Track (Career + Season)', () => {
  beforeEach(() => {
    currentBuilder = makeQueryBuilder()
    mockFrom.mockReset()
    mockFrom.mockImplementation(() => currentBuilder)
    mockResolvedValue = {
      data: [
        { user_id: 'winner', performance_score: 10, ps_season: 4 },
        { user_id: 'loser-positive', performance_score: 3, ps_season: 1 },
        { user_id: 'loser-negative', performance_score: 1, ps_season: 0 },
      ],
      error: null,
    }
  })

  test('ผู้ชนะ High Noble ปกติ (ไม่ใช่ Monarch) ได้ +5 ทั้ง Career และ Season', async () => {
    await awardPerformanceScore({
      tier: 'highNoble',
      finalWinnerId: 'winner',
      isMonarchMatch: false,
      humanNetDeltas: { winner: 500, 'loser-positive': 0, 'loser-negative': -100 },
    })
    const rows = currentBuilder.upsert.mock.calls[0][0]
    expect(rows).toEqual(expect.arrayContaining([{ user_id: 'winner', performance_score: 15, ps_season: 9 }]))
  })

  test('ผู้ชนะ Monarch ได้ x2 (+10 แทน +5) ทั้งสอง track — ตาม monarchMultiplier เสมอ', async () => {
    await awardPerformanceScore({
      tier: 'highNoble',
      finalWinnerId: 'winner',
      isMonarchMatch: true,
      humanNetDeltas: { winner: 500 },
    })
    const rows = currentBuilder.upsert.mock.calls[0][0]
    expect(rows).toEqual(expect.arrayContaining([{ user_id: 'winner', performance_score: 20, ps_season: 14 }]))
  })

  test('Ascendant tier ปกติ +7 / Monarch +14 — เท่ากันทั้ง Career และ Season', async () => {
    mockResolvedValue = { data: [{ user_id: 'winner', performance_score: 0, ps_season: 0 }], error: null }
    await awardPerformanceScore({ tier: 'ascendant', finalWinnerId: 'winner', isMonarchMatch: false, humanNetDeltas: { winner: 1 } })
    expect(currentBuilder.upsert.mock.calls[0][0]).toEqual(expect.arrayContaining([{ user_id: 'winner', performance_score: 7, ps_season: 7 }]))

    currentBuilder = makeQueryBuilder()
    mockFrom.mockImplementation(() => currentBuilder)
    mockResolvedValue = { data: [{ user_id: 'winner', performance_score: 0, ps_season: 0 }], error: null }
    await awardPerformanceScore({ tier: 'ascendant', finalWinnerId: 'winner', isMonarchMatch: true, humanNetDeltas: { winner: 1 } })
    expect(currentBuilder.upsert.mock.calls[0][0]).toEqual(expect.arrayContaining([{ user_id: 'winner', performance_score: 14, ps_season: 14 }]))
  })

  test('ไม่ชนะแต่ token สุทธิไม่ติดลบ ได้ +2 ทั้งสอง track', async () => {
    await awardPerformanceScore({
      tier: 'highNoble',
      finalWinnerId: 'winner',
      isMonarchMatch: false,
      humanNetDeltas: { winner: 500, 'loser-positive': 0 },
    })
    const rows = currentBuilder.upsert.mock.calls[0][0]
    expect(rows).toEqual(expect.arrayContaining([{ user_id: 'loser-positive', performance_score: 5, ps_season: 3 }]))
  })

  test('token สุทธิติดลบ ได้ +0 (ไม่มี PS ติดลบ) — ทั้งสอง track คงค่าเดิม', async () => {
    await awardPerformanceScore({
      tier: 'highNoble',
      finalWinnerId: 'winner',
      isMonarchMatch: false,
      humanNetDeltas: { winner: 500, 'loser-negative': -100 },
    })
    const rows = currentBuilder.upsert.mock.calls[0][0]
    expect(rows).toEqual(expect.arrayContaining([{ user_id: 'loser-negative', performance_score: 1, ps_season: 0 }]))
  })

  test('finalWinnerId เป็น null (Boss ชนะ ไม่มี human อันดับ 1) — ไม่มีใครได้แต้ม win-tier', async () => {
    await awardPerformanceScore({
      tier: 'highNoble',
      finalWinnerId: null,
      isMonarchMatch: false,
      humanNetDeltas: { 'loser-positive': 0, 'loser-negative': -50 },
    })
    const rows = currentBuilder.upsert.mock.calls[0][0]
    expect(rows).toEqual(expect.arrayContaining([
      { user_id: 'loser-positive', performance_score: 5, ps_season: 3 },
      { user_id: 'loser-negative', performance_score: 1, ps_season: 0 },
    ]))
  })

  test('humanNetDeltas ว่าง — ไม่เรียก supabase เลย', async () => {
    await awardPerformanceScore({ tier: 'highNoble', finalWinnerId: null, isMonarchMatch: false, humanNetDeltas: {} })
    expect(mockFrom).not.toHaveBeenCalled()
  })
})
