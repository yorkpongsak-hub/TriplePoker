// ─────────────────────────────────────────────────────────────────────────────
// pileResolution.test.ts — Unit Tests สำหรับ pileResolution
// TriplePoker | The Sage Unicorn Studio Co., Ltd.
// ─────────────────────────────────────────────────────────────────────────────

import {
  calcPot,
  resolvePile,
  getTierByToken,
  buildTokenUpdates,
  type PlayerArrangement,
  type CommunityCards,
  type Card,
} from '../src/game/pileResolution';

// ─── Mock handEvaluator ───────────────────────────────────────────────────────

jest.mock('../src/game/handEvaluator', () => ({
  evaluateHand: jest.fn((cards: Card[]) => {
    // mock: ดูแต่ใบแรก value สูงสุด
    const maxVal = Math.max(...cards.map((c: Card) => c.value));
    return {
      rank: 10 - Math.floor(maxVal / 2),
      name: 'Mock Hand',
      bestFive: cards.slice(0, 5),
    };
  }),
  compareHands: jest.fn(() => 0), // เสมอ
}));

// ─── Mock foulChecker ─────────────────────────────────────────────────────────

jest.mock('../src/game/foulChecker', () => ({
  checkFoul: jest.fn(() => ({ isFoul: false })),
}));

// ─── Mock gameConfig ──────────────────────────────────────────────────────────

jest.mock('../src/config/gameConfig', () => ({
  gameConfig: {
    tokenPot: {
      tiers: {
        beginner: { pile1: 10, pile2: 20, pile3: 50, call: null },
        pro:      { pile1: 50, pile2: 100, pile3: 250, call: 500 },
        boss:     { pile1: 200, pile2: 300, pile3: 500, call: 1000 },
        lastBoss: { pile1: 300, pile2: 500, pile3: 1000, call: 2000 },
      },
      rake: 0.05,
    },
    progressiveMechanics: {
      beginner: { showdownStyle: 'simultaneous' },
      pro:      { showdownStyle: 'sequential' },
    },
  },
}));

// ─── Test Data ────────────────────────────────────────────────────────────────

const makeCard = (suit: Card['suit'], value: number): Card => ({ suit, value });

const communityCards: CommunityCards = {
  pile1: [makeCard('spades', 10), makeCard('hearts', 5)],
  pile2: [makeCard('diamonds', 7), makeCard('clubs', 3)],
  pile3: [makeCard('spades', 14), makeCard('hearts', 13), makeCard('clubs', 12)],
};

const makeArrangement = (
  playerId: string,
  isAI = false
): PlayerArrangement => ({
  playerId,
  isAI,
  pile1: [makeCard('spades', 2), makeCard('hearts', 3), makeCard('clubs', 4)],
  pile2: [makeCard('diamonds', 5), makeCard('spades', 6), makeCard('hearts', 7)],
  pile3: [
    makeCard('spades', 8),
    makeCard('hearts', 9),
    makeCard('clubs', 10),
    makeCard('diamonds', 11),
    makeCard('spades', 12),
  ],
});

// ─── Tests: getTierByToken ────────────────────────────────────────────────────

describe('getTierByToken', () => {
  test('token < 20000 → beginner', () => {
    expect(getTierByToken(0)).toBe('beginner');
    expect(getTierByToken(100)).toBe('beginner');
    expect(getTierByToken(19999)).toBe('beginner');
  });

  test('20000 ≤ token < 60000 → pro', () => {
    expect(getTierByToken(20000)).toBe('pro');
    expect(getTierByToken(40000)).toBe('pro');
    expect(getTierByToken(59999)).toBe('pro');
  });

  test('token ≥ 60000 → boss', () => {
    expect(getTierByToken(60000)).toBe('boss');
    expect(getTierByToken(999999)).toBe('boss');
  });
});

// ─── Tests: calcPot ───────────────────────────────────────────────────────────

