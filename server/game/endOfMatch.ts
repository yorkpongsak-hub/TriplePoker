// ─────────────────────────────────────────────────────────────────────────────
// endOfMatch.ts — End of Match Flow: Summary + Rematch + Ad Trigger + Debt Recovery
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────
// หน้าที่:
//   • สรุปผล Match ทุกคน (token ±, pile wins, rank)
//   • Debt Recovery — ตรวจ token < 0 แล้วจัดการตาม tier + VIP status
//   • Ad Trigger — แสดงโฆษณาถ้าไม่มี VIP ใน room
//   • Rematch Logic — ทุกคนกด Rematch → เริ่มใหม่, มีคน Lobby → กลับ Lobby
//   • Win Condition Check — ตรวจจบ Match ตาม tier
// ─────────────────────────────────────────────────────────────────────────────

import { gameConfig } from '../config/gameConfig';
import type { ResolutionResult } from './pileResolution';
import type { GrandFinaleResult } from './grandFinale';
import type { Server as SocketServer } from 'socket.io';

// ─── Types ────────────────────────────────────────────────────────────────────

/** ข้อมูลผู้เล่นในห้อง */
export interface RoomPlayer {
  playerId: string;
  isAI: boolean;
  isVIP: boolean;
  tokenBalance: number;
  pile3Wins: number;    // จำนวนที่ชนะ Pile 3 ใน Match นี้
}

/** ผลลัพธ์สรุปผู้เล่น 1 คน */
export interface PlayerMatchSummary {
  playerId: string;
  tokenDelta: number;     // ±Token รวมทั้ง Match
  newBalance: number;     // Token หลัง Match
  pile3Wins: number;
  hasDebt: boolean;
  debtAmount: number;
  debtAction: 'none' | 'auto_forgive' | 'popup_small' | 'popup_medium' | 'popup_large';
}

/** ผลลัพธ์ Match Summary ทั้งหมด */
export interface MatchSummary {
  roomId: string;
  season: 'S1' | 'S2' | 'S3';
  tier: 'beginner' | 'pro' | 'boss' | 'lastBoss';
  winnerId: string | null;    // null ถ้า Match ยังไม่จบ
  isMatchOver: boolean;
  playerSummaries: PlayerMatchSummary[];
  showAd: boolean;            // true ถ้าไม่มี VIP ใน room
  handNumber: number;         // Hand ปัจจุบัน (เพื่อตรวจ max rounds)
}

/** สถานะการตัดสินใจ End of Match */
export type EndDecision = 'rematch' | 'lobby' | 'pending';

/** End of Match State */
export interface EndOfMatchState {
  roomId: string;
  decisions: Record<string, EndDecision>;
  deadline: number;
  timer?: NodeJS.Timeout;
}

// ─── Match Win Conditions ─────────────────────────────────────────────────────

/**
 * ตรวจว่า Match จบแล้วหรือยัง
 *
 * | Tier      | Max Rounds | เงื่อนไขชนะก่อนครบ                         |
 * |-----------|------------|---------------------------------------------|
 * | Beginner  | 3          | ครบรอบ (Simultaneous Showdown)              |
 * | Pro       | 5          | ชนะ Pile 3 ครบ 2 ครั้ง หรือครบรอบ         |
 * | Boss      | 6          | ชนะ Pile 3 ครบ 3 ครั้ง หรือ 2+Token 4x    |
 * | Last Boss | 5          | ชนะ Pile 3 ครบ 2 ครั้ง หรือ 1+Token 4x    |
 */
export function checkMatchOver(
  tier: 'beginner' | 'pro' | 'boss' | 'lastBoss',
  handNumber: number,
  pile3WinsPerPlayer: Record<string, number>,
  tokenBalances: Record<string, number>,
  initialBalances: Record<string, number>
): { isOver: boolean; winnerId: string | null } {
  const maxRounds = {
    beginner: 3,
    pro: 5,
    boss: 6,
    lastBoss: 5,
  }[tier];

  const pile3WinTarget = {
    beginner: null,  // ไม่ใช้ (ครบรอบ)
    pro: 2,
    boss: 3,
    lastBoss: 2,
  }[tier];

  // ── ตรวจชนะด้วย Pile 3 Wins ──────────────────────────────────────────────
  if (pile3WinTarget !== null) {
    for (const [playerId, wins] of Object.entries(pile3WinsPerPlayer)) {
      if (wins >= pile3WinTarget) {
        return { isOver: true, winnerId: playerId };
      }
    }
  }

  // ── ตรวจชนะด้วย Token 4x (Boss / Last Boss) ──────────────────────────────
  if (tier === 'boss' || tier === 'lastBoss') {
    const winsByToken = checkToken4xWin(tier, pile3WinsPerPlayer, tokenBalances, initialBalances);
    if (winsByToken) return { isOver: true, winnerId: winsByToken };
  }

  // ── ตรวจครบรอบ ────────────────────────────────────────────────────────────
  if (handNumber >= maxRounds) {
    // ผู้ชนะ = pile3 wins มากสุด, ถ้าเสมอ → token มากสุด
    const winnerId = findWinnerByStats(pile3WinsPerPlayer, tokenBalances);
    return { isOver: true, winnerId };
  }

  return { isOver: false, winnerId: null };
}

