// ─────────────────────────────────────────────────────────────────────────────
// grandFinale.ts — Pile 3 Discard Phase + Grand Finale Betting + Showdown
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────
// หน้าที่:
//   • Discard Phase: ผู้เล่นเลือกทิ้ง 2 ใบจาก Pile 3 (5→3 ใบ) — Pro+ เท่านั้น
//   • Grand Finale Betting: Call หรือ Fold เท่านั้น (ไม่มี Raise) 2 Rounds
//   • Auto-Fold หมดเวลา — timer ต่างกันตาม Tier
//   • เหลือผู้เล่นคนเดียวไม่ Fold → Auto-win ไม่ต้อง Showdown
//   • Showdown: เปรียบ Pile 3 หาผู้ชนะ + Token Settlement
//   • Beginner: ข้ามมาตรงนี้หลัง simultaneous showdown ทำไว้แล้วใน pileResolution
// ─────────────────────────────────────────────────────────────────────────────

import { gameConfig } from '../config/gameConfig';
import { evaluateHand, compareHands } from './handEvaluator';
import type { Card, CommunityCards, PileResult } from './pileResolution';
import type { Server as SocketServer } from 'socket.io';

// ─── Types ────────────────────────────────────────────────────────────────────

/** ข้อมูล Discard ของผู้เล่น 1 คน */
export interface DiscardSubmission {
  playerId: string;
  keptCards: Card[];    // 3 ใบที่เก็บไว้ (จาก 5 ใบใน Pile 3)
  discardedCards: Card[]; // 2 ใบที่ทิ้ง
}

/** Action ของผู้เล่นใน Grand Finale */
export type GrandFinaleAction = 'call' | 'fold';

/** Betting Round State */
export interface BettingRound {
  roundNumber: 1 | 2;
  actions: Record<string, GrandFinaleAction | 'pending'>;
  showCard?: Card; // ไพ่ที่เปิดเพิ่มก่อน Round นี้
  potAdded: number;
}

/** State ของ Grand Finale ทั้งหมด */
export interface GrandFinaleState {
  roomId: string;
  season: 'S1' | 'S2' | 'S3';
  tier: 'pro' | 'boss' | 'lastBoss';
  pile3Cards: Record<string, Card[]>;   // playerId → ไพ่ Pile 3 (หลัง Discard)
  community3: Card[];                   // Community Pile 3 (3 ใบ)
  activePlayers: Set<string>;           // ผู้เล่นที่ยังไม่ Fold
  bettingRounds: BettingRound[];
  currentRound: 1 | 2;
  status: 'discard' | 'betting_r1' | 'betting_r2' | 'showdown' | 'done';
  extraPot: number;                     // Token เพิ่มจาก Call
  timers: Map<string, NodeJS.Timeout>;
}

/** ผลลัพธ์ Grand Finale */
export interface GrandFinaleResult {
  roomId: string;
  pile3Result: PileResult;
  bettingRounds: BettingRound[];
  autoWin: boolean;       // true ถ้าชนะเพราะทุกคน Fold
  autoWinnerId?: string;
  tokenDeltas: Record<string, number>;
}

// ─── State Store ──────────────────────────────────────────────────────────────

const finaleStates = new Map<string, GrandFinaleState>();

// ─── Gate Check ───────────────────────────────────────────────────────────────

export function isGrandFinaleEnabled(
  tier: 'beginner' | 'pro' | 'boss' | 'lastBoss'
): boolean {
  return gameConfig.progressiveMechanics[tier].grandFinaleBetting === true;
}

export function isDiscardEnabled(
  tier: 'beginner' | 'pro' | 'boss' | 'lastBoss'
): boolean {
  return gameConfig.progressiveMechanics[tier].discardPhase === true;
}

// ─── Discard Phase ────────────────────────────────────────────────────────────

/**
 * เริ่ม Discard Phase — ผู้เล่น Pro+ ทิ้ง 2 ใบจาก Pile 3 (5→3 ใบ)
 */
export function startDiscardPhase(
  roomId: string,
  playerIds: string[],
  season: 'S1' | 'S2' | 'S3',
  tier: 'pro' | 'boss' | 'lastBoss',
  io: SocketServer
): void {
  // Discard timer = 15 วินาที (ไม่ได้ระบุใน spec → ใช้ค่า default)
  const discardTimerSec = 15;

  io.to(roomId).emit('discard_phase_start', {
    playerIds,
    timerSec: discardTimerSec,
  });

  // Auto-discard สำหรับผู้ที่หมดเวลา (จัดการใน socket event handler)
}

/**
 * รับ Discard Submission — ตรวจว่า keptCards ถูกต้อง 3 ใบ
 */
export function submitDiscard(
  roomId: string,
  submission: DiscardSubmission
): { success: boolean; reason?: string } {
  if (submission.keptCards.length !== 3) {
    return { success: false, reason: 'Must keep exactly 3 cards' };
  }
  if (submission.discardedCards.length !== 2) {
    return { success: false, reason: 'Must discard exactly 2 cards' };
  }

  const state = finaleStates.get(roomId);
  if (!state) return { success: false, reason: 'Grand Finale state not found' };

  state.pile3Cards[submission.playerId] = submission.keptCards;
  return { success: true };
}

