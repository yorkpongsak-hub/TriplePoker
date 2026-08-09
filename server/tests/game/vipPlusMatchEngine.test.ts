import { Card, createDeck } from '../../src/game/deck'
import {
  clearVipPlusMatchState,
  attachVipPlusBettingIo,
  beginVipPlusAuction,
  buildVipPlusSnapshot,
  dealVipPlusGame,
  finalizeVipPlusMatch,
  forfeitVipPlusMatch,
  markVipPlusConnected,
  markVipPlusDisconnected,
  rankVipPlusMatch,
  startVipPlusMatch,
  submitVipPlusArrangement,
  submitVipPlusBettingAction,
  resolveVipPlusBettingTimeout,
  resolveVipPlusAuction,
  selectVipPlusAuctionWinner,
  submitVipPlusAuctionBid,
  submitVipPlusRearrangement,
  validateVipPlusArrangement,
  vipPlusCardKey,
} from '../../src/game/vipPlusMatchEngine'
import { VIP_PLUS_ENTRY_TERMS_VERSION, VipPlusTableRegistry, vipPlusTableRegistry } from '../../src/game/vipPlusTableRegistry'

const player = (number: number) => ({ playerId: `p${number}`, displayName: `Player ${number}`, tokenBalance: 100_000 })

function readyTable() {
  const registry = new VipPlusTableRegistry()
  const table = registry.create(player(1), 'INITIATE_WAGER')
  for (let number = 2; number <= 5; number++) registry.join(table.tableId, player(number))
  for (let number = 1; number <= 5; number++) registry.confirm(table.tableId, `p${number}`, 100_000, VIP_PLUS_ENTRY_TERMS_VERSION)
  return table
}

function reducedReadyTable(humanCount: 3 | 4 = 3) {
  const registry = new VipPlusTableRegistry()
  const table = registry.create(player(1), 'INITIATE_WAGER')
  for (let number = 2; number <= humanCount; number++) registry.join(table.tableId, player(number))
  for (let number = 1; number <= humanCount; number++) registry.confirm(table.tableId, `p${number}`, 100_000, VIP_PLUS_ENTRY_TERMS_VERSION)
  registry.approveReducedStart(table.tableId, 'p1')
  return table
}

function fakeIo() {
  const events: Array<{ room: string; event: string; payload: any }> = []
  return {
    events,
    io: { to: (room: string) => ({ emit: (event: string, payload: any) => { events.push({ room, event, payload }) } }) } as any,
  }
}

function findValidArrangement(hand: Card[], center: { g1: Card[]; g2: Card[]; g3: Card[] }) {
  for (let a = 0; a < hand.length; a++) {
    for (let b = a + 1; b < hand.length; b++) {
      const g1 = [hand[a], hand[b]]
      const rest1 = hand.filter((_, index) => index !== a && index !== b)
      for (let c = 0; c < rest1.length; c++) {
        for (let d = c + 1; d < rest1.length; d++) {
          const arrangement = { g1, g2: [rest1[c], rest1[d]], g3: rest1.filter((_, index) => index !== c && index !== d) }
          if (validateVipPlusArrangement(hand, center, arrangement).ok) return arrangement
        }
      }
    }
  }
  throw new Error('No valid arrangement found for deterministic test deck')
}

let cachedGame1Controlled: any = null
function dealWithFiveValidArrangements() {
  if (cachedGame1Controlled) return cachedGame1Controlled
  const deckByKey = new Map(createDeck().map(card => [vipPlusCardKey(card), card]))
  const cards = (keys: string[]) => keys.map(key => deckByKey.get(key)!)
  const hand = cards(['5c', '7s', '3c', '4c', '10s', 'js', 'qs', 'ks', 'as'])
  // Feedback ลุงเยาะ — G3 (เกม 1-2) กติกาใหม่ใช้ "4 ใบแรก + ไพ่กองกลาง" ตรวจ (ใบที่ 5 เป็น forced discard
  // ไม่นับคะแนน) ต้องจัดใหม่ให้ผ่าน non-foul: g1(7s,10s)+center = high_card, g2(js,qs)+center = one_pair
  // (คู่ 8 จากกองกลาง), g3 4 ใบแรก(as,5c,3c,4c)+center(2h) = straight (A-2-3-4-5 ace-low) ks เป็นใบทิ้ง
  const arrangement = { g1: cards(['7s', '10s']), g2: cards(['js', 'qs']), g3: cards(['as', '5c', '3c', '4c', 'ks']) }
  const deal = {
    handsBySeat: { H1: [...hand], H2: [...hand], H3: [...hand], H4: [...hand], H5: [...hand] },
    center: { g1: cards(['2s', '3h', '4d']), g2: cards(['8s', '8h', '2d']), g3: cards(['2h']) },
    auctionCard: null,
  }
  cachedGame1Controlled = { deal, arrangements: { H1: arrangement, H2: arrangement, H3: arrangement, H4: arrangement, H5: arrangement } }
  return cachedGame1Controlled
}

let cachedGame3Controlled: any = null
function game3DealWithFiveValidArrangements() {
  if (cachedGame3Controlled) return cachedGame3Controlled
  // Feedback ลุงเยาะ (รอบ 2) — Auction ผูกกับ ruleset NO_G3_CENTER แล้ว ไม่ใช่ gameNumber===3 เฉยๆ อีกต่อไป
  // ต้องระบุ ruleset ตรงๆ ถึงจะได้ auctionCard มาทดสอบ (default WITH_G3_CENTER ไม่มี Auction เลย)
  const deal = dealVipPlusGame(3, 'NO_G3_CENTER')
  const arrangements = Object.fromEntries(Object.entries(deal.handsBySeat).map(([seat, hand]) => [seat, { g1: hand.slice(0, 2), g2: hand.slice(2, 4), g3: hand.slice(4, 9) }]))
  cachedGame3Controlled = { deal, arrangements }
  return cachedGame3Controlled
}

async function preparedAuctionMatch() {
  const started = await startedBettingMatch()
  if (started.state.betting?.timer) clearTimeout(started.state.betting.timer)
  const controlled = game3DealWithFiveValidArrangements()
  started.state.gameNumber = 3
  started.state.centerRuleset = 'NO_G3_CENTER'
  started.state.phase = 'INITIAL_ARRANGE'
  started.state.betting = null
  started.state.center = controlled.deal.center
  started.state.auctionCard = controlled.deal.auctionCard
  started.state.arrangements = {}
  for (const [seat, playerId] of Object.entries(started.state.playerBySeat)) {
    started.state.hands[playerId] = controlled.deal.handsBySeat[seat as keyof typeof controlled.deal.handsBySeat]
    started.state.arrangements[playerId] = controlled.arrangements[seat]
  }
  expect(beginVipPlusAuction(started.state.roomId)).toBe(true)
  return { ...started, controlled }
}

