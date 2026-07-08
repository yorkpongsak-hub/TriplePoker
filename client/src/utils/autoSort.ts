/**
 * autoSort.ts v4 — Greedy + Brute Force fallback
 * แก้ไขจาก v3:
 *   1. bestOf7 → bestHandN — รองรับ hand 5/6 ใบ (n=11/n=12) ไม่ hardcode slice(5,7)
 *      (บั๊กเดิม: ตอนมี 12 ใบ pile3=6 → bestOf7 อ่าน community ผิด → score เพี้ยน → Foul บ่อย)
 *   2. autoSort — Greedy first: Max Pile3 → Max Pile2 ≤ Pile3 → Pile1 ที่เหลือ
 *      ถ้า Greedy หาผลที่ไม่ Foul ไม่ได้ → Fallback Brute Force C(n,3)×C(n-3,3)
 *   3. sortPile3Best3First — รองรับ pile3.length > 5 (เลือก best 3 จาก n ใบ)
 * Pile1 = hand3 + comm2 (5 ใบ)
 * Pile2 = hand3 + comm2 (5 ใบ)
 * Pile3 = handN + comm2 (เลือก best 3 จาก hand ก่อน evaluate)
 * The Sage Unicorn Studio Co., Ltd.
 */

const VALUE_MAP: Record<string, number> = {
  '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,
  'j':11,'q':12,'k':13,'a':14,
};
const SUIT_MAP: Record<string, string> = {
  's':'spade','h':'heart','d':'diamond','c':'club',
};

function parseCard(key: string): { value: number; suit: string } {
  const suitChar = key[key.length - 1];
  const rankStr  = key.slice(0, -1);
  return { value: VALUE_MAP[rankStr] ?? 0, suit: SUIT_MAP[suitChar] ?? 'spade' };
}

// ── Hand rank score (ยิ่งสูงยิ่งดี) ──────────────────────────────
const RANK_SCORE: Record<string, number> = {
  royal_flush:    9,
  straight_flush: 8,
  four_of_a_kind: 7,
  full_house:     6,
  flush:          5,
  straight:       4,
  three_of_a_kind:3,
  two_pair:       2,
  one_pair:       1,
  high_card:      0,
};

function countVals(values: number[]): Record<number, number> {
  const c: Record<number, number> = {};
  for (const v of values) c[v] = (c[v] || 0) + 1;
  return c;
}

/**
 * checkStraight — sliding window 5 ใบ + รองรับ Ace-low (A-2-3-4-5)
 */
function checkStraight(sortedUniq: number[]): boolean {
  for (let i = 0; i <= sortedUniq.length - 5; i++) {
    const window = sortedUniq.slice(i, i + 5);
    if (window[0] - window[4] === 4) return true;
  }
  if (
    sortedUniq.includes(14) &&
    sortedUniq.includes(2) &&
    sortedUniq.includes(3) &&
    sortedUniq.includes(4) &&
    sortedUniq.includes(5)
  ) return true;
  return false;
}

/**
 * evaluate5 — ประเมิน Hand Rank จากไพ่ 5 ใบ
 */
function evaluate5(keys: string[]): number {
  const cards   = keys.map(parseCard);
  const values  = cards.map(c => c.value).sort((a, b) => b - a);
  const suits   = cards.map(c => c.suit);

  const isFlush = suits.every(s => s === suits[0]);
  const sortedUniq = [...new Set(values)].sort((a, b) => b - a);
  const isStraight = checkStraight(sortedUniq);

  const isWheelStraight =
    isStraight &&
    values[0] === 14 &&
    values[values.length - 1] === 2 &&
    !values.includes(6);

  const counts  = countVals(values);
  const cntVals = Object.values(counts).sort((a, b) => b - a);

  let rank = 'high_card';

  const isRoyal =
    isFlush && isStraight &&
    sortedUniq.includes(14) && sortedUniq.includes(13) &&
    sortedUniq.includes(12) && sortedUniq.includes(11) &&
    sortedUniq.includes(10);

  if      (isRoyal)                                 rank = 'royal_flush';
  else if (isFlush && isStraight)                   rank = 'straight_flush';
  else if (cntVals[0] === 4)                        rank = 'four_of_a_kind';
  else if (cntVals[0] === 3 && cntVals[1] === 2)   rank = 'full_house';
  else if (isFlush)                                 rank = 'flush';
  else if (isStraight)                              rank = 'straight';
  else if (cntVals[0] === 3)                        rank = 'three_of_a_kind';
  else if (cntVals[0] === 2 && cntVals[1] === 2)   rank = 'two_pair';
  else if (cntVals[0] === 2)                        rank = 'one_pair';

  const rs = RANK_SCORE[rank];

  const sortedByFreq = [...values].sort((a, b) => {
    const freqDiff = (counts[b] || 0) - (counts[a] || 0)
    if (freqDiff !== 0) return freqDiff
    const valA = (isWheelStraight && a === 14) ? 1 : a
    const valB = (isWheelStraight && b === 14) ? 1 : b
    return valB - valA
  })

  const kickerScore = sortedByFreq.reduce((acc, v, i) => {
    const val = (isWheelStraight && v === 14) ? 1 : v;
    return acc + val * Math.pow(15, 4 - i);
  }, 0);

  return rs * 100000000 + kickerScore;
}

