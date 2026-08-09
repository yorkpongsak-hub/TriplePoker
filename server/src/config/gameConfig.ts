// ============================================================
// TriplePoker — gameConfig.ts
// Config-driven ทั้งระบบ — ปรับค่าได้โดยไม่ต้อง redeploy
// พาธ: triplepoker-backend/src/config/gameConfig.ts
// The Sage Unicorn Studio Co., Ltd.
// Founder & Chief Architect: Assistant Professor Pongnathee Maneekul
// Updated: May 2026 — v1.2 เพิ่ม aiConfig block (lastBossAlgorithm DDE+MCTS) + aiMode dde_mcts
// ============================================================

export const gameConfig = {

  // ─── Tier Ranges ─────────────────────────────────────────────
  // กำหนดช่วง Token ของแต่ละ Tier — ใช้สำหรับ matchmaking และ feature gate
  // Canon: TriplePoker_EconomyProgression_Spec_v2_0.md §5 (2026-07-30) — แทนที่ชุดเดิม (10k/40k/100k)
  // ⚠️ Threshold ชุดนี้ต้องตรงกับ client/src/config/tierConfig.ts (TIER_CONFIG.minToken) เสมอ — แก้ที่นี่ต้องแก้อีกที่ด้วย
  // และต้อง align กับ progressionGate.*.minToken ด้านล่างเสมอ (validateGameConfig() เช็คให้ตอน server start)
  tierRanges: {
    initiate:   { min: 100,        max: 5_999     },  // Tier 1 — เรียนรู้เกม
    adept:      { min: 6_000,      max: 19_999    },  // Tier 2 — เริ่มเจอคนจริง
    mastermind: { min: 20_000,     max: 99_999    },  // Tier 3 — ปลดล็อค Auction + Betting
    highNoble:  { min: 100_000,    max: 999_999   },  // Tier 4 — Full experience + จตุรเทพ AI
    lastBoss:   { min: 1_000_000,  max: Infinity  },  // ย้ายไป The Arena แล้ว — ห้ามใช้ใน matchmaking แอปหลัก (ยังไม่ลบ กัน import พัง — ค่อยเก็บกวาดตอน refactor Ascendant)
  },

  // ─── Progression Gate (3-Axis: Token + Time + Skill) ─────────
  // Canon: TriplePoker_EconomyProgression_Spec_v2_0.md §6 — คุมความเร็วขึ้น Tier ไม่ให้เร็วเกินไป
  // minToken ต้องตรงกับ tierRanges.*.min เสมอ (validateGameConfig() เช็คให้)
  // minDays นับจาก users.created_at (server-side) — ดู server/src/game/progressionGate.ts
  // skill: "pass" ผ่านเสมอ | "nineSentinels" เช็ค conquered_sentinels >= 9 (highNoble) |
  // "monarchSlayer" เช็ค monarch_victories >= 1 (ascendant) — logic จริงอยู่ที่
  // progressionGate.ts's canUnlockTier() ทั้งหมดแล้ว (รวมจาก tierUnlockService.ts/ascendantGate.ts
  // ที่เคยเช็คแยกกันคนละที่มาไว้ที่เดียว)
  // ⚠️ arena ยังไม่ถูก wire เข้า flow จริงรอบนี้ (Arena/S+ ทั้งระบบยังเป็น stub) — ใส่ค่าไว้ตาม Spec เผื่ออนาคต
  progressionGate: {
    adept:      { minToken: 6_000,      minDays: 3,    skill: 'pass' as const },
    mastermind: { minToken: 20_000,     minDays: 10,   skill: 'pass' as const },
    highNoble:  { minToken: 100_000,    minDays: 90,   skill: 'nineSentinels' as const },
    ascendant:  { minToken: 600_000,    minDays: null as number | null, skill: 'monarchSlayer' as const },
    arena:      { minToken: 1_000_001,  minDays: null as number | null, skill: 'pass' as const },
  },

  // ─── Token Economy (Daily) ──────────────────────────────────
  // ระบบ Token รายวัน — ปรับตาม burn ratio monitoring
  dailyEconomy: {
    newUserBonus:      3_000,   // Token ที่ผู้สมัครใหม่ได้ทันที — ⚠️ ค่านี้ยังไม่มีที่ไหนอ่านจริง
                                 // ตัวที่มีผลจริงคือ users.token_balance DEFAULT บน Supabase (ดู
                                 // supabase/migrations/003_starting_token_3000.sql) แก้ที่นี่ไว้เผื่อ
                                 // อนาคตมีคนเอามาต่อยอด ไม่ให้เห็นเลขเก่าค้าง
    newUserXpBonus:    1,       // XP +1 เมื่อสมัครใหม่
    dailyRefill:       500,     // Token ฟรีต่อวัน (ทุกคน)
    minTokenToPlay:    100,     // Token ต่ำกว่านี้ → รอข้ามวัน หรือดู Ad
    adRewardToken: {
      min: 50,                  // Token ต่ำสุดจากการดู Ad เมื่อ Token < 100
      max: 100,                 // Token สูงสุดจากการดู Ad เมื่อ Token < 100
    },
    loginBonus: {
      free: 200,                // +200 Token เมื่อดูโฆษณาครั้งแรกของวัน
      vip:  300,                // +300 Token อัตโนมัติสำหรับ VIP
    },
    // ได้เมื่อเล่นจบอย่างน้อย 1 แมตช์ในวันนั้น (Asia/Bangkok), ไม่ใช่แค่เปิดแอป
    // วันที่ 7 จบรอบและวันถัดไปวนกลับวันที่ 1
    playStreak: {
      rewards: [
        { token: 100, xp: 5 },
        { token: 150, xp: 5 },
        { token: 200, xp: 10 },
        { token: 250, xp: 10 },
        { token: 300, xp: 15 },
        { token: 400, xp: 20 },
        { token: 700, xp: 35 },
      ],
      cycleDays: 7,
      maxShields: 2,
      day7ShieldBonus: 1,
    },
  },

  // ─── Token Pot ───────────────────────────────────────────────
  // ค่า Ante และ Call Amount ต่อ Tier — จ่ายอัตโนมัติต้น Hand
  // ⚠️ ไม่มี field `call` ในนี้อีกแล้ว (เดิมซ้ำกับ grandFinale.callAmount ด้านล่างจนขัดกันเอง 2 แหล่ง —
  // แหล่งเดียวสำหรับ Call Amount คือ grandFinale.callAmount เท่านั้น validateGameConfig() เช็คให้)
  tokenPot: {
    tiers: {
      initiate:   { pile1: 10,  pile2: 20,   pile3: 40   },
      adept:      { pile1: 60,  pile2: 100,  pile3: 140  },
      mastermind: { pile1: 200, pile2: 300,  pile3: 500  },
      highNoble:  { pile1: 500, pile2: 1_000,pile3: 1_500},
      lastBoss:   { pile1: 1_000,pile2: 2_000,pile3: 3_000},
    },
    // Patch (2026-07-17): ยกเลิก rakeJackpot 10% ของ Triple Sweep — ใช้ rake อัตราเดียว 5% ทุกกรณี
    // ทุก Tier (ดู gameLoop.ts/highNobleMultiEngine.ts ที่คำนวณ jackpotRake)
    rake:        0.05,  // 5% หักจากทุก Pot ทุกกรณี รวม Triple Sweep

    // S1/S2: 3 Human + 1 AI
    s1s2: {
      potPlayers:          4,           // 3H + AI นับรวมเป็น 4 ที่นั่ง
      aiContributesToPot:  true,        // AI ใส่ Virtual Token จริง
      aiWinBehavior:       "burn",      // AI ชนะ → Burn ออกจากระบบทันที
      aiEntryTokenRange: {
        min: 1.5,                       // × ขั้นต่ำของ Tier (เช่น Beginner = 1.5 × 100)
        max: 3.0,
      },
    },

    // S3 Clan: 6 Human (3+3) ไม่มี AI Seat
    s3clan: {
      potPlayers:          6,           // ทั้ง 6 คนใส่ Ante — "ได้หรือเสีย ทุกคนมีส่วนร่วม"
      aiRole:              "leader_tool", // AI = Tool ของ Leader เท่านั้น
      aiContributesToPot:  false,       // AI ไม่มี Ante ไม่มี Token
      clanSpirit:          true,        // ระบุว่าเป็น Clan mode
    },
  },

  // ─── Buy-in per Tier (Escrow Model — TriplePoker_BuyIn_Spec_v1_0 §2/§5) ───
  // หักจาก users.token_balance ครั้งเดียวตอนเข้าโต๊ะ (escrow) — settle กลับครั้งเดียวตอนจบแมตช์
  // ค่านี้แทนที่ baseline 5000 เดิมที่ hardcode กระจายอยู่ทั่ว gameLoop.ts/highNobleMultiEngine.ts ทั้งหมด
  buyIn: {
    initiate:   500,
    adept:      2_000,  // Buy-in Spec v1.1 — แก้บั๊ก game balance: worst case จริง 1,500 > buy-in เดิม 1,000
    // มติลุงเยาะ 2026-07-25: ขึ้นจาก 9,000 -> 15,000 เพราะ worst case จริงของ Tier นี้ (ante 1,000 +
    // Auto Sort 165 + Auction 150 + Grand Finale Call 600 x 2 = 2,515/รอบ x 5 รอบ = 12,575) ทะลุ
    // buy-in เดิม ผู้เล่นที่ Call ทุกครั้งจะหมด stack ก่อนจบแมตช์ (เคสเดียวกับที่ Adept แก้ไปแล้วใน
    // Buy-in Spec v1.1) — 15,000 ครอบคลุม worst case + เหลือ headroom เผื่อ Triple Sweep ซ้อน
    mastermind: 15_000,
    highNoble:  30_000,
    lastBoss:   60_000,  // reserve — Arena Phase 3
  },
  adRescueAmount: 500,  // token ต่อ 1 rewarded ad ตอน token < buyIn (Buy-in Spec §3 — คนละ mechanism กับ debtRecovery.adReward แต่ค่าเท่ากัน)

  // ─── Progressive Game Mechanics ─────────────────────────────
  // *** ADDED v1.1 — ต้องอ่าน block นี้ก่อน execute ทุก phase ***
  // Game Engine, Socket Events, Frontend UI ทั้งหมดต้อง reference block นี้
  progressiveMechanics: {
    initiate: {
      showdownStyle:       "simultaneous", // หงาย 3 Pile พร้อมกันทันที
      fogOfWar:            false,
      blindAuction:        false,
      grandFinaleBetting:  false,
      discardPhase:        false,          // Pile 3 ใช้ 5 ใบเต็ม
      aiMode:              "first_valid",
    },
    adept: {
      showdownStyle:       "simultaneous", // หงาย 3 Pile พร้อมกันทันที
      fogOfWar:            false,
      blindAuction:        false,
      grandFinaleBetting:  false,
      discardPhase:        false,
      aiMode:              "first_valid",
    },
    mastermind: {
      showdownStyle:       "sequential",
      fogOfWar:            true,
      blindAuction:        true,
      grandFinaleBetting:  true,
      discardPhase:        true,
      aiMode:              "first_valid",  // Minion AI
    },
    highNoble: {
      showdownStyle:       "sequential",
      fogOfWar:            true,
      blindAuction:        true,
      grandFinaleBetting:  true,
      discardPhase:        true,
      aiMode:              "dde",          // จตุรเทพ AI
    },
    lastBoss: {
      showdownStyle:       "sequential",
      fogOfWar:            true,
      blindAuction:        true,
      grandFinaleBetting:  true,
      discardPhase:        true,
      aiMode:              "dde_mcts",     // วันคู่=DDE / วันคี่=MCTS
      aiAlgorithmNote:     "even_day=DDE(iterations=50,population=20) / odd_day=MCTS(simulations=70,UCB1_C=√2)",
    },
  },

  // ─── Arrangement Timer ───────────────────────────────────────
  // *** ADDED v1.1 — เวลาจัดไพ่ต่อ Tier (วินาที) ***
  // Patch v1.2 (2026-07-24): "Tier สูง = เดิมพันสูง = ต้องให้เวลาคิดมากขึ้น" (กลับจาก design เดิม
  // ที่เคยลดเวลาลงตาม Tier) — initiate/adept พับ client-side tierBonus (+15) เข้ามาไว้ที่นี่จุดเดียว
  // (ผู้เล่นเห็นตัวเลขเท่าเดิมทุกประการ ดู client index.tsx) mastermind/highNoble ยืดขึ้นจริงตาม design
  // ใหม่ — arrangement_2 (รอบ 2 หลัง auction) อ่านค่าเดียวกันนี้ ทั้ง client display และ server
  // enforcement (resolveArrangementRound2Timeout/resolveHNArrangementTimeout) จะอัปเดตตามอัตโนมัติ
  arrangementTimer: {
    initiate:   105,
    adept:      90,
    mastermind: 105,
    highNoble:  120, // R1+R2 ใช้ค่านี้ทั้งคู่ — ครั้งหน้าแก้ที่นี่จุดเดียว (R1 มี server enforcement ด้วย — resolveHNArrangementTimeout)
    lastBoss:   75, // แยกจาก highNoble — ให้เวลาคิดมากขึ้นเพราะ AI เก่งระดับ DDE/MCTS
  },

  // ─── Discard Timer ────────────────────────────────────────────
  // Patch v1.2 (2026-07-24): ย้ายมาจาก literal 20000 (ms) ที่ hardcode ซ้ำ 2 จุด (gameLoop.ts
  // startDiscardPhase ทั้ง 2 branch + highNobleMultiEngine.ts) มารวมที่นี่จุดเดียว — ค่าเท่าเดิมทุกประการ
  // (20s ทั้งคู่) ไม่มีการเปลี่ยนพฤติกรรม แค่ทำให้ config-driven ตาม pattern เดียวกับ arrangementTimer/betTimer
  discardTimer: {
    mastermind: 20,
    highNoble:  20,
  },

  // ─── Auto-Sort Fee ───────────────────────────────────────────
  // มติลุงเยาะ 2026-07-25 (เขียนทับ design เดิม "ฟรี 10 Round แรก" ทั้งหมด):
  //   - ยกเลิกระบบ free rounds ถาวร — `freeRoundsForNewUser` ถูกลบทิ้งแล้ว ไม่มีการนับรอบฟรีอีก
  //   - ฟรีเฉพาะ Tier C (initiate = 0) เท่านั้น  Tier อื่นคิดเงิน "ทุกครั้งที่กด" และแพงขึ้นตาม Tier
  //   - เหตุผล: กันผู้เล่นติดนิสัยพึ่ง Auto Sort ก่อนขึ้น The Arena ซึ่งห้ามใช้เด็ดขาด (Hardcore Rule)
  // ค่าที่หักไหลเข้า Fee & Rake ของ Token Flow Panel แล้ว burn ตอนจบเกม
  // มติลุงเยาะ 2026-07-25 (ชุดที่ 2 — เขียนทับเลขตายตัวทุกตัวที่เคยขัดกัน 3 แหล่ง):
  //   ค่าธรรมเนียม = % ของ **Ante กอง 3** (กองใหญ่สุดของ Tier นั้น) ไม่ใช่เลขตายตัวอีกต่อไป
  //     C = Free | B = 25% | A = 33% | A+ = 50%
  //   เจตนา: ยิ่ง Tier สูงยิ่งแพง เพื่อกึ่งบังคับให้ผู้เล่นฝึกจัดไพ่เองให้เป็นก่อนขึ้น The Arena
  //   ซึ่งห้ามใช้ Auto Sort เด็ดขาด (Hardcore Rule)
  // ⚠️ ห้ามกลับไป hardcode ตัวเลขอีก — ให้อ่านผ่าน getAutoSortFee() ท้ายไฟล์เสมอ
  //    เพื่อให้ปรับ ante ของ Tier ไหนแล้ว fee ขยับตามเองจุดเดียว
  autoSort: {
    feeRateOfPile3Ante: {
      initiate:   0,      // Free ตลอด (Tier เรียนรู้เกม)
      adept:      0.25,   // 25% x 140  = 35
      mastermind: 0.33,   // 33% x 500  = 165
      highNoble:  0.50,   // 50% x 1500 = 750
      lastBoss:   0.50,   // 50% x 3000 = 1500 — Arena ห้าม Auto Sort อยู่แล้ว ค่านี้ไม่ควรถูกใช้จริง
    },
  },

  // ─── Progressive Hook ────────────────────────────────────────
  // Toast message ดึงผู้เล่น Beginner ขึ้น Tier
  progressiveHook: {
    afterFirstGameEver:  "You've got the basics! Reach Pro Tier to unlock Blind Auction, Fog of War & Grand Finale Betting!",
    nearProThreshold:    15_000,    // แสดง Toast เมื่อ Token ถึงค่านี้
    nearProMessage:      "Almost there! Reach 20,000 Tokens to unlock Pro Tier — where the real strategy begins!",
  },

  // ─── Blind Auction ───────────────────────────────────────────
  // ใช้เฉพาะ Tier Pro ขึ้นไป — gate ด้วย progressiveMechanics[tier].blindAuction
  blindAuction: {
    communityCards:  2,             // จำนวน Community Card ที่นำมาประมูล
    decisionTimeMs:  12000,         // เวลาตัดสินใจกดราคา ต่อใบ (ปรับจาก 5000 -> 12000 ตามที่ลุงเยาะแจ้ง)
    tieBreak:        "human_first_then_random", // Human ชนะก่อน AI เสมอ / Human-vs-Human สุ่ม 50/50 (CoreRules v1.3)
    auctionBurn:     1.0,           // Token ที่ใช้ประมูล Burn 100% ออกจากระบบทันที
    bidLevels: {                    // ราคาประมูล 4 ระดับ ต่อ Tier (CoreRules v1.3)
      mastermind: [25, 50, 100, 150],
      highNoble:  [100, 200, 300, 500],
      lastBoss:   [200, 400, 600, 1000],
    },
    tieBreakToast: {
      winner: {
        s1s2:   "Lucky Star! Fortune favors the bold.",
        s3clan: "Clan Destiny! Your team's luck is unbreakable.",
      },
      loser: {
        s3clan: "The stars weren't aligned this time...",
      },
    },
  },

  // ─── Grand Finale ────────────────────────────────────────────
  // Pile 3 Betting — ใช้เฉพาะ Tier Pro ขึ้นไป
  grandFinale: {
    callPerRound:       true,       // จ่ายต่อ Round ไม่ใช่รวม
    bettingRounds:      2,          // สูงสุด 2 Rounds
    autoFoldOnTimeout:  true,       // หมดเวลา → Auto-Fold + Toast แจ้ง
    // Call Amount ต่อ Round ต่อ Tier
    // Canon: TriplePoker_EconomyProgression_Spec_v2_0.md §4 (2026-07-30) — ลดครึ่งจากชุดเดิม (600/2,000/4,000)
    // เหตุผล: Call คือตัวปั๊ม token หลัก (~84% ของกำไร Strong ที่ HighNoble) ต้องชะลอไม่ให้ถึง 1M ก่อน 3 เดือน
    callAmount: {
      initiate:   null,
      adept:      null,
      mastermind: 300,
      highNoble:  1_000,
      lastBoss:   2_000,
    },
    betTimer: {
      // Patch v1.2 (2026-07-24): highNoble เดิม 8s สั้นกว่า mastermind (20s) ทั้งที่ callAmount.highNoble
      // (2,000) สูงกว่า callAmount.mastermind (600) เกือบ 3 เท่า — ขัดกับ "Tier สูง = เดิมพันสูง =
      // เวลาคิดมากขึ้น" ยืดเป็น 30s ให้สอดคล้อง (mastermind ไม่มีปัญหานี้ คงไว้ 20s เดิม)
      initiate:   null,
      adept:      null,
      mastermind: 20,
      highNoble:  30,
      lastBoss:   8,
    },
    // ลำดับ Betting
    bettingOrder: {
      s1s2:   ["ai", "player1", "player2", "player3"], // AI เดิมพันก่อน
      s3clan: ["leaderA", "leaderB"],                  // Leader แทนทีม
    },
  },

  // ─── VIP Plus 5-Player Economy Overrides ────────────────────
  // Founder decision 2026-08-03: Initiate/Adept เดิมไม่มี Call จึงกำหนดค่าเฉพาะโหมดนี้
  // ส่วน Mastermind ต้องอ่านจาก grandFinale.callAmount.mastermind ห้ามคัดลอกเลขมาซ้ำที่นี่
  vipPlus5: {
    callAmountOverrides: {
      initiate: 50,
      adept: 100,
    },
    // Batch 1 (VIP-05 fix) — grace ก่อนปล่อยที่นั่งเมื่อ disconnect ระหว่าง Waiting Chamber เท่านั้น
    // (C2/C7) — หลังแมตช์เริ่มแล้ว Gate 8 (vipPlusMatchEngine.ts) คุมเองไม่เกี่ยวกับค่านี้
    waitingSeatGraceMs: 60_000,
    seatSweepIntervalMs: 10_000,
    // Feedback ลุงเยาะ (เทสมือถือรอบ 1) — หน่วงก่อนไปกอง/เกมถัดไปหลัง settle ทุกกอง (G1/G2/G3) ให้เห็น
    // ไพ่ผู้ชนะเต็มๆ ก่อน — server-authoritative จริง (ไม่ใช่ client overlay เฉยๆ) sync ทุก client พร้อมกัน
    // ปรับ 10 วิ -> 6 วิ (เทสมือถือรอบ 3 — 10 วิรู้สึกนานเกินไป)
    resultDisplayMs: 6_000,
    // มติลุงเยาะ (รอบ 11) — ค่าธรรมเนียมท้ายแมตช์ทุกโต๊ะ VIP Plus 10% เก็บเฉพาะ "กำไรสุทธิที่เป็นบวก"
    // ของแต่ละคน (finalStack - buyIn > 0 เท่านั้น) คนที่เสมอทุน/ขาดทุนไม่โดนหักเพิ่ม — แยกจาก rake ต่อกอง
    // (tokenPot.rake) เดิม ดู finalizeVipPlusMatch ใน vipPlusMatchEngine.ts
    matchEndProfitFeeRate: 0.10,
  },

  // ─── Debt Recovery ───────────────────────────────────────────
  // จัดการเมื่อ Token < 0 หลัง Match จบ
  debtRecovery: {
    autoForgive: {
      tiers: ["highNoble", "lastBoss"],
      vip:   true,
    },
    thresholds: {
      initiate:   { small: 200,   medium: 1_000 },
      adept:      { small: 1_000, medium: 5_000 },
      mastermind: { small: 1_000, medium: 5_000 },
    },
    installment: {
      deductPercent: 0.20,          // หัก 20% จาก Pot ทุกครั้งจนหมดหนี้
      showDebtBadge: true,          // แสดง Badge ที่ Profile ตลอดช่วงมีหนี้
    },
    adReward: {
      tokenPerAd: 500,              // Token ที่ได้ต่อ 1 Ad ระหว่างชำระหนี้
    },
  },

  // ─── FoulChecker ─────────────────────────────────────────────
  // ตรวจ Foul ทั้ง Client-side และ Server-side
  foulChecker: {
    checkOnReady:     true,         // Client ตรวจก่อน Submit (UX ด่านแรก)
    checkOnShowdown:  true,         // Server ตรวจซ้ำที่ Showdown (security)
    penalty:          "burn_all_pots", // Foul → เสียทุก Pot → Burn ออกจากระบบ
  },

  // ─── AI Config ───────────────────────────────────────────────
  // ควบคุม AI Fill System + Arrangement Algorithm ทุก Tier
  aiConfig: {
    fillWaitSeconds: 300,           // รอ Human > 5 นาที → Auto-fill AI
    minHumans:       2,             // Human ขั้นต่ำต่อโต๊ะ (ห้ามต่ำกว่านี้)
    maxAI:           2,             // AI สูงสุดต่อโต๊ะ

    // N สำหรับ arrangement algorithm ของแต่ละ AI type (ไม่ใช้กับ lastBoss)
    arrangementN: {
      beginner: 1,                  // first_valid — หยุดชุดแรกที่ผ่าน FoulChecker
      pro:      5,                  // best_of_n — เลือก Total Strength สูงสุดจาก 5 ชุด
      reaper:   5,                  // precision — weight Pile 3 ×1.5
      crag:     3,                  // juggernaut — weight Pile 1 ×1.5 (front-load)
      cortex:   15,                 // optimal — balance 3 Pile + weight Pile 3 ×1.3
      cipher:   5,                  // chaos — 80% normal / 20% unorthodox
    },

    // Last Boss Dual Algorithm — สลับตามวันของ Server UTC
    lastBossAlgorithm: {
      evenDay: {
        name:       "DDE",          // Discrete Differential Evolution (วันคู่)
        iterations: 50,
        population: 20,
        mutation:   0.8,
        crossover:  0.9,
      },
      oddDay: {
        name:        "MCTS",        // Monte Carlo Tree Search (วันคี่)
        simulations: 70,
        ucb1C:       1.4142,        // √2 — Exploration constant
      },
      earlyCheckpoint: [10, 20],    // iteration ที่บันทึก earlyBest (ทั้ง 2 algorithm)
      timeLimitMs:     200,         // hard limit ≤ 200ms
      timeBudgetMs:    190,         // soft limit — หยุดก่อนหมดเวลา 10ms เพื่อ safety
    },
  },

  // ─── Tokenomics ──────────────────────────────────────────────
  // ค่า Target สำหรับ Token Economy Monitoring
  tokenomics: {
    rake:            0.05,          // 5% หักจากทุก Pot ที่มีการจ่ายออก
    auctionBurn:     1.0,           // 100% Burn ทันทีจาก Auction
    foulBurn:        true,          // Foul Penalty → Burn ออกจากระบบ
    aiWinBurn:       true,          // AI ชนะ Pot → Burn ทันที ไม่สะสม
    burnRatioTarget: { min: 0.8, max: 1.0 }, // Target ที่ต้องการ
    velocityTarget:  { min: 0.3 },  // ถ้าต่ำกว่า → Token ไหลเวียนน้อยเกินไป
    inflationTarget: { max: 0.05 }, // ถ้าเกิน → ต้องเพิ่ม Burn mechanism
  },

  // ─── Skin System ────────────────────────────────────────────
  // ระบบ Unlock Skin จากการชนะ Tier ต่างๆ
  skinSystem: {
    1: { id: 1, name: 'Marble Luxury', tiers: ['initiate', 'adept', 'mastermind', 'highNoble'], assetPath: 'assets/tables/skin_1_marble.png' },
    2: { id: 2, name: 'Ancient Stone Castle', tiers: ['adept', 'mastermind', 'highNoble'], assetPath: 'assets/tables/skin_2_stone.png' },
    3: { id: 3, name: 'Cosmic Mystical', tiers: ['mastermind', 'highNoble'], assetPath: 'assets/tables/skin_3_cosmic.png' },
    4: { id: 4, name: 'Bamboo Rice Field', tiers: ['highNoble'], assetPath: 'assets/tables/skin_4_bamboo.png' }
  },

  // ─── Monarch (TriplePoker_Monarch_Spec_v2_1 — Batch 1 คลีนอัป v1.3 เดิม) ──
  // บอสลับ special encounter ของ Tier A+ (High Noble) — entry-roll ที่ gameSocket.ts ก่อนเข้า
  // matchmaking ปกติเลย (ดู rollMonarchEntry() ใน monarchEngine.ts) — เส้นทางเดียวเท่านั้น
  // (Batch 1 Task 2: ถอด Monarch ออกจาก rollHighNobleBoss()/pity เดิมที่อยู่คู่ขนานกันแล้ว)
  // pity เป็นต่อผู้เล่นจริง (user_id) ไม่ใช่ max ของโต๊ะอีกต่อไป — ดู rollMonarchEntry() (Batch 1 Task 3)
  monarchConfig: {
    spawnRateBase:   0.03,   // Batch 1 Task 1: รีเซ็ตจาก 0.97 (ค่าเทสที่ลืมเปลี่ยนกลับ) — ห้ามแก้ค่านี้ตรงๆ เพื่อเทสอีก ใช้ MONARCH_TEST_RATE env var ผ่าน getMonarchSpawnRate() แทน (อ่านค่าจริงต้องผ่าน helper นั้นเท่านั้น ไม่อ่าน field นี้ตรงๆ)
    pityStepPerGame: 0.005,  // +0.5% ต่อเกม High Noble ที่ไม่เจอ Monarch (นับจาก reset ล่าสุด)
    pityGuaranteeAt: 30,     // เกมที่ 30 นับจาก reset ยังไม่เจอ → บังคับ spawn (effective rate = 100%)
    potMultiplier:   2.0,    // Pot ×2 เมื่อผู้เล่น human ชนะ Monarch — ส่วนต่าง House mint ไม่หักจากผู้เล่นอื่น
    // Batch 1 Task 4 — Royal Hour: เสาร์ 20:00-20:59:59 (Asia/Bangkok) spawn rate ×2 (คูณเฉพาะ base
    // rate ผ่าน getMonarchSpawnRate() เท่านั้น ไม่คูณ/ข้าม pity) ห้ามส่งค่าใดๆ ในนี้ไปที่ client เด็ดขาด
    royalHour: {
      enabled:    true,
      dayOfWeek:  6,             // 0=Sun...6=Sat (ตรงกับ Date.getDay() ปกติ)
      startHour:  20,
      endHour:    21,            // [startHour, endHour) — 20 เท่านั้นที่เข้าเงื่อนไข = 20:00:00-20:59:59
      multiplier: 2.0,
      timezone:   'Asia/Bangkok',
    },
    // Batch 1 Task 2 (Monarch v2.2): ถอด Monarch ออกจาก pool นี้แล้ว — rollHighNobleBoss() (monarchSpawn.ts)
    // สุ่มแค่ Four Gods เท่านั้นตอนนี้ ค่าเดิม 28/25/25/19 (รวม Monarch=3 → 100) normalize ตามสัดส่วนเดิม
    // ด้วย largest-remainder method ให้รวมกัน = 100 พอดี (28.87→29, 25.77→26, 25.77→26, 19.59→19)
    bossWeights: { reaper: 29, crag: 26, cortex: 26, cipher: 19 },
    // Batch 1 Task 6 — เวลาจัดไพ่ก่อนหมดเวลา auto-seal (ห้ามช่วยจัด ดู forceSealMonarchArrangement
    // ใน monarchEngine.ts) ยังไม่มี UI countdown ในบัตช์นี้ (client ได้ค่านี้ผ่าน monarch_round_start's
    // arrangementDeadlineAt แล้ว เตรียมไว้ให้ Batch 2 ใช้ต่อ)
    arrangementDeadlineMs: 60_000,
    // Personality Lock ของ Monarch — แบ่ง Total Hand Strength (bestArrangement) เป็น 4 ช่วงด้วย quartile threshold
    // (Spec v1.3 ให้แค่คำบรรยายเชิงคุณภาพ "แข็งมาก/ปานกลาง/ปานกลางค่อนอ่อน/อ่อน" — ตัวเลขนี้เป็นค่าเริ่มต้นที่ปรับจูนได้หลัง playtest จริง)
    handStrengthQuartile: { veryStrong: 0.75, medium: 0.5, mediumWeak: 0.25 },
    // Batch 3D-1 — Royal Relic: token bonus ที่ให้ทุกครั้งที่ชนะ Monarch หลังเก็บ relic ครบ 6 ชิ้นแล้ว
    // (recurring ไม่ใช่ one-time — ปรับตัวเลขนี้ได้อิสระหลัง playtest จริง ไม่กระทบ drop logic ที่อื่น)
    relicCompleteBonus: 5_000,
  },

  // ─── Performance Score (PS) ────────────────────────────────────
  // Active ตั้งแต่ Tier A+ ขึ้นไป (เดิม dormant รอ Arena) — ใช้คัดเลือก "Ascendant Star" ใน Ascendant Tier
  psConfig: {
    // เกณฑ์ใหม่ 2026-08-08: negative / non-negative / defeat boss
    // Named legendary bosses (Monarch, Soren, Last Boss) add +2 to bossWin.
    highNoble:  { negative: 0, nonNegative: 1, bossWin: 3 },
    ascendant:  { negative: 0, nonNegative: 1, bossWin: 3 },
    grandmaster:{ negative: 0, nonNegative: 2, bossWin: 4 },
    sovereign:  { negative: 0, nonNegative: 4, bossWin: 6 },
    legendaryBossBonus: 2,
  },

  // ─── XP Rewards (End-of-Match Stats Recording MVP) ────────────
  // completion = จบเกม (ไม่ว่าแพ้ชนะ) / win = ชนะ match (แทนที่ completion ไม่บวกซ้อน) /
  // tripleSweepBonus = บวกเพิ่มถ้าชนะทั้ง 3 กอง (Triple Sweep) ในรอบใดก็ได้ของแมตช์นี้
  xpRewards: {
    initiate:   { completion: 5,  win: 15, tripleSweepBonus: 20 },
    adept:      { completion: 10, win: 25, tripleSweepBonus: 35 },
    mastermind: { completion: 15, win: 40, tripleSweepBonus: 60 },
    highNoble:  { completion: 20, win: 60, tripleSweepBonus: 90 },
    // D1 Hook: games_played กลายเป็น 1 (เกมแรกของผู้เล่นใหม่) — บวกครั้งเดียว
    d1Hook: { xpBonus: 50, streakShieldBonus: 1 },
    // เงื่อนไข XP ขั้นต่ำสำหรับปลดล็อก Ascendant — กันผู้เล่นซื้อ token อย่างเดียว
    // ยังไม่มีใครเรียกใช้ จะถูกใช้ตอน implement Ascendant Trigger
    ascendantXpRequirement: 12000,
  },

  // ─── Monarch Identity (Canon Locked v1.2) ──────────────────────
  monarchIdentity: {
    name:     'Monarch',
    title:    'The Faceless King',
    hookLine: 'My mask is the hand I am dealt.',
    emoji:    '👑',
    // Asset มีอยู่แล้วใน client/assets/bosses/ — ชื่อไฟล์ตัว M พิมพ์ใหญ่ (ต่างจากจตุรเทพที่เป็นตัวเล็กหมด) ห้ามเปลี่ยนชื่อไฟล์
    assetMain:   'boss_Monarch.png',
    assetAvatar: 'boss_Monarch_avatar.png',
  },

  // ─── Ascendant Gate (Ascendant_Spec_v1_1 §2 + มติลุงเยาะ 2026-07-30 — ทับ MasterPlan §5 เดิม) ─
  // Ascendant ยังไม่ใช่ tier เต็มรูปแบบใน tierRanges/getTierFromToken() — ใช้ค่านี้ตรงใน ascendantGate.ts เท่านั้น
  // ⚠️ tokenMax ถูกตัดออกแล้ว (มติ 2026-07-30 ทับ Spec v1.1 "ตัดเพดานบน 999,999 ออก") — คนที่มี token
  // เกิน 1M อยู่แล้วยังซื้อ Ascendant Pass ได้ และจะ Instant Pass ทันที (ดู crownVaultService.ts)
  ascendantConfig: {
    tokenMin:              600_000,
    requireMonarchVictory: true,   // ต้องมี monarch_victories >= 1 ก่อนซื้อ Ascendant Pass ได้ (badge ต้องได้ก่อนเข้า)
    windowDays:            30,     // ต้องขึ้น Tier S (token >= 1M) ภายใน 30 วันหลังซื้อ Ascendant Pass (เว้นแต่ Instant Pass)
  },

  // ─── The Crown Vault (มติลุงเยาะ 2026-07-30 — Shop section ใหม่ เชื่อม Main App กับ The Arena) ─
  // Token→Crown Exchange ปลดล็อกที่ HighNoble (ไม่ต้องรอ Ascendant) ตาม Ascendant_Spec_v1_1 §5
  // Ascendant Pass / Arena Pass เป็นกลไกใหม่ที่ไม่มีใน Spec v1.1 เดิม — ยืนยันแล้วไม่ต้อง revise เอกสาร
  crownVaultConfig: {
    tokenToCrownRate:          5_000,      // 1 Crown = 5,000 Token ทางเดียว ห้ามแลกกลับ
    ascendantPassPriceCrown:   20,         // ซื้อเพื่อเปิด Ascendant window (หรือ Instant Pass ถ้า token >= 1M อยู่แล้ว)
    arenaPassPriceCrown:       20,         // ซื้อเพื่อปลดล็อกเข้า Tier S / The Arena ถาวร — ด่านสุดท้ายบังคับทั้ง 2 เส้นทาง
    unlockCrownExchangeAtTier: 'highNoble' as const, // ต้องเคยปลด tier_unlocked_max ถึง highNoble ก่อนแลก Crown ได้
  },

  // ─── Merch Shop (มติลุงเยาะ 2026-08-04 — สินค้าจริง เสื้อ/ถ้วย/เหรียญรางวัล) ─────
  // จ่ายด้วย Earned Crown เท่านั้น (Legal/Economy Rule #1 — Crown Package ใช้ได้เฉพาะ Crown Vault
  // cosmetics เท่านั้น ห้ามใช้ซื้อสินค้าจริง) gate ด้วย tier_unlocked_max แบบเดียวกับ Competitive Items
  // (ปลด Tier ไหนแล้วซื้อของ Tier นั้นได้ ไม่ต้องซื้อไล่ลำดับ) จัดส่งในประเทศไทยเท่านั้น
  // ⚠️ single source of truth ราคา/แคตาล็อก — client (ShopScreen.tsx) ห้าม hardcode ราคาเอง
  // ต้องดึงผ่าน GET /merch/catalog เท่านั้น (กัน bug 3-แหล่งขัดกันแบบ Auto Sort Fee เดิม)
  merchConfig: {
    catalog: [
      { key: 'medal_initiate',    type: 'medal',  name: 'Initiate Medal',     tier: 'initiate',   priceCrown: 5 },
      { key: 'trophy_initiate',   type: 'trophy', name: 'Initiate Trophy',    tier: 'initiate',   priceCrown: 10 },
      { key: 'shirt_initiate',    type: 'shirt',  name: 'Initiate Shirt',     tier: 'initiate',   priceCrown: 15 },

      { key: 'medal_adept',       type: 'medal',  name: 'Adept Medal',        tier: 'adept',      priceCrown: 8 },
      { key: 'trophy_adept',      type: 'trophy', name: 'Adept Trophy',       tier: 'adept',      priceCrown: 15 },
      { key: 'shirt_adept',       type: 'shirt',  name: 'Adept Shirt',        tier: 'adept',      priceCrown: 25 },

      { key: 'medal_mastermind',  type: 'medal',  name: 'Mastermind Medal',   tier: 'mastermind', priceCrown: 12 },
      { key: 'trophy_mastermind', type: 'trophy', name: 'Mastermind Trophy',  tier: 'mastermind', priceCrown: 25 },
      { key: 'shirt_mastermind',  type: 'shirt',  name: 'Mastermind Shirt',   tier: 'mastermind', priceCrown: 40 },

      { key: 'medal_highNoble',   type: 'medal',  name: 'High Noble Medal',   tier: 'highNoble',  priceCrown: 20 },
      { key: 'trophy_highNoble',  type: 'trophy', name: 'High Noble Trophy',  tier: 'highNoble',  priceCrown: 40 },
      { key: 'shirt_highNoble',   type: 'shirt',  name: 'High Noble Shirt',   tier: 'highNoble',  priceCrown: 60 },

      { key: 'medal_grandmaster',  type: 'medal',  name: 'Grandmaster Medal',  tier: 'grandmaster', priceCrown: 35 },
      { key: 'trophy_grandmaster', type: 'trophy', name: 'Grandmaster Trophy', tier: 'grandmaster', priceCrown: 70 },
      { key: 'shirt_grandmaster',  type: 'shirt',  name: 'Grandmaster Shirt',  tier: 'grandmaster', priceCrown: 100 },
    ] as { key: string; type: 'medal' | 'trophy' | 'shirt'; name: string; tier: 'initiate' | 'adept' | 'mastermind' | 'highNoble' | 'grandmaster'; priceCrown: number }[],
    shippingCountry: 'TH' as const, // จัดส่งในประเทศไทยเท่านั้น (มติลุงเยาะ 2026-08-04)
  },

  // ─── Matchmaking Timeouts (LobbyMatchmaking_Spec_v1_1) ─────────
  // ย้ายมาจาก roomRegistry.ts (เดิม hardcode เป็น local const) ให้ config-driven ตามกติกา —
  // roomRegistry.ts import ค่าจาก block นี้แทน ไม่มี local const ซ้ำอีก
  matchmakingTimeouts: {
    // Mastermind แบบเดิม (waiting timeout รอบแรกก่อน AI-fill) — ห้ามแก้ค่าที่กระทบ Mastermind
    // (ดู roomRegistry.TIER_ROOM_CONFIG.mastermind.waitTimeoutMs)
    mastermindWaitTimeoutMs: 120_000,

    // TIER_ROOM_CONFIG.adept.waitTimeoutMs เดิม — ใช้แค่ฝั่ง private room เท่านั้น (2H+2AI ตายตัว,
    // invite ด้วย PIN ไม่ผ่าน auto-match flow ใหม่ v1.1 เลย ไม่ถูกแตะใน Step 1-3)
    adeptPrivateWaitTimeoutMs: 3 * 60_000,

    // TIER_ROOM_CONFIG.highNoble.waitTimeoutMs เดิม — รอบแรกของ waiting timeout dialog (§4.4) ก่อนถาม
    // choice ครั้งแรก (ยังใช้จนกว่า Step 3 จะย้าย HighNoble มาใช้ 2-stage timer ใหม่ทั้งหมด)
    highNobleWaitTimeoutMs: 3 * 60_000,

    // §4.4: รอบขยายเวลาหลัง Dialog เลือก "Wait 2 More Minutes" (HighNoble เดิม — เก็บไว้ใช้กับ dialog flow เก่าจนกว่า Step 3)
    waitExtensionMs: 2 * 60_000,

    // Adept v1.2: ล็อคตายตัว 2H+2AI เท่านั้น ไม่มี 3rd-human wait stage อีกแล้ว (thirdHumanWaitMs ถูกลบ —
    // เคยมีใน v1.1 ตอนยังรอคนที่ 3 ได้ 15 วิ) — HighNoble ยังใช้ 2-stage timer เดิม (v1.1) แยกต่างหาก
    // ไม่ถูกกระทบ ค่าเริ่มต้นเท่ากันทั้ง 2 Tier ตาม Spec เดิม แยก key ต่อ Tier ไว้เผื่อปรับจูนทีหลังไม่เท่ากัน
    adept: {
      secondHumanWaitMs: 120_000, // Human คนที่ 1 เข้า → รอ 2 นาที ให้คนที่ 2 เข้า ไม่งั้นปิดโต๊ะ (Human>=2 บังคับ)
    },
    highNoble: {
      secondHumanWaitMs: 120_000,
      thirdHumanWaitMs:  15_000,  // Human คนที่ 2 เข้า → รอ 15 วิ ให้คนที่ 3 เข้า ไม่งั้นเติม AI ตัวที่ 2
    },
  },

} as const;