async function startedBettingMatch() {
  const table = readyTable()
  const transport = fakeIo()
  attachVipPlusBettingIo(transport.io)
  const controlled = dealWithFiveValidArrangements()
  const result = await startVipPlusMatch(transport.io, table, {
    acquire: async userId => ({ ok: true, escrowId: `escrow-${userId}`, buyInAmount: 2_000 }),
    refund: async () => undefined,
    deal: () => controlled.deal,
  })
  if (!result.ok) throw new Error(result.reason)
  for (const [seat, playerId] of Object.entries(result.state.playerBySeat)) {
    const arrangement = controlled.arrangements[seat]
    const submitted = Object.fromEntries(Object.entries(arrangement).map(([group, cards]) => [group, (cards as Card[]).map(vipPlusCardKey)])) as any
    expect(submitVipPlusArrangement(result.state.roomId, playerId, submitted).ok).toBe(true)
  }
  return { state: result.state, ...transport }
}

describe('VIP Plus Gate 4 deal and arrangement engine', () => {
  beforeEach(() => clearVipPlusMatchState())
  afterEach(() => clearVipPlusMatchState())

  test.each([1, 2, 3] as const)('deals every card exactly once in Game %s', gameNumber => {
    const deal = dealVipPlusGame(gameNumber, 'WITH_G3_CENTER', createDeck())
    const cards = [
      ...Object.values(deal.handsBySeat).flat(),
      ...deal.center.g1,
      ...deal.center.g2,
      ...deal.center.g3,
      ...(deal.auctionCard ? [deal.auctionCard] : []),
    ]
    expect(cards).toHaveLength(52)
    expect(new Set(cards.map(vipPlusCardKey)).size).toBe(52)
    expect(Object.values(deal.handsBySeat).every(hand => hand.length === 9)).toBe(true)
  })

  test('acquires all five escrows before exposing public center and private hands', async () => {
    const table = readyTable()
    const acquired: string[] = []
    const { io, events } = fakeIo()
    const result = await startVipPlusMatch(io, table, {
      acquire: async (userId, _roomId, tier) => {
        acquired.push(`${userId}:${tier}`)
        return { ok: true, escrowId: `escrow-${userId}`, buyInAmount: 2_000 }
      },
      refund: async () => undefined,
      now: () => 1_000,
    })
    expect(result.ok).toBe(true)
    expect(acquired).toEqual(['p1:adept', 'p2:adept', 'p3:adept', 'p4:adept', 'p5:adept'])
    expect(events.filter(event => event.event === 'vip_plus:private_hand')).toHaveLength(5)
    expect(events.find(event => event.event === 'vip_plus:game_started')?.payload).not.toHaveProperty('hands')
    expect(events.filter(event => event.event === 'vip_plus:private_hand').every(event => event.payload.cards.length === 9)).toBe(true)
  })

  test('starts with three humans, deals two Blank hands, and excludes Blank seats from play', async () => {
    const table = reducedReadyTable()
    const acquired: string[] = []
    const { io, events } = fakeIo()
    const controlled = dealWithFiveValidArrangements()
    const result = await startVipPlusMatch(io, table, {
      acquire: async userId => {
        acquired.push(userId)
        return { ok: true, escrowId: `escrow-${userId}`, buyInAmount: 2_000 }
      },
      refund: async () => undefined,
      deal: () => controlled.deal,
    })
    if (!result.ok) throw new Error(result.reason)

    expect(acquired).toEqual(['p1', 'p2', 'p3'])
    expect(result.state.humanSeats).toEqual(['H1', 'H2', 'H3'])
    expect(result.state.blankSeats).toEqual(['H4', 'H5'])
    expect(result.state.seatStatus).toMatchObject({ H4: 'BLANK', H5: 'BLANK' })
    expect(result.state.hands[result.state.playerBySeat.H4]).toHaveLength(9)
    expect(result.state.hands[result.state.playerBySeat.H5]).toHaveLength(9)
    expect(result.state.pot).toEqual([30, 60, 120])
    expect(events.filter(event => event.event === 'vip_plus:private_hand')).toHaveLength(3)
    const startedEvent = events.find(event => event.event === 'vip_plus:game_started')
    expect(startedEvent?.payload.seats).toEqual(expect.arrayContaining([
      expect.objectContaining({ seat: 'H4', displayName: 'Blank', status: 'BLANK', isBlank: true }),
      expect.objectContaining({ seat: 'H5', displayName: 'Blank', status: 'BLANK', isBlank: true }),
    ]))
    expect(startedEvent?.payload).not.toHaveProperty('hands')
    expect(events.some(event => event.room.startsWith('__VIP_PLUS_BLANK_'))).toBe(false)

    for (const seat of result.state.humanSeats) {
      const playerId = result.state.playerBySeat[seat]
      const arrangement = controlled.arrangements[seat]
      const submitted = Object.fromEntries(Object.entries(arrangement).map(([group, cards]) => [group, (cards as Card[]).map(vipPlusCardKey)])) as any
      expect(submitVipPlusArrangement(result.state.roomId, playerId, submitted).ok).toBe(true)
    }
    expect(result.state.phase).toBe('BETTING')
    expect(result.state.betting?.turnOrder).toEqual(['p1', 'p2', 'p3'])

    const blankId = result.state.playerBySeat.H4
    const blankArrangement = controlled.arrangements.H4
    const blankSubmitted = Object.fromEntries(Object.entries(blankArrangement).map(([group, cards]) => [group, (cards as Card[]).map(vipPlusCardKey)])) as any
    expect(submitVipPlusArrangement(result.state.roomId, blankId, blankSubmitted)).toEqual({ ok: false, reason: 'PLAYER_NOT_SEATED' })
    expect(buildVipPlusSnapshot(result.state.roomId, blankId)).toBeNull()
    expect(markVipPlusDisconnected(result.state.roomId, blankId)).toBe(false)
    expect(forfeitVipPlusMatch(result.state.roomId, blankId)).toBe(false)
  })

  test('preserves clockwise and counter-clockwise order with four humans and one Blank', async () => {
    const table = reducedReadyTable(4)
    const { io } = fakeIo()
    attachVipPlusBettingIo(io)
    const controlled = dealWithFiveValidArrangements()
    const result = await startVipPlusMatch(io, table, {
      acquire: async userId => ({ ok: true, escrowId: `escrow-${userId}`, buyInAmount: 2_000 }),
      refund: async () => undefined,
      deal: () => controlled.deal,
    })
    if (!result.ok) throw new Error(result.reason)
    for (const seat of result.state.humanSeats) {
      const playerId = result.state.playerBySeat[seat]
      const arrangement = controlled.arrangements[seat]
      const submitted = Object.fromEntries(Object.entries(arrangement).map(([group, cards]) => [group, (cards as Card[]).map(vipPlusCardKey)])) as any
      submitVipPlusArrangement(result.state.roomId, playerId, submitted)
    }
    expect(result.state.blankSeats).toEqual(['H5'])
    expect(result.state.betting?.turnOrder).toEqual(['p1', 'p2', 'p3', 'p4'])
    for (const playerId of ['p1', 'p2', 'p3', 'p4']) submitVipPlusBettingAction(result.state.roomId, playerId, 'CALL')
    expect(result.state.betting?.turnOrder).toEqual(['p4', 'p3', 'p2', 'p1'])
  })

  test('settles and ranks only real players in a reduced table', async () => {
    const table = reducedReadyTable()
    const { io } = fakeIo()
    attachVipPlusBettingIo(io)
    const result = await startVipPlusMatch(io, table, {
      acquire: async userId => ({ ok: true, escrowId: `escrow-${userId}`, buyInAmount: 2_000 }),
      refund: async () => undefined,
    })
    if (!result.ok) throw new Error(result.reason)
    const settled: string[] = []
    const final = await finalizeVipPlusMatch(result.state, {
      settle: async (playerId: string) => { settled.push(playerId); return 10_000 },
      persist: async () => undefined,
      recordStats: async () => undefined,
    } as any)
    expect(settled).toEqual(['p1', 'p2', 'p3'])
    expect(final?.rankings).toHaveLength(3)
    expect(final?.rankings.map(row => row.playerId)).toEqual(expect.arrayContaining(['p1', 'p2', 'p3']))
    expect(final?.rankings.some(row => row.displayName === 'Blank')).toBe(false)
  })

  test('rolls back acquired escrows when any of five acquisitions fails', async () => {
    const table = readyTable()
    const refunded: string[] = []
    const { io } = fakeIo()
    const result = await startVipPlusMatch(io, table, {
      acquire: async userId => userId === 'p3'
        ? { ok: false, reason: 'INSUFFICIENT_TOKENS' }
        : { ok: true, escrowId: `escrow-${userId}`, buyInAmount: 2_000 },
      refund: async (userId, escrowId, amount) => { refunded.push(`${userId}:${escrowId}:${amount}`) },
    })
    expect(result).toEqual({ ok: false, reason: 'INSUFFICIENT_TOKENS' })
    expect(refunded).toEqual(['p1:escrow-p1:2000', 'p2:escrow-p2:2000'])
  })

  test('rejects duplicate, foreign, and wrong-sized cards', () => {
    const hand = createDeck().slice(0, 9)
    const center = { g1: createDeck().slice(9, 12), g2: createDeck().slice(12, 15), g3: [createDeck()[15]] }
    expect(validateVipPlusArrangement(hand, center, { g1: hand.slice(0, 1), g2: hand.slice(2, 4), g3: hand.slice(4, 9) })).toEqual({ ok: false, reason: 'INVALID_LAYOUT' })
    expect(validateVipPlusArrangement(hand, center, { g1: [hand[0], hand[0]], g2: hand.slice(2, 4), g3: hand.slice(4, 9) })).toEqual({ ok: false, reason: 'INVALID_CARD_OWNERSHIP' })
  })

  test('accepts an owned 2-2-5 arrangement and locks after all five submit', async () => {
    const table = readyTable()
    const { io } = fakeIo()
    const controlled = dealWithFiveValidArrangements()
    const result = await startVipPlusMatch(io, table, {
      acquire: async userId => ({ ok: true, escrowId: `escrow-${userId}`, buyInAmount: 2_000 }),
      refund: async () => undefined,
      now: () => 1_000,
      deal: () => controlled.deal,
    })
    if (!result.ok) throw new Error(result.reason)
    for (const [seat, playerId] of Object.entries(result.state.playerBySeat)) {
      const arrangement = controlled.arrangements[seat]
      const submitted = Object.fromEntries(Object.entries(arrangement).map(([group, cards]) => [group, (cards as Card[]).map(vipPlusCardKey)])) as any
      expect(submitVipPlusArrangement(result.state.roomId, playerId, submitted).ok).toBe(true)
      expect(submitVipPlusArrangement(result.state.roomId, playerId, submitted)).toEqual({ ok: false, reason: 'ALREADY_SUBMITTED' })
    }
    expect(result.state.phase).toBe('BETTING')
  })

  // มติลุงเยาะ (รอบ 9) — G1 มี 2 รอบแล้ว (เดิมมีแค่ 1) เช็คว่ารอบ 2 ของกองเดียวกัน (H5 CCW) ยังกัน Fold
  // ของรอบ 1 ไว้ต่อ (foldedByGroup scope ตาม "กอง" ไม่ใช่ตาม "รอบ") แล้วพอกองเปลี่ยนจริง (group 2) ค่อยกลับมา
  // ให้ p1 เล่นได้ปกติ (fold ของกองก่อนหน้าไม่ตามข้ามกอง)
  test('uses H1 clockwise then H5 counter-clockwise per round, and keeps Fold pile-scoped within a group but not across groups', async () => {
    const { state } = await startedBettingMatch()
    expect(state.betting?.turnOrder).toEqual(['p1', 'p2', 'p3', 'p4', 'p5'])
    expect(submitVipPlusBettingAction(state.roomId, 'p1', 'FOLD')).toMatchObject({ ok: true, appliedAction: 'FOLD' })
    for (const playerId of ['p2', 'p3', 'p4', 'p5']) expect(submitVipPlusBettingAction(state.roomId, playerId, 'CALL').ok).toBe(true)
    // G1 รอบ 1 จบ — ยังอยู่กอง 1 แค่ขึ้นรอบ 2 (H5 CCW) p1 ยังโดนกันไว้เพราะ Fold ใน "กองเดียวกัน"
    expect(state.betting?.group).toBe(1)
    expect(state.betting?.groupRound).toBe(2)
    expect(state.betting?.turnOrder).toEqual(['p5', 'p4', 'p3', 'p2'])
    for (const playerId of ['p5', 'p4', 'p3', 'p2']) expect(submitVipPlusBettingAction(state.roomId, playerId, 'CALL').ok).toBe(true)
    // G1 จบทั้ง 2 รอบแล้ว ขึ้นกอง 2 รอบ 1 (H1 CW) — p1 กลับมาเล่นได้ปกติ (fold ไม่ตามข้ามกอง)
    expect(state.betting?.group).toBe(2)
    expect(state.betting?.groupRound).toBe(1)
    expect(state.betting?.turnOrder).toEqual(['p1', 'p2', 'p3', 'p4', 'p5'])
    expect(state.betting?.foldedByGroup[1].has('p1')).toBe(true)
    expect(state.betting?.foldedByGroup[2].has('p1')).toBe(false)
  })

  test('insufficient Call and deadline expiry Auto-Fold only the current group', async () => {
    const { state } = await startedBettingMatch()
    state.tokenBalance.p1 = 0
    expect(submitVipPlusBettingAction(state.roomId, 'p1', 'CALL')).toEqual({ ok: true, appliedAction: 'FOLD', autoFold: true })
    expect(state.betting?.foldedByGroup[1].has('p1')).toBe(true)
    state.deadlineAt = 100
    expect(resolveVipPlusBettingTimeout(state.roomId, 99)).toBe(false)
    expect(resolveVipPlusBettingTimeout(state.roomId, 100)).toBe(true)
    expect(state.betting?.foldedByGroup[1].has('p2')).toBe(true)
  })

  test('G3 first-round Fold is excluded from G3 second round', async () => {
    const { state } = await startedBettingMatch()
    while (state.betting?.group !== 3) {
      const current = state.betting!.turnOrder[state.betting!.currentTurnIndex]
      submitVipPlusBettingAction(state.roomId, current, 'CALL')
    }
    expect(state.betting?.groupRound).toBe(1)
    submitVipPlusBettingAction(state.roomId, 'p1', 'FOLD')
    while (state.betting?.group === 3 && state.betting.groupRound === 1) {
      const current = state.betting.turnOrder[state.betting.currentTurnIndex]
      submitVipPlusBettingAction(state.roomId, current, 'CALL')
    }
    expect(state.betting?.groupRound).toBe(2)
    expect(state.betting?.turnOrder).toEqual(['p5', 'p4', 'p3', 'p2'])
  })

  test('settles all four rounds, preserves Token conservation, and resets Game 2', async () => {
    const { state } = await startedBettingMatch()
    while (state.gameNumber === 1 && state.phase === 'BETTING') {
      const current = state.betting!.turnOrder[state.betting!.currentTurnIndex]
      expect(submitVipPlusBettingAction(state.roomId, current, 'CALL').ok).toBe(true)
    }
    expect(state.gameResults).toHaveLength(1)
    expect(state.gameNumber).toBe(2)
    expect(state.phase).toBe('INITIAL_ARRANGE')
    expect(state.arrangements).toEqual({})
    expect(state.pot).toEqual([50, 100, 200])
    const conserved = Object.values(state.tokenBalance).reduce((sum, amount) => sum + amount, 0) + state.pot.reduce((sum, amount) => sum + amount, 0) + state.feeRake
    expect(conserved).toBe(10_000)
  })

  test('reuses the existing Triple Sweep bonus and jackpot-rake formula', async () => {
    const { state } = await startedBettingMatch()
    while (state.gameNumber === 1 && state.phase === 'BETTING') {
      const current = state.betting!.turnOrder[state.betting!.currentTurnIndex]
      submitVipPlusBettingAction(state.roomId, current, current === 'p1' ? 'CALL' : 'FOLD')
    }
    expect(state.gameResults[0].winners).toEqual(['p1', 'p1', 'p1'])
    // มติลุงเยาะ (รอบ 9) — ทุกกองเล่น 2 รอบแล้ว ตัวเลขเปลี่ยนไปหมดจากเดิม (G1/G2 เดิมมีรอบเดียว G3 มี 2 รอบ
    // เท่ากันหมด ไม่มีตัวคูณ) คำนวณใหม่: callAmount ฐาน initiate = 50, ante = {10,20,40}, rake 5%
    // G1 pot = ante(50) + R1(1x=50) + R2(2x=100) = 200 -> payout floor(200*.95)=190, rake 10
    // G2 pot = ante(100) + R1(1x=50) + R2(2x=100) = 250 -> payout floor(250*.95)=237, rake 13
    // G3 pot = ante(200) + R1(2x=100) + R2(4x=200) = 500 -> payout floor(500*.95)=475, rake 25
    // regular pot rake รวม = 10+13+25 = 48; bonus = ante.pile3(40)x4 losers = 160
    // jackpot rake = floor((190+237+475+160)*5%) = floor(1062*.05) = 53; total Fee & Rake = 48+53 = 101
    expect(state.feeRake).toBe(101)
  })

  // มติลุงเยาะ (รอบ 11) — ค่าธรรมเนียมท้ายแมตช์ 10% เก็บเฉพาะ "กำไรสุทธิที่เป็นบวก" ของแต่ละคน คนที่เสมอทุน/
  // ขาดทุนไม่โดนหักซ้ำ — สืบต่อจากเทส Triple Sweep ด้านบน (p1 ชนะทุกกอง กำไรสุทธิเป็นบวกแน่นอน) อ่านค่า
  // tokenBalance จริงจาก state ก่อนแมตช์จบมาคำนวณ fee ที่ควรจะเป็นเอง กันพลาดเลขมือ (สูตรเดียวกับ production)
  test('finalizeVipPlusMatch charges a 10% fee only on positive net profit, leaving losers untouched', async () => {
    const { state } = await startedBettingMatch()
    while (state.gameNumber === 1 && state.phase === 'BETTING') {
      const current = state.betting!.turnOrder[state.betting!.currentTurnIndex]
      submitVipPlusBettingAction(state.roomId, current, current === 'p1' ? 'CALL' : 'FOLD')
    }
    expect(state.gameResults[0].winners).toEqual(['p1', 'p1', 'p1'])
    const feeRakeBeforeMatchEnd = state.feeRake
    const preFeeTokenBalance = state.tokenBalance.p1
    const preNetToken = preFeeTokenBalance - state.wager.buyIn
    expect(preNetToken).toBeGreaterThan(0) // Triple Sweep ต้องกำไรสุทธิเป็นบวกเสมอ ไม่งั้นเทสนี้ไม่มีความหมาย
    const expectedFee = Math.floor(preNetToken * 0.10)

    const final = await finalizeVipPlusMatch(state, {
      settle: async (_playerId, _escrowId, finalStack) => finalStack,
      persist: async () => undefined,
      recordStats: async () => undefined,
    })

    const p1Row = final!.rankings.find(row => row.playerId === 'p1')!
    expect(p1Row.netToken).toBe(preNetToken - expectedFee)
    expect(p1Row.finalStack).toBe(preFeeTokenBalance - expectedFee)
    // ผู้แพ้ (p2-p5) กำไรสุทธิติดลบ (จ่าย ante + โดนหัก jackpot loser stake) ไม่โดนค่าธรรมเนียมเลย
    for (const playerId of ['p2', 'p3', 'p4', 'p5']) {
      const row = final!.rankings.find(candidate => candidate.playerId === playerId)!
      expect(row.netToken).toBeLessThan(0)
    }
    expect(state.feeRake).toBe(feeRakeBeforeMatchEnd + expectedFee)
  })

  // มติลุงเยาะ — บั๊ก/feature ที่ลุงขอ: จบแมตช์ VIP Plus ต้องอัพเดทสถิติผู้เล่น (games_played/games_won/
  // triple sweep) เหมือนโต๊ะหลัก Initiate/Adept เรียก recordMatchStats ตัวเดียวกันเป๊ะ (matchStatsService.ts)
  // — tier มาจาก state.wager.bettingTier ตรงๆ (readyTable()/INITIATE_WAGER -> 'initiate')
  test('finalizeVipPlusMatch records match stats for every human player via the shared recordMatchStats service', async () => {
    const { state } = await startedBettingMatch()
    while (state.gameNumber === 1 && state.phase === 'BETTING') {
      const current = state.betting!.turnOrder[state.betting!.currentTurnIndex]
      submitVipPlusBettingAction(state.roomId, current, current === 'p1' ? 'CALL' : 'FOLD')
    }
    expect(state.gameResults[0].winners).toEqual(['p1', 'p1', 'p1']) // Triple Sweep ยืนยันแล้วจากเทสข้างบน

    const recorded: Array<{ userId: string; tier: string; won: boolean; isTripleSweep: boolean }> = []
    await finalizeVipPlusMatch(state, {
      settle: async (_playerId, _escrowId, finalStack) => finalStack,
      persist: async () => undefined,
      recordStats: async (inputs: any) => { recorded.push(...inputs) },
    })

    expect(recorded).toHaveLength(5)
    expect(recorded.every(row => row.tier === 'initiate')).toBe(true)
    const p1Stats = recorded.find(row => row.userId === 'p1')
    expect(p1Stats).toMatchObject({ won: true, isTripleSweep: true })
    for (const userId of ['p2', 'p3', 'p4', 'p5']) {
      expect(recorded.find(row => row.userId === userId)).toMatchObject({ won: false, isTripleSweep: false })
    }
  })

  test('resolves equal highest auction bids by first server receipt', () => {
    const winner = selectVipPlusAuctionWinner([
      { playerId: 'p2', amount: 100, multiplier: 2, serverReceivedAt: 20, receiptSequence: 2 },
      { playerId: 'p1', amount: 100, multiplier: 2, serverReceivedAt: 10, receiptSequence: 1 },
      { playerId: 'p3', amount: 50, multiplier: 1, serverReceivedAt: 5, receiptSequence: 3 },
    ])
    expect(winner?.playerId).toBe('p1')
  })

  test('accepts one fixed sealed bid, deducts once, and keeps private data out of public events', async () => {
    const { state, events } = await preparedAuctionMatch()
    const before = state.tokenBalance.p1
    expect(submitVipPlusAuctionBid(state.roomId, 'p1', 999)).toEqual({ ok: false, reason: 'INVALID_BID_AMOUNT' })
    expect(submitVipPlusAuctionBid(state.roomId, 'p1', 100, state.deadlineAt - 2)).toEqual({ ok: true })
    expect(submitVipPlusAuctionBid(state.roomId, 'p1', 50, state.deadlineAt - 1)).toEqual({ ok: false, reason: 'ALREADY_BID' })
    expect(submitVipPlusAuctionBid(state.roomId, 'p2', 100, state.deadlineAt - 1)).toEqual({ ok: true })
    expect(resolveVipPlusAuction(state.roomId)).toBe(true)
    expect(state.auction?.winnerId).toBe('p1')
    expect(state.tokenBalance.p1).toBe(before - 100)
    expect(state.auctionBurn).toBe(100)
    expect(state.phase).toBe('REARRANGE')

    const roomEvents = events.filter(event => event.room === state.roomId)
    expect(roomEvents.some(event => JSON.stringify(event.payload).includes(vipPlusCardKey(state.auctionCard!)))).toBe(false)
    expect(roomEvents.some(event => JSON.stringify(event.payload).includes('receiptSequence'))).toBe(false)
    expect(events.filter(event => event.event === 'vip_plus:auction_card_private')).toEqual([
      expect.objectContaining({ room: 'p1' }),
    ])
  })

  test('rejects an unaffordable bid without changing stack', async () => {
    const { state } = await preparedAuctionMatch()
    state.tokenBalance.p1 = 99
    expect(submitVipPlusAuctionBid(state.roomId, 'p1', 100)).toEqual({ ok: false, reason: 'INSUFFICIENT_TOKENS' })
    expect(state.tokenBalance.p1).toBe(99)
    expect(state.auction?.bids).toEqual({})
  })

  test('no-bid burns the hidden card and still opens rearrangement before betting', async () => {
    const { state } = await preparedAuctionMatch()
    expect(resolveVipPlusAuction(state.roomId)).toBe(true)
    expect(state.auctionCard).toBeNull()
    expect(state.phase).toBe('REARRANGE')
    const { finishVipPlusRearrangement } = await import('../../src/game/vipPlusMatchEngine')
    expect(finishVipPlusRearrangement(state.roomId)).toBe(true)
    expect(state.phase).toBe('BETTING')
  })

  test('winner may use the private auction card and discard one original card', async () => {
    const { state } = await preparedAuctionMatch()
    submitVipPlusAuctionBid(state.roomId, 'p1', 100)
    resolveVipPlusAuction(state.roomId)
    const deckByKey = new Map(createDeck().map(card => [vipPlusCardKey(card), card]))
    const cards = (keys: string[]) => keys.map(key => deckByKey.get(key)!)
    state.hands.p1 = cards(['5c', '7s', '3c', '4c', '10s', 'js', 'qs', 'ks', '9d'])
    state.auctionCard = deckByKey.get('as')!
    state.center = { g1: cards(['2s', '3h', '4d']), g2: cards(['8s', '8h', '2d']), g3: [] }
    const replacement = { g1: cards(['5c', '7s']), g2: cards(['3c', '4c']), g3: cards(['10s', 'js', 'qs', 'ks', 'as']) }
    const submitted = Object.fromEntries(Object.entries(replacement).map(([group, groupCards]) => [group, groupCards.map(vipPlusCardKey)])) as any
    expect(submitVipPlusRearrangement(state.roomId, 'p1', submitted).ok).toBe(true)
    const usedKeys = [...replacement.g1, ...replacement.g2, ...replacement.g3].map(vipPlusCardKey)
    expect(usedKeys).toHaveLength(9)
    expect(usedKeys).toContain(vipPlusCardKey(state.auctionCard!))
    expect(state.hands.p1.map(vipPlusCardKey)).toEqual(usedKeys)
    expect(state.auction?.rearrangedPlayers.has('p1')).toBe(true)
  })

  test('tracks disconnect and reconnect without changing the fixed seat', async () => {
    const { state } = await startedBettingMatch()
    expect(markVipPlusDisconnected(state.roomId, 'p3')).toBe(true)
    expect(state.seatStatus.H3).toBe('DISCONNECTED')
    expect(state.playerBySeat.H3).toBe('p3')
    expect(markVipPlusConnected(state.roomId, 'p3')).toBe(true)
    expect(state.seatStatus.H3).toBe('CONNECTED')
  })

  test('forfeit is permanent and removes the seat from future action order', async () => {
    const { state } = await startedBettingMatch()
    expect(forfeitVipPlusMatch(state.roomId, 'p3')).toBe(true)
    expect(state.seatStatus.H3).toBe('FORFEITED')
    expect(state.betting?.foldedByGroup[1].has('p3')).toBe(true)
    expect(state.betting?.foldedByGroup[2].has('p3')).toBe(true)
    expect(state.betting?.foldedByGroup[3].has('p3')).toBe(true)
    expect(markVipPlusConnected(state.roomId, 'p3')).toBe(false)
  })

  test('reconnect snapshot exposes only the requesting player private data', async () => {
    const { state } = await preparedAuctionMatch()
    submitVipPlusAuctionBid(state.roomId, 'p1', 100)
    submitVipPlusAuctionBid(state.roomId, 'p2', 50)
    const p1 = buildVipPlusSnapshot(state.roomId, 'p1')!
    const p2 = buildVipPlusSnapshot(state.roomId, 'p2')!
    expect(p1.hand).toEqual(state.hands.p1.map(vipPlusCardKey))
    // เช็คเฉพาะ field ที่มีสิทธิ์พกไพ่ส่วนตัวจริงๆ (hand/arrangement/auction.privateCard)
    // ห้ามใช้ JSON.stringify(p1).not.toContain(...) ตรงๆ เพราะ card key 2 ตัวอักษร
    // (เช่น "as") บังเอิญเป็น substring ของ field name อื่นได้ (เช่น "phase") ทำให้เทสสุ่ม pass/fail
    const p2CardKeys = new Set(state.hands.p2.map(vipPlusCardKey))
    const p1PrivateCardKeys = [
      ...p1.hand,
      ...Object.values(p1.arrangement ?? {}).flat(),
      ...(p1.auction?.privateCard ? [p1.auction.privateCard] : []),
    ]
    for (const key of p1PrivateCardKeys) expect(p2CardKeys.has(key)).toBe(false)
    expect(p1.auction?.ownLockedBid).toBe(100)
    expect(p2.auction?.ownLockedBid).toBe(50)
    expect(p1.auction).not.toHaveProperty('bids')
  })

  test('ranking prioritizes Net Token before pile metrics', async () => {
    const { state } = await startedBettingMatch()
    state.tokenBalance = { p1: 2100, p2: 2200, p3: 2000, p4: 2000, p5: 2000 }
    state.gameResults = [{ gameNumber: 1, winners: ['p1', 'p1', 'p1'], tokenBalance: {} }]
    expect(rankVipPlusMatch(state).rankings[0].playerId).toBe('p2')
  })

  test('ranking uses total pile wins when Net Token is tied', async () => {
    const { state } = await startedBettingMatch()
    state.tokenBalance = { p1: 2100, p2: 2100, p3: 2000, p4: 2000, p5: 2000 }
    state.gameResults = [{ gameNumber: 1, winners: ['p1', 'p1', 'p2'], tokenBalance: {} }]
    expect(rankVipPlusMatch(state).rankings[0].playerId).toBe('p1')
  })

  test('ranking uses G3 wins after Net Token and pile wins tie', async () => {
    const { state } = await startedBettingMatch()
    state.tokenBalance = { p1: 2100, p2: 2100, p3: 2000, p4: 2000, p5: 2000 }
    state.gameResults = [
      { gameNumber: 1, winners: ['p1', 'p2', 'p2'], tokenBalance: {} },
      { gameNumber: 2, winners: ['p1', 'p1', 'p2'], tokenBalance: {} },
    ]
    expect(rankVipPlusMatch(state).rankings[0].playerId).toBe('p2')
  })

  test('ranking declares joint winners when all three metrics remain tied', async () => {
    const { state } = await startedBettingMatch()
    state.tokenBalance = { p1: 2100, p2: 2100, p3: 2000, p4: 2000, p5: 2000 }
    state.gameResults = [{ gameNumber: 1, winners: ['p1', 'p2', 'p3'], tokenBalance: {} }]
    expect(rankVipPlusMatch(state).winnerSeats).toEqual(['H1', 'H2'])
  })

  test('final settlement and result persistence are idempotent', async () => {
    const { state, events } = await startedBettingMatch()
    const settled: string[] = []
    const persisted: string[] = []
    const dependencies = {
      settle: async (playerId: string, _escrowId: string, finalStack: number) => { settled.push(playerId); return finalStack + 10_000 },
      persist: async (match: any) => { persisted.push(match.roomId) },
      recordStats: async () => undefined,
    }
    const first = await finalizeVipPlusMatch(state, dependencies as any)
    const second = await finalizeVipPlusMatch(state, dependencies as any)
    expect(first).toEqual(second)
    expect(settled).toHaveLength(5)
    expect(persisted).toEqual([state.roomId])
    expect(events.filter(event => event.event === 'vip_plus:match_complete')).toHaveLength(1)
  })
})

