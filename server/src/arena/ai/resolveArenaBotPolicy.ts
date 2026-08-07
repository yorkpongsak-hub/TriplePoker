import { tierSEconomyConfig } from '../config/tierSConfig'
import { ArenaBotPolicy } from '../connection/arenaBotTakeover'
import { ArenaMatchEngine } from '../match/arenaMatchEngine'
import { ArenaMatchComposition } from '../matchmaking/arenaMatchmaking'
import { arenaAuctionBid, arenaGfDecision, arenaJokerDecision, estimateArenaWinrate, ArenaPersonality } from './arenaBotPersonality'
import { sorenAuctionBid, sorenGfDecision } from './arenaSorenPersonality'

const FOUR_GODS_PERSONALITY: Partial<Record<string, ArenaPersonality>> = { REAPER: 'reaper', CRAG: 'crag', CORTEX: 'cortex', CIPHER: 'cipher' }

function gfPileForPhase(phase: string): 2 | 3 | null {
  if (phase === 'GF_PILE_2') return 2
  if (phase === 'GF_PILE_3_ROUND_1' || phase === 'GF_PILE_3_ROUND_2') return 3
  return null
}

function estimateWinrateFor(engine: ArenaMatchEngine, actorId: string, pile: 1 | 2 | 3): number {
  const hand = engine.pileHandFor(actorId, pile)
  return hand ? estimateArenaWinrate(hand) : 0.5
}

// เฉพาะที่นั่ง Boss (role==='BOSS') เท่านั้นที่มีบุคลิก — ที่นั่งเติมโต๊ะ (ARENA_MINION/FILL) ยังใช้ policy ว่างเหมือนเดิม
// (ตัวเติมโต๊ะธรรมดา ไม่ได้ตั้งใจให้เป็นคู่แข่งจริง)
export function resolveArenaBotPolicy(
  engine: ArenaMatchEngine,
  composition: ArenaMatchComposition,
  botActorId: string,
  random: () => number = Math.random,
): ArenaBotPolicy {
  const seatIndex = engine.actorIds.indexOf(botActorId)
  const seat = composition.seats[seatIndex]
  if (!seat || seat.controller !== 'AI' || seat.role !== 'BOSS') return {}

  const phase = engine.snapshot().phase
  const gfPile = gfPileForPhase(phase)
  // GF ใช้ card counting จริง (engine.estimateOpponentSafeRate) แทนดูแค่ไพ่ตัวเอง — ดูว่าคู่ต่อสู้ที่เหลือ
  // ชนะเราได้ไหมแม้กรณีเลวร้ายสุด (ดู arenaMatchEngine.ts's estimateOpponentSafeRate) ส่วน Joker ยังใช้ไพ่ตัวเองอย่างเดียว
  // (ตัดสินใจก่อน pile1/pile2 resolve จึงไม่มี opponent signal ให้ใช้)
  const winrateForGf = gfPile ? engine.estimateOpponentSafeRate(botActorId, gfPile) : 0.5
  const winrateForJoker = phase === 'JOKER_DECLARE' ? estimateWinrateFor(engine, botActorId, 3) : 0.5
  const availableCrest = engine.settlementBreakdown().find(entry => entry.playerId === botActorId)?.endingCrest ?? 0
  const requiredCrest = tierSEconomyConfig.anteCrest.pile3

  if (seat.aiId === 'SOREN') {
    const stats = engine.sorenMatchStats()
    return {
      bidCrest: sorenAuctionBid(stats, random),
      gfDecision: gfPile ? sorenGfDecision(stats, winrateForGf, random) : undefined,
      // Soren ไม่มี precedent เฉพาะเรื่อง Joker — ใช้เกณฑ์ EV แบบเดียวกับ Cortex (ไม่มีในสเปคเดิม ทำใจเชื่อมโยงตามความสมเหตุสมผล)
      jokerMode: availableCrest >= requiredCrest && winrateForJoker >= 0.6 ? 'ANTE_X2' : 'WILD',
      jokerTargetPile: 3,
      availableCrest,
    }
  }

  const personality: ArenaPersonality | null = seat.aiId === 'MONARCH' ? engine.resolvedBossPersonality() : FOUR_GODS_PERSONALITY[seat.aiId] ?? null
  if (!personality) return {}

  const joker = arenaJokerDecision(personality, availableCrest, requiredCrest, winrateForJoker, random)
  return {
    bidCrest: arenaAuctionBid(personality, random),
    gfDecision: gfPile ? arenaGfDecision(personality, winrateForGf, random) : undefined,
    jokerMode: joker.mode,
    jokerTargetPile: joker.targetPile,
    availableCrest,
  }
}
