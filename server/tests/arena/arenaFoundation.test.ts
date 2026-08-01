import { createArenaRoom } from '../../src/arena/rooms/createArenaRoom'
import { tierSConfig, tierSEconomyConfig } from '../../src/arena/config/tierSConfig'
import { splitTotalCrest, toTotalCrest } from '../../src/arena/economy/crest'
import { checkTierSEligibility } from '../../src/arena/eligibility/tierSEligibility'
import {
  ArenaCrestLedger,
  ArenaLedgerGateway,
  ApplyCrestDeltaInput,
  ArenaCrestBalance,
} from '../../src/arena/economy/arenaCrestLedger'

class MemoryGateway implements ArenaLedgerGateway {
  crown = 10
  remainder = 3
  calls: ApplyCrestDeltaInput[] = []

  async read() {
    return { crown_balance: this.crown, crown_crest_remainder: this.remainder }
  }

  async apply(input: ApplyCrestDeltaInput): Promise<ArenaCrestBalance> {
    this.calls.push(input)
    const next = splitTotalCrest(toTotalCrest(this.crown, this.remainder) + input.deltaCrest)
    this.crown = next.crown
    this.remainder = next.crestRemainder
    return next
  }
}

describe('Arena Gate 1 foundation', () => {
  test('config ใช้ค่าที่ล็อกและปิด feature ไว้ก่อน', () => {
    expect(tierSConfig.featureEnabled).toBe(false)
    expect(tierSConfig.unlockTokenExclusive).toBe(1_000_000)
    expect(tierSConfig.tableSkinKey).toBe('boss_monarch')
    expect(tierSConfig.handLayout).toBe('fan')
    expect(tierSEconomyConfig.anteCrest).toEqual({ pile1: 3, pile2: 3, pile3: 6 })
    expect(tierSEconomyConfig.entryFeeCrest).toBe(12)
    expect(tierSEconomyConfig.requiredReservationCrest).toBe(19 * 12)
  })

  test('สร้าง room ใหม่โดยไม่เรียก game loop ของ Tier เดิม', () => {
    expect(createArenaRoom('arena-1')).toEqual({
      roomId: 'arena-1',
      tier: 'grandmaster',
      phase: 'WAITING_FOR_PLAYERS',
      gameNumber: 0,
      bossComposition: { kind: 'NONE', bosses: [] },
      version: 1,
    })
  })

  test('Grandmaster ใช้ token > 1M แบบ exclusive และไม่มีเงื่อนไข legacy', () => {
    expect(checkTierSEligibility(1_000_000)).toEqual({
      eligible: false,
      reason: 'TOKEN_THRESHOLD_NOT_EXCEEDED',
    })
    expect(checkTierSEligibility(1_000_001)).toEqual({ eligible: true, reason: 'ELIGIBLE' })
  })
})

describe('Arena Gate 2 Crown/Crest primitives', () => {
  test('แปลง Crown + remainder เป็น integer Crest', () => {
    expect(toTotalCrest(10, 3)).toBe(123)
    expect(splitTotalCrest(123)).toEqual({ crown: 10, crestRemainder: 3, totalCrest: 123 })
  })

  test('ปฏิเสธ remainder และจำนวนที่ไม่ถูกต้อง', () => {
    expect(() => toTotalCrest(1, 12)).toThrow('CREST_REMAINDER_OUT_OF_RANGE')
    expect(() => splitTotalCrest(-1)).toThrow('TOTAL_CREST_MUST_NOT_BE_NEGATIVE')
    expect(() => toTotalCrest(0.5, 0)).toThrow('CROWN_MUST_BE_SAFE_INTEGER')
  })

  test('ledger อ่านยอดร่วมโดยไม่สร้าง balance ก้อนใหม่', async () => {
    const ledger = new ArenaCrestLedger(new MemoryGateway())
    await expect(ledger.getBalance('u1')).resolves.toEqual({ crown: 10, crestRemainder: 3, totalCrest: 123 })
  })

  test('ledger ส่ง integer delta และ idempotency key ลง gateway', async () => {
    const gateway = new MemoryGateway()
    const ledger = new ArenaCrestLedger(gateway)
    const result = await ledger.applyDelta({
      userId: 'u1',
      deltaCrest: -3,
      reason: 'ANTE',
      idempotencyKey: '00000000-0000-0000-0000-000000000001',
      matchId: 'm1',
    })
    expect(result).toEqual({ crown: 10, crestRemainder: 0, totalCrest: 120 })
    expect(gateway.calls).toHaveLength(1)
  })

  test('ledger ปฏิเสธ zero/fractional delta', async () => {
    const ledger = new ArenaCrestLedger(new MemoryGateway())
    await expect(ledger.applyDelta({ userId: 'u1', deltaCrest: 0, reason: 'ANTE', idempotencyKey: 'k1' }))
      .rejects.toThrow('DELTA_CREST_MUST_NOT_BE_ZERO')
    await expect(ledger.applyDelta({ userId: 'u1', deltaCrest: 0.25, reason: 'ANTE', idempotencyKey: 'k2' }))
      .rejects.toThrow('DELTA_CREST_MUST_BE_SAFE_INTEGER')
  })
})
