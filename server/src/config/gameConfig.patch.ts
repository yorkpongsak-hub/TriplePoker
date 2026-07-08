// ============================================================
// PATCH: gameConfig.ts
// Sprint 5 | TriplePoker — The Sage Unicorn Studio Co., Ltd.
// ============================================================
// สาเหตุ: lastBossAI.ts อัปเดตเป็น Dual Algorithm (DDE + MCTS)
//         วันคู่ = DDE (50 iter) / วันคี่ = MCTS (70 iter)
//
// วิธีใช้: แก้ไข 2 จุดใน gameConfig.ts จริง ตามที่ระบุด้านล่าง
// ============================================================

// ─────────────────────────────────────────────────────────────
// PATCH 1: progressiveMechanics block
// ─────────────────────────────────────────────────────────────
// แก้ไข boss และ lastBoss tier:
//
// BEFORE (boss):
//   boss: {
//     ...
//     aiMode: "dde",           // Discrete Differential Evolution
//   },
//
// AFTER (boss): ไม่เปลี่ยน — Boss tier ยังใช้ bossAI.ts (DDE ไม่ใช่ lastBossAI)
//   boss: {
//     ...
//     aiMode: "dde",           // Discrete Differential Evolution (bossAI.ts)
//   },
//
// ─────────────────────────────────────────────────────────────
// BEFORE (lastBoss):
//   lastBoss: {
//     showdownStyle:       "sequential",
//     fogOfWar:            true,
//     blindAuction:        true,
//     grandFinaleBetting:  true,
//     discardPhase:        true,
//     aiMode:              "dde",
//   },
//
// AFTER (lastBoss): ← แก้ตรงนี้
//   lastBoss: {
//     showdownStyle:       "sequential",
//     fogOfWar:            true,
//     blindAuction:        true,
//     grandFinaleBetting:  true,
//     discardPhase:        true,
//     aiMode:              "dde_mcts",      // ← เปลี่ยน
//     aiAlgorithmNote:     "even_day=DDE(50iter) / odd_day=MCTS(70iter) by Server UTC",
//   },

// ─────────────────────────────────────────────────────────────
// PATCH 2: aiConfig block (arrangementN section)
// ─────────────────────────────────────────────────────────────
// BEFORE:
//   aiConfig: {
//     fillWaitSeconds: 300,
//     minHumans: 2,
//     maxAI: 2,
//     arrangementN: {
//       beginner: 1,    // first_valid
//       pro: 5,
//       reaper: 5,      // precision
//       crag: 3,        // juggernaut
//       cortex: 15,     // optimal
//       cipher: 5,      // chaos
//       // lastBoss: dde (50 iterations — ไม่ใช้ N)
//     }
//   }
//
// AFTER: ← แก้ตรงนี้
//   aiConfig: {
//     fillWaitSeconds: 300,
//     minHumans: 2,
//     maxAI: 2,
//     arrangementN: {
//       beginner: 1,        // first_valid
//       pro: 5,
//       reaper: 5,          // precision
//       crag: 3,            // juggernaut
//       cortex: 15,         // optimal
//       cipher: 5,          // chaos
//     },
//     lastBossAlgorithm: {
//       evenDay: {
//         name:       "DDE",                          // ← เพิ่ม block นี้
//         iterations: 50,
//         population: 20,
//         mutation:   0.8,
//         crossover:  0.9,
//       },
//       oddDay: {
//         name:        "MCTS",
//         simulations: 70,
//         ucb1C:       1.4142,                        // √2
//       },
//       earlyCheckpoint: [10, 20],                   // iteration ที่บันทึก earlyBest
//       timeLimitMs:     200,
//       timeBudgetMs:    190,
//     },
//   }

// ─────────────────────────────────────────────────────────────
// CODE ที่แก้ไขแล้วทั้ง 2 block (copy ไปแทนใน gameConfig.ts จริง)
// ─────────────────────────────────────────────────────────────

export const gameConfig_AI_PATCH = {

  // ── progressiveMechanics (lastBoss เท่านั้น) ────────────────
  progressiveMechanics_lastBoss: {
    showdownStyle:       'sequential',
    fogOfWar:            true,
    blindAuction:        true,
    grandFinaleBetting:  true,
    discardPhase:        true,
    aiMode:              'dde_mcts',        // วันคู่=DDE / วันคี่=MCTS
    aiAlgorithmNote:     'even_day=DDE(50iter) / odd_day=MCTS(70iter) by Server UTC',
  },

  // ── aiConfig (ทั้ง block) ────────────────────────────────────
  aiConfig: {
    fillWaitSeconds: 300,   // 5 นาที
    minHumans:       2,
    maxAI:           2,

    // N สำหรับ arrangement algorithm ของแต่ละ AI type
    arrangementN: {
      beginner: 1,          // first_valid
      pro:      5,
      reaper:   5,          // precision
      crag:     3,          // juggernaut
      cortex:   15,         // optimal
      cipher:   5,          // chaos
    },

    // Last Boss Dual Algorithm Config (ไม่ใช้ N — ใช้ iterations แทน)
    lastBossAlgorithm: {
      evenDay: {
        name:       'DDE',
        iterations: 50,
        population: 20,
        mutation:   0.8,
        crossover:  0.9,
      },
      oddDay: {
        name:        'MCTS',
        simulations: 70,
        ucb1C:       Math.SQRT2,  // √2 ≈ 1.4142
      },
      earlyCheckpoint: [10, 20],  // iteration ที่บันทึก earlyBest (ทั้ง 2 algorithm)
      timeLimitMs:     200,       // hard limit
      timeBudgetMs:    190,       // soft limit (หยุดก่อน 10ms เพื่อ safety)
    },
  },

} as const;
