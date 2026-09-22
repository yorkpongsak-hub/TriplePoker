import { AI_CONFIGS } from '../../src/game/aiEngine'
import { arrangeTierDBot, createTierDLevel, tierDAiCandidateFraction } from '../../src/game/tierDSolo'
import { TIER_D_RISE_SOLO_PERSONALITIES, tierDRiseCandidateFraction, tierDRiseVisiblePileWeights, type TierDRiseSoloPersonality } from '../../src/game/tierDRiseSoloPersonality'

const fixedRandom = () => .5

describe('TriplePoker: Rise Solo Lv.1000+ personalities', () => {
  test('the gate is exact and keeps Lv.1-999 on the legacy decision path', () => {
    const legacy = createTierDLevel(999, 'human', fixedRandom)
    expect(legacy.seats.filter(seat => seat.isBot).every(seat => seat.risePersonality === undefined)).toBe(true)
    const firstBot = legacy.seats.find(seat => seat.isBot)!
    expect(legacy.arrangements[firstBot.id]).toEqual(arrangeTierDBot(
      legacy.dealtHands[firstBot.id], legacy.communityPiles, firstBot.difficulty.skill,
      fixedRandom, legacy.missions, firstBot.id === legacy.comboBotId, tierDAiCandidateFraction(999),
    ))

    const rise = createTierDLevel(1000, 'human', fixedRandom)
    expect(rise.seats.filter(seat => seat.isBot).map(seat => [seat.bot?.name, seat.risePersonality])).toEqual([
      ['Reaper', 'reaper'], ['Crag', 'crag'], ['Cypher', 'cypher'],
    ])
  })

  test('shared multiplayer AI configs remain the established three profiles', () => {
    expect(AI_CONFIGS.map(({ id, personality }) => [id, personality])).toEqual([
      ['AI_SAGE', 'sage'], ['AI_RECKLESS', 'reckless'], ['AI_GHOST', 'ghost'],
    ])
  })

  test('difficulty improves candidate precision inside each personality without perfect play', () => {
    for (const personality of ['reaper', 'crag', 'cypher'] as const) {
      expect(tierDRiseCandidateFraction(1000, personality)).toBe(.20)
      expect(tierDRiseCandidateFraction(1250, personality)).toBeCloseTo(.16)
      expect(tierDRiseCandidateFraction(1500, personality)).toBe(.12)
      expect(tierDRiseCandidateFraction(100000, personality)).toBe(.12)
    }
  })

  test('the same legal hand produces personality-dependent final decisions', () => {
    const fixture = createTierDLevel(999, 'human', fixedRandom)
    const cards = fixture.dealtHands['tier-d-bot-1']
    const decisions = (['reaper', 'crag', 'cypher'] as TierDRiseSoloPersonality[]).map(personality =>
      arrangeTierDBot(cards, fixture.communityPiles, 5, fixedRandom, [], false, .12, {
        personality, visible: { community: fixture.communityPiles },
      }),
    )
    const keys = decisions.map(arrangement => JSON.stringify(arrangement))
    expect(new Set(keys).size).toBeGreaterThan(1)
  })

  test('changing hidden opponents cards cannot change a decision with identical visible input', () => {
    const state = createTierDLevel(1000, 'human', fixedRandom)
    const bot = state.seats.find(seat => seat.risePersonality === 'cypher')!
    const ownCards = [...state.dealtHands[bot.id]]
    const visible = { community: state.communityPiles }
    const decide = () => arrangeTierDBot(ownCards, state.communityPiles, 5, () => .37, [], false, .12, { personality: 'cypher', visible })
    const before = decide()
    ;[state.dealtHands.human[0], state.dealtHands['tier-d-bot-1'][0]] = [state.dealtHands['tier-d-bot-1'][0], state.dealtHands.human[0]]
    expect(decide()).toEqual(before)
  })

  test('Cypher adapts to public community and only a revealed auction card', () => {
    const state = createTierDLevel(999, 'human', fixedRandom)
    const base = tierDRiseVisiblePileWeights('cypher', { community: state.communityPiles })
    const withVisibleAuction = tierDRiseVisiblePileWeights('cypher', { community: state.communityPiles, visibleAuctionCard: state.dealtHands.human[0] })
    expect(withVisibleAuction[1]).toBeGreaterThan(base[1])
    expect(TIER_D_RISE_SOLO_PERSONALITIES.cypher.pileWeights).toEqual([1, 1, 1])
  })
})
