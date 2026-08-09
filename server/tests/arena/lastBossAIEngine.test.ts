import { checkArenaFoul, evaluatePileBest } from '../../src/arena/arrangement/arenaArrangement'
import { ArenaCard, createArenaDeck, createSeededRandom } from '../../src/arena/cards/arenaDeck'
import { LastBossAIEngine } from '../../src/arena/sovereign/lastBossAIEngine'

const deck = createArenaDeck()
const byId = new Map(deck.map(card => [card.id, card]))
const cards = (...ids: string[]): ArenaCard[] => ids.map(id => {
  const card = byId.get(id)
  if (!card) throw new Error(`missing test card ${id}`)
  return card
})

describe('Tier S+ The Last Boss AI engine', () => {
  const community = {
    pile1: cards('2_clubs', '7_diamonds'),
    pile2: cards('8_clubs', '9_diamonds'),
    pile3: cards('10_spades', 'J_spades'),
  }

  test('exhaustively evaluates all 9,240 partitions and returns a legal non-foul 3-3-5 arrangement', () => {
    const hand = cards('2_hearts', '3_hearts', '4_clubs', '5_diamonds', '6_spades', '8_hearts', '9_hearts', 'Q_spades', 'K_spades', 'A_spades', 'JOKER')
    const engine = new LastBossAIEngine({ random: createSeededRandom(11), monteCarloSamples: 32 })
    const result = engine.arrange(hand, community)

    expect(result.evaluatedPartitions).toBe(9_240)
    expect(result.arrangement.pile1).toHaveLength(3)
    expect(result.arrangement.pile2).toHaveLength(3)
    expect(result.arrangement.pile3).toHaveLength(5)
    expect(new Set([...result.arrangement.pile1, ...result.arrangement.pile2, ...result.arrangement.pile3]).size).toBe(11)
    expect(checkArenaFoul(result.arrangement, new Map(hand.map(card => [card.id, card])), community).fouled).toBe(false)
  })

  test('Pile 3 is ranked as Best 5 of exactly seven cards', () => {
    const privatePile = cards('2_clubs', '3_diamonds', 'Q_spades', 'K_spades', 'A_spades')
    const board = cards('10_spades', 'J_spades')
    const result = evaluatePileBest(privatePile, board)

    expect(result.rank).toBe('royal_flush')
    expect(result.selectedCardIds).toHaveLength(5)
    expect(result.selectedCardIds).toEqual(expect.arrayContaining(['10_spades', 'J_spades', 'Q_spades', 'K_spades', 'A_spades']))
  })

  test('mandatory discard lock cannot be changed by the Boss', () => {
    const hand = cards('2_hearts', '3_hearts', '4_clubs', '5_diamonds', '6_spades', '7_hearts', '8_hearts', '9_hearts', 'Q_spades', 'K_spades', 'A_spades', 'JOKER')
    const engine = new LastBossAIEngine({ monteCarloSamples: 32 })
    const result = engine.chooseDiscard(hand, community, new Set(['JOKER']))

    expect(result.cardId).toBe('JOKER')
    expect([...result.decision.arrangement.pile1, ...result.decision.arrangement.pile2, ...result.decision.arrangement.pile3]).not.toContain('JOKER')
  })

  test('uses pot odds for Call/Fold and only samples unseen cards', () => {
    const engine = new LastBossAIEngine({ random: createSeededRandom(99), monteCarloSamples: 96, riskMargin: 0 })
    const bossPile = cards('Q_spades', 'K_spades', 'A_spades', '2_clubs', '3_diamonds')
    const board = cards('10_spades', 'J_spades')
    const decision = engine.decideCall({
      bossPileCards: bossPile,
      communityCards: board,
      publicKnownCards: [],
      opponentIds: ['h1', 'h2', 'h3'],
      opponentRevealedCards: { h1: cards('4_clubs'), h2: [], h3: [] },
      potCrest: 9,
      callCostCrest: 9,
    })

    expect(decision.action).toBe('CALL')
    expect(decision.estimatedEquity).toBe(1)
    expect(decision.requiredEquity).toBe(0.5)
  })

  test('face-up auction respects ineligibility and available bid levels', () => {
    const hand = cards('2_hearts', '3_hearts', '4_clubs', '5_diamonds', '6_spades', '8_hearts', '9_hearts', 'Q_spades', 'K_spades', 'A_spades', 'JOKER')
    const engine = new LastBossAIEngine({ monteCarloSamples: 32 })
    expect(engine.decideFaceUpBid({ hand, community, auctionCard: byId.get('10_hearts')!, bidOptionsCrest: [0, 9, 18, 27, 36], availableCrest: 36, eligible: false })).toMatchObject({ bidCrest: 0, reasonCode: 'INELIGIBLE' })
  })
})