// ─── Grand Finale Start ───────────────────────────────────────────────────────

/**
 * เริ่ม Grand Finale Betting หลัง Discard Phase เสร็จ
 */
export function startGrandFinale(
  roomId: string,
  pile3Cards: Record<string, Card[]>,
  community3: Card[],
  playerIds: string[],
  season: 'S1' | 'S2' | 'S3',
  tier: 'pro' | 'boss' | 'lastBoss',
  io: SocketServer
): GrandFinaleState {
  const state: GrandFinaleState = {
    roomId,
    season,
    tier,
    pile3Cards,
    community3,
    activePlayers: new Set(playerIds),
    bettingRounds: [],
    currentRound: 1,
    status: 'betting_r1',
    extraPot: 0,
    timers: new Map(),
  };

  finaleStates.set(roomId, state);
  startBettingRound(state, 1, undefined, io);
  return state;
}

// ─── Betting Round ────────────────────────────────────────────────────────────

/**
 * เริ่ม Betting Round (1 หรือ 2)
 * - Round 1: เปิด Show Card ใบแรก
 * - Round 2: เปิด Show Card ใบที่สอง
 */
function startBettingRound(
  state: GrandFinaleState,
  roundNumber: 1 | 2,
  showCard: Card | undefined,
  io: SocketServer
): void {
  const betTimer = gameConfig.grandFinale.betTimer[state.tier] ?? 10;

  const round: BettingRound = {
    roundNumber,
    actions: {},
    showCard,
    potAdded: 0,
  };

  for (const pid of state.activePlayers) {
    round.actions[pid] = 'pending';
  }

  state.bettingRounds.push(round);
  state.currentRound = roundNumber;
  state.status = roundNumber === 1 ? 'betting_r1' : 'betting_r2';

  io.to(state.roomId).emit('grand_finale_round_start', {
    roundNumber,
    showCard,
    activePlayers: Array.from(state.activePlayers),
    timerSec: betTimer,
    callAmount: gameConfig.grandFinale.callAmount[state.tier],
  });

  // ตั้ง Auto-Fold timer
  const timer = setTimeout(() => {
    autoFoldAllPending(state, io);
  }, betTimer * 1000);

  state.timers.set(`round_${roundNumber}`, timer);
}

// ─── Submit Action ────────────────────────────────────────────────────────────

/**
 * ผู้เล่นกด Call หรือ Fold
 */
export function submitGrandFinaleAction(
  roomId: string,
  playerId: string,
  action: GrandFinaleAction,
  io: SocketServer
): { success: boolean; reason?: string } {
  const state = finaleStates.get(roomId);
  if (!state) return { success: false, reason: 'State not found' };
  if (!state.activePlayers.has(playerId)) return { success: false, reason: 'Player not active' };

  const round = state.bettingRounds[state.bettingRounds.length - 1];
  if (!round) return { success: false, reason: 'No active round' };
  if (round.actions[playerId] !== 'pending') return { success: false, reason: 'Already acted' };

  round.actions[playerId] = action;

  if (action === 'fold') {
    state.activePlayers.delete(playerId);
    io.to(roomId).emit('player_folded', { playerId });

    // เหลือคนเดียว → Auto-win
    if (state.activePlayers.size === 1) {
      const winnerId = Array.from(state.activePlayers)[0];
      clearTimers(state);
      resolveAutoWin(state, winnerId, io);
      return { success: true };
    }
  } else {
    // Call → เพิ่ม Pot
    const callAmount = gameConfig.grandFinale.callAmount[state.tier] ?? 0;
    round.potAdded += callAmount;
    state.extraPot += callAmount;
  }

  io.to(roomId).emit('grand_finale_action', { playerId, action });

  // ตรวจว่าทุก Active player ตัดสินใจแล้วหรือยัง
  const allActed = Array.from(state.activePlayers).every(
    pid => round.actions[pid] !== 'pending'
  );

  if (allActed) {
    clearTimers(state);
    advanceRound(state, io);
  }

  return { success: true };
}

// ─── Advance Round ────────────────────────────────────────────────────────────

function advanceRound(state: GrandFinaleState, io: SocketServer): void {
  if (state.currentRound === 1) {
    // เริ่ม Round 2 (ยังไม่มี Show Card ใบที่ 2 → Frontend จัดการ animation)
    startBettingRound(state, 2, undefined, io);
  } else {
    // Round 2 จบ → Showdown
    resolveShowdown(state, io);
  }
}

// ─── Auto-Fold ────────────────────────────────────────────────────────────────