/** ตรวจเงื่อนไข Token 4x สำหรับ Boss / Last Boss */
function checkToken4xWin(
  tier: 'boss' | 'lastBoss',
  pile3Wins: Record<string, number>,
  currentBalances: Record<string, number>,
  initialBalances: Record<string, number>
): string | null {
  const minWins = tier === 'lastBoss' ? 1 : 2;

  for (const [playerId, wins] of Object.entries(pile3Wins)) {
    if (wins >= minWins) {
      const initial = initialBalances[playerId] ?? 1;
      const current = currentBalances[playerId] ?? 0;
      if (current >= initial * 4) {
        return playerId;
      }
    }
  }
  return null;
}

/** หาผู้ชนะเมื่อครบรอบ */
function findWinnerByStats(
  pile3Wins: Record<string, number>,
  tokenBalances: Record<string, number>
): string | null {
  const players = Object.keys(pile3Wins).filter(id => id !== 'AI');
  if (players.length === 0) return null;

  players.sort((a, b) => {
    const winsA = pile3Wins[a] ?? 0;
    const winsB = pile3Wins[b] ?? 0;
    if (winsA !== winsB) return winsB - winsA;
    return (tokenBalances[b] ?? 0) - (tokenBalances[a] ?? 0);
  });

  return players[0];
}

// ─── Build Match Summary ──────────────────────────────────────────────────────

/**
 * สร้าง MatchSummary สำหรับส่งให้ Frontend
 */
export function buildMatchSummary(
  roomId: string,
  season: 'S1' | 'S2' | 'S3',
  tier: 'beginner' | 'pro' | 'boss' | 'lastBoss',
  players: RoomPlayer[],
  tokenDeltas: Record<string, number>,
  handNumber: number,
  winnerId: string | null,
  isMatchOver: boolean
): MatchSummary {
  // ตรวจว่ามี VIP ไหม → ถ้าไม่มีเลย → แสดง Ad
  const hasVIP = players.some(p => !p.isAI && p.isVIP);

  const playerSummaries: PlayerMatchSummary[] = players
    .filter(p => !p.isAI)
    .map(player => {
      const delta = tokenDeltas[player.playerId] ?? 0;
      const newBalance = player.tokenBalance + delta;
      const hasDebt = newBalance < 0;
      const debtAmount = hasDebt ? Math.abs(newBalance) : 0;
      const debtAction = resolveDebtAction(tier, player.isVIP, debtAmount);

      return {
        playerId: player.playerId,
        tokenDelta: delta,
        newBalance,
        pile3Wins: player.pile3Wins,
        hasDebt,
        debtAmount,
        debtAction,
      };
    });

  return {
    roomId,
    season,
    tier,
    winnerId,
    isMatchOver,
    playerSummaries,
    showAd: !hasVIP,
    handNumber,
  };
}

// ─── Debt Recovery ────────────────────────────────────────────────────────────

/**
 * กำหนด Debt Action ตาม tier + VIP status + ขนาดหนี้
 */
export function resolveDebtAction(
  tier: 'beginner' | 'pro' | 'boss' | 'lastBoss',
  isVIP: boolean,
  debtAmount: number
): PlayerMatchSummary['debtAction'] {
  if (debtAmount <= 0) return 'none';

  // Boss / Last Boss → Auto-forgive เสมอ
  if (tier === 'boss' || tier === 'lastBoss') return 'auto_forgive';

  // VIP → Auto-forgive เสมอ
  if (isVIP) return 'auto_forgive';

  const thresholds = gameConfig.debtRecovery.thresholds[
    tier as 'beginner' | 'pro'
  ];

  if (debtAmount < thresholds.small) return 'auto_forgive';
  if (debtAmount <= thresholds.medium) return 'popup_small';
  return debtAmount <= thresholds.medium * 5 ? 'popup_medium' : 'popup_large';
}

