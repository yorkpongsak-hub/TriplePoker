// ============================================================
// lastBossAI.ts — The Last Boss AI (DDE + MCTS Dual Algorithm)
// Sprint 5 | TriplePoker — The Sage Unicorn Studio Co., Ltd.
// ============================================================
// ⚠️ SERVER-SIDE ONLY — Client ไม่เคยเห็นผลลัพธ์จนถึง Showdown
//
// Algorithm สลับตามวันของ Server (UTC):
//   วันคู่  (2,4,6,...) → DDE  — Discrete Differential Evolution
//                                Population=20, Iterations=50
//   วันคี่  (1,3,5,...) → MCTS — Monte Carlo Tree Search
//                                Simulations=70, UCB1 C=√2
//
// Early Best Checkpoint (ทั้ง 2 algorithm):
//   Iteration 10 → บันทึก earlyBest ครั้งแรก
//   Iteration 20 → อัปเดต earlyBest
//   หมดเวลา (≥190ms) ก่อน iteration ครบ → คืน earlyBest ทันที
//
// Intelligence Modes (ใช้ร่วมกันทั้ง 2 algorithm):
//   Full Power  : Lock ไพ่ J+ ไว้ใน Pile 3 (retryCount < 4)
//   Balancing   : retryCount ≥ 4 → ปิด Full Power Lock
//   Full Moon   : isFullMoon = true → สุ่มล้วน (handicap)
// ============================================================

import { checkFoul } from '../game/foulChecker';
import { evaluateHand } from '../game/handEvaluator';
import type { Card, Arrangement, CommunityCards } from '../types/game.types';

// ─── Constants ───────────────────────────────────────────────
const PILE1_SIZE         = 3;
const PILE2_SIZE         = 3;
const PILE3_SIZE         = 5;

const DDE_POPULATION     = 20;
const DDE_ITERATIONS     = 50;
const DDE_MUTATION       = 0.8;
const DDE_CROSSOVER      = 0.9;

const MCTS_SIMULATIONS   = 70;
const MCTS_UCB1_C        = Math.SQRT2;    // Exploration constant √2

const TIME_BUDGET_MS     = 190;           // หยุดก่อนหมดเวลา 10ms เพื่อ safety
const EARLY_CHECKPOINT_1 = 10;            // บันทึก earlyBest ครั้งแรก
const EARLY_CHECKPOINT_2 = 20;            // อัปเดต earlyBest

const HIGH_RANK_THRESHOLD = 11;           // J=11, Q=12, K=13, A=14

// ─── Types ───────────────────────────────────────────────────
export interface LastBossOptions {
  retryCount?:   number;   // จำนวนครั้งที่ผู้เล่นสู้ซ้ำ (Balancing trigger)
  isFullMoon?:   boolean;  // true = Full Moon Handicap → สุ่มล้วน
  trackedCards?: Card[];   // ไพ่ที่ Perfect Memory จำได้ (สำหรับ scoring ภายนอก)
  serverUtcDay?: number;   // inject วันที่ UTC จาก Server (เพื่อ testability)
}

type Chromosome = number[]; // index permutation ของ cards array

interface MctsNode {
  arrangement: Arrangement;
  score:       number;      // Total Hand Strength
  visits:      number;
  totalScore:  number;      // สะสม score ทุก visit (สำหรับ UCB1 avg)
}

interface LockSet {
  lockedIndices: Set<number>;
  freeCount:     number;
}

// ============================
// ฟังก์ชันหลัก — lastBossArrange
// ============================
/**
 * lastBossArrange
 * เลือก algorithm ตามวันของ Server UTC:
 *   วันคู่ → DDE | วันคี่ → MCTS
 *
 * @param cards        - ไพ่ 11 ใบ
 * @param community    - Community Cards ทั้ง 3 row
 * @param options      - Intelligence options
 */
export function lastBossArrange(
  cards: Card[],
  community: CommunityCards,
  options: LastBossOptions = {}
): Arrangement {
  if (cards.length !== PILE1_SIZE + PILE2_SIZE + PILE3_SIZE) {
    throw new Error(
      `lastBossArrange: ต้องการ 11 ใบ แต่ได้รับ ${cards.length} ใบ`
    );
  }

  const {
    retryCount   = 0,
    isFullMoon   = false,
    serverUtcDay = new Date().getUTCDate(),  // Server UTC date จริง
  } = options;

  // ─── Full Moon Handicap ────────────────────────────────────
  if (isFullMoon) return fullMoonArrange(cards, community);

  // ─── Balancing: retryCount ≥ 4 → ปิด Full Power Lock ──────
  const useFullPowerLock = retryCount < 4;

  // ─── เลือก Algorithm ตามวัน UTC ──────────────────────────
  const isEvenDay = serverUtcDay % 2 === 0;
  return isEvenDay
    ? runDDE(cards, community, useFullPowerLock)
    : runMCTS(cards, community, useFullPowerLock);
}