function autoFoldAllPending(state: GrandFinaleState, io: SocketServer): void {
  const round = state.bettingRounds[state.bettingRounds.length - 1];
  if (!round) return;

  const pendingPlayers = Array.from(state.activePlayers).filter(
    pid => round.actions[pid] === 'pending'
  );

  for (const pid of pendingPlayers) {
    round.actions[pid] = 'fold';
    state.activePlayers.delete(pid);
    io.to(state.roomId).emit('auto_fold', { playerId: pid, reason: 'timeout' });
  }

  // เหลือคนเดียว → Auto-win
  if (state.activePlayers.size === 1) {
    const winnerId = Array.from(state.activePlayers)[0];
    resolveAutoWin(state, winnerId, io);
    return;
  }

  // ทุกคน Fold พร้อมกัน (edge case) → ไม่มีผู้ชนะ → Showdown ยังเกิด
  if (state.activePlayers.size === 0) {
    resolveShowdown(state, io);
    return;
  }

  advanceRound(state, io);
}

// ─── Auto-Win (ทุกคน Fold) ───────────────────────────────────────────────────

function resolveAutoWin(
  state: GrandFinaleState,
  winnerId: string,
  io: SocketServer
): void {
  state.status = 'done';

  const callAmount = gameConfig.grandFinale.callAmount[state.tier] ?? 0;
  const basePot = calcPile3Pot(state.tier, state.season);
  const totalPot = basePot + state.extraPot;
  const rake = Math.floor(totalPot * gameConfig.tokenPot.rake);
  const payout = totalPot - rake;

  const tokenDeltas: Record<string, number> = {};
  tokenDeltas[winnerId] = payout;

  const result: GrandFinaleResult = {
    roomId: state.roomId,
    pile3Result: {
      pileNumber: 3,
      winnerId,
      winnerIsAI: false,
      pot: totalPot,
      rake,
      payout,
      burned: false,
      rankings: [],
      isTie: false,
    },
    bettingRounds: state.bettingRounds,
    autoWin: true,
    autoWinnerId: winnerId,
    tokenDeltas,
  };

  io.to(state.roomId).emit('grand_finale_auto_win', result);
  finaleStates.delete(state.roomId);
}

// ─── Showdown ─────────────────────────────────────────────────────────────────

function resolveShowdown(state: GrandFinaleState, io: SocketServer): void {
  state.status = 'showdown';

  const community3 = state.community3;
  const rankings: Array<{ playerId: string; rank: number; name: string; cards: Card[] }> = [];

  for (const [playerId, pileCards] of Object.entries(state.pile3Cards)) {
    if (!state.activePlayers.has(playerId)) continue;

    const combined = [...pileCards, ...community3];
    const evalResult = evaluateHand(combined);
    rankings.push({
      playerId,
      rank: evalResult.rank,
      name: evalResult.name,
      cards: evalResult.bestFive,
    });
  }

  // เรียงอันดับ
  rankings.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return compareHands(a.cards, b.cards);
  });

  const topRank = rankings[0]?.rank;
  const tied = rankings.filter(r => r.rank === topRank);
  let winnerId: string;

  if (tied.length > 1) {
    winnerId = tied[Math.floor(Math.random() * tied.length)].playerId;
  } else {
    winnerId = rankings[0]?.playerId ?? '';
  }

  const basePot = calcPile3Pot(state.tier, state.season);
  const totalPot = basePot + state.extraPot;
  const rake = Math.floor(totalPot * gameConfig.tokenPot.rake);
  const payout = totalPot - rake;
  const winnerIsAI = false; // Pile 3 Showdown — AI ไม่ผ่าน Grand Finale

  const tokenDeltas: Record<string, number> = {};
  if (winnerId) tokenDeltas[winnerId] = payout;

  const result: GrandFinaleResult = {
    roomId: state.roomId,
    pile3Result: {
      pileNumber: 3,
      winnerId,
      winnerIsAI,
      pot: totalPot,
      rake,
      payout,
      burned: false,
      rankings: rankings.map(r => ({
        playerId: r.playerId,
        handRank: r.rank,
        handName: r.name,
        cards: r.cards,
        hasFoul: false,
      })),
      isTie: tied.length > 1,
      tieWinnerById: tied.length > 1 ? winnerId : undefined,
    },
    bettingRounds: state.bettingRounds,
    autoWin: false,
    tokenDeltas,
  };

  io.to(state.roomId).emit('grand_finale_showdown', result);
  state.status = 'done';
  finaleStates.delete(state.roomId);
}

// ─── Helper: Calc Pile 3 Pot ─────────────────────────────────────────────────

function calcPile3Pot(
  tier: 'pro' | 'boss' | 'lastBoss',
  season: 'S1' | 'S2' | 'S3'
): number {
  const base = gameConfig.tokenPot.tiers[tier].pile3;
  const players = season === 'S3' ? 6 : 4;
  return base * players;
}

// ─── Helper: Clear Timers ────────────────────────────────────────────────────

function clearTimers(state: GrandFinaleState): void {
  for (const timer of state.timers.values()) {
    clearTimeout(timer);
  }
  state.timers.clear();
}

// ─── Get State ───────────────────────────────────────────────────────────────

export function getGrandFinaleState(roomId: string): GrandFinaleState | undefined {
  return finaleStates.get(roomId);
}
