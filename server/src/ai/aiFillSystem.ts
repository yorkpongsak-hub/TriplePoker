// ============================================================
// aiFillSystem.ts — AI Fill System
// Sprint 5 | TriplePoker — The Sage Unicorn Studio Co., Ltd.
// ============================================================
// กฎหลัก:
//   - ทุกโต๊ะมี AI ≥ 1 ที่นั่งเสมอ
//   - Human ≥ 2 เสมอ (ห้ามต่ำกว่านี้ ไม่ว่ากรณีใด)
//   - AI สูงสุด 2 ที่นั่งต่อโต๊ะ
//   - รอ Human > 5 นาที → Auto-fill AI จนครบ 4 ที่นั่ง
//   - AI Entry Token = Server สุ่ม 1.5–3.0 × ขั้นต่ำของ Tier
// ============================================================

import type { BossType } from './bossAI';

// ─── Types ───────────────────────────────────────────────────

export type Tier = 'initiate' | 'adept' | 'mastermind' | 'highNoble' | 'lastBoss';

export type AiPersonality =
  | 'minion'
  | 'elite'
  | 'reaper'
  | 'crag'
  | 'cortex'
  | 'cipher'
  | 'lastBoss';

export interface AiSeat {
  seatIndex:    number;
  personality:  AiPersonality;
  virtualToken: number;
  joinedAt:     number;
}

export interface TableState {
  tableId:      string;
  tier:         Tier;
  seats:        SeatInfo[];
  waitingSince: number;
}

export interface SeatInfo {
  seatIndex: number;
  isHuman:   boolean;
  isAi:      boolean;
  isEmpty:   boolean;
}

export interface FillDecision {
  shouldFill:  boolean;
  seatsToFill: number;
  reason:      FillReason | null;
}

export type FillReason =
  | 'WAIT_TIMEOUT'
  | 'MUST_HAVE_ONE_AI'
  | 'HUMAN_LEFT';

export interface FillResult {
  filled:    AiSeat[];
  notify:    boolean;
  notifyMsg: string;
  canStart:  boolean;
}

// ─── Constants ───────────────────────────────────────────────

const TABLE_SIZE       = 4;
const MIN_HUMANS       = 2;
const MAX_AI           = 2;
const MIN_AI           = 1;
const WAIT_TIMEOUT_MS  = 5 * 60 * 1000;

const TIER_MIN_TOKEN: Record<Tier, number> = {
  beginner: 1_000,
  pro:      10_000,
  boss:     50_000,
  lastBoss: 100_000,
};

const FILL_NOTIFY_MESSAGE =
  'Waiting too long — AI players have joined to start the game';

const BOSS_TYPES: BossType[] = ['reaper', 'crag', 'cortex', 'cipher'];

// ============================
// triggerAiFill
// ============================
export function triggerAiFill(
  table: TableState,
  nowMs: number = Date.now()
): FillResult {
  const decision = checkFillNeeded(table, nowMs);

  if (!decision.shouldFill || decision.seatsToFill <= 0) {
    return {
      filled:    [],
      notify:    false,
      notifyMsg: '',
      canStart:  canStartGame(table),
    };
  }

  const emptySeats = table.seats
    .filter(s => s.isEmpty)
    .slice(0, decision.seatsToFill);

  const filled: AiSeat[] = emptySeats.map(seat => ({
    seatIndex:    seat.seatIndex,
    personality:  selectAiPersonality(table.tier),
    virtualToken: generateVirtualToken(table.tier),
    joinedAt:     nowMs,
  }));

  const shouldNotify = decision.reason === 'WAIT_TIMEOUT' && filled.length > 0;
  const updatedTable = applyFillToTable(table, filled);

  return {
    filled,
    notify:    shouldNotify,
    notifyMsg: shouldNotify ? FILL_NOTIFY_MESSAGE : '',
    canStart:  canStartGame(updatedTable),
  };
}

// ============================
// checkFillNeeded
// ============================
export function checkFillNeeded(
  table: TableState,
  nowMs: number
): FillDecision {
  const aiCount    = table.seats.filter(s => s.isAi).length;
  const emptyCount = table.seats.filter(s => s.isEmpty).length;

  // กฎ 1: ต้องมี AI ≥ 1
  if (aiCount < MIN_AI && emptyCount > 0) {
    const canFill = aiCount + 1 <= MAX_AI;
    return {
      shouldFill:  canFill,
      seatsToFill: canFill ? 1 : 0,
      reason:      'MUST_HAVE_ONE_AI',
    };
  }

  // กฎ 2: รอ > 5 นาที
  const waitElapsed = nowMs - table.waitingSince;
  if (waitElapsed > WAIT_TIMEOUT_MS && emptyCount > 0) {
    const maxFillable = Math.min(emptyCount, MAX_AI - aiCount);
    return {
      shouldFill:  maxFillable > 0,
      seatsToFill: maxFillable,
      reason:      'WAIT_TIMEOUT',
    };
  }

  return { shouldFill: false, seatsToFill: 0, reason: null };
}

// ============================
// canStartGame
// ============================
export function canStartGame(table: TableState): boolean {
  const humanCount = table.seats.filter(s => s.isHuman).length;
  const aiCount    = table.seats.filter(s => s.isAi).length;
  const emptyCount = table.seats.filter(s => s.isEmpty).length;

  return (
    humanCount >= MIN_HUMANS &&
    aiCount    >= MIN_AI     &&
    emptyCount === 0
  );
}

// ============================
// removeAiSeat
// ============================
export function removeAiSeat(table: TableState, seatIndex: number): boolean {
  const seat = table.seats[seatIndex];
  if (!seat || !seat.isAi) return false;

  const aiCount = table.seats.filter(s => s.isAi).length;
  if (aiCount - 1 < MIN_AI) return false;

  return true;
}

// ─── Internal Helpers ────────────────────────────────────────

function selectAiPersonality(tier: Tier): AiPersonality {
  switch (tier) {
    case 'initiate': return 'minion';
    case 'mastermind':      return 'elite';
    case 'lastBoss': return 'lastBoss';
    case 'highNoble': {
      const pick = BOSS_TYPES[Math.floor(Math.random() * BOSS_TYPES.length)];
      return pick as AiPersonality;
    }
  }
}

function generateVirtualToken(tier: Tier): number {
  const minToken   = TIER_MIN_TOKEN[tier];
  const multiplier = 1.5 + Math.random() * 1.5;
  return Math.floor(minToken * multiplier);
}

function applyFillToTable(table: TableState, filled: AiSeat[]): TableState {
  const filledIndexes = new Set(filled.map(a => a.seatIndex));
  return {
    ...table,
    seats: table.seats.map(seat => {
      if (filledIndexes.has(seat.seatIndex)) {
        return { ...seat, isEmpty: false, isAi: true, isHuman: false };
      }
      return seat;
    }),
  };
}