// ============================================================
// ALGORITHM 1 — DDE (วันคู่)
// Discrete Differential Evolution
// ============================================================
function runDDE(
  cards: Card[],
  community: CommunityCards,
  useFullPowerLock: boolean
): Arrangement {
  const startTime = Date.now();
  const lock      = buildLockSet(cards, useFullPowerLock);

  let population   = initPopulation(cards, community);
  let bestChrom    = population[0];
  let bestScore    = scoreFitness(chromosomeToArrangement(bestChrom, cards), community);

  // earlyBest — รับประกันคำตอบก่อนหมดเวลา
  let earlyBest:      Arrangement | null = null;
  let earlyBestScore: number             = -Infinity;

  for (let iter = 0; iter < DDE_ITERATIONS; iter++) {
    // ─── Early Best Checkpoint ────────────────────────────
    if (iter === EARLY_CHECKPOINT_1 || iter === EARLY_CHECKPOINT_2) {
      const cand = chromosomeToArrangement(bestChrom, cards);
      if (bestScore > earlyBestScore && !checkFoul(cand, community)) {
        earlyBest      = cand;
        earlyBestScore = bestScore;
      }
    }

    // ─── Time Budget ──────────────────────────────────────
    if (Date.now() - startTime >= TIME_BUDGET_MS) break;

    const nextPop: Chromosome[] = [];

    for (let i = 0; i < DDE_POPULATION; i++) {
      const [a, b, c] = sampleThree(population, i);

      // Mutation
      let mutant = [...population[i]];
      if (Math.random() < DDE_MUTATION) {
        mutant = discreteMutate(a, b, c);
      }

      // Crossover
      let trial = discreteCrossover(population[i], mutant, DDE_CROSSOVER);

      // Full Power Lock
      if (useFullPowerLock && lock.lockedIndices.size > 0) {
        trial = applyFullPowerLock(trial, lock);
      }

      // Selection
      const trialArr   = chromosomeToArrangement(trial, cards);
      if (checkFoul(trialArr, community)) {
        nextPop.push(population[i]);
        continue;
      }

      const trialScore  = scoreFitness(trialArr, community);
      const parentScore = scoreFitness(
        chromosomeToArrangement(population[i], cards), community
      );

      if (trialScore >= parentScore) {
        nextPop.push(trial);
        if (trialScore > bestScore) {
          bestScore = trialScore;
          bestChrom = trial;
        }
      } else {
        nextPop.push(population[i]);
      }
    }

    population = nextPop;
  }

  // คืนผลลัพธ์
  const finalArr = chromosomeToArrangement(bestChrom, cards);
  if (!checkFoul(finalArr, community)) return finalArr;
  if (earlyBest) return earlyBest;
  return fallbackArrange(cards, community);
}

// ============================================================
// ALGORITHM 2 — MCTS (วันคี่)
// Monte Carlo Tree Search + UCB1
// ============================================================
function runMCTS(
  cards: Card[],
  community: CommunityCards,
  useFullPowerLock: boolean
): Arrangement {
  const startTime = Date.now();
  const lock      = buildLockSet(cards, useFullPowerLock);

  // สร้าง initial node pool
  const nodes = buildInitialNodes(cards, community, lock);
  if (nodes.length === 0) return fallbackArrange(cards, community);

  let bestNode = nodes.reduce((a, b) => a.score > b.score ? a : b);

  // earlyBest — รับประกันคำตอบก่อนหมดเวลา
  let earlyBest:      Arrangement | null = null;
  let earlyBestScore: number             = -Infinity;

  for (let sim = 0; sim < MCTS_SIMULATIONS; sim++) {
    // ─── Early Best Checkpoint ────────────────────────────
    if (sim === EARLY_CHECKPOINT_1 || sim === EARLY_CHECKPOINT_2) {
      if (bestNode.score > earlyBestScore) {
        earlyBest      = bestNode.arrangement;
        earlyBestScore = bestNode.score;
      }
    }

    // ─── Time Budget ──────────────────────────────────────
    if (Date.now() - startTime >= TIME_BUDGET_MS) break;

    // ─── Selection: UCB1 ──────────────────────────────────
    const totalVisits = nodes.reduce((s, n) => s + n.visits, 0);
    const selected    = selectUCB1(nodes, totalVisits);

    // ─── Rollout: สุ่ม valid arrangement ──────────────────
    const rolloutArr = rollout(cards, community, lock);
    if (!rolloutArr) {
      selected.visits++;
      continue;
    }

    const rolloutScore = scoreFitness(rolloutArr, community);

    // ─── Backpropagation ──────────────────────────────────
    selected.visits++;
    selected.totalScore += rolloutScore;

    // ─── Expansion: ถ้า rollout ดีกว่า selected → เพิ่ม node ใหม่
    if (rolloutScore > selected.score) {
      const newNode: MctsNode = {
        arrangement: rolloutArr,
        score:       rolloutScore,
        visits:      1,
        totalScore:  rolloutScore,
      };
      nodes.push(newNode);

      if (rolloutScore > bestNode.score) bestNode = newNode;
    }
  }

  // คืนผลลัพธ์
  if (!checkFoul(bestNode.arrangement, community)) return bestNode.arrangement;
  if (earlyBest) return earlyBest;
  return fallbackArrange(cards, community);
}