// มติลุงเยาะ (รอบ 4) — HOLDEM_G3 เปิดกองกลาง G3 ทีละใบ: Flop 3 ใบตอนแจก, Turn ใบที่ 4 ก่อนรอบเดิมพัน G3
// รอบแรก, River ใบที่ 5 ก่อนรอบเดิมพัน G3 รอบสอง — คะแนนจริงตอน settle ต้องใช้ครบ 5 ใบเสมอไม่ว่าจะ "เปิด" ไปแล้วกี่ใบ
describe('VIP Plus Gate 4 — HOLDEM_G3 progressive board reveal', () => {
  beforeEach(() => clearVipPlusMatchState())
  afterEach(() => clearVipPlusMatchState())

  async function startedHoldemBettingMatch() {
    const registry = new VipPlusTableRegistry()
    const table = registry.create(player(1), 'INITIATE_WAGER', Date.now(), { centerRuleset: 'HOLDEM_G3', foulRuleEnabled: false })
    for (let number = 2; number <= 5; number++) registry.join(table.tableId, player(number))
    for (let number = 1; number <= 5; number++) registry.confirm(table.tableId, `p${number}`, 100_000, VIP_PLUS_ENTRY_TERMS_VERSION)
    const transport = fakeIo()
    attachVipPlusBettingIo(transport.io)
    const result = await startVipPlusMatch(transport.io, table, {
      acquire: async userId => ({ ok: true, escrowId: `escrow-${userId}`, buyInAmount: 2_000 }),
      refund: async () => undefined,
    })
    if (!result.ok) throw new Error(result.reason)
    for (const [seat, playerId] of Object.entries(result.state.playerBySeat)) {
      const hand = result.state.hands[playerId]
      const arrangement = { g1: hand.slice(0, 3), g2: hand.slice(3, 6), g3: hand.slice(6, 8) }
      const submitted = Object.fromEntries(Object.entries(arrangement).map(([group, cards]) => [group, (cards as Card[]).map(vipPlusCardKey)])) as any
      expect(submitVipPlusArrangement(result.state.roomId, playerId, submitted).ok).toBe(true)
    }
    return { state: result.state, ...transport }
  }

  test('deal shows only the Flop (3 cards) while the full 5-card board is dealt internally', async () => {
    const { state, events } = await startedHoldemBettingMatch()
    expect(state.center.g3).toHaveLength(5)
    expect(state.holdemBoardRevealed).toBe(3)
    const started = events.find(event => event.event === 'vip_plus:game_started')
    expect(started?.payload.center.g3).toHaveLength(3)
    expect(started?.payload.center.g3).toEqual(state.center.g3.slice(0, 3).map(vipPlusCardKey))
  })

  // มติลุงเยาะ — บั๊กที่ลุงเจอจริง: เกมแรกของแมตช์ HOLDEM_G3 มือมี G3 5 ใบ (ต้องมีแค่ 2) ต้นเหตุคือ game_started
  // ตัวแรก (จาก startVipPlusMatch โดยตรง ต่างจาก emitVipPlusGameStarted ที่ใช้เกม 2-3) ไม่เคยส่ง
  // centerRuleset/foulRuleEnabled มาด้วยเลย client เลย fallback ไปใช้ default 'WITH_G3_CENTER' ของตัวเอง
  // ไปคำนวณ autoArrange() ผิด (ดู client/app/game/vipPlus/index.tsx's private_hand handler)
  test('game 1 game_started carries the real centerRuleset/foulRuleEnabled (not left for the client to default)', async () => {
    const { state, events } = await startedHoldemBettingMatch()
    const started = events.find(event => event.event === 'vip_plus:game_started')
    expect(started?.payload.centerRuleset).toBe('HOLDEM_G3')
    expect(started?.payload.foulRuleEnabled).toBe(state.foulRuleEnabled)
  })

  test('Turn reveals the 4th card once G3 round 1 betting begins, River reveals the 5th before round 2', async () => {
    const { state, events } = await startedHoldemBettingMatch()
    while (state.betting?.group !== 3) {
      const current = state.betting!.turnOrder[state.betting!.currentTurnIndex]
      submitVipPlusBettingAction(state.roomId, current, 'CALL')
    }
    // มติลุงเยาะ — จุด Turn ต่อจาก G2 settle เลยใช้ extraDelayMs (resultDisplayMs) หน่วง "emit ตาแรก" จริง
    // (setTimeout จริง ไม่ fire ใน test แบบ synchronous) แต่ state.holdemBoardRevealed อัปเดต synchronous
    // เหมือน group/groupRound เสมอ (ดู comment ที่ startBettingRound) เลยเช็คจาก state ตรงๆ พอ ไม่ต้องพึ่ง events
    expect(state.betting?.groupRound).toBe(1)
    expect(state.holdemBoardRevealed).toBe(4)
    expect(state.center.g3.slice(0, state.holdemBoardRevealed)).toHaveLength(4)

    while (state.betting?.group === 3 && state.betting.groupRound === 1) {
      const current = state.betting!.turnOrder[state.betting!.currentTurnIndex]
      submitVipPlusBettingAction(state.roomId, current, 'CALL')
    }
    expect(state.betting?.groupRound).toBe(2)
    expect(state.holdemBoardRevealed).toBe(5)
    const riverTurns = events.filter(event => event.event === 'vip_plus:betting_turn' && event.payload.group === 3 && event.payload.groupRound === 2)
    expect(riverTurns[0]?.payload.center.g3).toHaveLength(5)
    expect(riverTurns[0]?.payload.center.g3).toEqual(state.center.g3.map(vipPlusCardKey))
  })

  test('reconnect snapshot only exposes the board cards revealed so far', async () => {
    const { state } = await startedHoldemBettingMatch()
    const midArrangeSnapshot = buildVipPlusSnapshot(state.roomId, 'p1')
    expect(midArrangeSnapshot?.center.g3).toHaveLength(3)
    while (state.betting?.group !== 3) {
      const current = state.betting!.turnOrder[state.betting!.currentTurnIndex]
      submitVipPlusBettingAction(state.roomId, current, 'CALL')
    }
    const turnSnapshot = buildVipPlusSnapshot(state.roomId, 'p1')
    expect(turnSnapshot?.center.g3).toHaveLength(4)
  })

  test('settlement always scores the full 7-card board+hole pile regardless of reveal progress', async () => {
    const { state } = await startedHoldemBettingMatch()
    while (state.gameNumber === 1 && state.phase === 'BETTING') {
      const current = state.betting!.turnOrder[state.betting!.currentTurnIndex]
      expect(submitVipPlusBettingAction(state.roomId, current, 'CALL').ok).toBe(true)
    }
    expect(state.gameResults).toHaveLength(1)
    // ทุกคน CALL หมด ไม่มีใคร Fold — ทุกกองต้องมีผู้ชนะจริง (ไม่ใช่ null จาก all-fold)
    expect(state.gameResults[0].winners.every(winner => !!winner)).toBe(true)
  })

  // มติลุงเยาะ (รอบ 10) — UI กระพริบเฉพาะ 5 ใบที่ใช้จริงตอนโชว์ผู้ชนะ G3 กองสุดท้าย ต้องได้ highlightedCards
  // (5 ใบ, subset) แยกจาก winningCards (7 ใบเต็ม: 2 hole + 5 shared) — G1/G2 ทั้ง 5 ใบใช้จริงหมดเลยเท่ากัน
  test('group_settled marks exactly 5 highlighted cards out of the 7 shown for the HOLDEM_G3 winner, and G1/G2 highlight everything shown', async () => {
    const { state, events } = await startedHoldemBettingMatch()
    while (state.gameNumber === 1 && state.phase === 'BETTING') {
      const current = state.betting!.turnOrder[state.betting!.currentTurnIndex]
      submitVipPlusBettingAction(state.roomId, current, 'CALL')
    }
    const settled = events.filter(event => event.event === 'vip_plus:group_settled')
    const g1 = settled.find(event => event.payload.group === 1)!
    const g2 = settled.find(event => event.payload.group === 2)!
    const g3 = settled.find(event => event.payload.group === 3)!

    expect(g1.payload.winningCards).toHaveLength(5)
    expect(g1.payload.highlightedCards).toEqual(g1.payload.winningCards)
    expect(g2.payload.winningCards).toHaveLength(5)
    expect(g2.payload.highlightedCards).toEqual(g2.payload.winningCards)

    expect(g3.payload.winningCards).toHaveLength(7)
    expect(g3.payload.highlightedCards).toHaveLength(5)
    expect(g3.payload.highlightedCards.every((key: string) => g3.payload.winningCards.includes(key))).toBe(true)
  })
})