// ─── Type Helpers ────────────────────────────────────────────────
// Utility types สำหรับ TypeScript type safety ทั่วทั้งระบบ

export type Tier = keyof typeof gameConfig.progressiveMechanics;
// → "initiate" | "adept" | "mastermind" | "highNoble" | "lastBoss"

export type ProgressiveMechanics = typeof gameConfig.progressiveMechanics[Tier];
// → ใช้สำหรับ type-safe access ใน gameSocket.ts, cardEngine.ts ฯลฯ

// ─── Helper Function ─────────────────────────────────────────────
// ดึง Progressive Mechanics ของ Tier ที่กำหนด — ใช้ในทุก module
export function getMechanics(tier: Tier): ProgressiveMechanics {
  return gameConfig.progressiveMechanics[tier];
}

/**
 * ค่าธรรมเนียม Auto Sort ของ Tier — คิดสดจาก config ทุกครั้ง (มติลุงเยาะ 2026-07-25)
 *
 * สูตร: อัตราของ Tier x Ante กอง 3 ของ Tier นั้น
 *   initiate 0 (Free) | adept 35 | mastermind 165 | highNoble 750 | lastBoss 1,500
 *
 * ที่ต้องเป็นฟังก์ชันไม่ใช่ตัวเลขในตาราง เพราะของเดิมเคยมีเลขตายตัวขัดกันเอง 3 แหล่ง
 * (gameConfig / CLAUDE.md / TokenFlowPanel Spec) จนไม่มีใครรู้ว่าอันไหนจริง — แบบนี้เหลือแหล่งเดียว
 * และปรับ ante ของ Tier ไหน fee ก็ขยับตามเองทันที
 */