/**
 * bestHandN — เลือก best 5 ใบจาก hand (N ใบ) + community (2 ใบ)
 * แทนที่ bestOf7 เดิมที่ hardcode slice(0,5) + slice(5,7) → bug ตอน n=8
 * - hand = keys.slice(0, -2) — รองรับ 5 หรือ 6 ใบ
 * - comm = keys.slice(-2)
 * - เก็บ 3 ใบจาก hand → C(hand.length, 3)
 */
function bestHandN(keys: string[]): number {
  const hand = keys.slice(0, -2);
  const comm = keys.slice(-2);
  if (comm.length !== 2 || hand.length < 3) return -Infinity;

  let best = -Infinity;
  for (let i = 0; i < hand.length - 2; i++) {
    for (let j = i + 1; j < hand.length - 1; j++) {
      for (let k = j + 1; k < hand.length; k++) {
        const five = [hand[i], hand[j], hand[k], comm[0], comm[1]];
        const score = evaluate5(five);
        if (score > best) best = score;
      }
    }
  }
  return best;
}

// ── Interface ──────────────────────────────────────────────────────
interface CardData { id: string; key: string; }

export interface CommunityCards {
  pile1: [string, string];
  pile2: [string, string];
  pile3: [string, string];
}

/**
 * greedyArrangement — Greedy heuristic
 * Step 1: เลือก pile3 (n-6 ใบ) ที่ bestHandN score สูงสุด
 * Step 2: เลือก pile2 (3 ใบจาก 6 ที่เหลือ) ที่ score สูงสุดแต่ ≤ pile3
 * Step 3: pile1 = 3 ใบที่เหลือ — ตรวจ ≤ pile2
 * คืน arrangement หรือ null ถ้า Foul (ใช้ fallback ต่อ)
 */
function greedyArrangement(
  cards: CardData[],
  comm: CommunityCards,
): [CardData[], CardData[], CardData[]] | null {
  const n = cards.length;
  const pile3Size = n - 6; // 5 (n=11) หรือ 6 (n=12)

  // ── Step 1: หา pile3 ที่ดีสุด — ลองทุก C(n, pile3Size) ─────
  let bestP3Score = -Infinity;
  let bestP3Idx: number[] = [];

  const explore = (start: number, remaining: number, current: number[]): void => {
    if (remaining === 0) {
      const p3keys = current.map(i => cards[i].key);
      const score = bestHandN([...p3keys, comm.pile3[0], comm.pile3[1]]);
      if (score > bestP3Score) {
        bestP3Score = score;
        bestP3Idx = [...current];
      }
      return;
    }
    for (let i = start; i <= n - remaining; i++) {
      current.push(i);
      explore(i + 1, remaining - 1, current);
      current.pop();
    }
  };
  explore(0, pile3Size, []);

  if (bestP3Idx.length === 0) return null;
  const pile3 = bestP3Idx.map(i => cards[i]);
  const restIdx = cards.map((_, i) => i).filter(i => !bestP3Idx.includes(i));
  const rest = restIdx.map(i => cards[i]);

  // ── Step 2: หา pile2 (3 ใบจาก 6) ที่ score ≤ pile3 ──────────
  let bestP2Score = -Infinity;
  let bestP2LocalIdx: number[] = [];

  for (let i = 0; i < rest.length - 2; i++) {
    for (let j = i + 1; j < rest.length - 1; j++) {
      for (let k = j + 1; k < rest.length; k++) {
        const p2keys = [rest[i].key, rest[j].key, rest[k].key];
        const score = evaluate5([...p2keys, comm.pile2[0], comm.pile2[1]]);
        if (score > bestP3Score) continue; // pile2 > pile3 → Foul, skip
        if (score > bestP2Score) {
          bestP2Score = score;
          bestP2LocalIdx = [i, j, k];
        }
      }
    }
  }

  if (bestP2LocalIdx.length === 0) return null; // ไม่มี pile2 ที่ ≤ pile3

  const pile2 = bestP2LocalIdx.map(i => rest[i]);
  const pile1 = rest.filter((_, idx) => !bestP2LocalIdx.includes(idx));

  // ── Step 3: ตรวจ pile1 ≤ pile2 ──────────────────────────────
  const pile1Keys = pile1.map(c => c.key);
  const pile1Score = evaluate5([...pile1Keys, comm.pile1[0], comm.pile1[1]]);
  if (pile1Score > bestP2Score) return null; // Foul

  return [pile1, pile2, pile3];
}

