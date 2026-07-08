// ─────────────────────────────────────────────────────────────────────────────
// blindAuction.ts — Blind Auction Engine
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────
// หน้าที่:
//   • จัดการ Blind Auction ก่อน Pile 3 — ใช้เฉพาะ Tier Pro+ เท่านั้น
//   • รับ Bid จากผู้เล่นทุกคนพร้อมกัน (Blind Bid)
//   • อันดับ 1 ได้ไพ่ใบแรก / อันดับ 2 ได้ไพ่ใบที่สอง (ไม่เกิน 1 ใบ/คน)
//   • Tie-Break: Random Roll 50/50 ทันที
//   • Token ที่ใช้ประมูล → Burn 100% ออกจากระบบทันที
//   • S3 Clan: รองรับ Team Signal Window 5 วินาที
// ─────────────────────────────────────────────────────────────────────────────

import { gameConfig } from '../config/gameConfig';
import type { Card } from './pileResolution';
import type { Server as SocketServer } from 'socket.io';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Bid ของผู้เล่น 1 คน */
export interface PlayerBid {
  playerId: string;
  bidAmount: number;  // Token ที่ประมูล
  isAI: boolean;
  teamId?: string;    // S3 Clan เท่านั้น
}

/** ผลการประมูล 1 ใบ */
export interface AuctionCardResult {
  cardIndex: 0 | 1;   // ใบที่ 1 หรือ 2 (index 0/1)
  card: Card;
  winnerId: string;
  winnerTeamId?: string;
  bidAmount: number;
  burned: number;     // Token ที่ Burn = bidAmount (100%)
  isTieBreak: boolean;
  tieBreakMessage?: string;
}

/** ผลรวมของ Blind Auction ทั้ง 2 ใบ */
export interface BlindAuctionResult {
  roomId: string;
  season: 'S1' | 'S2' | 'S3';
  tier: 'pro' | 'boss' | 'lastBoss';
  auctionCards: Card[];          // ไพ่ 2 ใบที่นำมาประมูล (ยังคว่ำอยู่)
  cardResults: AuctionCardResult[];
  totalBurned: number;           // Token รวมที่ Burn ออกระบบ
  tokenDeltas: Record<string, number>; // playerId → -bidAmount (ล้วนติดลบ)
  winners: { cardIndex: number; winnerId: string }[];
}

/** State ระหว่าง Auction กำลังเปิด */
export interface AuctionState {
  roomId: string;
  auctionCards: Card[];
  bids: Map<string, PlayerBid>;
  teamSignals: Map<string, 'want' | 'pass'>; // S3 เท่านั้น
  deadline: number; // timestamp ms
  status: 'team_signal' | 'bidding' | 'resolved';
}

// ─── Auction State Store (in-memory per room) ─────────────────────────────────

const auctionStates = new Map<string, AuctionState>();

// ─── Gate Check: Pro+ เท่านั้น ───────────────────────────────────────────────

export function isAuctionEnabled(
  tier: 'beginner' | 'pro' | 'boss' | 'lastBoss'
): boolean {
  return gameConfig.progressiveMechanics[tier].blindAuction === true;
}

// ─── Start Auction ────────────────────────────────────────────────────────────

/**
 * เริ่ม Blind Auction — emit event ให้ทุก client รู้ว่ากำลังประมูล
 * S3 Clan: มี Team Signal Window 5 วินาทีก่อน Bid
 */
export function startBlindAuction(
  roomId: string,
  auctionCards: Card[],
  season: 'S1' | 'S2' | 'S3',
  tier: 'pro' | 'boss' | 'lastBoss',
  io: SocketServer
): AuctionState {
  // Team Signal Window = 5 วินาที (S3 เท่านั้น)
  const signalWindowMs = season === 'S3' ? 5000 : 0;
  const biddingWindowMs = 10000; // 10 วินาที Bid
  const now = Date.now();

  const state: AuctionState = {
    roomId,
    auctionCards,
    bids: new Map(),
    teamSignals: new Map(),
    deadline: now + signalWindowMs + biddingWindowMs,
    status: season === 'S3' ? 'team_signal' : 'bidding',
  };

  auctionStates.set(roomId, state);

  if (season === 'S3') {
    // เริ่ม Team Signal Phase
    io.to(roomId).emit('auction_team_signal_start', {
      windowMs: signalWindowMs,
    });

    // หลัง Team Signal → เริ่ม Bidding
    setTimeout(() => {
      state.status = 'bidding';
      io.to(roomId).emit('auction_bidding_start', {
        blindCardCount: auctionCards.length,
        deadlineMs: biddingWindowMs,
      });
    }, signalWindowMs);
  } else {
    // S1/S2: เริ่ม Bidding ทันที
    io.to(roomId).emit('auction_bidding_start', {
      blindCardCount: auctionCards.length,
      deadlineMs: biddingWindowMs,
    });
  }

  return state;
}

// ─── Submit Team Signal (S3 Clan) ────────────────────────────────────────────

export function submitTeamSignal(
  roomId: string,
  playerId: string,
  signal: 'want' | 'pass'
): boolean {
  const state = auctionStates.get(roomId);
  if (!state || state.status !== 'team_signal') return false;

  state.teamSignals.set(playerId, signal);
  return true;
}