// มติลุงเยาะ — บั๊กที่ลุงเจอจริง: จบแมตช์กลับ Lobby แล้วเปิด/เข้าโต๊ะใหม่ไม่ได้ ขึ้น "Player already seated"
// ตลอด ต้นเหตุคือ vipPlusTableRegistry (playerTable map) ไม่เคยถูกปล่อยทิ้งเลยหลังแมตช์จบจริง ต้องใช้
// singleton ตัวจริง (ไม่ใช่ new VipPlusTableRegistry() แยกแบบเทสอื่นในไฟล์นี้) เพราะ finalizeVipPlusMatch
// เรียก singleton ตัวเดียวกับที่ vipPlusSocket.ts ใช้จริงตอน production
describe('VIP Plus — table registry release on match completion', () => {
  beforeEach(() => { clearVipPlusMatchState(); vipPlusTableRegistry.clear() })
  afterEach(() => { clearVipPlusMatchState(); vipPlusTableRegistry.clear() })

  test('releases every seated player from the shared registry once the match truly finishes, fixing "Player already seated" on the next table', async () => {
    const table = vipPlusTableRegistry.create(player(1), 'INITIATE_WAGER')
    for (let number = 2; number <= 5; number++) vipPlusTableRegistry.join(table.tableId, player(number))
    for (let number = 1; number <= 5; number++) vipPlusTableRegistry.confirm(table.tableId, `p${number}`, 100_000, VIP_PLUS_ENTRY_TERMS_VERSION)
    const readyTable = vipPlusTableRegistry.get(table.tableId)!
    expect(readyTable.status).toBe('READY')

    const transport = fakeIo()
    attachVipPlusBettingIo(transport.io)
    const controlled = dealWithFiveValidArrangements()
    const started = await startVipPlusMatch(transport.io, readyTable, {
      acquire: async userId => ({ ok: true, escrowId: `escrow-${userId}`, buyInAmount: 2_000 }),
      refund: async () => undefined,
      deal: () => controlled.deal,
    })
    if (!started.ok) throw new Error(started.reason)

    // ระหว่างแมตช์ยังเล่นอยู่จริง — ต้องยังโดน PLAYER_ALREADY_SEATED เหมือนเดิม (ล็อคอยู่กับแมตช์ปัจจุบันตาม
    // กติกาเดิม "Leaving an active match is a Forfeit" ห้ามเปิดโต๊ะใหม่ซ้อนได้ก่อนแมตช์เดิมจบ)
    expect(() => vipPlusTableRegistry.create(player(1), 'INITIATE_WAGER')).toThrow('PLAYER_ALREADY_SEATED')

    // เรียก finalizeVipPlusMatch ตรงๆ แทนการเดินเกมครบ 3 เกมจริง (เกม 2-3 ใช้ไพ่สุ่มจริงไม่ใช่ controlled
    // deck ต้องหา arrangement ที่ไม่ foul ใหม่ทุกเกม ซึ่งไม่ใช่จุดที่เทสนี้ต้องการวัด — เทสนี้วัดแค่ว่า
    // registry ถูกปล่อยจริงตอนแมตช์จบ ไม่ใช่วัดกลไกเดินเกม ดู "settles all four rounds..." ด้านบนสำหรับ
    // เทสที่คุมกลไกเดินเกมจริงอยู่แล้ว)
    await finalizeVipPlusMatch(started.state, {
      settle: async (_playerId, _escrowId, finalStack) => finalStack,
      persist: async () => undefined,
      recordStats: async () => undefined,
    })
    expect(started.state.matchComplete).toBe(true)

    // แมตช์จบจริงแล้ว — เปิดโต๊ะใหม่ได้ทันที ไม่ใช่ PLAYER_ALREADY_SEATED อีกต่อไป
    expect(() => vipPlusTableRegistry.create(player(1), 'INITIATE_WAGER')).not.toThrow()
    expect(vipPlusTableRegistry.get(table.tableId)).toBeNull()
  })
})