// ─── End of Match: Emit + Listen ──────────────────────────────────────────────

const endStates = new Map<string, EndOfMatchState>();

/**
 * เริ่ม End of Match sequence:
 * 1. ถ้า showAd → emit ad event ก่อน
 * 2. Emit match summary
 * 3. รอ player decisions (Rematch / Lobby) — timeout 30 วินาที
 */
export async function startEndOfMatch(
  summary: MatchSummary,
  io: SocketServer
): Promise<void> {
  const { roomId, showAd, playerSummaries } = summary;
  const DECISION_TIMEOUT_MS = 30_000;

  // ── Step 1: Ad Phase ─────────────────────────────────────────────────────
  if (showAd) {
    io.to(roomId).emit('show_ad', { source: 'end_of_match' });
    await delay(5000); // รอ 5 วินาที (Ad duration จริงจัดการที่ client)
  }

  // ── Step 2: Emit Match Summary ───────────────────────────────────────────
  io.to(roomId).emit('match_summary', summary);

  // ── Step 3: Emit Debt Popups รายบุคคล ───────────────────────────────────
  for (const ps of playerSummaries) {
    if (ps.hasDebt && ps.debtAction !== 'auto_forgive' && ps.debtAction !== 'none') {
      io.to(ps.playerId).emit('debt_popup', {
        debtAmount: ps.debtAmount,
        action: ps.debtAction,
        adTokenReward: gameConfig.debtRecovery.adReward.tokenPerAd,
        installmentRate: gameConfig.debtRecovery.installment.deductPercent,
      });
    }
  }

  // ── Step 4: รอ Rematch / Lobby decisions ────────────────────────────────
  const playerIds = playerSummaries.map(ps => ps.playerId);
  const endState: EndOfMatchState = {
    roomId,
    decisions: Object.fromEntries(playerIds.map(id => [id, 'pending'])),
    deadline: Date.now() + DECISION_TIMEOUT_MS,
  };

  endState.timer = setTimeout(() => {
    // หมดเวลา → ถือว่ากด Lobby ทุกคน
    forceAllLobby(roomId, io);
  }, DECISION_TIMEOUT_MS);

  endStates.set(roomId, endState);

  io.to(roomId).emit('end_of_match_decision_start', {
    timerSec: DECISION_TIMEOUT_MS / 1000,
    playerIds,
  });
}

// ─── Submit Decision ──────────────────────────────────────────────────────────

export function submitEndDecision(
  roomId: string,
  playerId: string,
  decision: 'rematch' | 'lobby',
  io: SocketServer
): void {
  const state = endStates.get(roomId);
  if (!state) return;

  state.decisions[playerId] = decision;
  io.to(roomId).emit('player_decision', { playerId, decision });

  const allDecided = Object.values(state.decisions).every(d => d !== 'pending');
  if (!allDecided) return;

  clearTimeout(state.timer);

  const allRematch = Object.values(state.decisions).every(d => d === 'rematch');

  if (allRematch) {
    io.to(roomId).emit('rematch_start', { roomId });
  } else {
    io.to(roomId).emit('return_to_lobby', { roomId });
  }

  endStates.delete(roomId);
}

// ─── Force All Lobby ─────────────────────────────────────────────────────────

function forceAllLobby(roomId: string, io: SocketServer): void {
  io.to(roomId).emit('return_to_lobby', { roomId, reason: 'timeout' });
  endStates.delete(roomId);
}

// ─── Debt Installment: หัก 20% ──────────────────────────────────────────────

/**
 * เรียกทุกครั้งที่ผู้เล่นได้รับ Pot เพื่อหัก 20% ชำระหนี้
 */
export function applyDebtInstallment(
  playerId: string,
  potReceived: number,
  currentDebt: number
): { netPayout: number; debtRemaining: number; deductedAmount: number } {
  if (currentDebt <= 0) {
    return { netPayout: potReceived, debtRemaining: 0, deductedAmount: 0 };
  }

  const deductRate = gameConfig.debtRecovery.installment.deductPercent;
  const deducted = Math.min(Math.floor(potReceived * deductRate), currentDebt);

  return {
    netPayout: potReceived - deducted,
    debtRemaining: currentDebt - deducted,
    deductedAmount: deducted,
  };
}

// ─── Helper: Delay ───────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Get End State ────────────────────────────────────────────────────────────

export function getEndOfMatchState(roomId: string): EndOfMatchState | undefined {
  return endStates.get(roomId);
}
