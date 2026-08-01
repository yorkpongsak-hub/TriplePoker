import { createArenaDeck, createSeededRandom, dealArenaCards, shuffleArenaDeck, ArenaStandardCard } from '../../src/arena/cards/arenaDeck'
import { autoLockJoker, declareJoker, extraAnteForJoker } from '../../src/arena/joker/jokerRules'
import { compareArenaHands, evaluateArenaHand } from '../../src/arena/joker/wildHandEvaluator'
import { resolveBlindAuction, resolveFaceUpAuction } from '../../src/arena/auction/arenaAuction'
import { recordGFAction, soleRemainingPlayer, startPile2GF, startPile3Round1, startPile3Round2, GFPlayer } from '../../src/arena/gf/arenaGFRules'
import { projectArenaPlayers } from '../../src/arena/fog/arenaFogOfWar'

const card = (rank: ArenaStandardCard['rank'], suit: ArenaStandardCard['suit'], value: number): ArenaStandardCard =>
  ({ kind: 'STANDARD', id: `${rank}_${suit}`, rank, suit, value })

describe('Gate 3 - Arena deck 53 cards', () => {
  test('มีไพ่ 52 ใบ + Joker และแจกครบ 44+6+3', () => {
    const deck = createArenaDeck()
    expect(deck).toHaveLength(53)
    expect(new Set(deck.map(item => item.id)).size).toBe(53)
    expect(deck.filter(item => item.kind === 'JOKER')).toHaveLength(1)

    const dealt = dealArenaCards(deck)
    expect(dealt.players.map(hand => hand.length)).toEqual([11, 11, 11, 11])
    expect(Object.values(dealt.community).flat()).toHaveLength(6)
    expect([dealt.auction.faceUp, ...dealt.auction.blind]).toHaveLength(3)
  })

  test('seed เดิมให้ shuffle และ deal เหมือนเดิม', () => {
    const first = shuffleArenaDeck(createArenaDeck(), createSeededRandom(42)).map(item => item.id)
    const second = shuffleArenaDeck(createArenaDeck(), createSeededRandom(42)).map(item => item.id)
    expect(first).toEqual(second)
    expect(first).not.toEqual(createArenaDeck().map(item => item.id))
  })
})

describe('Gate 3 - Joker rules and Wild evaluator', () => {
  test('Community Pile 3 บังคับ Wild Pile 3', () => {
    expect(declareJoker({
      mode: 'ANTE_X2', targetPile: 1, declaredAt: 'now', availableCrest: 0,
      requiredMatchedAnteCrest: 99, communityPile3Joker: true,
    })).toEqual({ mode: 'WILD', targetPile: 3, forcedWild: true, declaredAt: 'now' })
  })

  test('Ante x2 คูณเฉพาะ base ante และต้องมียอดพอ', () => {
    const declaration = declareJoker({ mode: 'ANTE_X2', targetPile: 3, declaredAt: 'now', availableCrest: 12, requiredMatchedAnteCrest: 6 })
    expect(extraAnteForJoker(declaration, { 1: 3, 2: 3, 3: 6 })).toBe(6)
    expect(() => declareJoker({ mode: 'ANTE_X2', targetPile: 3, declaredAt: 'now', availableCrest: 5, requiredMatchedAnteCrest: 6 }))
      .toThrow('INSUFFICIENT_CREST_FOR_ANTE_X2')
    expect(autoLockJoker('timeout')).toEqual({ mode: 'WILD', targetPile: 3, forcedWild: false, declaredAt: 'timeout' })
  })

  test('Wild สร้าง Royal Flush และเลือก best 5 จาก 7 ใบ', () => {
    const result = evaluateArenaHand([
      card('10', 'hearts', 10), card('J', 'hearts', 11), card('Q', 'hearts', 12), card('K', 'hearts', 13),
      { kind: 'JOKER', id: 'JOKER' }, card('2', 'clubs', 2), card('3', 'diamonds', 3),
    ])
    expect(result.rank).toBe('royal_flush')
    expect(result.jokerAs).toEqual({ rank: 'A', suit: 'hearts' })
  })

  test('Joker ห้ามสร้าง Five of a Kind', () => {
    const result = evaluateArenaHand([
      card('A', 'spades', 14), card('A', 'hearts', 14), card('A', 'diamonds', 14), card('A', 'clubs', 14),
      { kind: 'JOKER', id: 'JOKER' },
    ])
    expect(result.rank).toBe('four_of_a_kind')
    expect(result.jokerAs?.rank).not.toBe('A')
  })

  test('Natural ชนะ Wild เมื่อ rank และ score เท่ากัน', () => {
    const natural = evaluateArenaHand([
      card('10', 'hearts', 10), card('J', 'hearts', 11), card('Q', 'hearts', 12), card('K', 'hearts', 13), card('A', 'hearts', 14),
    ])
    const wild = evaluateArenaHand([
      card('10', 'hearts', 10), card('J', 'hearts', 11), card('Q', 'hearts', 12), card('K', 'hearts', 13), { kind: 'JOKER', id: 'JOKER' },
    ])
    expect(compareArenaHands(natural, wild)).toBeGreaterThan(0)
  })
})

