// ─────────────────────────────────────────────────────────────────────────────
// blindAuction.test.ts — Unit Tests สำหรับ blindAuction
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────

import {
  isAuctionEnabled,
  startBlindAuction,
  submitBid,
  resolveBlindAuction,
  submitTeamSignal,
  getAuctionState,
  cancelAuction,
  type PlayerBid,
  type AuctionState,
} from '../src/game/blindAuction';
import type { Card } from '../src/game/pileResolution';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../src/config/gameConfig', () => ({
  gameConfig: {
    progressiveMechanics: {
      beginner: { blindAuction: false },
      pro:      { blindAuction: true },
      boss:     { blindAuction: true },
      lastBoss: { blindAuction: true },
    },
    blindAuction: {
      tieBreakToast: {
        winner: {
          s1s2:   'Lucky Star! Fortune favors the bold.',
          s3clan: "Clan Destiny! Your team's luck is unbreakable.",
        },
      },
    },
  },
}));

// ─── Mock Socket.IO ────────────────────────────────────────────────────────────

const mockEmit = jest.fn();
const mockTo = jest.fn().mockReturnValue({ emit: mockEmit });
const mockIo = { to: mockTo } as any;

// ─── Test Data ────────────────────────────────────────────────────────────────

const makeCard = (suit: Card['suit'], value: number): Card => ({ suit, value });

const auctionCards: Card[] = [
  makeCard('spades', 14), // Ace of Spades
  makeCard('hearts', 13), // King of Hearts
];

const makeBid = (playerId: string, amount: number, isAI = false): PlayerBid => ({
  playerId,
  bidAmount: amount,
  isAI,
});

// ─── Tests: isAuctionEnabled ──────────────────────────────────────────────────

describe('isAuctionEnabled', () => {
  test('Beginner → false', () => {
    expect(isAuctionEnabled('beginner')).toBe(false);
  });

  test('Pro → true', () => {
    expect(isAuctionEnabled('pro')).toBe(true);
  });

  test('Boss → true', () => {
    expect(isAuctionEnabled('boss')).toBe(true);
  });

  test('Last Boss → true', () => {
    expect(isAuctionEnabled('lastBoss')).toBe(true);
  });
});

// ─── Tests: startBlindAuction ─────────────────────────────────────────────────

describe('startBlindAuction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('S1 — emit auction_bidding_start ทันที (ไม่มี team signal)', () => {
    jest.useFakeTimers();

    const state = startBlindAuction('room1', auctionCards, 'S1', 'pro', mockIo);

    expect(state.roomId).toBe('room1');
    expect(state.status).toBe('bidding');
    expect(mockTo).toHaveBeenCalledWith('room1');
    expect(mockEmit).toHaveBeenCalledWith('auction_bidding_start', expect.any(Object));

    jest.useRealTimers();
    cancelAuction('room1');
  });

  test('S3 — emit auction_team_signal_start ก่อน', () => {
    jest.useFakeTimers();

    const state = startBlindAuction('room2', auctionCards, 'S3', 'pro', mockIo);

    expect(state.status).toBe('team_signal');
    expect(mockEmit).toHaveBeenCalledWith('auction_team_signal_start', expect.any(Object));

    jest.useRealTimers();
    cancelAuction('room2');
  });
});

// ─── Tests: submitBid ────────────────────────────────────────────────────────

describe('submitBid', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    startBlindAuction('room_bid', auctionCards, 'S1', 'pro', mockIo);
    jest.clearAllMocks();
  });

  afterEach(() => {
    cancelAuction('room_bid');
    jest.useRealTimers();
  });

  test('Bid สำเร็จ → success = true', () => {
    const result = submitBid('room_bid', makeBid('player1', 500));
    expect(result.success).toBe(true);
  });

  test('Bid 0 → ยังรับได้ (ไม่ Bid)', () => {
    const result = submitBid('room_bid', makeBid('player1', 0));
    expect(result.success).toBe(true);
  });

  test('Bid ติดลบ → ปฏิเสธ', () => {
    const result = submitBid('room_bid', makeBid('player1', -100));
    expect(result.success).toBe(false);
  });

  test('Room ไม่มี → ปฏิเสธ', () => {
    const result = submitBid('nonexistent_room', makeBid('player1', 100));
    expect(result.success).toBe(false);
  });
});

// ─── Tests: resolveBlindAuction ───────────────────────────────────────────────

