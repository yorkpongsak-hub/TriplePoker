export type ArenaClientPhase =
  | 'WAITING_FOR_PLAYERS' | 'CHECK_FAST_THREE_HUMANS' | 'ROLL_BOSS_ENCOUNTER_OR_WAIT_FOURTH_HUMAN'
  | 'MATCH_BUY_IN_RESERVE' | 'DUAL_BOSS_INTRO' | 'GAME_START' | 'DEAL' | 'DEAL_ANIMATION' | 'ARRANGE_1'
  | 'AUCTION_FACE_UP' | 'AUCTION_FACE_UP_RESULT' | 'AUCTION_BLIND' | 'AUCTION_BLIND_RESULT' | 'REVEAL_PILE3_COMMUNITY_CARD_2' | 'FINAL_ARRANGE' | 'JOKER_DECLARE'
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
  // Human เท่านั้น (AI ไม่มี vip_status จริง) — ใช้โชว์กรอบทอง VIP หน้าที่นั่ง เหมือน Adept/High Noble
  isVip: boolean
  controller: 'HUMAN' | 'AI'
  isLocal: boolean
  isBoss: boolean
  isCurrentTurn: boolean
  isWaiting?: boolean
  connection: ArenaConnectionView
  cards: string[]
  cardCount: number
  arrangedPiles?: { pile1: string[]; pile2: string[]; pile3: string[] } | null
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
  cardZones: {
    stockCount: number
    discardCount: number
    auction: { faceUpCard: string | null; blindCount: number }
    resolvedPileCounts: { pile1: number; pile2: number; pile3: number }
    totalCards: 53
  }
  crown: ArenaCrownView
  communityCards: { pile1: string[]; pile2: string[]; pile3: string[] }
  auction: null | { round: 'FACE_UP' | 'BLIND'; faceUpCard?: string; bidOptionsCrest: number[]; locked: boolean }
  // เห็นได้ทุกคนตลอดช่วงประมูล (ต่างจาก auction ด้านบนที่เห็นเฉพาะคนกำลังบิดตาตัวเอง) — ไพ่ปิด 2 ใบไม่มีข้อมูล
  // ส่งมาเลย (คงหลังไพ่ไว้ตามกฎ Blind Auction) render แค่ backs คงที่ 2 ใบเสมอที่ client
  auctionDisplay: null | { faceUpCard: string }
  auctionResult: null | { round: 'FACE_UP'; card: string; winnerSeat: 1 | 2 | 3 | 4 | null; winnerDisplayName: string }
  blindAuctionResults: Array<{ cardIndex: 0 | 1; ownedCard?: string; winnerSeat: 1 | 2 | 3 | 4 | null; winnerDisplayName: string }>
  // true ทันทีที่กองนั้น resolve แล้วคงเป็น true ต่อไปตลอดเกมนั้น
  pilesResolved: { pile1: boolean; pile2: boolean; pile3: boolean }
  joker: null | { canChoose: boolean; anteX2Enabled: boolean; selectedMode?: 'WILD' | 'ANTE_X2'; selectedPile?: 1 | 2 | 3 }
  gf: null | { pile: 2 | 3; round: 1 | 2; localTurn: boolean; callCostCrest: number }
  gfTable?: null | {
    pile: 2 | 3
    round: 1 | 2
    direction: 'CLOCKWISE' | 'COUNTER_CLOCKWISE'
    currentSeat: 1 | 2 | 3 | 4 | null
    players: Array<{ seat: 1 | 2 | 3 | 4; displayName: string; status: 'WAITING' | 'CURRENT' | 'CALLED' | 'FOLDED' | 'SHOWDOWN'; revealedCards: string[] }>
  }
  callReveal?: null | { id: string; seat: 1 | 2 | 3 | 4; displayName: string; pile: 2 | 3; round: 1 | 2; cards: string[] }
  gfAction?: null | { id: string; seat: 1 | 2 | 3 | 4; displayName: string; pile: 2 | 3; round: 1 | 2; decision: 'CALL' | 'FOLD'; cards: string[] }
  bossPresentation: null | {
    bossId: 'MONARCH' | 'SOREN' | 'DUAL'
    title: string
    subtitle: string
    atmosphere: string
    quote: string
  }
  dualBossLore: null | {
    id: string
    speakerSeat: 3 | 4
    speaker: 'MONARCH' | 'SOREN'
    text: string
  }
  result: null | {
    title: string; lines: ArenaResultLine[]; playNetCrest: number; entryFeeCrest: number; netCrest: number; psGained: number
    bossVictory: null | { tier: 'sentinel' | 'god' | 'monarch'; title: string | null }
  }
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
  | { type: 'DUAL_BOSS_INTRO_ACK' }
  | ({ type: 'SAVE_ARRANGEMENT_DRAFT' } & ArenaPileArrangement)
  | ({ type: 'SUBMIT_ARRANGEMENT'; stage: 'ARRANGE_1' | 'FINAL_ARRANGE' } & ArenaPileArrangement)
  | { type: 'AUCTION_BID'; round: 'FACE_UP' | 'BLIND'; cardIndex: 0 | 1; amountCrest: 0 | 3 | 6 | 9 | 12 }
  | { type: 'JOKER_DECLARE'; mode: 'WILD' | 'ANTE_X2'; targetPile: 1 | 2 | 3; availableCrest: number }
  | { type: 'GF_ACTION'; decision: 'CALL' | 'FOLD'; revealCardIds?: string[] }
  | ({ type: 'DISCARD'; cardId: string } & ArenaPileArrangement)
  | ({ type: 'FINAL_LOCK' } & ArenaPileArrangement)
