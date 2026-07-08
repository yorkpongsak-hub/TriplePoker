// ============================================================
// aiFillSystem.test.ts — Unit Tests for AI Fill System
// Sprint 5 | TriplePoker — The Sage Unicorn Studio Co., Ltd.
// ============================================================

import {
  triggerAiFill,
  checkFillNeeded,
  canStartGame,
  removeAiSeat,
  TableState,
  SeatInfo,
  Tier,
} from '../../src/ai/aiFillSystem';

// ─── Helpers สร้าง TableState ─────────────────────────────────

function makeSeats(config: Array<'human' | 'ai' | 'empty'>): SeatInfo[] {
  return config.map((type, i) => ({
    seatIndex: i,
    isHuman:   type === 'human',
    isAi:      type === 'ai',
    isEmpty:   type === 'empty',
  }));
}

function makeTable(
  seats: SeatInfo[],
  tier: Tier = 'beginner',
  waitingSince?: number
): TableState {
  return {
    tableId:      'test-room-001',
    tier,
    seats,
    waitingSince: waitingSince ?? Date.now(),
  };
}

// เวลา 6 นาทีที่แล้ว (เกิน 5 นาที timeout)
const SIX_MINUTES_AGO = Date.now() - 6 * 60 * 1000;

// เวลา 2 นาทีที่แล้ว (ไม่เกิน timeout)
const TWO_MINUTES_AGO = Date.now() - 2 * 60 * 1000;

// ============================================================
// TEST SUITE
// ============================================================

