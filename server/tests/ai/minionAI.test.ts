// ============================================================
// minionAI.test.ts — Unit Tests for Beginner AI (first_valid)
// Sprint 5 | TriplePoker — The Sage Unicorn Studio Co., Ltd.
// ============================================================

import { minionArrange } from '../../src/ai/minionAI';
import { checkFoul, CommunityCards } from '../../src/game/foulChecker';
import { Card } from '../../src/game/deck';

// ─── Test Fixtures ────────────────────────────────────────────
// Card = { suit: Suit, rank: Rank (string), value: number }

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

// ============================================================
// TEST SUITE
// ============================================================

describe('minionAI — first_valid strategy', () => {

  // ─── 1. Arrangement ผ่าน FoulChecker เสมอ ─────────────────
  it('should return an arrangement that passes FoulChecker', () => {
    const result = minionArrange(mockCards, mockCommunity);
    expect(checkFoul(result, mockCommunity).isFoul).toBe(false);
  });

  // ─── 2. Pile sizes ถูกต้อง 3-3-5 ──────────────────────────
  it('should return pile1=3, pile2=3, pile3=5 cards', () => {
    const result = minionArrange(mockCards, mockCommunity);
    expect(result.pile1).toHaveLength(3);
    expect(result.pile2).toHaveLength(3);
    expect(result.pile3).toHaveLength(5);
  });

  // ─── 3. รวมไพ่ใน 3 Pile = 11 ใบพอดี ───────────────────────
  it('should use exactly 11 cards across all piles', () => {
    const result = minionArrange(mockCards, mockCommunity);
    const total = result.pile1.length + result.pile2.length + result.pile3.length;
    expect(total).toBe(11);
  });

  // ─── 4. ไม่มีไพ่ซ้ำใน 3 Pile ──────────────────────────────
  it('should not have duplicate cards across piles', () => {
    const result   = minionArrange(mockCards, mockCommunity);
    const allCards = [...result.pile1, ...result.pile2, ...result.pile3];
    const keys     = allCards.map(c => `${c.suit}_${c.rank}`);
    const unique   = new Set(keys);
    expect(unique.size).toBe(11);
  });

  // ─── 5. ไพ่ทุกใบมาจาก mockCards เท่านั้น ──────────────────
  it('should only contain cards from the original hand', () => {
    const result       = minionArrange(mockCards, mockCommunity);
    const allCards     = [...result.pile1, ...result.pile2, ...result.pile3];
    const originalKeys = new Set(mockCards.map(c => `${c.suit}_${c.rank}`));
    allCards.forEach(card => {
      expect(originalKeys.has(`${card.suit}_${card.rank}`)).toBe(true);
    });
  });

  // ─── 6. throw error เมื่อส่งไพ่น้อยกว่า 11 ใบ ──────────────
  it('should throw error when given fewer than 11 cards', () => {
    expect(() => minionArrange(tooFewCards, mockCommunity))
      .toThrow('minionArrange: ต้องการ 11 ใบ');
  });

  // ─── 7. throw error เมื่อส่งไพ่มากกว่า 11 ใบ ───────────────
  it('should throw error when given more than 11 cards', () => {
    expect(() => minionArrange(tooManyCards, mockCommunity))
      .toThrow('minionArrange: ต้องการ 11 ใบ');
  });

  // ─── 8. เรียกซ้ำ 20 ครั้ง — ผ่าน FoulChecker ทุกครั้ง ──────
  it('should consistently return valid arrangements on repeated calls', () => {
    for (let i = 0; i < 20; i++) {
      const result = minionArrange(mockCards, mockCommunity);
      expect(checkFoul(result, mockCommunity).isFoul).toBe(false);
    }
  });

  // ─── 9. ผลลัพธ์มี key pile1 pile2 pile3 ครบ ─────────────────
  it('should return an object with pile1, pile2, pile3 keys', () => {
    const result = minionArrange(mockCards, mockCommunity);
    expect(result).toHaveProperty('pile1');
    expect(result).toHaveProperty('pile2');
    expect(result).toHaveProperty('pile3');
  });

  // ─── 10. ไม่แก้ไข cards array ต้นฉบับ (immutability) ────────
  it('should not mutate the original cards array', () => {
    const snapshot = mockCards.map(c => ({ ...c }));
    minionArrange(mockCards, mockCommunity);
    mockCards.forEach((card, i) => {
      expect(card.suit).toBe(snapshot[i].suit);
      expect(card.rank).toBe(snapshot[i].rank);
      expect(card.value).toBe(snapshot[i].value);
    });
  });

});
