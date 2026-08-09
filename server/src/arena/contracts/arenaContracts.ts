export type ArenaTierKey = 'grandmaster' | 'sovereign'
export type ArenaPile = 1 | 2 | 3
export type ArenaSeat = 1 | 2 | 3 | 4
export type ArenaBoss = 'MONARCH' | 'SOREN'
export type ArenaBossComposition =
  | { kind: 'NONE'; bosses: [] }
  | { kind: 'SINGLE'; bosses: [ArenaBoss] }
  | { kind: 'DUAL'; bosses: [ArenaBoss, ArenaBoss] }

export type ArenaMatchPhase =
  | 'WAITING_FOR_PLAYERS'
  | 'CHECK_FAST_THREE_HUMANS'
  | 'ROLL_BOSS_ENCOUNTER_OR_WAIT_FOURTH_HUMAN'
  | 'MATCH_BUY_IN_RESERVE'
  | 'GAME_START'
  | 'DEAL'
  | 'DEAL_ANIMATION'
  | 'ARRANGE_1'
  | 'AUCTION_FACE_UP'
  | 'AUCTION_FACE_UP_RESULT'
  | 'AUCTION_BLIND'
  | 'AUCTION_BLIND_RESULT'
  | 'REVEAL_PILE3_COMMUNITY_CARD_2'
  | 'FINAL_ARRANGE'
  | 'JOKER_DECLARE'
  | 'DISCARD'
  | 'FINAL_LOCK'
  | 'RESOLVE_PILE_1'
  | 'REVEAL_PILE_1'
  | 'GF_PILE_2'
  | 'RESOLVE_PILE_2'
  | 'REVEAL_PILE_2'
  | 'GF_PILE_3_ROUND_1'
  | 'GF_PILE_3_ROUND_2'
  | 'RESOLVE_PILE_3'
  | 'REVEAL_PILE_3'
  | 'CHECK_SWEEP_JACKPOT'
  | 'GAME_SETTLEMENT'
  | 'NEXT_GAME_OR_MATCH_END'
  | 'MATCH_SETTLEMENT'
  | 'BATTLE_REWARDS_SINK_IF_REMAINING'
  | 'MATCH_RESULT'

export type JokerMode = 'WILD' | 'ANTE_X2'

export interface JokerDeclaration {
  mode: JokerMode
  targetPile: ArenaPile
  forcedWild: boolean
  declaredAt: string
}

export interface ArenaRoomSnapshot {
  roomId: string
  tier: ArenaTierKey
  phase: ArenaMatchPhase
  gameNumber: 0 | 1 | 2 | 3
  bossComposition: ArenaBossComposition
  version: number
}
