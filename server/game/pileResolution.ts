// ─────────────────────────────────────────────────────────────────────────────
// pileResolution.ts — Pile 1 / Pile 2 Resolution + Token Settlement
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────
// หน้าที่:
//   • เปรียบมือผู้เล่นทีละ Pile (Pro+) หรือพร้อมกันทั้ง 3 Pile (Beginner)
//   • คำนวณ Token settlement หักค่า Rake 5%
//   • จัดการ AI win → Burn Token ออกจากระบบ
//   • ตรวจ Foul ซ้ำฝั่ง Server ก่อน resolve
//   • Emit socket events หลัง resolve แต่ละ Pile
// ─────────────────────────────────────────────────────────────────────────────

import { gameConfig } from '../config/gameConfig';
import { evaluateHand, compareHands } from './handEvaluator';
import { checkFoul } from './foulChecker';
import type { Server as SocketServer } from 'socket.io';

// ─── Types ────────────────────────────────────────────────────────────────────

/** ไพ่ 1 ใบ */
export interface Card {
  suit: 'spades' | 'hearts' | 'diamonds' | 'clubs';
  value: number; // 2–14 (11=J, 12=Q, 13=K, 14=A)
}

/** ไพ่ที่ผู้เล่นวางในแต่ละ Pile */
export interface PlayerArrangement {
  playerId: string;
  isAI: boolean;
  pile1: Card[];  // 3 ใบ (S1/S2) หรือ 2 ใบ (S3)
  pile2: Card[];  // 3 ใบ (S1/S2) หรือ 2 ใบ (S3)
  pile3: Card[];  // 5 ใบ (S1/S2 Beginner) หรือ 5 ใบก่อน Discard (Pro+)
  hasFoul?: boolean;
}

/** Community Cards แต่ละ Pile */
export interface CommunityCards {
  pile1: Card[];  // 2 ใบ
  pile2: Card[];  // 2 ใบ
  pile3: Card[];  // 3 ใบ
}

/** ผลลัพธ์ของ 1 Pile */
export interface PileResult {
  pileNumber: 1 | 2 | 3;
  winnerId: string;
  winnerIsAI: boolean;
  pot: number;         // Token ใน Pot ก่อนหักค่า Rake
  rake: number;        // 5% ของ Pot
  payout: number;      // Token ที่ผู้ชนะได้รับ (pot - rake)
  burned: boolean;     // true ถ้า AI ชนะ → Burn
  rankings: PileRanking[];
  isTie: boolean;
  tieWinnerById?: string; // กรณี Tie → Random Roll
}

/** อันดับผู้เล่นใน 1 Pile */
export interface PileRanking {
  playerId: string;
  handRank: number;   // 1 (Royal Flush) – 10 (High Card)
  handName: string;
  cards: Card[];      // ไพ่ 5 ใบที่ใช้ (Pile + Community)
  hasFoul: boolean;
}

/** ผลลัพธ์รวมของ Resolution */
export interface ResolutionResult {
  roomId: string;
  season: 'S1' | 'S2' | 'S3';
  tier: 'beginner' | 'pro' | 'boss' | 'lastBoss';
  showdownStyle: 'simultaneous' | 'sequential';
  pileResults: PileResult[];
  tokenDeltas: Record<string, number>; // playerId → ±Token
  foulPlayers: string[];               // playerId ที่ถูก Foul
}

// ─── Helper: หา Tier จาก Token ─────────────────────────────────────────────

export function getTierByToken(token: number): 'beginner' | 'pro' | 'boss' | 'lastBoss' {
  if (token < 20000) return 'beginner';
  if (token < 60000) return 'pro';
  return 'boss'; // lastBoss ต้องกำหนดเพิ่มผ่าน flag พิเศษ (Sprint 8)
}

// ─── Helper: คำนวณ Pot ──────────────────────────────────────────────────────

/**
 * คำนวณ Pot size ตาม Tier, Season และหมายเลข Pile
 */
export function calcPot(
  tier: 'beginner' | 'pro' | 'boss' | 'lastBoss',
  pileNumber: 1 | 2 | 3,
  season: 'S1' | 'S2' | 'S3'
): number {
  const tierConfig = gameConfig.tokenPot.tiers[tier];
  const basePot = {
    1: tierConfig.pile1,
    2: tierConfig.pile2,
    3: tierConfig.pile3,
  }[pileNumber];

  // S3 Clan มี 6 ผู้เล่น → Pot ใหญ่กว่า S1/S2 (4 ผู้เล่น)
  const playerCount = season === 'S3' ? 6 : 4;
  return basePot * playerCount;
}

