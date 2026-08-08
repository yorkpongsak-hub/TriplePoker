export type ArenaClientPhase =
  | 'WAITING_FOR_PLAYERS' | 'CHECK_FAST_THREE_HUMANS' | 'ROLL_BOSS_ENCOUNTER_OR_WAIT_FOURTH_HUMAN'
  | 'MATCH_BUY_IN_RESERVE' | 'GAME_START' | 'DEAL' | 'ARRANGE_1'
  | 'AUCTION_FACE_UP' | 'AUCTION_BLIND' | 'REVEAL_PILE3_COMMUNITY_CARD_2' | 'FINAL_ARRANGE' | 'JOKER_DECLARE'
  | 'DISCARD' | 'FINAL_LOCK' | 'RESOLVE_PILE_1' | 'REVEAL_PILE_1' | 'GF_PILE_2'
  | 'RESOLVE_PILE_2' | 'REVEAL_PILE_2' | 'GF_PILE_3_ROUND_1' | 'GF_PILE_3_ROUND_2'
  | 'RESOLVE_PILE_3' | 'REVEAL_PILE_3' | 'CHECK_SWEEP_JACKPOT' | 'GAME_SETTLEMENT'
  | 'NEXT_GAME_OR_MATCH_END' | 'MATCH_SETTLEMENT' | 'BATTLE_REWARDS_SINK_IF_REMAINING' | 'MATCH_RESULT'

export type ArenaConnectionView =
  | 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED_GRACE'
  | 'BOT_ACTIVE' | 'BOT_UNTIL_NEXT_GAME' | 'BOT_FOR_MATCH'

export interface ArenaSeatView {
  seat: 1 | 2 | 3 | 4
  playerId: string
  displayName: string
  // Human: preset avatar key (resolve ผ่าน AvatarDisplay/PRESET_AVATARS) อาจว่างถ้ายังไม่ตั้งค่า
  // AI (Boss/Sentinel/Minion): สัญลักษณ์ตัวอักษรเดิม ('♛'/'♠')
  avatar: string
  controller: 'HUMAN' | 'AI'
  isLocal: boolean
  isBoss: boolean
  isCurrentTurn: boolean
  connection: ArenaConnectionView
  cards: string[]
  cardCount: number
  crownCrest: number
}

export interface ArenaCrownView {
  pile1PotCrest: number
  pile2PotCrest: number
  pile3PotCrest: number
  battleRewardsCrest: number
  tableTotalCrest: number
  localBalanceCrest: number
}

export interface ArenaResultLine {
  label: string
  crest: number
}

export interface ArenaClientSnapshot {
  matchId: string
  version: number
  phase: ArenaClientPhase
  gameNumber: 0 | 1 | 2 | 3
  phaseEndsAt: number | null
  seats: ArenaSeatView[]
  crown: ArenaCrownView
  communityCards: { pile1: string[]; pile2: string[]; pile3: string[] }
  auction: null | { round: 'FACE_UP' | 'BLIND'; faceUpCard?: string; bidOptionsCrest: number[]; locked: boolean }
  joker: null | { canChoose: boolean; anteX2Enabled: boolean; selectedMode?: 'WILD' | 'ANTE_X2'; selectedPile?: 1 | 2 | 3 }
  gf: null | { pile: 2 | 3; round: 1 | 2; localTurn: boolean; callCostCrest: number }
  bossPresentation: null | {
    bossId: 'MONARCH' | 'SOREN'
    title: string
    subtitle: string
    dialogue: string
  }
  result: null | { title: string; lines: ArenaResultLine[]; netCrest: number }
  reveal: null | {
    pile: 1 | 2 | 3
    winnerSeat: 1 | 2 | 3 | 4 | null
    winnerDisplayName: string
    handName: string | null
    cards: string[]
    highlightedCards: string[]
    payoutCrest: number
  }
}

export interface ArenaPileArrangement { pile1: string[]; pile2: string[]; pile3: string[] }

export type ArenaClientIntent =
  | { type: 'SELECT_CARD'; cardId: string }
  | ({ type: 'SUBMIT_ARRANGEMENT'; stage: 'ARRANGE_1' | 'FINAL_ARRANGE' } & ArenaPileArrangement)
  | { type: 'AUCTION_BID'; round: 'FACE_UP' | 'BLIND'; cardIndex: 0 | 1; amountCrest: 0 | 3 | 6 | 9 | 12 }
  | { type: 'JOKER_DECLARE'; mode: 'WILD' | 'ANTE_X2'; targetPile: 1 | 2 | 3; availableCrest: number }
  | { type: 'GF_ACTION'; decision: 'CALL' | 'FOLD' }
  | { type: 'DISCARD'; cardId: string }
  | ({ type: 'FINAL_LOCK' } & ArenaPileArrangement)
