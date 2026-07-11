// ─────────────────────────────────────────────────────────────────────────────
// monarchSpawn.test.ts — Unit Tests สำหรับ monarchSpawn (Monarch_Spec_v1_3 §2)
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Mock supabase (chainable: select/eq/in/single/update/upsert) ─────────────
let mockResolvedValue: { data: any; error: any } = { data: null, error: null }
function makeQueryBuilder(): any {
  const builder: any = {}
  const chain = () => builder
  builder.select = jest.fn(chain)
  builder.update = jest.fn(chain)
  builder.upsert = jest.fn(chain)
  builder.eq = jest.fn(chain)
  builder.in = jest.fn(chain)
  builder.single = jest.fn(chain)
  builder.then = (resolve: any, reject?: any) => Promise.resolve(mockResolvedValue).then(resolve, reject)
  return builder
}
let currentBuilder = makeQueryBuilder()
const mockFrom = jest.fn(() => currentBuilder)

jest.mock('../../src/config/supabase', () => ({
  supabase: { from: mockFrom },
}))

jest.mock('../../src/config/gameConfig', () => ({
  gameConfig: {
    monarchConfig: {
      spawnRateBase: 0.03,
      pityStepPerGame: 0.005,
      pityGuaranteeAt: 30,
      potMultiplier: 2.0,
      bossWeights: { reaper: 28, crag: 25, cortex: 25, cipher: 19 },
    },
  },
}))

import { rollHighNobleBoss, recordMonarchVictory } from '../../src/game/monarchSpawn'