/**
 * bruteForceArrangement — Original v3 algorithm (filter Foul + max totalScore)
 * Fallback กรณี Greedy หา arrangement ที่ไม่ Foul ไม่ได้
 */
function bruteForceArrangement(
  cards: CardData[],
  comm: CommunityCards,
): [CardData[], CardData[], CardData[]] {
  const n = cards.length;
  let bestScore = -Infinity;
  let bestPiles: [CardData[], CardData[], CardData[]] = [
    cards.slice(0, 3),
    cards.slice(3, 6),
    cards.slice(6),
  ];

  for (let i = 0; i < n - 2; i++) {
    for (let j = i + 1; j < n - 1; j++) {
      for (let k = j + 1; k < n; k++) {
        const p1idx = [i, j, k];
        const rest = cards.filter((_, idx) => !p1idx.includes(idx));

        for (let a = 0; a < rest.length - 2; a++) {
          for (let b = a + 1; b < rest.length - 1; b++) {
            for (let c = b + 1; c < rest.length; c++) {
              const pile1 = p1idx.map(idx => cards[idx]);
              const pile2 = [rest[a], rest[b], rest[c]];
              const pile3 = rest.filter((_, idx) => ![a, b, c].includes(idx));

              const h1 = evaluate5([...pile1.map(cd => cd.key), ...comm.pile1]);
              const h2 = evaluate5([...pile2.map(cd => cd.key), ...comm.pile2]);
              const h3 = bestHandN([...pile3.map(cd => cd.key), ...comm.pile3]);

              if (h1 > h2 || h2 > h3) continue;

              const totalScore = h1 + h2 * 2 + h3 * 4;
              if (totalScore > bestScore) {
                bestScore = totalScore;
                bestPiles = [pile1, pile2, pile3];
              }
            }
          }
        }
      }
    }
  }

  return bestPiles;
}

/**
 * sortPile3Best3First — เรียง pile3 ให้ best 3 ใบอยู่ index 0-2
 * รองรับ pile3.length = 5 หรือ 6 (เลือก best 3 จาก N ใบ)
 */
function sortPile3Best3First(
  pile3: CardData[],
  comm3: [string, string],
): CardData[] {
  if (pile3.length < 3) return pile3;
  let bestScore = -Infinity;
  let bestKeptIdx: number[] = [0, 1, 2];

  for (let i = 0; i < pile3.length - 2; i++) {
    for (let j = i + 1; j < pile3.length - 1; j++) {
      for (let k = j + 1; k < pile3.length; k++) {
        const kept = [pile3[i], pile3[j], pile3[k]];
        const score = evaluate5([...kept.map(c => c.key), comm3[0], comm3[1]]);
        if (score > bestScore) {
          bestScore = score;
          bestKeptIdx = [i, j, k];
        }
      }
    }
  }

  const kept = bestKeptIdx.map(idx => pile3[idx]);
  const discarded = pile3.filter((_, idx) => !bestKeptIdx.includes(idx));
  return [...kept, ...discarded];
}

/**
 * autoSort — Greedy first, fallback Brute Force
 * เงื่อนไข: h1 ≤ h2 ≤ h3 (ไม่ Foul)
 */
export function autoSort(
  cards: CardData[],
  comm: CommunityCards,
): [CardData[], CardData[], CardData[]] {
  const n = cards.length;

  if (n !== 11 && n !== 12) {
    return [cards.slice(0, 3), cards.slice(3, 6), cards.slice(6)];
  }

  // ── Try Greedy first ─────────────────────────────────────
  let result = greedyArrangement(cards, comm);

  // ── Fallback to Brute Force ──────────────────────────────
  if (!result) {
    result = bruteForceArrangement(cards, comm);
  }

  // ── Sort pile3 (best 3 ใบไว้ index 0-2 ให้ตรงกับ Discard slice(0,3)) ──
  const sortedPile3 = sortPile3Best3First(result[2], comm.pile3);

  return [result[0], result[1], sortedPile3];
}
