import { assignMemoryPositions, generateBoard, seededRandom, selectableCards, shuffleIdentities } from './board.mjs'
import { applyMissionCumulativeScore, evaluateBestHand, evaluateHand, scoreHand } from './poker.mjs'
import { findAchievableMissions, solveBoard } from './solver.mjs'

export function createGame(config = {}) {
  const seed = Number(config.seed ?? 205031)
  const memoryPercent = Number(config.memoryPercent ?? 25)
  const cards = assignMemoryPositions(generateBoard(seed, Number(config.size || 5), Number(config.maxLayers || 4)), memoryPercent, seededRandom(seed ^ 0x51f15e))
  const state = {
    seed, size: Number(config.size || 5), maxLayers: Number(config.maxLayers || 4), memoryPercent, cards,
    hand: [], history: [], handHistory: [], handsCompleted: 0, score: 0, undoCount: 0,
    status: 'playing', message: 'Choose an accessible card.', lastRank: null, lastPoints: 0,
    pendingHand: null, startedAt: Number(config.now ?? Date.now()), endedAt: null,
    startingAccessibleCount: selectableCards(cards).length, solver: null, revealedMemorySlot: null,
    currentMission: null, achievableMissions: [], missionPath: [], missionGeneration: 0, shuffleCount: 0,
  }
  state.solver = solveBoard({ ...state, nodeLimit: Number(config.nodeLimit || 5000) })
  state.solverBestScore = state.solver.bestScore
  generateCurrentMission(state, Number(config.missionNodeLimit || 1200))
  return state
}

const snapshot = state => ({
  cards: state.cards.map(card => ({ ...card })), hand: state.hand.map(card => ({ ...card })),
  status: state.status, message: state.message, lastRank: state.lastRank, lastPoints: state.lastPoints,
  pendingHand: state.pendingHand, handsCompleted: state.handsCompleted, revealedMemorySlot: null,
  currentMission: state.currentMission || null, achievableMissions: [...(state.achievableMissions || [])], missionPath: [...(state.missionPath || [])],
  missionGeneration: state.missionGeneration, shuffleCount: state.shuffleCount,
})
const remember = state => state.history.push(snapshot(state))

export function elapsedSeconds(state, now = Date.now()) {
  return Math.max(0, Math.floor(((state.endedAt ?? now) - state.startedAt) / 1000))
}

export function canCompleteCurrentHand(cards, handLength = 0) {
  const needed = 6 - handLength
  if (needed <= 0) return true
  const seen = new Set()
  const visit = (stateCards, depth) => {
    if (depth >= needed) return true
    const key = stateCards.filter(card => card.removed).map(card => card.id).sort().join('.')
    if (seen.has(key)) return false
    seen.add(key)
    for (const choice of selectableCards(stateCards)) {
      const next = stateCards.map(card => card.id === choice.id ? { ...card, removed: true } : card)
      if (visit(next, depth + 1)) return true
    }
    return false
  }
  return visit(cards, 0)
}

export function selectCard(state, cardId, forced = false) {
  if (state.status !== 'playing' || state.hand.length >= 6) return false
  const legal = selectableCards(state.cards)
  const card = state.cards.find(candidate => (candidate.id === cardId || candidate.slotId === cardId) && !candidate.removed)
  if (!card || (!forced && !legal.some(candidate => candidate.id === card.id))) return false
  remember(state)
  state.revealedMemorySlot = null
  state.cards = state.cards.map(candidate => candidate.id === card.id ? { ...candidate, removed: true } : candidate)
  state.hand = [...state.hand, card]
  state.message = `${state.hand.length}/6 cards committed.`
  if (state.hand.length === 5 && evaluateHand(state.hand) === state.currentMission) settleHand(state)
  else if (state.hand.length === 6) settleHand(state)
  else if (!canCompleteCurrentHand(state.cards, state.hand.length)) {
    state.status = 'ended'
    state.endedAt = Date.now()
    state.message = 'RUN COMPLETE — no legal six-card continuation.'
  }
  return true
}

export function tryPlayerSelection(state, cardId) {
  if (state.status !== 'playing') return { selected: false, revealed: false, blocked: false }
  const card = state.cards.find(candidate => (candidate.id === cardId || candidate.slotId === cardId) && !candidate.removed)
  if (!card) return { selected: false, revealed: false, blocked: false }
  if (state.revealedMemorySlot && state.revealedMemorySlot !== card.slotId) state.revealedMemorySlot = null
  const legal = selectableCards(state.cards).some(candidate => candidate.id === card.id)
  if (!legal) return { selected: false, revealed: false, blocked: true }
  if (card.faceDown && state.revealedMemorySlot !== card.slotId) {
    state.revealedMemorySlot = card.slotId
    state.message = 'Memory card revealed. Tap it again to commit.'
    return { selected: false, revealed: true, blocked: false }
  }
  const selected = selectCard(state, card.slotId, false)
  return { selected, revealed: false, blocked: !selected && state.status === 'playing' }
}

