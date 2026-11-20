export const RANKS = ['High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush', 'Royal Flush']
export const HAND_SCORES = Object.freeze({
  'High Card': 1, Pair: 2, 'Two Pair': 3, 'Three of a Kind': 4,
  Straight: 5, Flush: 6, 'Full House': 8, 'Four of a Kind': 10,
  'Straight Flush': 15, 'Royal Flush': 20,
})
export const scoreHand = rank => HAND_SCORES[rank] || 0

export function getMissionMultiplier(actualRank, missionRank) {
  if (!missionRank) return { relation: 'No Mission', multiplier: 1 }
  if (actualRank === missionRank) return { relation: 'Exact Mission', multiplier: 1.10 }
  if (actualRank === 'High Card') return { relation: 'Lowest Result', multiplier: 0.90 }
  if (rankValue(actualRank) > rankValue(missionRank)) return { relation: 'Higher Than Mission', multiplier: 1.02 }
  return { relation: 'Lower Than Mission', multiplier: 0.95 }
}

export function applyMissionCumulativeScore(oldCumulativeScore, currentMissionScore, actualRank, missionRank) {
  const outcome = getMissionMultiplier(actualRank, missionRank)
  return { ...outcome, score: Math.round((oldCumulativeScore + currentMissionScore) * outcome.multiplier) }
}
export const rankValue = rank => RANKS.indexOf(rank)

const rankNumber = rank => ({ A: 14, K: 13, Q: 12, J: 11 }[rank] || Number(rank))

function evaluateNatural(cards) {
  const values = cards.map(card => rankNumber(card.rank)).sort((a, b) => a - b)
  const counts = [...values.reduce((map, value) => map.set(value, (map.get(value) || 0) + 1), new Map()).values()].sort((a, b) => b - a)
  const flush = cards.every(card => card.suit === cards[0].suit)
  const unique = [...new Set(values)]
  const straight = unique.length === 5 && (unique[4] - unique[0] === 4 || unique.join(',') === '2,3,4,5,14')
  if (straight && flush && unique.join(',') === '10,11,12,13,14') return 'Royal Flush'
  if (straight && flush) return 'Straight Flush'
  if (counts[0] === 4) return 'Four of a Kind'
  if (counts[0] === 3 && counts[1] === 2) return 'Full House'
  if (flush) return 'Flush'
  if (straight) return 'Straight'
  if (counts[0] === 3) return 'Three of a Kind'
  if (counts[0] === 2 && counts[1] === 2) return 'Two Pair'
  if (counts[0] === 2) return 'Pair'
  return 'High Card'
}

const naturalDeck = (() => {
  const cards = []
  for (const suit of ['S', 'H', 'D', 'C']) for (const rank of ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']) cards.push({ rank, suit })
  return cards
})()
const wildEvaluationCache = new Map()

export function evaluateHand(cards) {
  if (cards.length !== 5) return null
  const jokers = cards.filter(card => card.joker).length
  if (!jokers) return evaluateNatural(cards)
  const cacheKey = `${jokers}/${cards.filter(card => !card.joker).map(card => `${card.rank}${card.suit}`).sort().join('.')}`
  if (wildEvaluationCache.has(cacheKey)) return wildEvaluationCache.get(cacheKey)
  let best = 'High Card'
  const fixed = cards.filter(card => !card.joker)
  const search = picked => {
    if (picked.length === jokers) {
      const value = evaluateNatural([...fixed, ...picked])
      if (rankValue(value) > rankValue(best)) best = value
      return
    }
    for (const card of naturalDeck) search([...picked, card])
  }
  search([])
  wildEvaluationCache.set(cacheKey, best)
  return best
}

export function evaluateBestHand(cards) {
  if (cards.length === 5) return { rank: evaluateHand(cards), usedCards: [...cards], leftoverCard: null }
  if (cards.length !== 6) return { rank: null, usedCards: [], leftoverCard: null }
  let best = null
  for (let omitted = cards.length - 1; omitted >= 0; omitted--) {
    const usedCards = cards.filter((_, index) => index !== omitted)
    const rank = evaluateHand(usedCards)
    if (!best || rankValue(rank) > rankValue(best.rank)) best = { rank, usedCards, leftoverCard: cards[omitted] }
  }
  return best
}
