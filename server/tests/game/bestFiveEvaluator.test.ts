import { Card } from '../../src/game/deck'
import { compareHands, evaluateBestFive, evaluateSoloG2BestFive, evaluateSoloG3BestFive } from '../../src/game/handEvaluator'

const c = (value: number, suit: string): Card => ({ value, suit } as Card)
const S = 'spades'; const H = 'hearts'; const D = 'diamonds'; const C = 'clubs'

describe('Core Best Five evaluator', () => {
  test('G2 normal player resolves three player cards plus two community cards', () => {
    const result = evaluateSoloG2BestFive([c(14, S), c(13, H), c(12, D)], [c(11, C), c(10, S)])
    expect(result.rank).toBe('straight')
    expect(result.bestFive).toHaveLength(5)
    expect(result.unusedCards).toHaveLength(0)
    expect(result.auctionCardUsed).toBe(false)
  })

  test('G2 Auction owner evaluates Best 5/6 and selects the Auction Card when it improves', () => {
    const auction = c(14, C)
    const result = evaluateSoloG2BestFive([c(14, S), c(14, H), c(13, D)], [c(14, D), c(13, S)], auction)
    expect(result.rank).toBe('four_of_a_kind')
    expect(result.auctionCardUsed).toBe(true)
    expect(result.bestFive).toHaveLength(5)
    expect(result.unusedCards).toEqual([c(13, S)])
  })

  test('G2 Auction Card is optional and can be ignored', () => {
    const auction = c(4, C)
    const result = evaluateSoloG2BestFive([c(14, S), c(13, S), c(12, S)], [c(11, S), c(10, S)], auction)
    expect(result.rank).toBe('royal_flush')
    expect(result.auctionCardUsed).toBe(false)
    expect(result.unusedCards).toEqual([auction])
  })

  test('G3 is Best 5/7 for everyone and takes no Auction Card', () => {
    const result = evaluateSoloG3BestFive([c(14, S), c(13, H), c(12, D), c(2, C), c(3, S)], [c(11, C), c(10, S)])
    expect(result.rank).toBe('straight')
    expect(result.bestFive.map(card => card.value).sort((a, b) => b - a)).toEqual([14, 13, 12, 11, 10])
    expect(result.unusedCards).toHaveLength(2)
  })

  test('Core accepts Best Five from 5, 6, or 7 cards only: no Best 5/8 path', () => {
    const cards = [c(14, S), c(13, H), c(12, D), c(11, C), c(2, S)]
    expect(evaluateBestFive(cards).bestFive).toHaveLength(5)
    expect(evaluateBestFive([...cards, c(3, H)]).unusedCards).toHaveLength(1)
    expect(evaluateBestFive([...cards, c(3, H), c(4, D)]).unusedCards).toHaveLength(2)
    expect(() => evaluateBestFive([...cards, c(3, H), c(4, D), c(5, C)])).toThrow('5 to 7')
  })

  test('comparison data preserves ties and poker-category ordering', () => {
    const tieA = evaluateBestFive([c(14, S), c(14, H), c(13, D), c(12, C), c(2, S)])
    const tieB = evaluateBestFive([c(14, D), c(14, C), c(13, S), c(12, H), c(2, D)])
    const flush = evaluateBestFive([c(14, S), c(10, S), c(7, S), c(4, S), c(2, S), c(3, H), c(5, D)])
    expect(compareHands(tieA, tieB)).toBe(0)
    expect(flush.rank).toBe('flush')
    expect(compareHands(flush, tieA)).toBeGreaterThan(0)
  })
})
