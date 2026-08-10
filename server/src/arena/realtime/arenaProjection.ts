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
  // Locked grouping is private to its owner. It lets the client animate the
  // actual arranged piles without exposing another player's face-down cards.
  arrangedPiles: { pile1: string[]; pile2: string[]; pile3: string[] } | null
  crownCrest: number
}

export interface ArenaClientSnapshotWire {
  matchId: string
  version: number
  phase: ArenaMatchPhase
  gameNumber: 0 | 1 | 2 | 3
  phaseEndsAt: number | null
  seats: ArenaSeatViewWire[]
  cardZones: {
    stockCount: number
    discardCount: number
    auction: { faceUpCard: string | null; blindCount: number }
    resolvedPileCounts: { pile1: number; pile2: number; pile3: number }
    totalCards: 53
  }
  crown: { pile1PotCrest: number; pile2PotCrest: number; pile3PotCrest: number; battleRewardsCrest: number; tableTotalCrest: number; localBalanceCrest: number }
  communityCards: { pile1: string[]; pile2: string[]; pile3: string[] }
  auction: null | { round: 'FACE_UP' | 'BLIND'; faceUpCard?: string; bidOptionsCrest: number[]; locked: boolean }
  // เห็นได้ทุกคนเสมอตลอดช่วงประมูล (ไม่ผูก viewerPending แบบ `auction` ด้านบนที่ gate เฉพาะคนกำลังบิดตาตัวเอง) —
  // ไพ่ใบเปิดจริง + จำนวนไพ่ปิด 2 ใบคงที่ (ไม่ส่งข้อมูลไพ่ปิดเลย กันหลุด fog of war ของ Blind Auction)
  auctionDisplay: null | { faceUpCard: string }
  auctionResult: null | { round: 'FACE_UP'; card: string; winnerSeat: 1 | 2 | 3 | 4 | null; winnerDisplayName: string }
  blindAuctionResults: Array<{ cardIndex: 0 | 1; ownedCard?: string; winnerSeat: 1 | 2 | 3 | 4 | null; winnerDisplayName: string }>
  // true ทันทีที่กองนั้น resolve แล้วคงเป็น true ต่อไปตลอดเกมนั้น (reset พร้อม pile1WinnerId ตอนเกมใหม่)
  pilesResolved: { pile1: boolean; pile2: boolean; pile3: boolean }
  joker: null | { canChoose: boolean; anteX2Enabled: boolean; selectedMode?: 'WILD' | 'ANTE_X2'; selectedPile?: 1 | 2 | 3 }
  gf: null | { pile: 2 | 3; round: 1 | 2; localTurn: boolean; callCostCrest: number }
  gfTable: null | {
    pile: 2 | 3; round: 1 | 2; direction: 'CLOCKWISE' | 'COUNTER_CLOCKWISE'; currentSeat: 1 | 2 | 3 | 4 | null
    players: Array<{ seat: 1 | 2 | 3 | 4; displayName: string; status: 'WAITING' | 'CURRENT' | 'CALLED' | 'FOLDED' | 'SHOWDOWN'; revealedCards: string[] }>
  }
  callReveal: null | { id: string; seat: 1 | 2 | 3 | 4; displayName: string; pile: 2 | 3; round: 1 | 2; cards: string[] }
  bossPresentation: null | { bossId: 'MONARCH' | 'SOREN' | 'DUAL'; title: string; subtitle: string; atmosphere: string; quote: string }
  dualBossLore: null | { id: string; speakerSeat: 3 | 4; speaker: 'MONARCH' | 'SOREN'; text: string }
  result: null | { title: string; lines: Array<{ label: string; crest: number }>; playNetCrest: number; entryFeeCrest: number; netCrest: number; psGained: number }
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
  'MATCH_BUY_IN_RESERVE', 'DUAL_BOSS_INTRO', 'GAME_START', 'DEAL', 'DEAL_ANIMATION', 'ARRANGE_1',
  'AUCTION_FACE_UP', 'AUCTION_FACE_UP_RESULT', 'AUCTION_BLIND', 'AUCTION_BLIND_RESULT', 'REVEAL_PILE3_COMMUNITY_CARD_2',
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

// Dual Boss lore ใช้เฉพาะช่วง reveal/result ที่ผู้เล่นไม่ต้องตัดสินใจใต้ active timer
// ลำดับยึด canon: Recognition -> Exile -> Gatekeeper -> The Immortal -> Final Warning
const DUAL_BOSS_LORE: Partial<Record<`${1 | 2 | 3}:${ArenaMatchPhase}`, {
  id: string; speakerSeat: 3 | 4; speaker: 'MONARCH' | 'SOREN'; text: string
}>> = {
  '1:REVEAL_PILE_1': { id: 'recognition-1', speakerSeat: 3, speaker: 'MONARCH', text: 'Soren Veyl. Exile did not erase your name.' },
  '1:REVEAL_PILE_2': { id: 'recognition-2', speakerSeat: 4, speaker: 'SOREN', text: 'No. You only erased it from your history.' },
  '1:REVEAL_PILE_3': { id: 'exile-1', speakerSeat: 3, speaker: 'MONARCH', text: 'Truth without order would have broken the kingdom.' },
  '2:REVEAL_PILE_1': { id: 'gatekeeper-1', speakerSeat: 4, speaker: 'SOREN', text: 'And your order left CAELUM alone at the gate.' },
  '2:REVEAL_PILE_2': { id: 'gatekeeper-2', speakerSeat: 3, speaker: 'MONARCH', text: 'He chose the duty neither of us could carry.' },
  '2:REVEAL_PILE_3': { id: 'gatekeeper-3', speakerSeat: 4, speaker: 'SOREN', text: 'He carried what we abandoned.' },
  '3:REVEAL_PILE_1': { id: 'immortal-1', speakerSeat: 3, speaker: 'MONARCH', text: 'The seal is weakening. The Immortal is stirring.' },
  '3:REVEAL_PILE_2': { id: 'immortal-2', speakerSeat: 4, speaker: 'SOREN', text: 'Your crown can break its shell. It cannot find the hidden road.' },
  '3:REVEAL_PILE_3': { id: 'immortal-3', speakerSeat: 3, speaker: 'MONARCH', text: 'And your road cannot stop its return.' },
  '3:MATCH_RESULT': { id: 'final-warning', speakerSeat: 4, speaker: 'SOREN', text: 'Then the three paths must meet again—before eternity opens the gate.' },
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

  const resolvedPiles = {
    pile1: atOrAfter(snapshot.phase, 'REVEAL_PILE_1'),
    pile2: atOrAfter(snapshot.phase, 'REVEAL_PILE_2'),
    pile3: atOrAfter(snapshot.phase, 'REVEAL_PILE_3'),
  }
  const resolvedIdsByActor = new Map<string, Set<string>>()
  for (const actorId of engine.actorIds) {
    const arrangement = detail.lockedArrangements[actorId]
    const ids = new Set<string>()
    if (arrangement) {
      if (resolvedPiles.pile1) arrangement.pile1.forEach(id => ids.add(id))
      if (resolvedPiles.pile2) arrangement.pile2.forEach(id => ids.add(id))
      if (resolvedPiles.pile3) arrangement.pile3.forEach(id => ids.add(id))
    }
    resolvedIdsByActor.set(actorId, ids)
  }

  const seats: ArenaSeatViewWire[] = composition.seats.map((seatAssignment, index) => {
    const actorId = engine.actorIds[index]
    // ใช้ไพ่ที่ actor ถืออยู่ ณ ปัจจุบันจริง (11 ใบตั้งต้น, +1 ถ้าชนะประมูล, -1 หลัง Discard) ไม่ใช่ deal.players ดิบที่ตายตัว 11 ใบเสมอ
    const resolvedIds = resolvedIdsByActor.get(actorId) ?? new Set<string>()
    const hand = deal ? engine.heldCardsFor(actorId).filter(card => !resolvedIds.has(arenaCardKey(card))) : []
    const isLocal = actorId === viewerId
    const lockedArrangement = detail.lockedArrangements[actorId] ?? detail.lastArrangements[actorId]
    const displayName = seatAssignment.controller === 'HUMAN'
      ? identities.get(actorId)?.displayName ?? `Grandmaster ${seatAssignment.seat}`
      : seatAssignment.aiId.split('_').join(' ')
    const avatar = seatAssignment.controller === 'HUMAN'
      ? identities.get(actorId)?.avatar ?? ''
      : seatAssignment.role === 'BOSS' ? '♛' : '♠'
    const connection: ArenaConnectionView = seatAssignment.controller === 'HUMAN' ? connections.view(actorId, now) : 'CONNECTED'
    return {
      seat: seatAssignment.seat, playerId: actorId, displayName, avatar, controller: seatAssignment.controller,
      isLocal, isBoss: seatAssignment.role === 'BOSS' || seatAssignment.role === 'HUMAN_BOSS', isCurrentTurn: snapshot.pendingActorIds.includes(actorId),
      connection, cards: isLocal ? hand.map(arenaCardKey) : [], cardCount: hand.length,
      arrangedPiles: isLocal && lockedArrangement ? {
        pile1: lockedArrangement.pile1.filter(id => !resolvedIds.has(id)),
        pile2: lockedArrangement.pile2.filter(id => !resolvedIds.has(id)),
        pile3: lockedArrangement.pile3.filter(id => !resolvedIds.has(id)),
      } : null,
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

  const resolvedPileCounts = {
    pile1: resolvedPiles.pile1 ? engine.actorIds.reduce((sum, actorId) => sum + (detail.lockedArrangements[actorId]?.pile1.length ?? 0), 0) : 0,
    pile2: resolvedPiles.pile2 ? engine.actorIds.reduce((sum, actorId) => sum + (detail.lockedArrangements[actorId]?.pile2.length ?? 0), 0) : 0,
    pile3: resolvedPiles.pile3 ? engine.actorIds.reduce((sum, actorId) => sum + (detail.lockedArrangements[actorId]?.pile3.length ?? 0), 0) : 0,
  }

  const hasDeal = deal !== null
  const beforeAuction = hasDeal && snapshot.phase === 'DEAL_ANIMATION'
  const auctionCardsParked = hasDeal && ['ARRANGE_1', 'AUCTION_FACE_UP'].includes(snapshot.phase)
  const inFaceUpAuction = hasDeal && snapshot.phase === 'AUCTION_FACE_UP'
  const inBlindAuction = hasDeal && (snapshot.phase === 'AUCTION_FACE_UP_RESULT' || snapshot.phase === 'AUCTION_BLIND')
  const stockCount = hasDeal && beforeAuction ? 3 : hasDeal ? 0 : 53
  const auctionZone = {
    faceUpCard: auctionCardsParked ? arenaCardKey(deal!.auction.faceUp) : null,
    blindCount: auctionCardsParked || inBlindAuction ? 2 : 0,
  }
  const handCount = seats.reduce((sum, seat) => sum + seat.cardCount, 0)
  const communityCount = hasDeal ? 6 : 0
  const resolvedCount = resolvedPileCounts.pile1 + resolvedPileCounts.pile2 + resolvedPileCounts.pile3
  const auctionCount = (auctionZone.faceUpCard ? 1 : 0) + auctionZone.blindCount
  const discardCount = Math.max(0, 53 - stockCount - handCount - communityCount - resolvedCount - auctionCount)
  const projectedTotal = stockCount + handCount + communityCount + resolvedCount + auctionCount + discardCount
  if (projectedTotal !== 53) throw new Error(`ARENA_CARD_PROJECTION_NOT_CONSERVED:${projectedTotal}`)

  const auction: ArenaClientSnapshotWire['auction'] =
    deal && (snapshot.phase === 'AUCTION_FACE_UP' || (snapshot.phase === 'AUCTION_BLIND' && viewerId !== detail.faceUpWinnerId))
      ? { round: snapshot.phase === 'AUCTION_FACE_UP' ? 'FACE_UP' : 'BLIND', faceUpCard: arenaCardKey(deal.auction.faceUp), bidOptionsCrest: [...tierSEconomyConfig.auctionBidOptionsCrest], locked: !viewerPending }
      : null

  const auctionDisplay: ArenaClientSnapshotWire['auctionDisplay'] =
    deal && (snapshot.phase === 'AUCTION_FACE_UP' || snapshot.phase === 'AUCTION_BLIND')
      ? { faceUpCard: arenaCardKey(deal.auction.faceUp) }
      : null
  const faceUpWinnerSeat = detail.faceUpWinnerId ? seats.find(seat => seat.playerId === detail.faceUpWinnerId) : undefined
  const auctionResult: ArenaClientSnapshotWire['auctionResult'] = deal && snapshot.phase === 'AUCTION_FACE_UP_RESULT'
    ? {
        round: 'FACE_UP', card: arenaCardKey(deal.auction.faceUp),
        winnerSeat: faceUpWinnerSeat?.seat ?? null,
        winnerDisplayName: faceUpWinnerSeat?.displayName ?? 'NO WINNER',
      }
    : null
  const blindAuctionResults: ArenaClientSnapshotWire['blindAuctionResults'] = snapshot.phase === 'AUCTION_BLIND_RESULT'
    ? detail.blindAuctionResults.map(result => {
        const winner = result.winnerId ? seats.find(seat => seat.playerId === result.winnerId) : undefined
        return {
          cardIndex: result.cardIndex,
          // Blind cards stay private. Only the winning viewer receives its card
          // code so their hand can hide it until the card-back flight completes.
          ownedCard: result.winnerId === viewerId ? result.card : undefined,
          winnerSeat: winner?.seat ?? null,
          winnerDisplayName: winner?.displayName ?? 'NO WINNER',
        }
      })
    : []

  const pilesResolved: ArenaClientSnapshotWire['pilesResolved'] = {
    pile1: detail.pile1WinnerId !== null,
    pile2: detail.pile2WinnerId !== null,
    pile3: detail.pile3WinnerId !== null,
  }

  const joker: ArenaClientSnapshotWire['joker'] =
    snapshot.phase === 'JOKER_DECLARE' && detail.jokerOwnerId === viewerId && !detail.jokerDeclaration
      ? {
          canChoose: true, anteX2Enabled: true,
          selectedPile: (() => {
            const arrangement = detail.lastArrangements[viewerId]
            if (arrangement?.pile1.includes('JOKER')) return 1
            if (arrangement?.pile2.includes('JOKER')) return 2
            return 3
          })(),
        }
      : null

  const gf: ArenaClientSnapshotWire['gf'] =
    detail.gfRound && viewerPending && GF_PHASES.includes(snapshot.phase)
      ? { pile: detail.gfRound.pile, round: detail.gfRound.round, localTurn: true, callCostCrest: tierSEconomyConfig.callCostCrest }
      : null

  const gfTable: ArenaClientSnapshotWire['gfTable'] = detail.gfRound &&
    (GF_PHASES.includes(snapshot.phase) || snapshot.phase === 'REVEAL_PILE_3')
    ? (() => {
        const round = detail.gfRound!
        const round1 = detail.pile3Round1
        const showdown = snapshot.phase === 'REVEAL_PILE_3'
        const currentId = snapshot.pendingActorIds[0] ?? null
        return {
          pile: round.pile, round: round.round, direction: round.direction,
          currentSeat: currentId ? seats.find(seat => seat.playerId === currentId)?.seat ?? null : null,
          players: seats.map(seat => {
            const actorId = seat.playerId
            const foldedInRound1 = round1?.foldedPlayerIds.includes(actorId) ?? false
            const called = round.calledPlayerIds.includes(actorId)
            const folded = foldedInRound1 || round.foldedPlayerIds.includes(actorId)
            const activeAtShowdown = showdown && round.turnOrder.includes(actorId) && !round.foldedPlayerIds.includes(actorId)
            const status = activeAtShowdown ? 'SHOWDOWN' as const
              : folded ? 'FOLDED' as const
              : actorId === currentId ? 'CURRENT' as const
              : called ? 'CALLED' as const
              : 'WAITING' as const
            const selectedReveals = detail.gfRevealedCardIds[actorId] ?? []
            return {
              seat: seat.seat, displayName: seat.displayName, status,
              revealedCards: activeAtShowdown && round.pile === 3
                ? detail.lockedArrangements[actorId]?.pile3 ?? []
                : selectedReveals,
            }
          }),
        }
      })()
    : null

  const callReveal: ArenaClientSnapshotWire['callReveal'] = detail.lastGFCallReveal
    ? (() => {
        const seat = seats.find(entry => entry.playerId === detail.lastGFCallReveal!.actorId)
        return seat ? {
          id: detail.lastGFCallReveal!.actionId,
          seat: seat.seat,
          displayName: seat.displayName,
          pile: detail.lastGFCallReveal!.pile,
          round: detail.lastGFCallReveal!.round,
          cards: [...detail.lastGFCallReveal!.cards],
        } : null
      })()
    : null

  const bossSeat = composition.seats.find(seat => seat.seat === 3)
  const bossAiId = bossSeat?.controller === 'AI' ? bossSeat.aiId : null
  const bossPresentation: ArenaClientSnapshotWire['bossPresentation'] =
    composition.kind === 'DUAL_BOSS_ENCOUNTER' && snapshot.phase === 'DUAL_BOSS_INTRO'
      ? {
          bossId: 'DUAL', title: 'THE BROKEN COVENANT', subtitle: 'MONARCH · THE WATCHER  ×  SOREN VEYL · THE FIRST EXILE',
          atmosphere: 'Two old friends return to the same table—one bound to the crown, the other cast beyond its history.',
          quote: 'Before the final gate opens, the Watcher and the Exile must play the hand they left unfinished.',
        }
      : snapshot.gameNumber === 1 && snapshot.phase === 'ARRANGE_1' && (bossAiId === 'MONARCH' || bossAiId === 'SOREN')
      ? { bossId: bossAiId, ...BOSS_PRESENTATION[bossAiId] }
      : null

  const dualBossLore: ArenaClientSnapshotWire['dualBossLore'] = composition.kind === 'DUAL_BOSS_ENCOUNTER'
    ? DUAL_BOSS_LORE[`${snapshot.gameNumber as 1 | 2 | 3}:${snapshot.phase}`] ?? null
    : null

  const totals = engine.settlementTotals()
  const localBreakdown = breakdownByActor.get(viewerId)

  const result: ArenaClientSnapshotWire['result'] = snapshot.phase === 'MATCH_RESULT' && localBreakdown
    ? (() => {
        const { winnerId, isRareBoss } = resolveArenaTableWinner(engine, composition)
        const psCfg = gameConfig.psConfig
        const psGained = viewerId === winnerId
          ? psCfg.grandmaster.bossWin + (isRareBoss ? psCfg.legendaryBossBonus : 0)
          : (localBreakdown.netCrest >= 0 ? psCfg.grandmaster.nonNegative : psCfg.grandmaster.negative)
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
          playNetCrest: localBreakdown.netCrest + localBreakdown.entryFee,
          entryFeeCrest: localBreakdown.entryFee,
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
    cardZones: { stockCount, discardCount, auction: auctionZone, resolvedPileCounts, totalCards: 53 },
    crown: {
      pile1PotCrest: totals.pots[1], pile2PotCrest: totals.pots[2], pile3PotCrest: totals.pots[3],
      battleRewardsCrest: totals.battleRewardsCrest, tableTotalCrest: totals.conservedTotalCrest,
      localBalanceCrest: localBreakdown?.endingCrest ?? 0,
    },
    communityCards,
    auction, auctionDisplay, auctionResult, blindAuctionResults, joker, gf, gfTable, callReveal, bossPresentation, dualBossLore,
    result, reveal, pilesResolved,
  }
}
