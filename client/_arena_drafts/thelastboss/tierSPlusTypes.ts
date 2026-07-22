export type PlayerId = string
export type CardKey = string
export type JokerSlot = 'A' | 'B' | 'C'
export type TierSPlusPhase =
  | 'waiting'
  | 'dealing'
  | 'auction1'
  | 'arrangement_pile1'
  | 'pile1_battle'
  | 'pile1_result'
  | 'auction2_card1'
  | 'auction2_card2'
  | 'reveal_pile3_hidden'
  | 'final_arrangement'
  | 'pile2_betting'
  | 'pile2_result'
  | 'pile3_betting'
  | 'pile3_result'
  | 'proof_reveal'
  | 'round_result'
  | 'match_end'

export type PileKey = 'pile1' | 'pile2' | 'pile3'
export type Auction2Index = 0 | 1
export type Pile2Action = 'call' | 'fold'
export type Pile3Action = 'call' | 'fold' | 'raise'
export type BettingAction = Pile2Action | Pile3Action

export interface CommunityState {
  pile1: [CardKey, CardKey]
  pile2: [CardKey, CardKey]
  pile3Open: CardKey
  pile3Hidden?: CardKey
}

export interface AuctionWin {
  winnerId?: PlayerId
  bid?: number
  card?: CardKey
  at?: number
}

export interface PlayerArrangement {
  pile1?: [CardKey, CardKey, CardKey]
  pile2?: [CardKey, CardKey, CardKey]
  pile3?: [CardKey, CardKey, CardKey]
}

export interface PileBattleState {
  pile: 'pile2' | 'pile3'
  round: 1 | 2
  actingPlayerId?: PlayerId
  survivors: PlayerId[]
  folded: PlayerId[]
  currentBet: number
  pot: number
  revealedByPlayer: Record<PlayerId, CardKey[]>
  actedThisRound: PlayerId[]
}

export interface TierSPlusPlayerState {
  id: PlayerId
  name: string
  isBoss: boolean
  tokens: number
  seatIndex: number
  hand: CardKey[]
  wonAuction1: boolean
  wonAuction2Cards: CardKey[]
  arrangements: PlayerArrangement
  folded: {
    pile2: boolean
    pile3: boolean
  }
}

export interface TierSPlusProofState {
  jokerSlot: JokerSlot
  auction2Card1: CardKey
  auction2Card2: CardKey
  pile3Hidden: CardKey
}

export interface TierSPlusRoundState {
  roomId: string
  roundNumber: number
  phase: TierSPlusPhase
  players: TierSPlusPlayerState[]
  bossPlayerId: PlayerId
  community: CommunityState
  auction1Card: CardKey
  auction2Cards: [CardKey, CardKey]
  jokerSlot: JokerSlot
  finalHiddenSet: [CardKey, CardKey, CardKey]
  pileResults: Partial<Record<PileKey, PileResult>>
  pileBattle?: PileBattleState
  proof?: TierSPlusProofState
  pendingContinueFrom: PlayerId[]
  bonusSweepWinnerId?: PlayerId
}

export interface HandScore {
  category: string
  rankValue: number
  tiebreak: number[]
  bestFive: CardKey[]
  usedJoker: boolean
}

export interface PileResult {
  pile: PileKey
  pot: number
  communityCards: CardKey[]
  entries: Array<{
    playerId: PlayerId
    cards: CardKey[]
    folded?: boolean
    handScore?: HandScore
  }>
  winnerIds: PlayerId[]
}

export interface StartRoundPayload {
  roundNumber: number
  timerSec: number
  cards: CardKey[]
  community: {
    pile1: [CardKey, CardKey]
    pile2: [CardKey, CardKey]
    pile3Open: CardKey
  }
  auction1Card: CardKey
  auction1BidLevels: number[]
  auction2BidLevels: number[]
  tokenBalance: Record<PlayerId, number>
  aiNames: Array<{ id: PlayerId; name: string; emoji?: string }>
}

export interface ObservableState {
  selfPlayerId: PlayerId
  selfHand: CardKey[]
  visibleCommunity: {
    pile1: CardKey[]
    pile2: CardKey[]
    pile3Open: CardKey[]
    pile3HiddenRevealed?: CardKey
  }
  visibleActions: Array<{
    type: string
    playerId: PlayerId
    value?: number | string
    pile?: PileKey
    round?: number
  }>
  revealedCardsByPlayer: Record<PlayerId, CardKey[]>
  tokenBalance: Record<PlayerId, number>
  currentPhase: TierSPlusPhase
  jokerBelief: { A: number; B: number; C: number }
}
