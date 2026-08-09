// ─────────────────────────────────────────────────────────────────────────────
// psEngine.test.ts — Unit Tests สำหรับ psEngine (Monarch_Spec_v1_3 §4 — Dual-Track PS)
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────

let mockResolvedValue: { data: any; error: any } = { data: null, error: null }
function makeQueryBuilder(): any {
  const builder: any = {}
  const chain = () => builder
  builder.select = jest.fn(chain)
  builder.in = jest.fn(chain)
  // psEngine.ts เขียนผลทีละคนผ่าน .update(fields).eq('user_id', userId) (ไม่ใช่ .upsert(rows) ก้อนเดียว
  // แบบเก่า) — update()/eq() ต้อง chain ต่อกันได้แล้ว resolve { error: null } เหมือน read query เดิม
  builder.update = jest.fn(chain)
  builder.eq = jest.fn(chain)
  builder.then = (resolve: any, reject?: any) => Promise.resolve(mockResolvedValue).then(resolve, reject)
  return builder
}
let currentBuilder = makeQueryBuilder()
const mockFrom = jest.fn(() => currentBuilder)
const mockRpc = jest.fn(async (_name: string, args: { p_user_id: string; p_delta: number }) => {
  const row = (mockResolvedValue.data ?? []).find((entry: any) => entry.user_id === args.p_user_id) ?? {}
  currentBuilder.update({
    performance_score: (row.performance_score ?? 0) + args.p_delta,
    ps_season: (row.ps_season ?? 0) + args.p_delta,
  })
  currentBuilder.eq('user_id', args.p_user_id)
  return { data: null, error: mockResolvedValue.error }
})

// หา payload ของ .update(fields) ที่ตามด้วย .eq('user_id', userId) ตรงกับ userId ที่ต้องการ —
// update.mock.calls[i] กับ eq.mock.calls[i] เรียงคู่กันเสมอ เพราะ psEngine.ts เขียนทีละแถวเรียงตามลำดับ
// (ไม่มี .eq() อื่นเรียกใน write loop นี้เลย มีแค่ 'user_id' ตัวเดียว)
function updatedFieldsFor(builder: any, userId: string): { performance_score: number; ps_season: number } | undefined {
  const idx = builder.eq.mock.calls.findIndex(([col, val]: [string, any]) => col === 'user_id' && val === userId)
  return idx === -1 ? undefined : builder.update.mock.calls[idx][0]
}

jest.mock('../../src/config/supabase', () => ({
  supabase: { from: mockFrom },
  supabaseAdmin: { from: mockFrom, rpc: mockRpc },
}))

jest.mock('../../src/config/gameConfig', () => ({
  gameConfig: {
    psConfig: {
      highNoble: { negative: 0, nonNegative: 1, bossWin: 3 },
      ascendant: { negative: 0, nonNegative: 1, bossWin: 3 },
      grandmaster: { negative: 0, nonNegative: 2, bossWin: 4 },
      sovereign: { negative: 0, nonNegative: 4, bossWin: 6 },
      legendaryBossBonus: 2,
    },
  },
}))

import { awardPerformanceScore } from '../../src/game/psEngine'