export function getAutoSortFee(tier: string): number {
  const rate = (gameConfig.autoSort.feeRateOfPile3Ante as Record<string, number>)[tier] ?? 0;
  const stakes = (gameConfig.tokenPot.tiers as Record<string, { pile3: number }>)[tier];
  if (!rate || !stakes) return 0;
  return Math.round(stakes.pile3 * rate);
}

/**
 * Batch 1 Task 4 — เช็คว่าตอนนี้อยู่ใน Royal Hour หรือไม่ (เสาร์ 20:00-20:59:59 Asia/Bangkok ตาม
 * gameConfig.monarchConfig.royalHour) คำนวณจาก Intl.DateTimeFormat กับ timeZone ที่ config ไว้เสมอ
 * ห้ามพึ่ง TZ ของเครื่อง server (เทียบ getBangkokDateString ใน matchStatsService.ts)
 *
 * Fail-open: คำนวณพลาด (เช่น timezone string ผิด) → คืน false เสมอ (ใช้ base rate ปกติ ไม่คูณ ไม่ throw)
 */
export function isRoyalHour(now: Date = new Date()): boolean {
  const cfg = gameConfig.monarchConfig.royalHour;
  if (!cfg.enabled) return false;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: cfg.timezone, weekday: 'short', hour: 'numeric', hourCycle: 'h23',
    }).formatToParts(now);
    const weekdayStr = parts.find(p => p.type === 'weekday')?.value;
    const hourStr = parts.find(p => p.type === 'hour')?.value;
    const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const weekday = weekdayStr ? WEEKDAY_INDEX[weekdayStr] : undefined;
    const hour = hourStr ? parseInt(hourStr, 10) : NaN;
    if (weekday === undefined || Number.isNaN(hour)) return false;
    return weekday === cfg.dayOfWeek && hour >= cfg.startHour && hour < cfg.endHour;
  } catch (err) {
    console.error('[MONARCH] isRoyalHour() calculation failed — fail-open (treated as not Royal Hour):', err);
    return false;
  }
}