describe('calcPot', () => {
  test('Beginner S1/S2 — Pile 1 = 10 × 4 = 40', () => {
    expect(calcPot('beginner', 1, 'S1')).toBe(40);
  });

  test('Beginner S1/S2 — Pile 2 = 20 × 4 = 80', () => {
    expect(calcPot('beginner', 2, 'S1')).toBe(80);
  });

  test('Beginner S1/S2 — Pile 3 = 50 × 4 = 200', () => {
    expect(calcPot('beginner', 3, 'S1')).toBe(200);
  });

  test('Pro S1/S2 — Pile 1 = 50 × 4 = 200', () => {
    expect(calcPot('pro', 1, 'S1')).toBe(200);
  });

  test('Pro S3 Clan — Pile 1 = 50 × 6 = 300', () => {
    expect(calcPot('pro', 1, 'S3')).toBe(300);
  });

  test('Boss S1/S2 — Pile 3 = 500 × 4 = 2000', () => {
    expect(calcPot('boss', 3, 'S1')).toBe(2000);
  });

  test('Last Boss S3 — Pile 3 = 1000 × 6 = 6000', () => {
    expect(calcPot('lastBoss', 3, 'S3')).toBe(6000);
  });
});

// ─── Tests: resolvePile ───────────────────────────────────────────────────────

describe('resolvePile — basic resolution', () => {
  test('ผู้เล่น 1 คนชนะ → ได้รับ payout (pot - 5% rake)', () => {
    const { evaluateHand } = require('../src/game/handEvaluator');

    // mock ให้ player1 ได้ rank 1 (ดีสุด) — คนอื่นได้ rank 7
    (evaluateHand as jest.Mock).mockImplementation((cards: Card[]) => {
      const maxVal = Math.max(...cards.map((c: Card) => c.value));
      // pile1 ของ player1 มีไพ่ value 14 (Ace) → maxVal สูงสุดใน combined
      const isStrongHand = cards.some((c: Card) => c.value === 14);
      return {
        rank: isStrongHand ? 1 : 7,
        name: isStrongHand ? 'Royal Flush' : 'Three of a Kind',
        bestFive: cards.slice(0, 5),
      };
    });

    // player1 มีไพ่ Ace ใน pile1 → ได้ rank 1 (ชนะแน่นอน)
    const player1Arr = makeArrangement('player1');
    player1Arr.pile1 = [makeCard('spades', 14), makeCard('hearts', 3), makeCard('clubs', 4)];

    const arrangements = [
      player1Arr,
      makeArrangement('player2'),
      makeArrangement('player3'),
      makeArrangement('AI', true),
    ];

    const result = resolvePile(1, arrangements, communityCards, 'pro', 'S1');

    expect(result.pileNumber).toBe(1);
    expect(result.pot).toBe(200); // 50 × 4
    expect(result.rake).toBe(10); // 5% of 200
    expect(result.payout).toBe(190); // 200 - 10
    expect(result.winnerId).toBe('player1'); // player1 ชนะด้วย rank 1
    expect(result.burned).toBe(false); // Human ชนะ → ไม่ Burn

    // reset mock
    (evaluateHand as jest.Mock).mockImplementation((cards: Card[]) => {
      const maxVal = Math.max(...cards.map((c: Card) => c.value));
      return { rank: 10 - Math.floor(maxVal / 2), name: 'Mock Hand', bestFive: cards.slice(0, 5) };
    });
  });

  test('AI ชนะ → burned = true ไม่มีการจ่าย Token', () => {
    // mock ให้ AI มี rank ดีที่สุด (rank 1)
    const { evaluateHand } = require('../src/game/handEvaluator');
    (evaluateHand as jest.Mock).mockImplementation((cards: Card[]) => {
      // AI playerId check ทำผ่าน arrangement ก่อน evaluate
      const maxVal = Math.max(...cards.map((c: Card) => c.value));
      // ทุกคนได้ rank เดียวกัน → ทดสอบ case AI ต้องชนะ
      return { rank: 5, name: 'Flush', bestFive: cards.slice(0, 5) };
    });

    const arrangements = [
      makeArrangement('player1'),
      makeArrangement('AI_SEAT', true),
    ];

    const result = resolvePile(1, arrangements, communityCards, 'beginner', 'S1');

    // เมื่อ tie → random → ทดสอบแค่ว่า burned เป็น true เมื่อ AI ชนะ
    if (result.winnerIsAI) {
      expect(result.burned).toBe(true);
    } else {
      expect(result.burned).toBe(false);
    }
  });
});