// ─── Helper: Random Roll Tie-Break ──────────────────────────────────────────

/**
 * สุ่ม 50/50 ระหว่าง 2 ผู้เล่น — ยุติธรรม ไม่ขึ้นกับ connection หรือ skill
 */
function randomTieBreak(playerIds: string[]): string {
  const idx = Math.floor(Math.random() * playerIds.length);
  return playerIds[idx];
}

// ─── Core: Resolve 1 Pile ────────────────────────────────────────────────────

/**
 * เปรียบมือผู้เล่นทุกคนใน 1 Pile
 * - ตรวจ Foul ฝั่ง Server ก่อน → ผู้ Foul เสียทุก Pot (Burn)
 * - เปรียบ Hand Strength ผู้ที่ไม่ Foul
 * - AI ชนะ → Burn Token ออกระบบ
 */
export function resolvePile(
  pileNumber: 1 | 2 | 3,
  arrangements: PlayerArrangement[],
  community: CommunityCards,
  tier: 'beginner' | 'pro' | 'boss' | 'lastBoss',
  season: 'S1' | 'S2' | 'S3'
): PileResult {
  const pot = calcPot(tier, pileNumber, season);
  const rake = Math.floor(pot * gameConfig.tokenPot.rake);
  const payout = pot - rake;

  const communityPile = {
    1: community.pile1,
    2: community.pile2,
    3: community.pile3,
  }[pileNumber];

  // ── ตรวจ Foul Server-side ────────────────────────────────────────────────
  const rankings: PileRanking[] = [];
  const validPlayers: PlayerArrangement[] = [];

  for (const arr of arrangements) {
    const foul = checkFoul({
      pile1: arr.pile1,
      pile2: arr.pile2,
      pile3: arr.pile3,
      community,
      season,
    });

    if (foul.isFoul) {
      // ผู้ Foul → เสียทุก Pot ไม่เข้าแถวแข่ง
      rankings.push({
        playerId: arr.playerId,
        handRank: 99,
        handName: 'FOUL',
        cards: [],
        hasFoul: true,
      });
    } else {
      const pilePile = {
        1: arr.pile1,
        2: arr.pile2,
        3: arr.pile3,
      }[pileNumber];

      // รวมไพ่ Pile + Community แล้วหา Best 5
      const combinedCards = [...pilePile, ...communityPile];
      const evalResult = evaluateHand(combinedCards);

      rankings.push({
        playerId: arr.playerId,
        handRank: evalResult.rank,
        handName: evalResult.name,
        cards: evalResult.bestFive,
        hasFoul: false,
      });
      validPlayers.push(arr);
    }
  }

  // ── หาผู้ชนะ ──────────────────────────────────────────────────────────────
  // กรณีทุกคน Foul → AI (index 0 คือ AI slot) รับแทน แล้ว Burn
  if (validPlayers.length === 0) {
    return {
      pileNumber,
      winnerId: 'AI',
      winnerIsAI: true,
      pot,
      rake,
      payout,
      burned: true,
      rankings,
      isTie: false,
    };
  }

  // เรียงจากดีสุดไปต่ำสุด (rank น้อย = ดีกว่า)
  const sorted = [...validPlayers].sort((a, b) => {
    const rankA = rankings.find(r => r.playerId === a.playerId)!.handRank;
    const rankB = rankings.find(r => r.playerId === b.playerId)!.handRank;

    if (rankA !== rankB) return rankA - rankB;

    // rank เท่ากัน → เปรียบ kicker
    const cardsA = rankings.find(r => r.playerId === a.playerId)!.cards;
    const cardsB = rankings.find(r => r.playerId === b.playerId)!.cards;
    return compareHands(cardsA, cardsB);
  });

  // ตรวจ Tie
  const topRank = rankings.find(r => r.playerId === sorted[0].playerId)!;
  const tiedPlayers = sorted.filter(p => {
    const r = rankings.find(rk => rk.playerId === p.playerId)!;
    return r.handRank === topRank.handRank;
  });

  let winnerId: string;
  let isTie = false;

  if (tiedPlayers.length > 1) {
    // Tie → Random Roll
    isTie = true;
    winnerId = randomTieBreak(tiedPlayers.map(p => p.playerId));
  } else {
    winnerId = sorted[0].playerId;
  }

  const winnerIsAI = arrangements.find(a => a.playerId === winnerId)?.isAI ?? false;

  return {
    pileNumber,
    winnerId,
    winnerIsAI,
    pot,
    rake,
    payout,
    burned: winnerIsAI, // AI ชนะ → Burn
    rankings,
    isTie,
    tieWinnerById: isTie ? winnerId : undefined,
  };
}

