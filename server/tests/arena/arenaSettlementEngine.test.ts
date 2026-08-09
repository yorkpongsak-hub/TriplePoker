import { ArenaSettlementEngine } from '../../src/arena/settlement/arenaSettlementEngine'

const players = ['p1', 'p2', 'p3', 'boss']
const balances = { p1: 200, p2: 200, p3: 200, boss: 200 }

function fundThreePiles(engine: ArenaSettlementEngine, game: 1 | 2 | 3, extraPile3 = 0): void {
  engine.execute({ type: 'ANTE', commandId: `g${game}-p1-ante`, game, pile: 1, playerIds: players, baseCrest: 3, extraCrest: 0 })
  engine.execute({ type: 'ANTE', commandId: `g${game}-p2-ante`, game, pile: 2, playerIds: players, baseCrest: 3, extraCrest: 0 })
  engine.execute({ type: 'ANTE', commandId: `g${game}-p3-ante`, game, pile: 3, playerIds: players, baseCrest: 6, extraCrest: extraPile3 })
}

describe('Gate 6 - Arena settlement and conservation', () => {
  test('Ante, Joker extra, Call และ Auction เคลื่อนยอดเข้า bucket ที่ถูกต้อง', () => {
    const engine = new ArenaSettlementEngine(balances)
    fundThreePiles(engine, 1, 6)
    engine.execute({ type: 'CALL', commandId: 'call-1', game: 1, pile: 2, playerId: 'p2', amountCrest: 3 })
    engine.execute({ type: 'AUCTION', commandId: 'auction-1', game: 1, winnerId: 'p3', amountCrest: 12 })
    expect(engine.totals()).toMatchObject({ pots: { 1: 12, 2: 15, 3: 48 }, battleRewardsCrest: 12 })
    const p3 = engine.resultBreakdown().find(row => row.playerId === 'p3')!
    expect(p3).toMatchObject({ ante: 12, jokerExtraAnte: 6, auction: 12 })
    expect(engine.totals().conservedTotalCrest).toBe(800)
  })

  test('Sweep ต้องชนะครบสาม Piles และรับ Battle Rewards จริง', () => {
    const engine = new ArenaSettlementEngine(balances)
    fundThreePiles(engine, 1)
    engine.execute({ type: 'AUCTION', commandId: 'auction', game: 1, winnerId: 'p2', amountCrest: 12 })
    engine.execute({ type: 'PILE_PAYOUT', commandId: 'pay-1', game: 1, pile: 1, winnerId: 'p1' })
    engine.execute({ type: 'PILE_PAYOUT', commandId: 'pay-2', game: 1, pile: 2, winnerId: 'p1' })
    expect(() => engine.execute({ type: 'SWEEP_JACKPOT', commandId: 'early', game: 1, winnerId: 'p1' }))
      .toThrow('SWEEP_REQUIRES_ALL_THREE_PILES')
    engine.execute({ type: 'PILE_PAYOUT', commandId: 'pay-3', game: 1, pile: 3, winnerId: 'p1' })
    const sweep = engine.execute({ type: 'SWEEP_JACKPOT', commandId: 'sweep', game: 1, winnerId: 'p1' })
    expect(sweep.transaction.entries).toEqual([{ userId: 'p1', deltaCrest: 12, persisted: true }])
    expect(engine.totals().battleRewardsCrest).toBe(0)
    expect(engine.resultBreakdown().find(row => row.playerId === 'p1')!.sweepJackpot).toBe(12)
  })

  test('Battle Rewards ที่เหลือจบ Match แล้วเข้า Crown Sink', () => {
    const engine = new ArenaSettlementEngine(balances)
    engine.execute({ type: 'BOSS_FEE', commandId: 'fee', playerIds: ['p1', 'p2', 'p3'], feeCrest: 24 })
    fundThreePiles(engine, 1)
    engine.execute({ type: 'AUCTION', commandId: 'auction', game: 1, winnerId: 'p2', amountCrest: 9 })
    engine.execute({ type: 'PILE_PAYOUT', commandId: 'pay-1', game: 1, pile: 1, winnerId: 'p1' })
    engine.execute({ type: 'PILE_PAYOUT', commandId: 'pay-2', game: 1, pile: 2, winnerId: 'p2' })
    engine.execute({ type: 'PILE_PAYOUT', commandId: 'pay-3', game: 1, pile: 3, winnerId: 'p3' })
    const end = engine.execute({ type: 'END_MATCH', commandId: 'end', playerIds: players, feeCrest: 12 })
    expect(end.transaction).toMatchObject({
      reason: 'ENTRY_FEE',
      entries: players.map(userId => ({ userId, deltaCrest: -12, persisted: true })),
    })
    expect(engine.resultBreakdown().every(row => row.entryFee === 12)).toBe(true)
    expect(engine.totals()).toMatchObject({ battleRewardsCrest: 0, crownSinkCrest: 129, pots: { 1: 0, 2: 0, 3: 0 } })
    expect(engine.totals().conservedTotalCrest).toBe(800)
  })

  test('command retry idempotent และ payload เปลี่ยนถูกปฏิเสธ', () => {
    const engine = new ArenaSettlementEngine(balances)
    const command = { type: 'AUCTION' as const, commandId: 'same', game: 1 as const, winnerId: 'p1', amountCrest: 3 }
    expect(engine.execute(command).duplicate).toBe(false)
    expect(engine.execute(command).duplicate).toBe(true)
    expect(() => engine.execute({ ...command, amountCrest: 6 })).toThrow('SETTLEMENT_COMMAND_ID_CONFLICT')
    expect(engine.resultBreakdown().find(row => row.playerId === 'p1')!.auction).toBe(3)
  })

  test('multi-player charge fail แบบ atomic เมื่อคนใดคนหนึ่งยอดไม่พอ', () => {
    const engine = new ArenaSettlementEngine({ p1: 100, p2: 2 })
    expect(() => engine.execute({ type: 'ANTE', commandId: 'ante', game: 1, pile: 1, playerIds: ['p1', 'p2'], baseCrest: 3, extraCrest: 0 }))
      .toThrow('INSUFFICIENT_CREST')
    expect(engine.resultBreakdown().map(row => row.endingCrest)).toEqual([100, 2])
  })

  test('ห้ามจ่าย Pot ซ้ำและห้ามจบ Match ขณะ Pot ยังไม่เคลียร์', () => {
    const engine = new ArenaSettlementEngine(balances)
    engine.execute({ type: 'ANTE', commandId: 'ante', game: 1, pile: 1, playerIds: players, baseCrest: 3, extraCrest: 0 })
    expect(() => engine.execute({ type: 'END_MATCH', commandId: 'end-early', playerIds: players, feeCrest: 12 })).toThrow('POTS_MUST_BE_SETTLED_BEFORE_MATCH_END')
    engine.execute({ type: 'PILE_PAYOUT', commandId: 'pay', game: 1, pile: 1, winnerId: 'p1' })
    expect(() => engine.execute({ type: 'PILE_PAYOUT', commandId: 'pay-again', game: 1, pile: 1, winnerId: 'p1' })).toThrow('PILE_ALREADY_PAID')
  })

  test('Pot ที่ทุกคน Fold ต้องเข้า Crown Sink และจบ Match ได้โดยยอดรวมยังสมดุล', () => {
    const engine = new ArenaSettlementEngine(balances)
    engine.execute({ type: 'ANTE', commandId: 'ante', game: 1, pile: 2, playerIds: players, baseCrest: 3, extraCrest: 0 })
    const forfeit = engine.execute({ type: 'PILE_FORFEIT', commandId: 'forfeit', game: 1, pile: 2 })

    expect(forfeit.transaction).toMatchObject({
      reason: 'CROWN_SINK',
      entries: [],
      potDeltaCrest: { 2: -12 },
      crownSinkDeltaCrest: 12,
    })
    expect(engine.totals()).toMatchObject({ pots: { 1: 0, 2: 0, 3: 0 }, crownSinkCrest: 12 })
    expect(engine.totals().conservedTotalCrest).toBe(800)
    expect(() => engine.execute({ type: 'END_MATCH', commandId: 'end', playerIds: players, feeCrest: 12 })).not.toThrow()
  })

  test('AI ใช้ virtual wallet เพื่อ conservation แต่ entry ไม่ถูกส่งเข้าบัญชีจริง', () => {
    const engine = new ArenaSettlementEngine({
      human: { balanceCrest: 100, persisted: true },
      'ai:REAPER': { balanceCrest: 100, persisted: false },
    })
    const transaction = engine.execute({
      type: 'ANTE', commandId: 'virtual-ante', game: 1, pile: 1,
      playerIds: ['human', 'ai:REAPER'], baseCrest: 3, extraCrest: 0,
    }).transaction
    expect(transaction.entries).toEqual([
      { userId: 'human', deltaCrest: -3, persisted: true },
      { userId: 'ai:REAPER', deltaCrest: -3, persisted: false },
    ])
    expect(engine.totals().conservedTotalCrest).toBe(200)
  })
})
