import { evaluateBestHand, scoreHand } from './poker.mjs'
import { selectableCards } from './board.mjs'

export function solveBoard({ cards, hand = [], score = 0, nodeLimit = 45000 }) {
  let nodes = 0
  let backtracks = 0
  let choiceTotal = 0
  let choiceSamples = 0
  let maxDepth = hand.length
  const seen = new Map()
  let bestScore = score
  let bestPath = []
  let bestComplete = false
  let capped = false

  const visit = (stateCards, stateHand, stateScore, path) => {
    nodes++
    maxDepth = Math.max(maxDepth, path.length)
    if (nodes > nodeLimit) { capped = true; return }
    if (stateScore > bestScore || (stateScore === bestScore && path.length > bestPath.length)) {
      bestScore = stateScore
      bestPath = path
    }
    const key = `${stateCards.filter(card => card.removed).map(card => card.id).sort().join('.')}/${stateHand.map(card => card.id).sort().join('.')}`
    const prior = seen.get(key)
    if (prior !== undefined && prior >= stateScore) return
    seen.set(key, stateScore)
    const choices = selectableCards(stateCards)
    choiceTotal += choices.length
    choiceSamples++
    if (!choices.length || stateCards.filter(card => !card.removed).length + stateHand.length < 6) {
      if (stateHand.length <= 1) bestComplete = true
      return
    }
    const ordered = [...choices].sort((a, b) => {
      const handRanks = stateHand.map(card => card.rank)
      return Number(handRanks.includes(b.rank) || b.joker) - Number(handRanks.includes(a.rank) || a.joker)
    })
    for (const card of ordered) {
      const nextCards = stateCards.map(candidate => candidate.id === card.id ? { ...candidate, removed: true } : candidate)
      const nextHand = [...stateHand, card]
      if (nextHand.length === 6) {
        const best = evaluateBestHand(nextHand)
        visit(nextCards, [best.leftoverCard], stateScore + scoreHand(best.rank), [...path, card.id])
      } else {
        visit(nextCards, nextHand, stateScore, [...path, card.id])
      }
      if (nodes > nodeLimit) break
    }
    backtracks++
  }

  visit(cards, hand, score, [])
  const initialChoices = selectableCards(cards).length
  const averageChoices = choiceSamples ? choiceTotal / choiceSamples : 0
  const layerDepth = Math.max(0, ...cards.filter(card => !card.removed).map(card => card.layer + 1))
  const chokepoints = cards.filter(card => !card.removed && selectableCards(cards).some(top => top.layer > card.layer)).length
  const searchMagnitude = Math.max(0, Math.log10(Math.max(1, nodes)) - 1)
  const difficulty = Math.max(1, Math.min(10, Math.round(1 + layerDepth * .3 + searchMagnitude * 1.4 + backtracks / Math.max(1, nodes) * 1.2 - Math.min(1.5, initialChoices / 12))))
  return { result: capped ? 'capped' : 'analyzed', bestScore, path: bestPath, completionState: bestComplete ? 'complete' : 'partial', nodes, backtracks, metrics: { initialChoices, averageChoices: Number(averageChoices.toFixed(1)), layerDepth, chokepoints, difficulty, maxDepth } }
}

export function findAchievableMissions({ cards, hand = [], nodeLimit = 1200 }) {
  let nodes = 0
  let capped = false
  const paths = new Map()
  const seen = new Set()
  const visit = (stateCards, stateHand, path) => {
    if (++nodes > nodeLimit) { capped = true; return }
    if (stateHand.length === 5) {
      const rank = evaluateBestHand(stateHand).rank
      if (rank !== 'High Card' && !paths.has(rank)) paths.set(rank, path)
    }
    if (stateHand.length === 6) {
      const rank = evaluateBestHand(stateHand).rank
      if (rank !== 'High Card' && !paths.has(rank)) paths.set(rank, path)
      return
    }
    const key = `${stateCards.filter(card => card.removed).map(card => card.id).sort().join('.')}/${stateHand.map(card => card.id).sort().join('.')}`
    if (seen.has(key)) return
    seen.add(key)
    for (const choice of selectableCards(stateCards)) {
      const next = stateCards.map(card => card.id === choice.id ? { ...card, removed: true } : card)
      visit(next, [...stateHand, choice], [...path, choice.id])
      if (nodes > nodeLimit) break
    }
  }
  visit(cards, hand, [])
  return { ranks: [...paths.keys()], paths: Object.fromEntries(paths), nodes, capped }
}

export function compareLeaderboardEntries(a, b) {
  return b.score - a.score || a.timeSeconds - b.timeSeconds || a.undoCount - b.undoCount
}