describe('psEngine.awardPerformanceScore — Dual-Track (Career + Season)', () => {
  beforeEach(() => {
    currentBuilder = makeQueryBuilder()
    mockFrom.mockReset()
    mockFrom.mockImplementation(() => currentBuilder)
    mockRpc.mockClear()
    mockResolvedValue = {
      data: [
        { user_id: 'winner', performance_score: 10, ps_season: 4 },
        { user_id: 'loser-positive', performance_score: 3, ps_season: 1 },
        { user_id: 'loser-negative', performance_score: 1, ps_season: 0 },
      ],
      error: null,
    }
  })

  test('ผู้ชนะ Boss ใน Tier A+ ได้ +3 ทั้ง Career และ Season', async () => {
    await awardPerformanceScore({
      tier: 'highNoble',
      finalWinnerId: 'winner',
      legendaryBossDefeated: false,
      humanNetDeltas: { winner: 500, 'loser-positive': 0, 'loser-negative': -100 },
    })
    expect(updatedFieldsFor(currentBuilder, 'winner')).toEqual({ performance_score: 13, ps_season: 7 })
  })

  test('ผู้ชนะ Monarch ใน Tier A+ ได้ bossWin 3 + legendary bonus 2 = 5', async () => {
    await awardPerformanceScore({
      tier: 'highNoble',
      finalWinnerId: 'winner',
      legendaryBossDefeated: true,
      humanNetDeltas: { winner: 500 },
    })
    expect(updatedFieldsFor(currentBuilder, 'winner')).toEqual({ performance_score: 15, ps_season: 9 })
  })

  test('Ascendant ชนะ Boss +3 / ชนะ Monarch +5', async () => {
    mockResolvedValue = { data: [{ user_id: 'winner', performance_score: 0, ps_season: 0 }], error: null }
    await awardPerformanceScore({ tier: 'ascendant', finalWinnerId: 'winner', legendaryBossDefeated: false, humanNetDeltas: { winner: 1 } })
    expect(updatedFieldsFor(currentBuilder, 'winner')).toEqual({ performance_score: 3, ps_season: 3 })

    currentBuilder = makeQueryBuilder()
    mockFrom.mockImplementation(() => currentBuilder)
    mockResolvedValue = { data: [{ user_id: 'winner', performance_score: 0, ps_season: 0 }], error: null }
    await awardPerformanceScore({ tier: 'ascendant', finalWinnerId: 'winner', legendaryBossDefeated: true, humanNetDeltas: { winner: 1 } })
    expect(updatedFieldsFor(currentBuilder, 'winner')).toEqual({ performance_score: 5, ps_season: 5 })
  })

  test('Tier A+ ไม่ชนะแต่ token สุทธิไม่ติดลบ ได้ +1 ทั้งสอง track', async () => {
    await awardPerformanceScore({
      tier: 'highNoble',
      finalWinnerId: 'winner',
      legendaryBossDefeated: false,
      humanNetDeltas: { winner: 500, 'loser-positive': 0 },
    })
    expect(updatedFieldsFor(currentBuilder, 'loser-positive')).toEqual({ performance_score: 4, ps_season: 2 })
  })

  test('token สุทธิติดลบ ได้ +0 (ไม่มี PS ติดลบ) — ทั้งสอง track คงค่าเดิม', async () => {
    await awardPerformanceScore({
      tier: 'highNoble',
      finalWinnerId: 'winner',
      legendaryBossDefeated: false,
      humanNetDeltas: { winner: 500, 'loser-negative': -100 },
    })
    expect(updatedFieldsFor(currentBuilder, 'loser-negative')).toEqual({ performance_score: 1, ps_season: 0 })
  })

  test('finalWinnerId เป็น null (Boss ชนะ ไม่มี human อันดับ 1) — ไม่มีใครได้แต้ม win-tier', async () => {
    await awardPerformanceScore({
      tier: 'highNoble',
      finalWinnerId: null,
      legendaryBossDefeated: false,
      humanNetDeltas: { 'loser-positive': 0, 'loser-negative': -50 },
    })
    expect(updatedFieldsFor(currentBuilder, 'loser-positive')).toEqual({ performance_score: 4, ps_season: 2 })
    expect(updatedFieldsFor(currentBuilder, 'loser-negative')).toEqual({ performance_score: 1, ps_season: 0 })
  })

  test('humanNetDeltas ว่าง — ไม่เรียก supabase เลย', async () => {
    await awardPerformanceScore({ tier: 'highNoble', finalWinnerId: null, legendaryBossDefeated: false, humanNetDeltas: {} })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  // Grandmaster (Tier S) — มติลุงเยาะ 2026-08-08: ทุกค่าของ High Noble บวก +2 อิสระต่อกัน (ไม่ใช่ x2)
  test('Grandmaster: ผู้ชนะปกติ (Four Gods) ได้ +4 ทั้งสอง track', async () => {
    mockResolvedValue = { data: [{ user_id: 'winner', performance_score: 0, ps_season: 0 }], error: null }
    await awardPerformanceScore({ tier: 'grandmaster', finalWinnerId: 'winner', legendaryBossDefeated: false, humanNetDeltas: { winner: 100 } })
    expect(updatedFieldsFor(currentBuilder, 'winner')).toEqual({ performance_score: 4, ps_season: 4 })
  })

  test('Grandmaster: ผู้ชนะ Monarch/Soren ได้ +6 (+4 และโบนัส +2)', async () => {
    mockResolvedValue = { data: [{ user_id: 'winner', performance_score: 0, ps_season: 0 }], error: null }
    await awardPerformanceScore({ tier: 'grandmaster', finalWinnerId: 'winner', legendaryBossDefeated: true, humanNetDeltas: { winner: 100 } })
    expect(updatedFieldsFor(currentBuilder, 'winner')).toEqual({ performance_score: 6, ps_season: 6 })
  })

  test('Grandmaster: ไม่ชนะแต่ net Crest ไม่ติดลบ ได้ +2', async () => {
    mockResolvedValue = { data: [{ user_id: 'loser-positive', performance_score: 0, ps_season: 0 }], error: null }
    await awardPerformanceScore({ tier: 'grandmaster', finalWinnerId: 'winner', legendaryBossDefeated: false, humanNetDeltas: { 'loser-positive': 0 } })
    expect(updatedFieldsFor(currentBuilder, 'loser-positive')).toEqual({ performance_score: 2, ps_season: 2 })
  })

  test('Grandmaster: net Crest ติดลบ ได้ +0', async () => {
    mockResolvedValue = { data: [{ user_id: 'loser-negative', performance_score: 0, ps_season: 0 }], error: null }
    await awardPerformanceScore({ tier: 'grandmaster', finalWinnerId: 'winner', legendaryBossDefeated: false, humanNetDeltas: { 'loser-negative': -50 } })
    expect(updatedFieldsFor(currentBuilder, 'loser-negative')).toEqual({ performance_score: 0, ps_season: 0 })
  })

  test('Sovereign Tier S+: negative/non-negative/boss/Last Boss = 0/4/6/8', async () => {
    const cases = [
      { finalWinnerId: null, legendaryBossDefeated: false, net: -1, expected: 0 },
      { finalWinnerId: null, legendaryBossDefeated: false, net: 0, expected: 4 },
      { finalWinnerId: 'winner', legendaryBossDefeated: false, net: 1, expected: 6 },
      { finalWinnerId: 'winner', legendaryBossDefeated: true, net: 1, expected: 8 },
    ]
    for (const entry of cases) {
      currentBuilder = makeQueryBuilder()
      mockFrom.mockImplementation(() => currentBuilder)
      mockResolvedValue = { data: [{ user_id: 'winner', performance_score: 0, ps_season: 0 }], error: null }
      await awardPerformanceScore({
        tier: 'sovereign', finalWinnerId: entry.finalWinnerId,
        legendaryBossDefeated: entry.legendaryBossDefeated,
        humanNetDeltas: { winner: entry.net },
      })
      expect(updatedFieldsFor(currentBuilder, 'winner')).toEqual({ performance_score: entry.expected, ps_season: entry.expected })
    }
  })
})