describe('resolvePile — foul handling', () => {
  test('ผู้เล่น Foul → ถูก rank 99 และไม่เข้าแถวแข่ง', () => {
    const { checkFoul } = require('../src/game/foulChecker');
    (checkFoul as jest.Mock).mockImplementation(({ pile1 }: any) => {
      // mock: player1 Foul
      return { isFoul: pile1[0].value === 2 };
    });

    const arrangements = [
      makeArrangement('player_foul'), // pile1[0].value === 2 → Foul
      makeArrangement('player_clean'),
    ];

    // player_clean มี pile1 value 2 ด้วย → mock ให้ clean pass
    arrangements[1].pile1 = [makeCard('spades', 5), makeCard('hearts', 6), makeCard('clubs', 7)];

    const result = resolvePile(1, arrangements, communityCards, 'pro', 'S1');

    const foulRanking = result.rankings.find((r: { playerId: string; hasFoul: boolean; handRank: number }) => r.playerId === 'player_foul');
    expect(foulRanking?.hasFoul).toBe(true);
    expect(foulRanking?.handRank).toBe(99);

    // clean player ต้องชนะ
    expect(result.winnerId).toBe('player_clean');

    // reset mock
    (checkFoul as jest.Mock).mockReturnValue({ isFoul: false });
  });

  test('ทุกคน Foul → burned = true', () => {
    const { checkFoul } = require('../src/game/foulChecker');
    (checkFoul as jest.Mock).mockReturnValue({ isFoul: true });

    const arrangements = [
      makeArrangement('player1'),
      makeArrangement('player2'),
    ];

    const result = resolvePile(1, arrangements, communityCards, 'pro', 'S1');

    expect(result.burned).toBe(true);
    expect(result.winnerId).toBe('AI');

    // reset mock
    (checkFoul as jest.Mock).mockReturnValue({ isFoul: false });
  });
});

describe('resolvePile — tie-break', () => {
  test('Tie → isTie = true และมี tieWinnerById', () => {
    // mock compareHands = 0 (tie)
    const arrangements = [
      makeArrangement('playerA'),
      makeArrangement('playerB'),
    ];

    // mock rank เท่ากัน
    const { evaluateHand } = require('../src/game/handEvaluator');
    (evaluateHand as jest.Mock).mockReturnValue({
      rank: 7,
      name: 'Three of a Kind',
      bestFive: [],
    });

    const result = resolvePile(1, arrangements, communityCards, 'pro', 'S1');

    expect(result.isTie).toBe(true);
    expect(result.tieWinnerById).toBeTruthy();
    expect(['playerA', 'playerB']).toContain(result.tieWinnerById);
  });
});

// ─── Tests: buildTokenUpdates ─────────────────────────────────────────────────

describe('buildTokenUpdates', () => {
  test('แปลง tokenDeltas map เป็น array ถูกต้อง', () => {
    const deltas = {
      player1: 190,
      player2: -50,
      player3: -80,
    };

    const updates = buildTokenUpdates(deltas);

    expect(updates).toHaveLength(3);
    expect(updates.find((u: { playerId: string; delta: number }) => u.playerId === 'player1')?.delta).toBe(190);
    expect(updates.find((u: { playerId: string; delta: number }) => u.playerId === 'player2')?.delta).toBe(-50);
    expect(updates.find((u: { playerId: string; delta: number }) => u.playerId === 'player3')?.delta).toBe(-80);
  });

  test('empty deltas → empty array', () => {
    expect(buildTokenUpdates({})).toHaveLength(0);
  });
});