/**
 * Batch 1 Task 1/4 — อัตราสุ่ม Monarch ที่ใช้งานจริง ห้ามอ่าน gameConfig.monarchConfig.spawnRateBase
 * ตรงๆ อีกที่ไหนเลย (ต้นเหตุเดิม: แก้ spawnRateBase เป็น 0.97 ไว้เทสบนมือถือแล้วลืมเปลี่ยนกลับ ค้าง
 * production-bound หลาย sprint) — เทสต่อไปให้ปรับผ่าน MONARCH_TEST_RATE env var แทน ซึ่งใช้ได้เฉพาะ
 * ตอน NODE_ENV !== 'production' เท่านั้น กัน env หลุดเข้า production โดยเด็ดขาด — Royal Hour คูณ
 * multiplier ทับ base (env หรือ config ก็ตาม) เป็นขั้นตอนสุดท้ายเสมอ แล้ว clamp ไม่ให้เกิน 1
 */
export function getMonarchSpawnRate(): number {
  let base: number;
  if (process.env.NODE_ENV !== 'production' && process.env.MONARCH_TEST_RATE !== undefined) {
    const parsed = parseFloat(process.env.MONARCH_TEST_RATE);
    base = Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : gameConfig.monarchConfig.spawnRateBase;
    console.warn(`[MONARCH] spawn rate overridden by MONARCH_TEST_RATE=${process.env.MONARCH_TEST_RATE} → ${base} (NODE_ENV=${process.env.NODE_ENV ?? 'undefined'}) — ห้ามลืมลบ env var นี้ก่อน deploy จริง`);
  } else {
    base = gameConfig.monarchConfig.spawnRateBase;
  }
  if (isRoyalHour()) {
    base = Math.min(1, base * gameConfig.monarchConfig.royalHour.multiplier);
  }
  return base;
}

