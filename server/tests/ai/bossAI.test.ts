// ============================================================
// bossAI.test.ts — Unit Tests for Boss AI (4 จตุรเทพ)
// Sprint 5 | TriplePoker — The Sage Unicorn Studio Co., Ltd.
// ============================================================

import { bossArrange, BossType } from '../../src/ai/bossAI';
import { checkFoul, CommunityCards } from '../../src/game/foulChecker';
import { evaluateHand } from '../../src/game/handEvaluator';
import { Card } from '../../src/game/deck';

// ─── Test Fixtures ────────────────────────────────────────────

const mockCards: Card[] = [
  { suit: 'spades',   rank: 'A',  value: 14 },
  { suit: 'hearts',   rank: 'K',  value: 13 },
  { suit: 'diamonds', rank: 'Q',  value: 12 },
  { suit: 'clubs',    rank: 'J',  value: 11 },
  { suit: 'spades',   rank: '10', value: 10 },
  { suit: 'hearts',   rank: '9',  value: 9  },
  { suit: 'diamonds', rank: '8',  value: 8  },
  { suit: 'clubs',    rank: '7',  value: 7  },
  { suit: 'spades',   rank: '6',  value: 6  },
  { suit: 'hearts',   rank: '5',  value: 5  },
  { suit: 'diamonds', rank: '4',  value: 4  },
];

const mockCommunity: CommunityCards = {
  row1: [
    { suit: 'clubs',    rank: '3', value: 3 },
    { suit: 'spades',   rank: '2', value: 2 },
  ],
  row2: [
    { suit: 'hearts',   rank: '3', value: 3 },
    { suit: 'diamonds', rank: '2', value: 2 },
  ],
  row3: [
    { suit: 'clubs',    rank: '4', value: 4 },
    { suit: 'spades',   rank: '3', value: 3 },
  ],
};

const tooFewCards: Card[]  = mockCards.slice(0, 10);
const tooManyCards: Card[] = [
  ...mockCards,
  { suit: 'clubs', rank: '2', value: 2 },
];

// ─── Helper ──────────────────────────────────────────────────
function pileScore(pile: Card[], community: Card[]): number {
  return evaluateHand([...pile, ...community]).score;
}

// ============================================================
// TEST SUITE
// ============================================================

