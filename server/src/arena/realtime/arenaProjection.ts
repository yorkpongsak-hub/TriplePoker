import { gameConfig } from '../../config/gameConfig'
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
  // เห็นได้ทุกคนเสมอตลอดช่วงประมูล (ไม่ผูก viewerPending แบบ `auction` ด้านบนที่ gate เฉพาะคนกำลังบิดตาตัวเอง) —
  // ไพ่ใบเปิดจริง + จำนวนไพ่ปิด 2 ใบคงที่ (ไม่ส่งข้อมูลไพ่ปิดเลย กันหลุด fog of war ของ Blind Auction)
  auctionDisplay: null | { faceUpCard: string }
  // true ทันทีที่กองนั้น resolve แล้วคงเป็น true ต่อไปตลอดเกมนั้น (reset พร้อม pile1WinnerId ตอนเกมใหม่)
  pilesResolved: { pile1: boolean; pile2: boolean; pile3: boolean }
  joker: null | { canChoose: boolean; anteX2Enabled: boolean; selectedMode?: 'WILD' | 'ANTE_X2'; selectedPile?: 1 | 2 | 3 }
  gf: null | { pile: 2 | 3; round: 1 | 2; localTurn: boolean; callCostCrest: number }
  bossPresentation: null | { bossId: 'MONARCH' | 'SOREN'; title: string; subtitle: string; atmosphere: string; quote: string }
  result: null | { title: string; lines: Array<{ label: string; crest: number }>; netCrest: number; psGained: number }
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

// เนื้อหาแนะนำ Monarch/Soren ตอนเจอครั้งแรกของแมตช์ (ดู docs/TriplePoker_Universe_Story_and_Cross_App_Integration_Spec.md
// §2.1-2.2) — Monarch = THE WATCHER (quote เดิมที่ shipped แล้วใน client/app/game/monarch/index.tsx's
// MONARCH_INTRO.quote), Soren = THE FIRST EXILE (quote เป็น draft ใหม่จากบุคลิกที่ตั้งไว้ในเอกสาร — ยังไม่มี
// quote canon จริงเหมือน Monarch รอลุงเยาะแก้ได้) Four Gods ไม่มี intro นี้ (ผู้เล่นเจอมาแล้วตั้งแต่ High Noble)
const BOSS_PRESENTATION: Record<'MONARCH' | 'SOREN', { title: string; subtitle: string; atmosphere: string; quote: string }> = {
  MONARCH: {
    title: 'MONARCH', subtitle: 'THE WATCHER',
    atmosphere: 'A shadow falls over the table...',
    quote: 'Power is easy to claim. Restraint is harder to prove.',
  },
  SOREN: {
    title: 'SOREN VEYL', subtitle: 'THE FIRST EXILE',
    atmosphere: 'A stranger slides into the empty seat...',
    quote: 'Titles are just stories people agree not to question.',
  },
}

const GF_PHASES: ArenaMatchPhase[] = ['GF_PILE_2', 'GF_PILE_3_ROUND_1', 'GF_PILE_3_ROUND_2']
const REVEAL_PHASES: ArenaMatchPhase[] = ['REVEAL_PILE_1', 'REVEAL_PILE_2', 'REVEAL_PILE_3']

// เปรียบเทียบ endingCrest ของทุก actor ในโต๊ะ (human/AI ทั้งหมด) หาผู้ชนะอันดับ 1 จริง — ยังไม่เคยมี concept
// นี้ใน Arena มาก่อน (ต่างจาก per-pile winner) ใช้ร่วมกันทั้งฝั่ง display (ที่นี่) และฝั่งบันทึก DB (arenaSocket.ts)
// กันสองจุดตัดสินผู้ชนะไม่ตรงกัน — เหมือน pattern highNobleMultiEngine.ts's finalWinner
export function resolveArenaTableWinner(
  engine: ArenaMatchEngine,
  composition: ArenaMatchComposition,
): { winnerId: string; isHumanWinner: boolean; isRareBoss: boolean } {
  const breakdown = engine.settlementBreakdown()
  const winner = breakdown.reduce((a, b) => (b.endingCrest > a.endingCrest ? b : a))
  const winnerSeatIndex = composition.seats.findIndex((_, index) => engine.actorIds[index] === winner.playerId)
  const winnerSeat = winnerSeatIndex >= 0 ? composition.seats[winnerSeatIndex] : undefined
  const bossSeat = composition.seats.find(seat => seat.seat === 3)
  const bossAiId = bossSeat?.controller === 'AI' ? bossSeat.aiId : null
  return {
    winnerId: winner.playerId,
    isHumanWinner: winnerSeat?.controller === 'HUMAN',
    isRareBoss: bossAiId === 'MONARCH' || bossAiId === 'SOREN',
  }
}

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
    // การ์ดใบที่ 2 ของกอง 3 ต้องส่งมาเสมอ (แม้ยังไม่หงาย) ให้ client รู้ว่ามี 2 ใบจริง — ส่ง '' แทนตอนยังไม่
    // เปิดเผย (ไม่ใช่ตัดออกจาก array เหมือนเดิม) client's cardView ไม่เจอ CARD_IMG[''] จะ fallback เป็นหลังไพ่เอง
    pile3: deal
      ? [arenaCardKey(deal.community.pile3[0]), atOrAfter(snapshot.phase, 'REVEAL_PILE3_COMMUNITY_CARD_2') ? arenaCardKey(deal.community.pile3[1]) : '']
      : [],
  }

  const auction: ArenaClientSnapshotWire['auction'] =
    deal && viewerPending && (snapshot.phase === 'AUCTION_FACE_UP' || snapshot.phase === 'AUCTION_BLIND')
      ? { round: snapshot.phase === 'AUCTION_FACE_UP' ? 'FACE_UP' : 'BLIND', faceUpCard: arenaCardKey(deal.auction.faceUp), bidOptionsCrest: [...tierSEconomyConfig.auctionBidOptionsCrest], locked: false }
      : null

  const auctionDisplay: ArenaClientSnapshotWire['auctionDisplay'] =
    deal && (snapshot.phase === 'AUCTION_FACE_UP' || snapshot.phase === 'AUCTION_BLIND')
      ? { faceUpCard: arenaCardKey(deal.auction.faceUp) }
      : null

  const pilesResolved: ArenaClientSnapshotWire['pilesResolved'] = {
    pile1: detail.pile1WinnerId !== null,
    pile2: detail.pile2WinnerId !== null,
    pile3: detail.pile3WinnerId !== null,
  }

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
    ? (() => {
        const { winnerId, isRareBoss } = resolveArenaTableWinner(engine, composition)
        const psCfg = gameConfig.psConfig
        const psGained = viewerId === winnerId
          ? (isRareBoss ? psCfg.grandmasterMonarchWin : psCfg.grandmasterWin)
          : (localBreakdown.netCrest >= 0 ? psCfg.grandmasterNotWinNonNegative : psCfg.grandmasterNegative)
        return {
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
          psGained,
        }
      })()
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
    auction, auctionDisplay, joker, gf, bossPresentation,
    result, reveal, pilesResolved,
  }
}