// ============================================================
// MCTS HELPERS
// ============================================================

/** buildInitialNodes — สร้าง 10 valid node เริ่มต้นสำหรับ MCTS */
function buildInitialNodes(
  cards: Card[],
  community: CommunityCards,
  lock: LockSet
): MctsNode[] {
  const nodes: MctsNode[] = [];
  for (let i = 0; i < 10; i++) {
    const arr = rollout(cards, community, lock);
    if (arr) {
      const score = scoreFitness(arr, community);
      nodes.push({ arrangement: arr, score, visits: 1, totalScore: score });
    }
  }
  return nodes;
}

/**
 * selectUCB1
 * UCB1 = avgScore_normalized + C × √(ln(totalVisits) / visits)
 * normalize avgScore ด้วย maxScore ของ pool เพื่อให้อยู่ในช่วง 0-1
 */
function selectUCB1(nodes: MctsNode[], totalVisits: number): MctsNode {
  const maxScore = Math.max(...nodes.map(n => n.score)) || 1;

  return nodes.reduce((best, node) => {
    const avgScore     = node.totalScore / node.visits;
    const exploitation = avgScore / maxScore;
    const exploration  = MCTS_UCB1_C * Math.sqrt(
      Math.log(totalVisits + 1) / node.visits
    );
    const ucb = exploitation + exploration;

    const bestAvg  = best.totalScore / best.visits;
    const bestUCB  = (bestAvg / maxScore) +
      MCTS_UCB1_C * Math.sqrt(Math.log(totalVisits + 1) / best.visits);

    return ucb > bestUCB ? node : best;
  });
}

/**
 * rollout
 * สุ่ม valid arrangement 1 ชุด พร้อม Full Power Lock (Rollout phase)
 */
function rollout(
  cards: Card[],
  community: CommunityCards,
  lock: LockSet
): Arrangement | null {
  const base = cards.map((_, i) => i);

  for (let attempt = 0; attempt < 200; attempt++) {
    let indices = shuffleArray([...base]);
    if (lock.lockedIndices.size > 0) {
      indices = applyFullPowerLock(indices, lock);
    }
    const arr = chromosomeToArrangement(indices, cards);
    if (!checkFoul(arr, community)) return arr;
  }

  return null;
}

// ============================================================
// FULL MOON + FALLBACK
// ============================================================
function fullMoonArrange(cards: Card[], community: CommunityCards): Arrangement {
  for (let i = 0; i < 1000; i++) {
    const s = shuffleCards([...cards]);
    const arr: Arrangement = {
      pile1: s.slice(0, PILE1_SIZE),
      pile2: s.slice(PILE1_SIZE, PILE1_SIZE + PILE2_SIZE),
      pile3: s.slice(PILE1_SIZE + PILE2_SIZE),
    };
    if (!checkFoul(arr, community)) return arr;
  }
  throw new Error('fullMoonArrange: ไม่พบ valid arrangement');
}

function fallbackArrange(cards: Card[], community: CommunityCards): Arrangement {
  for (let i = 0; i < 1000; i++) {
    const s = shuffleCards([...cards]);
    const arr: Arrangement = {
      pile1: s.slice(0, PILE1_SIZE),
      pile2: s.slice(PILE1_SIZE, PILE1_SIZE + PILE2_SIZE),
      pile3: s.slice(PILE1_SIZE + PILE2_SIZE),
    };
    if (!checkFoul(arr, community)) return arr;
  }
  throw new Error('fallbackArrange: ไม่พบ valid arrangement');
}