// ─── Submit Bid ───────────────────────────────────────────────────────────────

/**
 * รับ Bid จากผู้เล่น — ส่งได้ครั้งเดียว (ใครส่งซ้ำ → ใช้ค่าล่าสุด)
 */
export function submitBid(
  roomId: string,
  bid: PlayerBid
): { success: boolean; reason?: string } {
  const state = auctionStates.get(roomId);
  if (!state) return { success: false, reason: 'Auction not found' };
  if (state.status !== 'bidding') return { success: false, reason: 'Auction not in bidding phase' };
  if (Date.now() > state.deadline) return { success: false, reason: 'Auction deadline passed' };
  if (bid.bidAmount < 0) return { success: false, reason: 'Bid must be non-negative' };

  state.bids.set(bid.playerId, bid);
  return { success: true };
}

// ─── Resolve Auction ──────────────────────────────────────────────────────────

/**
 * ประมวลผล Blind Auction หลังหมดเวลาหรือทุกคน Bid แล้ว
 * - จัดอันดับตาม bidAmount (มากสุด → น้อยสุด)
 * - Tie → Random Roll
 * - Token ที่ Bid → Burn 100%
 */
export function resolveBlindAuction(
  roomId: string,
  season: 'S1' | 'S2' | 'S3',
  tier: 'pro' | 'boss' | 'lastBoss',
  io: SocketServer
): BlindAuctionResult | null {
  const state = auctionStates.get(roomId);
  if (!state) return null;

  state.status = 'resolved';

  const bids = Array.from(state.bids.values());
  const auctionCards = state.auctionCards;
  const cardResults: AuctionCardResult[] = [];
  const tokenDeltas: Record<string, number> = {};
  const winners: { cardIndex: number; winnerId: string }[] = [];
  let totalBurned = 0;
  const alreadyWon = new Set<string>(); // ไม่เกิน 1 ใบ/คน

  // ── ประมวลผลทีละใบ ─────────────────────────────────────────────────────
  // หัก Token เฉพาะผู้ชนะแต่ละใบ — คนแพ้ไม่เสีย Token (แฟร์กับทุกคน)
  for (let cardIdx = 0; cardIdx < auctionCards.length; cardIdx++) {
    const card = auctionCards[cardIdx];

    // กรองผู้เล่นที่ยังไม่ชนะใบก่อนหน้า
    const eligibleBids = bids.filter(b => !alreadyWon.has(b.playerId));

    if (eligibleBids.length === 0) break;

    // เรียงจาก Bid สูงสุด
    const sorted = [...eligibleBids].sort((a, b) => b.bidAmount - a.bidAmount);
    const topBid = sorted[0].bidAmount;

    // หา Tie
    const tied = sorted.filter(b => b.bidAmount === topBid);
    let isTieBreak = false;
    let winnerId: string;
    let tieBreakMessage: string | undefined;

    if (tied.length > 1) {
      isTieBreak = true;
      winnerId = randomRoll(tied.map(b => b.playerId));

      // Toast message ตาม season
      tieBreakMessage =
        season === 'S3'
          ? gameConfig.blindAuction.tieBreakToast.winner.s3clan
          : gameConfig.blindAuction.tieBreakToast.winner.s1s2;
    } else {
      winnerId = sorted[0].playerId;
    }

    alreadyWon.add(winnerId);

    const winnerBid = bids.find(b => b.playerId === winnerId)!;
    const winnerTeamId = winnerBid.teamId;

    // ── หัก Token เฉพาะผู้ชนะใบนี้ → Burn 100% ──────────────────────────
    if (!winnerBid.isAI && winnerBid.bidAmount > 0) {
      tokenDeltas[winnerId] = (tokenDeltas[winnerId] ?? 0) - winnerBid.bidAmount;
      totalBurned += winnerBid.bidAmount;
    }

    cardResults.push({
      cardIndex: cardIdx as 0 | 1,
      card,
      winnerId,
      winnerTeamId,
      bidAmount: winnerBid.bidAmount,
      burned: winnerBid.bidAmount, // 100% Burn เฉพาะคนชนะ
      isTieBreak,
      tieBreakMessage,
    });

    winners.push({ cardIndex: cardIdx, winnerId });
  }

  const result: BlindAuctionResult = {
    roomId,
    season,
    tier,
    auctionCards,
    cardResults,
    totalBurned,
    tokenDeltas,
    winners,
  };

  // Emit ผลการประมูล
  io.to(roomId).emit('auction_resolved', result);

  // Cleanup state
  auctionStates.delete(roomId);

  return result;
}

// ─── Helper: Random Roll ─────────────────────────────────────────────────────

function randomRoll(playerIds: string[]): string {
  return playerIds[Math.floor(Math.random() * playerIds.length)];
}

// ─── Get Auction State ───────────────────────────────────────────────────────

export function getAuctionState(roomId: string): AuctionState | undefined {
  return auctionStates.get(roomId);
}

// ─── Cancel Auction (cleanup) ────────────────────────────────────────────────

export function cancelAuction(roomId: string): void {
  auctionStates.delete(roomId);
}