describe('resolveBlindAuction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Bid สูงสุดชนะใบแรก, รองชนะใบที่สอง — Token Burn 100%', () => {
    jest.useFakeTimers();
    startBlindAuction('room_resolve', auctionCards, 'S1', 'pro', mockIo);

    submitBid('room_resolve', makeBid('player1', 1000));
    submitBid('room_resolve', makeBid('player2', 500));
    submitBid('room_resolve', makeBid('player3', 200));

    const result = resolveBlindAuction('room_resolve', 'S1', 'pro', mockIo);

    expect(result).not.toBeNull();
    expect(result!.cardResults).toHaveLength(2);

    // player1 ชนะใบแรก
    expect(result!.cardResults[0].winnerId).toBe('player1');
    expect(result!.cardResults[0].burned).toBe(1000);

    // player2 ชนะใบที่สอง
    expect(result!.cardResults[1].winnerId).toBe('player2');
    expect(result!.cardResults[1].burned).toBe(500);

    // Total Burn = เฉพาะผู้ชนะ: 1000 + 500 = 1500 (player3 แพ้ ไม่โดนหัก)
    expect(result!.totalBurned).toBe(1500);

    // Token Deltas = หักเฉพาะผู้ชนะแต่ละใบ — คนแพ้ได้คืนเต็ม
    expect(result!.tokenDeltas['player1']).toBe(-1000);
    expect(result!.tokenDeltas['player2']).toBe(-500);
    expect(result!.tokenDeltas['player3']).toBeUndefined(); // แพ้ → ไม่โดนหัก

    jest.useRealTimers();
  });

  test('ไม่มีคน Bid → winners ว่าง', () => {
    jest.useFakeTimers();
    startBlindAuction('room_no_bid', auctionCards, 'S1', 'pro', mockIo);

    // ไม่มีใคร submit bid

    const result = resolveBlindAuction('room_no_bid', 'S1', 'pro', mockIo);

    expect(result).not.toBeNull();
    expect(result!.cardResults).toHaveLength(0);
    expect(result!.totalBurned).toBe(0);

    jest.useRealTimers();
  });

  test('Tie → isTieBreak = true และมี tieBreakMessage', () => {
    jest.useFakeTimers();
    startBlindAuction('room_tie', auctionCards, 'S1', 'pro', mockIo);

    // player1 และ player2 Bid เท่ากัน → Tie
    submitBid('room_tie', makeBid('player1', 800));
    submitBid('room_tie', makeBid('player2', 800));

    const result = resolveBlindAuction('room_tie', 'S1', 'pro', mockIo);

    expect(result).not.toBeNull();

    const card1 = result!.cardResults[0];
    expect(card1.isTieBreak).toBe(true);
    expect(card1.tieBreakMessage).toBeTruthy();
    expect(['player1', 'player2']).toContain(card1.winnerId);

    jest.useRealTimers();
  });

  test('ผู้ชนะใบแรกไม่เข้าแข่งใบที่สอง (max 1 ใบ/คน)', () => {
    jest.useFakeTimers();
    startBlindAuction('room_max1', auctionCards, 'S1', 'pro', mockIo);

    submitBid('room_max1', makeBid('player1', 1000));
    submitBid('room_max1', makeBid('player2', 500));

    const result = resolveBlindAuction('room_max1', 'S1', 'pro', mockIo);

    expect(result).not.toBeNull();

    // player1 ชนะใบแรก → ไม่สามารถชนะใบที่สองได้
    if (result!.cardResults.length === 2) {
      expect(result!.cardResults[0].winnerId).not.toBe(result!.cardResults[1].winnerId);
    }

    jest.useRealTimers();
  });

  test('AI Bid → ไม่หัก Token (isAI = true)', () => {
    jest.useFakeTimers();
    startBlindAuction('room_ai', auctionCards, 'S1', 'pro', mockIo);

    submitBid('room_ai', makeBid('AI_SEAT', 2000, true)); // isAI = true
    submitBid('room_ai', makeBid('player1', 500));

    const result = resolveBlindAuction('room_ai', 'S1', 'pro', mockIo);

    expect(result).not.toBeNull();
    // AI ไม่ควรมีใน tokenDeltas
    expect(result!.tokenDeltas['AI_SEAT']).toBeUndefined();

    jest.useRealTimers();
  });

  test('emit auction_resolved หลัง resolve', () => {
    jest.useFakeTimers();
    startBlindAuction('room_emit', auctionCards, 'S1', 'pro', mockIo);

    submitBid('room_emit', makeBid('player1', 300));

    jest.clearAllMocks();
    resolveBlindAuction('room_emit', 'S1', 'pro', mockIo);

    expect(mockTo).toHaveBeenCalledWith('room_emit');
    expect(mockEmit).toHaveBeenCalledWith('auction_resolved', expect.any(Object));

    jest.useRealTimers();
  });
});

// ─── Tests: Team Signal (S3) ──────────────────────────────────────────────────

describe('submitTeamSignal (S3 Clan)', () => {
  test('บันทึก signal ของ teammate ได้', () => {
    jest.useFakeTimers();
    startBlindAuction('room_s3', auctionCards, 'S3', 'pro', mockIo);

    const result = submitTeamSignal('room_s3', 'player1', 'want');
    expect(result).toBe(true);

    const state = getAuctionState('room_s3');
    expect(state?.teamSignals.get('player1')).toBe('want');

    cancelAuction('room_s3');
    jest.useRealTimers();
  });

  test('ส่ง signal เมื่อไม่ใช่ team_signal phase → false', () => {
    jest.useFakeTimers();
    // S1 ไม่มี team signal phase
    startBlindAuction('room_s1_signal', auctionCards, 'S1', 'pro', mockIo);

    const result = submitTeamSignal('room_s1_signal', 'player1', 'want');
    expect(result).toBe(false);

    cancelAuction('room_s1_signal');
    jest.useRealTimers();
  });
});