// ─── Core: Full Resolution ───────────────────────────────────────────────────

/**
 * Resolution หลัก — รองรับทั้ง Beginner (simultaneous) และ Pro+ (sequential)
 *
 * Beginner: resolve ทั้ง 3 Pile พร้อมกัน emit event เดียว
 * Pro+:     resolve Pile 1 → 2 → (Auction) → 3 ทีละ Pile emit ทีละ event
 */
export async function resolveAllPiles(
  roomId: string,
  arrangements: PlayerArrangement[],
  community: CommunityCards,
  tier: 'beginner' | 'pro' | 'boss' | 'lastBoss',
  season: 'S1' | 'S2' | 'S3',
  io: SocketServer
): Promise<ResolutionResult> {
  const mechanics = gameConfig.progressiveMechanics[tier];
  const showdownStyle = mechanics.showdownStyle as 'simultaneous' | 'sequential';

  // ── คำนวณ Token Delta เริ่มต้น (หัก Ante) ─────────────────────────────────
  const tokenDeltas: Record<string, number> = {};
  const foulPlayers: string[] = [];

  for (const arr of arrangements) {
    if (!arr.isAI) {
      const anteConfig = gameConfig.tokenPot.tiers[tier];
      const totalAnte = anteConfig.pile1 + anteConfig.pile2 + anteConfig.pile3;
      tokenDeltas[arr.playerId] = -totalAnte;
    }
  }

  const pileResults: PileResult[] = [];

  if (showdownStyle === 'simultaneous') {
    // ── Beginner Mode: Resolve Pile 1, 2, 3 พร้อมกัน ─────────────────────────
    for (const pNum of [1, 2, 3] as const) {
      const result = resolvePile(pNum, arrangements, community, tier, season);
      pileResults.push(result);
      applyTokenDelta(result, tokenDeltas, foulPlayers);
    }

    // Emit รวมครั้งเดียว
    io.to(roomId).emit('simultaneous_showdown', {
      pileResults,
      tokenDeltas,
      foulPlayers,
    });
  } else {
    // ── Pro+ Mode: Resolve ทีละ Pile ─────────────────────────────────────────
    for (const pNum of [1, 2] as const) {
      const result = resolvePile(pNum, arrangements, community, tier, season);
      pileResults.push(result);
      applyTokenDelta(result, tokenDeltas, foulPlayers);

      // Emit Pile resolve + Fog of War
      io.to(roomId).emit('pile_resolved', {
        pileNumber: pNum,
        result,
        tokenDeltas: { ...tokenDeltas },
      });

      // หน่วงเล็กน้อยก่อน Pile ถัดไป (Fog of War animation)
      await delay(500);

      io.to(roomId).emit('fog_of_war', { pileNumber: pNum });
    }
    // Pile 3 จะ resolve ใน grandFinale.ts หลัง Discard Phase
  }

  return {
    roomId,
    season,
    tier,
    showdownStyle,
    pileResults,
    tokenDeltas,
    foulPlayers,
  };
}

// ─── Helper: Apply Token Delta ──────────────────────────────────────────────

function applyTokenDelta(
  result: PileResult,
  tokenDeltas: Record<string, number>,
  foulPlayers: string[]
): void {
  if (result.burned) {
    // AI ชนะหรือทุกคน Foul → Burn ไม่มีใครได้รับ Token
    return;
  }

  // ผู้ชนะได้รับ payout
  if (!result.winnerIsAI) {
    tokenDeltas[result.winnerId] = (tokenDeltas[result.winnerId] ?? 0) + result.payout;
  }

  // ผู้ Foul → บันทึกรายชื่อ
  for (const r of result.rankings) {
    if (r.hasFoul && !foulPlayers.includes(r.playerId)) {
      foulPlayers.push(r.playerId);
    }
  }
}

// ─── Helper: Delay ──────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Export Utility ─────────────────────────────────────────────────────────

/**
 * แปลง tokenDeltas เป็น array ที่ใช้ update DB
 */
export function buildTokenUpdates(
  tokenDeltas: Record<string, number>
): Array<{ playerId: string; delta: number }> {
  return Object.entries(tokenDeltas).map(([playerId, delta]) => ({
    playerId,
    delta,
  }));
}