describe('Gate 3 - two-round Auction', () => {
  const [face, blind0, blind1] = createArenaDeck().slice(0, 3)
  const players = ['p1', 'p2', 'p3', 'p4']

  test('Face-up: ผู้ชนะคนเดียวถูกหักและเงินเข้า Battle Rewards', () => {
    const result = resolveFaceUpAuction(face, [
      { playerId: 'p1', amountCrest: 3 }, { playerId: 'p2', amountCrest: 12 },
      { playerId: 'p3', amountCrest: 6 }, { playerId: 'p4', amountCrest: 0 },
    ], players)
    expect(result).toMatchObject({ status: 'AWARDED', winnerId: 'p2', chargedCrest: 12, battleRewardsCrest: 12, tieBreak: 'NONE' })
  })

  test('ราคาเสมอใช้ deterministic Lucky Draw เฉพาะคนที่เสมอ', () => {
    const result = resolveFaceUpAuction(face, [
      { playerId: 'p1', amountCrest: 9 }, { playerId: 'p2', amountCrest: 3 }, { playerId: 'p3', amountCrest: 9 },
    ], players, () => 0.99)
    expect(result.winnerId).toBe('p3')
    expect(result.tieBreak).toBe('LUCKY_DRAW')
    expect(result.tiedPlayerIds).toEqual(['p1', 'p3'])
  })

  test('Blind: ผู้ชนะรอบแรกหมดสิทธิ์ และผู้เล่นเลือกได้ใบเดียว', () => {
    expect(() => resolveBlindAuction([blind0, blind1], [{ playerId: 'p2', amountCrest: 3, cardIndex: 0 }], players, 'p2'))
      .toThrow('AUCTION_PLAYER_NOT_ELIGIBLE')
    const result = resolveBlindAuction([blind0, blind1], [
      { playerId: 'p1', amountCrest: 6, cardIndex: 0 },
      { playerId: 'p3', amountCrest: 0, cardIndex: 1 },
      { playerId: 'p4', amountCrest: 3, cardIndex: 1 },
    ], players, 'p2')
    expect(result.map(item => item.winnerId)).toEqual(['p1', 'p4'])
  })

  test('Bid 0 ทุกคนทำให้ไพ่ถูกทิ้ง', () => {
    const result = resolveFaceUpAuction(face, players.map(playerId => ({ playerId, amountCrest: 0 as const })), players)
    expect(result).toMatchObject({ status: 'DISCARDED', winnerId: null, chargedCrest: 0 })
  })
})

describe('Gate 3 - GF and Fog of War', () => {
  const players: GFPlayer[] = [
    { playerId: 'p1', seat: 1, isBoss: false, joinedAt: 1 },
    { playerId: 'boss', seat: 3, isBoss: true, joinedAt: 4 },
    { playerId: 'p2', seat: 2, isBoss: false, joinedAt: 2 },
    { playerId: 'p4', seat: 4, isBoss: false, joinedAt: 3 },
  ]

  test('Pile 2 เริ่ม Boss และทวนเข็ม; Pile 3 สลับทิศตามกติกา', () => {
    const pile2 = startPile2GF(players)
    expect(pile2.turnOrder[0]).toBe('boss')
    expect(pile2.direction).toBe('COUNTER_CLOCKWISE')

    const pile3r1 = startPile3Round1(players, 'p2')
    expect(pile3r1.turnOrder[0]).toBe('p2')
    expect(pile3r1.direction).toBe('CLOCKWISE')
    let acted = recordGFAction(pile3r1, 'p2', 'CALL')
    acted = recordGFAction(acted, 'boss', 'FOLD')
    acted = recordGFAction(acted, 'p4', 'CALL')
    const pile3r2 = startPile3Round2(players, acted)
    expect(pile3r2.turnOrder).toEqual(['p4', 'p2'])
    expect(pile3r2.direction).toBe('COUNTER_CLOCKWISE')
  })

  test('เหลือคนเดียวชนะทันทีโดยไม่ต้องเปิดไพ่', () => {
    let round = startPile3Round1(players.slice(0, 2), 'p1')
    round = recordGFAction(round, 'boss', 'FOLD')
    expect(soleRemainingPlayer(round)).toBe('p1')
  })

  test('Projection ซ่อนไพ่คู่แข่งและซ่อน Wild target จนเปิด Pile', () => {
    const ace = card('A', 'spades', 14)
    const king = card('K', 'hearts', 13)
    const projected = projectArenaPlayers([
      { playerId: 'me', hand: [ace] },
      { playerId: 'opp', hand: [king], jokerDeclaration: { mode: 'WILD', targetPile: 2, forcedWild: false, declaredAt: 'now' } },
    ], 'me')
    expect(projected[0].hand[0]).toEqual(ace)
    expect(projected[1].hand[0]).toEqual({ kind: 'HIDDEN' })
    expect(projected[1].jokerDeclaration).not.toHaveProperty('targetPile')

    const revealed = projectArenaPlayers([
      { playerId: 'opp', hand: [king], jokerDeclaration: { mode: 'WILD', targetPile: 2, forcedWild: false, declaredAt: 'now' } },
    ], 'me', new Set([king.id]), new Set([2]))
    expect(revealed[0].hand[0]).toEqual(king)
    expect(revealed[0].jokerDeclaration).toHaveProperty('targetPile', 2)
  })
})
