import { compareHands, evaluateBestFive } from './handEvaluator'
import { comboBonus, missionResult, pileWinScore, type Mission } from './leagueGameplay'
import { type Card } from './deck'
import { type TierDArrangement, type TierDCommunityPiles, type TierDGameNumber, type TierDLevelState } from './tierDSolo'

/** Ephemeral, client-safe result of a completed Tier D match.  It deliberately
 * contains no opponent cards, draw pile, or alternative Auction/Swap cards. */
export type TierDMatchAnalysis = {
  matchNumber: 1 | 2 | 3
  cards: Card[]
  community: TierDCommunityPiles
  actual: TierDArrangement
  best: TierDArrangement
  actualScore: number
  bestScore: number
  actualWins: number
  bestWins: number
  actualMissionCount: number
  bestMissionCount: number
  actualCombo: number
  bestCombo: number
  pile: { actual: number[]; best: number[] }
}

type KnownOpponents = Record<string, TierDArrangement>

/**
 * Enumerates only permutations of the eleven cards already in the player's
 * hand.  The optional opponent layouts must be layouts the player could see
 * before Reveal; hidden AI hands and post-Reveal hand results are never read.
 */
export function analyzeTierDCompletedMatch(state: TierDLevelState, humanId: string, matchNumber: 1 | 2 | 3, knownOpponents: KnownOpponents = {}): TierDMatchAnalysis {
  const cards = state.dealtHands[humanId]
  const actual = state.arrangements[humanId]
  if (!cards || !actual || state.gameResults.length !== 3) throw new Error('Tier D analysis requires a completed player match')
  const opponents=Object.values(knownOpponents)
  const score = (arrangement: TierDArrangement) => scoreArrangement(state.level, arrangement, state.communityPiles, state.missions, opponents)
  const actualResult = score(actual)
  let best = actual
  let bestResult = actualResult
  eachCombination(cards, 3, pile1 => {
    const rest = without(cards, pile1)
    eachCombination(rest, 3, pile2 => {
      const candidate = { pile1, pile2, pile3: without(rest, pile2) }
      const [h1, h2, h3] = hands(candidate, state.communityPiles)
      if (compareHands(h1, h2) >= 0 || compareHands(h2, h3) >= 0) return
      const result = score(candidate)
      if (result.total > bestResult.total || result.total === bestResult.total && result.wins > bestResult.wins) { best = candidate; bestResult = result }
    })
  })
  return { matchNumber, cards: [...cards], community: cloneCommunity(state.communityPiles), actual: clone(actual), best: clone(best), actualScore: actualResult.total, bestScore: bestResult.total, actualWins: actualResult.wins, bestWins: bestResult.wins, actualMissionCount: actualResult.missions, bestMissionCount: bestResult.missions, actualCombo: actualResult.combo, bestCombo: bestResult.combo, pile: { actual: actualResult.pile, best: bestResult.pile } }
}

function scoreArrangement(level: number, arrangement: TierDArrangement, community: TierDCommunityPiles, missions: readonly Mission[], opponents: TierDArrangement[]) {
  const own = hands(arrangement, community); const pile: number[] = []; let wins = 0
  for (const game of [1, 2, 3] as TierDGameNumber[]) {
    const hand = own[game - 1]
    const opposition=opponents.map(opponent=>hands(opponent,community)[game-1])
    // An unknown opponent cannot be assumed beaten. This deliberately makes
    // the post-Level review conservative in hidden-information Leagues.
    const win = opposition.length > 0 && opposition.every(other => compareHands(hand, other) >= 0)
    const points = win ? pileWinScore(level, game, hand.rank, false) : 0
    pile.push(points); if (win) wins++
  }
  const missionOutcomes = missions.map(mission => missionResult(mission, own[mission.pile - 1].rank))
  const missionPoints = missionOutcomes.reduce((sum, result) => sum + result.score + result.penalty, 0)
  const combo = missions.length >= 2 && missionOutcomes.every(result => result.complete) ? comboBonus(missions, missionOutcomes.map(result => result.complete), () => 0) : 0
  const sweep = wins === 3 ? 5 : 0
  return { total: pile.reduce((sum, points) => sum + points, 0) + missionPoints + combo + sweep, pile, wins, missions: missionOutcomes.filter(result => result.complete).length, combo }
}
function hands(arrangement: TierDArrangement, community: TierDCommunityPiles) { return [evaluateBestFive([...arrangement.pile1, ...community.pile1]), evaluateBestFive([...arrangement.pile2, ...community.pile2]), evaluateBestFive([...arrangement.pile3, ...community.pile3])] }
function eachCombination(cards: readonly Card[], size: number, visit: (cards: Card[]) => void) { const choose=(start:number, selected:Card[])=>{if(selected.length===size){visit(selected);return}for(let i=start;i<=cards.length-(size-selected.length);i++)choose(i+1,[...selected,cards[i]])};choose(0,[]) }
function without(cards: readonly Card[], removed: readonly Card[]) { const ids=new Set(removed.map(card => `${card.value}-${card.suit}`)); return cards.filter(card => !ids.has(`${card.value}-${card.suit}`)) }
function clone(arrangement: TierDArrangement): TierDArrangement { return { pile1: [...arrangement.pile1], pile2: [...arrangement.pile2], pile3: [...arrangement.pile3] } }
function cloneCommunity(community: TierDCommunityPiles): TierDCommunityPiles { return { pile1: [...community.pile1], pile2: [...community.pile2], pile3: [...community.pile3] } }
