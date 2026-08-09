// ─────────────────────────────────────────────────────────────────────────────
// monarchSpawn.test.ts — Unit Tests สำหรับ monarchSpawn
// Batch 1 Task 2 (Monarch v2.2 cleanup): rollHighNobleBoss() ไม่มี Monarch/pity/DB อีกแล้ว —
// สุ่มแค่ Four Gods ล้วน เทสเดิมที่ผูกกับ pity/isMonarch=true/upsert ถูกลบ/แทนที่ทั้งหมด
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
  supabaseAdmin: { from: mockFrom },
}))

jest.mock('../../src/config/gameConfig', () => ({
  gameConfig: {
    monarchConfig: {
      spawnRateBase: 0.03,
      pityStepPerGame: 0.005,
      pityGuaranteeAt: 30,
      potMultiplier: 2.0,
      bossWeights: { reaper: 29, crag: 26, cortex: 26, cipher: 19 },
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

  test('rollHighNobleBoss ไม่มีทางคืน isMonarch: true อีกต่อไป (คืน false เสมอ)', async () => {
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0)
    const result = await rollHighNobleBoss(['u1'])
    expect(result.isMonarch).toBe(false)
    expect(result.boss).not.toBeNull()
  })

  test('ไม่ query/ไม่ upsert คอลัมน์ pity อีกต่อไป (ย้ายไป rollMonarchEntry() แล้ว)', async () => {
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5)
    await rollHighNobleBoss(['u1', 'u2', 'u3'])
    expect(mockFrom).not.toHaveBeenCalled()
  })

  test('สุ่ม Four Gods ตามน้ำหนัก bossWeights (roll ต่ำสุด → ตัวแรกของ pool = reaper)', async () => {
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0)
    const result = await rollHighNobleBoss(['u1'])
    expect(result.boss?.personality).toBe('reaper')
  })

  test('roll กลาง pool → ได้ personality ที่สอดคล้องกับสัดส่วนน้ำหนัก (cortex อยู่ช่วง 55-81 จาก 100)', async () => {
    // pool order: reaper(29) crag(26) cortex(26) cipher(19) — total=100 → roll=0.60*100=60 ตกช่วง cortex (55-81)
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.60)
    const result = await rollHighNobleBoss(['u1'])
    expect(result.boss?.personality).toBe('cortex')
  })

  test('humanUserIds ว่าง/ไม่ว่าง ไม่มีผลต่อการสุ่ม (ไม่แตะ DB อีกแล้ว)', async () => {
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0)
    const result = await rollHighNobleBoss([])
    expect(result.isMonarch).toBe(false)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  test('recordMonarchVictory: อ่านค่าปัจจุบันแล้ว +1 เฉพาะ user ที่ระบุ', async () => {
    mockResolvedValue = { data: { monarch_victories: 2 }, error: null }
    await recordMonarchVictory('winner-1')
    expect(currentBuilder.update).toHaveBeenCalledWith({ monarch_victories: 3 })
    expect(currentBuilder.eq).toHaveBeenCalledWith('user_id', 'winner-1')
  })
})
