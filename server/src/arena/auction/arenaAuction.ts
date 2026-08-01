import { ArenaCard, ArenaRandom } from '../cards/arenaDeck'

export type AuctionRound = 'FACE_UP' | 'BLIND'
export type BlindCardIndex = 0 | 1

export interface ArenaBid {
  playerId: string
  amountCrest: 0 | 3 | 6 | 9 | 12
  cardIndex?: BlindCardIndex
}

export interface AuctionResolution {
  status: 'AWARDED' | 'DISCARDED'
  winnerId: string | null
  card: ArenaCard | null
  cardIndex: BlindCardIndex | null
  chargedCrest: number
  battleRewardsCrest: number
  tieBreak: 'NONE' | 'LUCKY_DRAW'
  tiedPlayerIds: string[]
}

const VALID_BIDS = new Set([0, 3, 6, 9, 12])

function validateBids(bids: readonly ArenaBid[], eligiblePlayerIds: readonly string[]): void {
  const eligible = new Set(eligiblePlayerIds)
  const seen = new Set<string>()
  for (const bid of bids) {
    if (!eligible.has(bid.playerId)) throw new Error('AUCTION_PLAYER_NOT_ELIGIBLE')
    if (seen.has(bid.playerId)) throw new Error('AUCTION_PLAYER_ALREADY_BID')
    if (!VALID_BIDS.has(bid.amountCrest)) throw new Error('AUCTION_INVALID_BID')
    seen.add(bid.playerId)
  }
}

function chooseWinner(candidates: ArenaBid[], random: ArenaRandom): { winner: ArenaBid; lucky: boolean } {
  if (candidates.length === 1) return { winner: candidates[0], lucky: false }
  const roll = random()
  if (roll < 0 || roll >= 1) throw new Error('ARENA_RANDOM_OUT_OF_RANGE')
  return { winner: candidates[Math.floor(roll * candidates.length)], lucky: true }
}

export function resolveFaceUpAuction(
  card: ArenaCard,
  bids: readonly ArenaBid[],
  eligiblePlayerIds: readonly string[],
  random: ArenaRandom = Math.random,
): AuctionResolution {
  validateBids(bids, eligiblePlayerIds)
  const highest = Math.max(0, ...bids.map(bid => bid.amountCrest))
  if (highest === 0) return discarded(card, null)
  const tied = bids.filter(bid => bid.amountCrest === highest)
  const { winner, lucky } = chooseWinner(tied, random)
  return awarded(winner, card, null, tied, lucky)
}

export function resolveBlindAuction(
  cards: readonly [ArenaCard, ArenaCard],
  bids: readonly ArenaBid[],
  eligiblePlayerIds: readonly string[],
  faceUpWinnerId: string | null,
  random: ArenaRandom = Math.random,
): AuctionResolution[] {
  const eligible = eligiblePlayerIds.filter(id => id !== faceUpWinnerId)
  validateBids(bids, eligible)
  if (bids.some(bid => bid.cardIndex !== 0 && bid.cardIndex !== 1)) throw new Error('AUCTION_BLIND_CARD_REQUIRED')

  return ([0, 1] as BlindCardIndex[]).map(cardIndex => {
    const cardBids = bids.filter(bid => bid.cardIndex === cardIndex)
    const highest = Math.max(0, ...cardBids.map(bid => bid.amountCrest))
    if (highest === 0) return discarded(cards[cardIndex], cardIndex)
    const tied = cardBids.filter(bid => bid.amountCrest === highest)
    const { winner, lucky } = chooseWinner(tied, random)
    return awarded(winner, cards[cardIndex], cardIndex, tied, lucky)
  })
}

function discarded(card: ArenaCard, cardIndex: BlindCardIndex | null): AuctionResolution {
  return { status: 'DISCARDED', winnerId: null, card, cardIndex, chargedCrest: 0, battleRewardsCrest: 0, tieBreak: 'NONE', tiedPlayerIds: [] }
}

function awarded(winner: ArenaBid, card: ArenaCard, cardIndex: BlindCardIndex | null, tied: ArenaBid[], lucky: boolean): AuctionResolution {
  return {
    status: 'AWARDED', winnerId: winner.playerId, card, cardIndex,
    chargedCrest: winner.amountCrest, battleRewardsCrest: winner.amountCrest,
    tieBreak: lucky ? 'LUCKY_DRAW' : 'NONE', tiedPlayerIds: tied.map(bid => bid.playerId),
  }
}