describe('monarchSpawn', () => {
  let randomSpy: jest.SpyInstance

  beforeEach(() => {
    currentBuilder = makeQueryBuilder()
    mockFrom.mockReset()
    mockFrom.mockImplementation(() => currentBuilder)
    mockResolvedValue = { data: null, error: null }
  })

  afterEach(() => {
    randomSpy?.mockRestore()
  })

  test('effective rate สูตรถูกต้อง (base + maxPity * step) และเจอ Monarch เมื่อ roll < rate', async () => {
    mockResolvedValue = {
      data: [{ user_id: 'u1', monarch_pity_counter: 10, monarch_encounters: 0 }],
      error: null,
    }
    // effectiveRate = 0.03 + 10*0.005 = 0.08
    randomSpy = jest.spyOn(Math, 'random').mockReturnValueOnce(0.07) // < 0.08 → เจอ Monarch
    const result = await rollHighNobleBoss(['u1'])
    expect(result.effectiveRate).toBeCloseTo(0.08)
    expect(result.maxPity).toBe(10)
    expect(result.isMonarch).toBe(true)
    expect(result.boss).toBeNull()
    expect(result.guaranteed).toBe(false)
  })

  test('roll >= effective rate → ไม่เจอ Monarch, สุ่ม Four Gods ตามน้ำหนัก', async () => {
    mockResolvedValue = {
      data: [{ user_id: 'u1', monarch_pity_counter: 0, monarch_encounters: 0 }],
      error: null,
    }
    // effectiveRate = 0.03 — roll แรก 0.5 (ไม่เจอ Monarch) — roll สอง 0 (เลือกตัวแรกของ pool = reaper)
    randomSpy = jest.spyOn(Math, 'random').mockReturnValueOnce(0.5).mockReturnValueOnce(0)
    const result = await rollHighNobleBoss(['u1'])
    expect(result.isMonarch).toBe(false)
    expect(result.boss?.personality).toBe('reaper')
  })

  test('ใช้ค่า max ของ pity counter ทั้งโต๊ะ ไม่ใช่ค่าเฉลี่ยหรือค่าแรก', async () => {
    mockResolvedValue = {
      data: [
        { user_id: 'u1', monarch_pity_counter: 5, monarch_encounters: 0 },
        { user_id: 'u2', monarch_pity_counter: 20, monarch_encounters: 0 },
        { user_id: 'u3', monarch_pity_counter: 0, monarch_encounters: 0 },
      ],
      error: null,
    }
    randomSpy = jest.spyOn(Math, 'random').mockReturnValueOnce(0.99) // สูงพอไม่ให้เจอ Monarch แม้ pity สูงสุด
    const result = await rollHighNobleBoss(['u1', 'u2', 'u3'])
    expect(result.maxPity).toBe(20)
  })

  test('เกม 30 นับจาก reset ยังไม่เจอ → การันตี spawn (effectiveRate = 100%) แม้ roll สูง', async () => {
    mockResolvedValue = {
      data: [{ user_id: 'u1', monarch_pity_counter: 30, monarch_encounters: 2 }],
      error: null,
    }
    randomSpy = jest.spyOn(Math, 'random').mockReturnValueOnce(0.9999)
    const result = await rollHighNobleBoss(['u1'])
    expect(result.guaranteed).toBe(true)
    expect(result.effectiveRate).toBe(1)
    expect(result.isMonarch).toBe(true)
  })

  test('เจอ Monarch → batch upsert reset pity=0 + encounters+1 ให้ทุกคนในโต๊ะ', async () => {
    mockResolvedValue = {
      data: [
        { user_id: 'u1', monarch_pity_counter: 10, monarch_encounters: 2 },
        { user_id: 'u2', monarch_pity_counter: 3, monarch_encounters: 0 },
      ],
      error: null,
    }
    randomSpy = jest.spyOn(Math, 'random').mockReturnValueOnce(0) // เจอ Monarch แน่นอน
    await rollHighNobleBoss(['u1', 'u2'])
    expect(currentBuilder.upsert).toHaveBeenCalledTimes(1)
    const rows = currentBuilder.upsert.mock.calls[0][0]
    expect(rows).toEqual(
      expect.arrayContaining([
        { user_id: 'u1', monarch_pity_counter: 0, monarch_encounters: 3 },
        { user_id: 'u2', monarch_pity_counter: 0, monarch_encounters: 1 },
      ])
    )
  })

  test('ไม่เจอ Monarch → batch upsert pity+1 ให้ทุกคนในโต๊ะ (ไม่แตะ encounters)', async () => {
    mockResolvedValue = {
      data: [
        { user_id: 'u1', monarch_pity_counter: 10, monarch_encounters: 2 },
        { user_id: 'u2', monarch_pity_counter: 3, monarch_encounters: 0 },
      ],
      error: null,
    }
    randomSpy = jest.spyOn(Math, 'random').mockReturnValueOnce(0.99).mockReturnValueOnce(0)
    await rollHighNobleBoss(['u1', 'u2'])
    const rows = currentBuilder.upsert.mock.calls[0][0]
    expect(rows).toEqual(
      expect.arrayContaining([
        { user_id: 'u1', monarch_pity_counter: 11 },
        { user_id: 'u2', monarch_pity_counter: 4 },
      ])
    )
  })

  test('ไม่มี humanUserIds (array ว่าง) → ไม่ query/ไม่ upsert, effectiveRate = spawnRateBase', async () => {
    randomSpy = jest.spyOn(Math, 'random').mockReturnValueOnce(0.99).mockReturnValueOnce(0)
    const result = await rollHighNobleBoss([])
    expect(mockFrom).not.toHaveBeenCalled()
    expect(result.effectiveRate).toBeCloseTo(0.03)
    expect(result.maxPity).toBe(0)
  })

  test('recordMonarchVictory: อ่านค่าปัจจุบันแล้ว +1 เฉพาะ user ที่ระบุ', async () => {
    mockResolvedValue = { data: { monarch_victories: 2 }, error: null }
    await recordMonarchVictory('winner-1')
    expect(currentBuilder.update).toHaveBeenCalledWith({ monarch_victories: 3 })
    expect(currentBuilder.eq).toHaveBeenCalledWith('user_id', 'winner-1')
  })
})