/**
 * ตรวจความสอดคล้องของค่า Economy ทั้งหมดตอน server start — fail fast ถ้าพัง
 * (Economy Progression Spec v2.0 §11 ข้อ 5) เรียกจาก server/src/index.ts ก่อน app.listen()
 *
 * เช็ค:
 *   1. grandFinale.callAmount ต้อง null เฉพาะ Tier ที่ progressiveMechanics.grandFinaleBetting === false
 *      และต้องเป็นตัวเลขบวกเมื่อ grandFinaleBetting === true (กัน duplicate/ขัดกันแบบที่เคยเกิดกับ
 *      tokenPot.tiers.call ที่ถูกลบทิ้งไปแล้ว)
 *   2. progressionGate.*.minToken ต้องตรงกับ tierRanges.*.min เสมอ (Spec §5 — "ต้อง align เสมอ")
 */
export function validateGameConfig(): void {
  const errors: string[] = [];

  for (const tier of Object.keys(gameConfig.progressiveMechanics) as Tier[]) {
    const mechanics = gameConfig.progressiveMechanics[tier];
    const call = (gameConfig.grandFinale.callAmount as Record<string, number | null>)[tier];
    if (mechanics.grandFinaleBetting && (call == null || call <= 0)) {
      errors.push(`grandFinale.callAmount.${tier} ต้องเป็นตัวเลขบวก เพราะ ${tier}.grandFinaleBetting === true (ปัจจุบัน: ${call})`);
    }
    if (!mechanics.grandFinaleBetting && call != null) {
      errors.push(`grandFinale.callAmount.${tier} ต้องเป็น null เพราะ ${tier}.grandFinaleBetting === false (ปัจจุบัน: ${call})`);
    }
  }

  for (const tier of Object.keys(gameConfig.progressionGate) as Array<keyof typeof gameConfig.progressionGate>) {
    const gateMinToken = gameConfig.progressionGate[tier].minToken;
    const rangeMinToken = (gameConfig.tierRanges as Record<string, { min: number }>)[tier]?.min;
    if (rangeMinToken != null && gateMinToken !== rangeMinToken) {
      errors.push(`progressionGate.${tier}.minToken (${gateMinToken}) ≠ tierRanges.${tier}.min (${rangeMinToken}) — ต้อง align กันเสมอ`);
    }
  }

  if (errors.length > 0) {
    throw new Error('[gameConfig] validateGameConfig() ล้มเหลว:\n' + errors.map(e => '  - ' + e).join('\n'));
  }
}
