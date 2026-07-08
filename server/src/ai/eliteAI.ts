// ============================================================
// eliteAI.ts — Pro AI (best_of_n strategy, N=5)
// Sprint 5 | TriplePoker — The Sage Unicorn Studio Co., Ltd.
// ============================================================

import { checkFoul, PlayerArrangement, CommunityCards } from '../game/foulChecker';
import { evaluateHand } from '../game/handEvaluator';
import { Card } from '../game/deck';

const PILE1_SIZE = 3;
const PILE2_SIZE = 3;
const PILE3_SIZE = 5;
const CANDIDATE_COUNT = 5;
const MAX_ATTEMPTS_PER_CANDIDATE = 500;

/**
 * eliteArrange
 * สร้าง valid arrangement N=5 ชุด แล้วเลือกชุดที่มี Total Strength สูงสุด
 */
export function eliteArrange(
  cards: Card[],
  community: CommunityCards
): PlayerArrangement {
  if (cards.length !== PILE1_SIZE + PILE2_SIZE + PILE3_SIZE) {
    throw new Error(
      `eliteArrange: ต้องการ 11 ใบ แต่ได้รับ ${cards.length} ใบ`
    );
  }

  const candidates: PlayerArrangement[] = [];

  for (let i = 0; i < CANDIDATE_COUNT; i++) {
    const candidate = findValidArrangement(cards, community);
    if (candidate) candidates.push(candidate);
  }

  if (candidates.length === 0) {
    throw new Error('eliteArrange: ไม่พบ valid arrangement ใดเลย');
  }

  return selectBestArrangement(candidates, community);
}

// หา valid arrangement 1 ชุด
function findValidArrangement(
  cards: Card[],
  community: CommunityCards
): PlayerArrangement | null {
  for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_CANDIDATE; attempt++) {
    const shuffled = shuffleCards([...cards]);
    const arr: PlayerArrangement = {
      pile1: shuffled.slice(0, PILE1_SIZE),
      pile2: shuffled.slice(PILE1_SIZE, PILE1_SIZE + PILE2_SIZE),
      pile3: shuffled.slice(PILE1_SIZE + PILE2_SIZE),
    };
    if (!checkFoul(arr, community).isFoul) return arr;
  }
  return null;
}

// เลือก arrangement ที่มี Total Strength สูงสุด
function selectBestArrangement(
  candidates: PlayerArrangement[],
  community: CommunityCards
): PlayerArrangement {
  let best      = candidates[0];
  let bestScore = calcTotalStrength(candidates[0], community);

  for (let i = 1; i < candidates.length; i++) {
    const score = calcTotalStrength(candidates[i], community);
    if (score > bestScore) {
      bestScore = score;
      best      = candidates[i];
    }
  }
  return best;
}

// คำนวณ Total Hand Strength ทั้ง 3 Pile
function calcTotalStrength(
  arr: PlayerArrangement,
  community: CommunityCards
): number {
  const s1 = evaluateHand([...arr.pile1, ...community.row1]).score;
  const s2 = evaluateHand([...arr.pile2, ...community.row2]).score;
  const s3 = evaluateHand([...arr.pile3, ...community.row3]).score;
  return s1 + s2 + s3;
}

// Fisher-Yates shuffle — ไม่แก้ไข array ต้นฉบับ
function shuffleCards(cards: Card[]): Card[] {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}
