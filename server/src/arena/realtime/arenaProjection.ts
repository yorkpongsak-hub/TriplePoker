import { arenaCardKey } from '../cards/arenaDeck'
import { ArenaConnectionManager, ArenaConnectionView } from '../connection/arenaConnectionManager'
import { tierSEconomyConfig } from '../config/tierSConfig'
import { ArenaMatchPhase } from '../contracts/arenaContracts'
import { ArenaMatchEngine } from '../match/arenaMatchEngine'
import { ArenaMatchComposition } from '../matchmaking/arenaMatchmaking'

export interface ArenaSeatViewWire {
  seat: 1 | 2 | 3 | 4
  playerId: string
  displayName: string
  // Human: preset avatar key (จาก PRESET_AVATARS ฝั่ง client, resolve ผ่าน AvatarDisplay) อาจว่างถ้ายังไม่ตั้งค่า
  // AI (Boss/Sentinel/Minion): สัญลักษณ์ตัวอักษรเดิม ('♛'/'♠') ไม่มี preset จริงให้ resolve
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

export interface ArenaClientSnapshotWire {
  matchId: string
  version: number
  phase: ArenaMatchPhase
  gameNumber: 0 | 1 | 2 | 3
  phaseEndsAt: number | null
  seats: ArenaSeatViewWire[]
  crown: { pile1PotCrest: number; pile2PotCrest: number; pile3PotCrest: number; battleRewardsCrest: number; tableTotalCrest: number; localBalanceCrest: number }
  communityCards: { pile1: string[]; pile2: string[]; pile3: string[] }
  auction: null | { round: 'FACE_UP' | 'BLIND'; faceUpCard?: string; bidOptionsCrest: number[]; locked: boolean }
  joker: null | { canChoose: boolean; anteX2Enabled: boolean; selectedMode?: 'WILD' | 'ANTE_X2'; selectedPile?: 1 | 2 | 3 }
  gf: null | { pile: 2 | 3; round: 1 | 2; localTurn: boolean; callCostCrest: number }
  bossPresentation: null | { bossId: 'MONARCH' | 'SOREN'; title: string; subtitle: string; dialogue: string }
  result: null | { title: string; lines: Array<{ label: string; crest: number }>; netCrest: number }
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

// ลำดับ phase ภายในหนึ่งเกม (ไพ่/deal ถูกล้างทุกครั้งที่ gameNumber เปลี่ยน จึงไม่ต้องกังวลข้าม game)
const PHASE_ORDER: ArenaMatchPhase[] = [
  'WAITING_FOR_PLAYERS', 'CHECK_FAST_THREE_HUMANS', 'ROLL_BOSS_ENCOUNTER_OR_WAIT_FOURTH_HUMAN',
  'MATCH_BUY_IN_RESERVE', 'GAME_START', 'DEAL', 'ARRANGE_1',
  'AUCTION_FACE_UP', 'AUCTION_BLIND', 'REVEAL_PILE3_COMMUNITY_CARD_2',
  'FINAL_ARRANGE', 'JOKER_DECLARE', 'DISCARD', 'FINAL_LOCK',
  'RESOLVE_PILE_1', 'REVEAL_PILE_1', 'GF_PILE_2', 'RESOLVE_PILE_2', 'REVEAL_PILE_2',
  'GF_PILE_3_ROUND_1', 'GF_PILE_3_ROUND_2',
  'RESOLVE_PILE_3', 'REVEAL_PILE_3', 'CHECK_SWEEP_JACKPOT', 'GAME_SETTLEMENT',
  'NEXT_GAME_OR_MATCH_END', 'MATCH_SETTLEMENT', 'BATTLE_REWARDS_SINK_IF_REMAINING', 'MATCH_RESULT',
]

function atOrAfter(phase: ArenaMatchPhase, threshold: ArenaMatchPhase): boolean {
  return PHASE_ORDER.indexOf(phase) >= PHASE_ORDER.indexOf(threshold)
}

const BOSS_PRESENTATION: Record<'MONARCH' | 'SOREN', { title: string; subtitle: string; dialogue: string }> = {
  MONARCH: { title: 'BOSS ENCOUNTER', subtitle: 'MONARCH | FOUR GODS', dialogue: 'Every crown remembers the hand that earned it.' },
  SOREN: { title: 'BOSS ENCOUNTER', subtitle: 'SOREN | ARENA SENTINEL', dialogue: 'The Arena does not forgive a careless hand.' },
}

const GF_PHASES: ArenaMatchPhase[] = ['GF_PILE_2', 'GF_PILE_3_ROUND_1', 'GF_PILE_3_ROUND_2']
const REVEAL_PHASES: ArenaMatchPhase[] = ['REVEAL_PILE_1', 'REVEAL_PILE_2', 'REVEAL_PILE_3']

export function projectArenaClientSnapshot(
  engine: ArenaMatchEngine,
  composition: ArenaMatchComposition,
  connections: ArenaConnectionManager,
  viewerId: string,
  now: number,
  identities: ReadonlyMap<string, { displayName: string; avatar: string }>,
): ArenaClientSnapshotWire {
  const snapshot = engine.snapshot()
  const detail = engine.snapshotDetail()
  const deal = engine.currentDeal()
  const viewerPending = snapshot.pendingActorIds.includes(viewerId)

  const breakdownByActor = new Map(engine.settlementBreakdown().map(entry => [entry.playerId, entry]))

  const seats: ArenaSeatViewWire[] = composition.seats.map((seatAssignment, index) => {
    const actorId = engine.actorIds[index]
    // ใช้ไพ่ที่ actor ถืออยู่ ณ ปัจจุบันจริง (11 ใบตั้งต้น, +1 ถ้าชนะประมูล, -1 หลัง Discard) ไม่ใช่ deal.players ดิบที่ตายตัว 11 ใบเสมอ
    const hand = deal ? engine.heldCardsFor(actorId) : []
    const isLocal = actorId === viewerId
    const displayName = seatAssignment.controller === 'HUMAN'
      ? identities.get(actorId)?.displayName ?? `Grandmaster ${seatAssignment.seat}`
      : seatAssignment.aiId.split('_').join(' ')
    const avatar = seatAssignment.controller === 'HUMAN'
      ? identities.get(actorId)?.avatar ?? ''
      : seatAssignment.role === 'BOSS' ? '♛' : '♠'
    const connection: ArenaConnectionView = seatAssignment.controller === 'HUMAN' ? connections.view(actorId, now) : 'CONNECTED'
    return {
      seat: seatAssignment.seat, playerId: actorId, displayName, avatar, controller: seatAssignment.controller,
      isLocal, isBoss: seatAssignment.seat === 3, isCurrentTurn: snapshot.pendingActorIds.includes(actorId),
      connection, cards: isLocal ? hand.map(arenaCardKey) : [], cardCount: hand.length,
      crownCrest: breakdownByActor.get(actorId)?.endingCrest ?? 0,
    }
  })

  const communityCards = {
    pile1: deal ? deal.community.pile1.map(arenaCardKey) : [],
    pile2: deal ? deal.community.pile2.map(arenaCardKey) : [],
    pile3: deal
      ? [deal.community.pile3[0], ...(atOrAfter(snapshot.phase, 'REVEAL_PILE3_COMMUNITY_CARD_2') ? [deal.community.pile3[1]] : [])].filter(Boolean).map(card => arenaCardKey(card!))
      : [],
  }

  const auction: ArenaClientSnapshotWire['auction'] =
    deal && viewerPending && (snapshot.phase === 'AUCTION_FACE_UP' || snapshot.phase === 'AUCTION_BLIND')
      ? { round: snapshot.phase === 'AUCTION_FACE_UP' ? 'FACE_UP' : 'BLIND', faceUpCard: arenaCardKey(deal.auction.faceUp), bidOptionsCrest: [...tierSEconomyConfig.auctionBidOptionsCrest], locked: false }
      : null

  const joker: ArenaClientSnapshotWire['joker'] =
    snapshot.phase === 'JOKER_DECLARE' && detail.jokerOwnerId === viewerId && !detail.jokerDeclaration
      ? { canChoose: true, anteX2Enabled: true }
      : null

  const gf: ArenaClientSnapshotWire['gf'] =
    detail.gfRound && viewerPending && GF_PHASES.includes(snapshot.phase)
      ? { pile: detail.gfRound.pile, round: detail.gfRound.round, localTurn: true, callCostCrest: tierSEconomyConfig.callCostCrest }
      : null

  const bossSeat = composition.seats.find(seat => seat.seat === 3)
  const bossAiId = bossSeat?.controller === 'AI' ? bossSeat.aiId : null
  const bossPresentation: ArenaClientSnapshotWire['bossPresentation'] =
    snapshot.gameNumber === 1 && snapshot.phase === 'ARRANGE_1' && (bossAiId === 'MONARCH' || bossAiId === 'SOREN')
      ? { bossId: bossAiId, ...BOSS_PRESENTATION[bossAiId] }
      : null

  const totals = engine.settlementTotals()
  const localBreakdown = breakdownByActor.get(viewerId)

  const result: ArenaClientSnapshotWire['result'] = snapshot.phase === 'MATCH_RESULT' && localBreakdown
    ? {
        title: 'MATCH COMPLETE',
        lines: [
          { label: 'Ante', crest: -localBreakdown.ante },
          { label: 'Joker Extra Ante', crest: -localBreakdown.jokerExtraAnte },
          { label: 'Auction', crest: -localBreakdown.auction },
          { label: 'Call', crest: -localBreakdown.call },
          { label: 'Boss Fee', crest: -localBreakdown.bossFee },
          { label: 'Sweep Jackpot', crest: localBreakdown.sweepJackpot },
          { label: 'Win / Loss', crest: localBreakdown.winLoss },
        ],
        netCrest: localBreakdown.netCrest,
      }
    : null

  const reveal: ArenaClientSnapshotWire['reveal'] =
    REVEAL_PHASES.includes(snapshot.phase) && detail.pileReveal
      ? {
          pile: detail.pileReveal.pile,
          winnerSeat: seats.find(seat => seat.playerId === detail.pileReveal!.winnerId)?.seat ?? null,
          winnerDisplayName: seats.find(seat => seat.playerId === detail.pileReveal!.winnerId)?.displayName ?? '???',
          handName: detail.pileReveal.handRank,
          cards: detail.pileReveal.cards,
          highlightedCards: detail.pileReveal.highlightedCards,
          payoutCrest: detail.pileReveal.payoutCrest,
        }
      : null

  return {
    matchId: snapshot.matchId, version: snapshot.version, phase: snapshot.phase, gameNumber: snapshot.gameNumber,
    phaseEndsAt: snapshot.deadlineAt,
    seats,
    crown: {
      pile1PotCrest: totals.pots[1], pile2PotCrest: totals.pots[2], pile3PotCrest: totals.pots[3],
      battleRewardsCrest: totals.battleRewardsCrest, tableTotalCrest: totals.conservedTotalCrest,
      localBalanceCrest: localBreakdown?.endingCrest ?? 0,
    },
    communityCards,
    auction, joker, gf, bossPresentation,
    result, reveal,
  }
}