describe('aiFillSystem', () => {

  // ════════════════════════════════════════════════════════════
  // checkFillNeeded
  // ════════════════════════════════════════════════════════════
  describe('checkFillNeeded', () => {

    // ─── 1. ไม่มี AI เลย → MUST_HAVE_ONE_AI ──────────────────
    it('should trigger MUST_HAVE_ONE_AI when no AI in table', () => {
      const table  = makeTable(makeSeats(['human', 'human', 'human', 'empty']));
      const result = checkFillNeeded(table, Date.now());
      expect(result.shouldFill).toBe(true);
      expect(result.reason).toBe('MUST_HAVE_ONE_AI');
      expect(result.seatsToFill).toBe(1);
    });

    // ─── 2. รอ > 5 นาที + มีที่ว่าง → WAIT_TIMEOUT ────────────
    it('should trigger WAIT_TIMEOUT after 5 minutes', () => {
      const table  = makeTable(
        makeSeats(['human', 'human', 'ai', 'empty']),
        'beginner',
        SIX_MINUTES_AGO
      );
      const result = checkFillNeeded(table, Date.now());
      expect(result.shouldFill).toBe(true);
      expect(result.reason).toBe('WAIT_TIMEOUT');
    });

    // ─── 3. รอ < 5 นาที → ไม่ Fill ────────────────────────────
    it('should NOT fill when waiting less than 5 minutes', () => {
      const table  = makeTable(
        makeSeats(['human', 'human', 'ai', 'empty']),
        'beginner',
        TWO_MINUTES_AGO
      );
      const result = checkFillNeeded(table, Date.now());
      expect(result.shouldFill).toBe(false);
      expect(result.reason).toBeNull();
    });

    // ─── 4. โต๊ะเต็ม 4 ที่นั่ง → ไม่ Fill ─────────────────────
    it('should NOT fill when table is full', () => {
      const table  = makeTable(makeSeats(['human', 'human', 'ai', 'human']));
      const result = checkFillNeeded(table, Date.now());
      expect(result.shouldFill).toBe(false);
    });

    // ─── 5. AI ครบ MAX (2) แล้ว → ไม่ Fill เพิ่ม ───────────────
    it('should NOT fill more AI when maxAI reached', () => {
      const table = makeTable(
        makeSeats(['human', 'human', 'ai', 'ai']),
        'beginner',
        SIX_MINUTES_AGO
      );
      const result = checkFillNeeded(table, Date.now());
      expect(result.shouldFill).toBe(false);
    });

  });

  // ════════════════════════════════════════════════════════════
  // triggerAiFill
  // ════════════════════════════════════════════════════════════
  describe('triggerAiFill', () => {

    // ─── 6. Fill AI เข้าที่นั่งว่าง เมื่อ timeout ──────────────
    it('should fill empty seats after timeout', () => {
      const table  = makeTable(
        makeSeats(['human', 'human', 'ai', 'empty']),
        'beginner',
        SIX_MINUTES_AGO
      );
      const result = triggerAiFill(table, Date.now());
      expect(result.filled.length).toBeGreaterThan(0);
    });

    // ─── 7. notify = true เมื่อ Fill จาก WAIT_TIMEOUT ──────────
    it('should set notify=true on WAIT_TIMEOUT fill', () => {
      const table  = makeTable(
        makeSeats(['human', 'human', 'ai', 'empty']),
        'beginner',
        SIX_MINUTES_AGO
      );
      const result = triggerAiFill(table, Date.now());
      expect(result.notify).toBe(true);
      expect(result.notifyMsg).toBe(
        'Waiting too long — AI players have joined to start the game'
      );
    });

    // ─── 8. notify = false เมื่อ Fill จาก MUST_HAVE_ONE_AI ─────
    it('should set notify=false on MUST_HAVE_ONE_AI fill', () => {
      const table  = makeTable(makeSeats(['human', 'human', 'human', 'empty']));
      const result = triggerAiFill(table, Date.now());
      expect(result.notify).toBe(false);
    });

    // ─── 9. canStart = true เมื่อ Fill ครบแล้ว ─────────────────
    it('should return canStart=true when table is full after fill', () => {
      const table  = makeTable(
        makeSeats(['human', 'human', 'ai', 'empty']),
        'beginner',
        SIX_MINUTES_AGO
      );
      const result = triggerAiFill(table, Date.now());
      expect(result.canStart).toBe(true);
    });

    // ─── 10. ไม่ Fill เมื่อโต๊ะเต็มแล้ว ────────────────────────
    it('should return empty filled array when table already full', () => {
      const table  = makeTable(makeSeats(['human', 'human', 'ai', 'human']));
      const result = triggerAiFill(table, Date.now());
      expect(result.filled).toHaveLength(0);
      expect(result.notify).toBe(false);
    });

    // ─── 11. AI ที่ Fill มี seatIndex ถูกต้อง ───────────────────
    it('should fill correct seatIndex', () => {
      const table  = makeTable(
        makeSeats(['human', 'human', 'ai', 'empty']),
        'beginner',
        SIX_MINUTES_AGO
      );
      const result = triggerAiFill(table, Date.now());
      result.filled.forEach(seat => {
        expect(seat.seatIndex).toBeGreaterThanOrEqual(0);
        expect(seat.seatIndex).toBeLessThanOrEqual(3);
      });
    });

    // ─── 12. Virtual Token อยู่ในช่วง 1.5–3.0 × Tier minimum ───
    it('should generate virtualToken in range 1.5x–3.0x tier minimum', () => {
      const tierMin: Record<Tier, number> = {
        beginner: 1_000,
        pro:      10_000,
        boss:     50_000,
        lastBoss: 100_000,
      };

      const tiers: Tier[] = ['beginner', 'pro', 'boss', 'lastBoss'];

      tiers.forEach(tier => {
        const table = makeTable(
          makeSeats(['human', 'human', 'empty', 'empty']),
          tier,
          SIX_MINUTES_AGO
        );
        const result = triggerAiFill(table, Date.now());

        result.filled.forEach(seat => {
          const min = tierMin[tier] * 1.5;
          const max = tierMin[tier] * 3.0;
          expect(seat.virtualToken).toBeGreaterThanOrEqual(min);
          expect(seat.virtualToken).toBeLessThanOrEqual(max);
        });
      });
    });

    // ─── 13. joinedAt ≈ nowMs ────────────────────────────────────
    it('should set joinedAt close to nowMs', () => {
      const nowMs  = Date.now();
      const table  = makeTable(
        makeSeats(['human', 'human', 'ai', 'empty']),
        'beginner',
        SIX_MINUTES_AGO
      );
      const result = triggerAiFill(table, nowMs);
      result.filled.forEach(seat => {
        expect(seat.joinedAt).toBe(nowMs);
      });
    });

  });

  // ════════════════════════════════════════════════════════════
  // canStartGame
  // ════════════════════════════════════════════════════════════
  describe('canStartGame', () => {

    // ─── 14. Human ≥ 2 + AI ≥ 1 + เต็ม → canStart = true ──────
    it('should return true when human>=2, ai>=1, no empty seats', () => {
      const table = makeTable(makeSeats(['human', 'human', 'ai', 'human']));
      expect(canStartGame(table)).toBe(true);
    });

    // ─── 15. Human < 2 → canStart = false ──────────────────────
    it('should return false when human < 2', () => {
      const table = makeTable(makeSeats(['human', 'ai', 'ai', 'empty']));
      expect(canStartGame(table)).toBe(false);
    });

    // ─── 16. มีที่นั่งว่าง → canStart = false ───────────────────
    it('should return false when there are empty seats', () => {
      const table = makeTable(makeSeats(['human', 'human', 'ai', 'empty']));
      expect(canStartGame(table)).toBe(false);
    });

    // ─── 17. ไม่มี AI เลย → canStart = false ────────────────────
    it('should return false when no AI in table', () => {
      const table = makeTable(makeSeats(['human', 'human', 'human', 'human']));
      expect(canStartGame(table)).toBe(false);
    });

  });

  // ════════════════════════════════════════════════════════════
  // removeAiSeat
  // ════════════════════════════════════════════════════════════
  describe('removeAiSeat', () => {

    // ─── 18. ถอด AI ได้เมื่อ AI เหลือ > MIN_AI ─────────────────
    it('should allow removing AI when remaining AI > minAI', () => {
      // มี AI 2 ที่นั่ง → ถอดได้ 1 (เหลือ 1 = MIN_AI)
      const table  = makeTable(makeSeats(['human', 'human', 'ai', 'ai']));
      const result = removeAiSeat(table, 2); // ถอด seatIndex 2
      expect(result).toBe(true);
    });

    // ─── 19. ถอด AI ไม่ได้เมื่อ AI เหลือ = MIN_AI ───────────────
    it('should NOT allow removing AI when it would go below minAI', () => {
      // มี AI 1 ที่นั่ง → ถอดไม่ได้ (จะเหลือ 0 < MIN_AI)
      const table  = makeTable(makeSeats(['human', 'human', 'human', 'ai']));
      const result = removeAiSeat(table, 3);
      expect(result).toBe(false);
    });

    // ─── 20. ถอด seat ที่ไม่ใช่ AI → return false ───────────────
    it('should return false when target seat is not AI', () => {
      const table  = makeTable(makeSeats(['human', 'human', 'ai', 'ai']));
      const result = removeAiSeat(table, 0); // seatIndex 0 เป็น human
      expect(result).toBe(false);
    });

  });

});