describe('bossAI — 4 จตุรเทพ', () => {

  // ════════════════════════════════════════════════════════════
  // SHARED: ทุก Boss type ต้องผ่าน basic checks
  // ════════════════════════════════════════════════════════════
  const allBossTypes: BossType[] = ['reaper', 'crag', 'cortex', 'cipher'];

  allBossTypes.forEach(bossType => {
    describe(`${bossType}`, () => {

      it(`[${bossType}] should return arrangement that passes FoulChecker`, () => {
        const result = bossArrange(bossType, mockCards, mockCommunity);
        expect(checkFoul(result, mockCommunity).isFoul).toBe(false);
      });

      it(`[${bossType}] should return pile1=3, pile2=3, pile3=5`, () => {
        const result = bossArrange(bossType, mockCards, mockCommunity);
        expect(result.pile1).toHaveLength(3);
        expect(result.pile2).toHaveLength(3);
        expect(result.pile3).toHaveLength(5);
      });

      it(`[${bossType}] should not have duplicate cards`, () => {
        const result   = bossArrange(bossType, mockCards, mockCommunity);
        const allCards = [...result.pile1, ...result.pile2, ...result.pile3];
        const keys     = allCards.map(c => `${c.suit}_${c.rank}`);
        expect(new Set(keys).size).toBe(11);
      });

      it(`[${bossType}] should throw when given fewer than 11 cards`, () => {
        expect(() => bossArrange(bossType, tooFewCards, mockCommunity))
          .toThrow(`bossArrange [${bossType}]: ต้องการ 11 ใบ`);
      });

      it(`[${bossType}] should throw when given more than 11 cards`, () => {
        expect(() => bossArrange(bossType, tooManyCards, mockCommunity))
          .toThrow(`bossArrange [${bossType}]: ต้องการ 11 ใบ`);
      });
    });
  });

  // ════════════════════════════════════════════════════════════
  // REAPER
  // ════════════════════════════════════════════════════════════
  describe('reaper — precision (weight Pile3 ×1.5)', () => {

    it('should consistently return valid arrangements (10 runs)', () => {
      for (let i = 0; i < 10; i++) {
        const result = bossArrange('reaper', mockCards, mockCommunity);
        expect(checkFoul(result, mockCommunity).isFoul).toBe(false);
      }
    });

    it('pile3 score should be >= pile1 score (FoulChecker rule holds)', () => {
      for (let i = 0; i < 10; i++) {
        const result = bossArrange('reaper', mockCards, mockCommunity);
        const s1 = pileScore(result.pile1, mockCommunity.row1);
        const s3 = pileScore(result.pile3, mockCommunity.row3);
        expect(s3).toBeGreaterThanOrEqual(s1);
      }
    });
  });

  // ════════════════════════════════════════════════════════════
  // THE CRAG
  // ════════════════════════════════════════════════════════════
  describe('crag — juggernaut (weight Pile1 ×1.5)', () => {

    it('should consistently return valid arrangements (10 runs)', () => {
      for (let i = 0; i < 10; i++) {
        const result = bossArrange('crag', mockCards, mockCommunity);
        expect(checkFoul(result, mockCommunity).isFoul).toBe(false);
      }
    });

    it('pile1 should have 3 cards', () => {
      const result = bossArrange('crag', mockCards, mockCommunity);
      expect(result.pile1).toHaveLength(3);
    });
  });

  // ════════════════════════════════════════════════════════════
  // CORTEX
  // ════════════════════════════════════════════════════════════
  describe('cortex — optimal (N=15, balanced)', () => {

    it('should consistently return valid arrangements (10 runs)', () => {
      for (let i = 0; i < 10; i++) {
        const result = bossArrange('cortex', mockCards, mockCommunity);
        expect(checkFoul(result, mockCommunity).isFoul).toBe(false);
      }
    });

    it('total strength should be >= 0', () => {
      const result = bossArrange('cortex', mockCards, mockCommunity);
      const total  =
        pileScore(result.pile1, mockCommunity.row1) +
        pileScore(result.pile2, mockCommunity.row2) +
        pileScore(result.pile3, mockCommunity.row3);
      expect(total).toBeGreaterThanOrEqual(0);
    });
  });

  // ════════════════════════════════════════════════════════════
  // CIPHER — 80/20 path
  // ─── Fix: mockReturnValueOnce สำหรับ path selection call แรกเท่านั้น
  //         call ถัดไป (Fisher-Yates shuffle) ใช้ real Math.random
  // ════════════════════════════════════════════════════════════
  describe('cipher — chaos (80/20 path)', () => {

    it('should return valid arrangement on normal path (first random < 0.8)', () => {
      // mock เฉพาะ call แรก (path selection) → 0.5 = normal path
      // call ถัดๆ ไป (shuffle) ใช้ real Math.random ตามปกติ
      const original = Math.random.bind(Math);
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(0.5)
        .mockImplementation(() => original());

      const result = bossArrange('cipher', mockCards, mockCommunity);
      expect(checkFoul(result, mockCommunity).isFoul).toBe(false);
      spy.mockRestore();
    });

    it('should return valid arrangement on unorthodox path (first random >= 0.8)', () => {
      // mock เฉพาะ call แรก (path selection) → 0.85 = unorthodox path
      // call ถัดๆ ไป (shuffle / fallback) ใช้ real Math.random ตามปกติ
      const original = Math.random.bind(Math);
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(0.85)
        .mockImplementation(() => original());

      const result = bossArrange('cipher', mockCards, mockCommunity);
      expect(checkFoul(result, mockCommunity).isFoul).toBe(false);
      spy.mockRestore();
    });

    it('should consistently return valid arrangements (20 runs, real random)', () => {
      for (let i = 0; i < 20; i++) {
        const result = bossArrange('cipher', mockCards, mockCommunity);
        expect(checkFoul(result, mockCommunity).isFoul).toBe(false);
      }
    });
  });

});