export function settleHand(state) {
  if (![5, 6].includes(state.hand.length) || state.status !== 'playing' || state.pendingHand) return false
  const best = evaluateBestHand(state.hand)
  const rank = best.rank
  const missionSuccess = Boolean(state.currentMission && rank === state.currentMission)
  if (state.hand.length === 5 && !missionSuccess) return false
  const basePoints = scoreHand(rank)
  const outcome = applyMissionCumulativeScore(state.score, basePoints, rank, state.currentMission)
  const record = { cards: state.hand.map(card => card.id), usedCards: best.usedCards.map(card => card.id), leftoverCard: best.leftoverCard, rank, points: basePoints, missionSuccess, mission: state.currentMission, multiplier: outcome.multiplier, relation: outcome.relation, cumulativeScore: outcome.score, willEnd: state.hand.length === 6 && (rank === 'High Card' || !missionSuccess) }
  state.score = outcome.score
  state.handsCompleted++
  state.lastRank = rank
  state.lastPoints = basePoints
  state.pendingHand = record
  state.handHistory = [...state.handHistory, record]
  state.status = 'resolving'
  state.message = `${rank} +${basePoints} · ${outcome.relation} ×${outcome.multiplier.toFixed(2)} · TOTAL ${outcome.score}`
  return true
}

export function completeHandTransition(state, now = Date.now()) {
  if (state.status !== 'resolving' || !state.pendingHand) return false
  const completed = state.pendingHand
  state.hand = completed.willEnd || !completed.leftoverCard ? [] : [completed.leftoverCard]
  state.pendingHand = null
  state.revealedMemorySlot = null
  state.history = []
  const remaining = state.cards.filter(card => !card.removed).length
  if (completed.willEnd || remaining + state.hand.length < 6 || !canCompleteCurrentHand(state.cards, state.hand.length)) {
    state.status = 'ended'
    state.endedAt = now
    state.message = 'RUN COMPLETE'
  } else {
    state.status = 'playing'
    state.message = 'Choose an accessible card.'
  }
  updateSolver(state)
  if (state.status === 'playing') generateCurrentMission(state)
  return true
}

export function updateSolver(state, nodeLimit = 5000) {
  state.solver = solveBoard({ ...state, nodeLimit })
  state.solverBestScore = Math.max(state.solverBestScore ?? state.score, state.solver.bestScore)
  return state.solver
}

export function generateCurrentMission(state, nodeLimit = 1200) {
  const analysis = findAchievableMissions({ cards: state.cards, hand: state.hand, nodeLimit })
  state.achievableMissions = analysis.ranks
  state.missionGeneration = (state.missionGeneration || 0) + 1
  if (!analysis.ranks.length) {
    state.currentMission = null
    state.missionPath = []
    return null
  }
  const random = seededRandom(state.seed + state.missionGeneration * 104729 + (state.shuffleCount || 0) * 8191)
  const rank = analysis.ranks[Math.floor(random() * analysis.ranks.length)]
  state.currentMission = rank
  state.missionPath = analysis.paths[rank] || []
  return rank
}

export function undo(state) {
  if (state.status !== 'playing') return false
  const previous = state.history.pop()
  if (!previous) return false
  const penalizedScore = state.score - 2
  const nextUndoCount = state.undoCount + 1
  Object.assign(state, previous)
  state.score = penalizedScore
  state.undoCount = nextUndoCount
  state.message = 'UNDO -2'
  return true
}

export function useShuffle(state) {
  if (state.status !== 'playing') return false
  remember(state)
  state.revealedMemorySlot = null
  state.cards = shuffleIdentities(state.cards, seededRandom(state.seed + state.history.length * 7919))
  state.shuffleCount++
  state.message = 'Remaining identities shuffled; geometry preserved.'
  updateSolver(state, 4000)
  generateCurrentMission(state, 1000)
  return true
}

export function magnetCandidates(state) {
  if (state.status !== 'playing' || state.hand.length !== 5) return []
  const legalIds = new Set(selectableCards(state.cards).map(card => card.id))
  const legalBest = Math.max(0, ...state.cards.filter(card => !card.removed && legalIds.has(card.id)).map(card => scoreHand(evaluateBestHand([...state.hand, card]).rank)))
  return state.cards.filter(card => !card.removed && !legalIds.has(card.id) && scoreHand(evaluateBestHand([...state.hand, card]).rank) > legalBest)
}

export function useMagnet(state) {
  const candidate = magnetCandidates(state).sort((a, b) => scoreHand(evaluateBestHand([...state.hand, b]).rank) - scoreHand(evaluateBestHand([...state.hand, a]).rank))[0]
  if (!candidate) {
    state.message = 'MAGNET needs a blocked sixth card that improves this hand.'
    return false
  }
  return selectCard(state, candidate.id, true)
}

export function hint(state) {
  if (state.status !== 'playing') return null
  const solved = solveBoard({ ...state, nodeLimit: 10000 })
  state.solver = solved
  state.solverBestScore = Math.max(state.solverBestScore ?? state.score, solved.bestScore)
  const identityId = state.missionPath?.[0] || solved.path?.[0] || null
  const cardId = state.cards.find(card => card.id === identityId)?.slotId || null
  state.message = cardId ? 'Recommended legal card highlighted.' : 'No recommendation found within the search limit.'
  return cardId
}