// ============================================================
// SHARED HELPERS
// ============================================================

/** buildLockSet — สร้าง Set ของ index ไพ่ J+ สำหรับ Full Power */
function buildLockSet(cards: Card[], useFullPowerLock: boolean): LockSet {
  if (!useFullPowerLock) {
    return { lockedIndices: new Set(), freeCount: cards.length };
  }
  const lockedIndices = new Set<number>();
  cards.forEach((c, i) => {
    if (cardRankValue(c) >= HIGH_RANK_THRESHOLD) lockedIndices.add(i);
  });
  return { lockedIndices, freeCount: cards.length - lockedIndices.size };
}

/** initPopulation — สร้าง initial DDE population (20 chromosomes) */
function initPopulation(cards: Card[], community: CommunityCards): Chromosome[] {
  const pop  = [];
  const base = cards.map((_, i) => i);
  for (let i = 0; i < DDE_POPULATION; i++) {
    let indices = shuffleArray([...base]);
    for (let t = 0; t < 10 &&
      checkFoul(chromosomeToArrangement(indices, cards), community); t++) {
      indices = shuffleArray([...base]);
    }
    pop.push(indices);
  }
  return pop;
}

/** chromosomeToArrangement — แปลง index array → Arrangement */
function chromosomeToArrangement(chromosome: Chromosome, cards: Card[]): Arrangement {
  return {
    pile1: chromosome.slice(0, PILE1_SIZE).map(i => cards[i]),
    pile2: chromosome.slice(PILE1_SIZE, PILE1_SIZE + PILE2_SIZE).map(i => cards[i]),
    pile3: chromosome.slice(PILE1_SIZE + PILE2_SIZE).map(i => cards[i]),
  };
}

/** scoreFitness — Total Hand Strength 3 Pile (Foul = -Infinity) */
function scoreFitness(arr: Arrangement, community: CommunityCards): number {
  if (checkFoul(arr, community)) return -Infinity;
  return (
    evaluateHand([...arr.pile1, ...community.row1]).score +
    evaluateHand([...arr.pile2, ...community.row2]).score +
    evaluateHand([...arr.pile3, ...community.row3]).score
  );
}

/** discreteMutate — DDE swap-based mutation */
function discreteMutate(a: Chromosome, b: Chromosome, c: Chromosome): Chromosome {
  const mutant = [...c];
  for (let i = 0; i < mutant.length; i++) {
    if (a[i] !== b[i] && Math.random() < DDE_MUTATION) {
      const t = mutant.indexOf(a[i]);
      if (t !== -1) [mutant[i], mutant[t]] = [mutant[t], mutant[i]];
    }
  }
  return mutant;
}

/** discreteCrossover — permutation-safe crossover */
function discreteCrossover(
  parent: Chromosome, mutant: Chromosome, rate: number
): Chromosome {
  const trial = [...parent];
  for (let i = 0; i < trial.length; i++) {
    if (Math.random() < rate) {
      const t = trial.indexOf(mutant[i]);
      if (t !== -1 && t !== i) [trial[i], trial[t]] = [trial[t], trial[i]];
    }
  }
  return trial;
}

/**
 * applyFullPowerLock
 * วาง free cards ก่อน (Pile 1+2) → locked cards (J+) ท้าย (Pile 3)
 */
function applyFullPowerLock(chromosome: Chromosome, lock: LockSet): Chromosome {
  const free   = chromosome.filter(i => !lock.lockedIndices.has(i));
  const locked = chromosome.filter(i =>  lock.lockedIndices.has(i));
  return [...free, ...locked];
}

/** sampleThree — สุ่ม 3 chromosome ที่ไม่ซ้ำ excludeIdx */
function sampleThree(
  pop: Chromosome[], excludeIdx: number
): [Chromosome, Chromosome, Chromosome] {
  const picked: number[] = [];
  while (picked.length < 3) {
    const r = Math.floor(Math.random() * pop.length);
    if (r !== excludeIdx && !picked.includes(r)) picked.push(r);
  }
  return [pop[picked[0]], pop[picked[1]], pop[picked[2]]];
}

function cardRankValue(card: Card): number {
  const m: Record<string, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6,
    '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 11, 'Q': 12, 'K': 13, 'A': 14,
  };
  return m[card.rank] ?? 0;
}

function shuffleCards(cards: Card[]): Card[] {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
