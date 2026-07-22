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
  // ⚠️ Threshold ชุดนี้ต้องตรงกับ client/src/config/tierConfig.ts (TIER_CONFIG.minToken) เสมอ — แก้ที่นี่ต้องแก้อีกที่ด้วย
  // getTierFromToken() ด้านล่างยังเป็น dead code (ไม่มีใครเรียกใช้จริงในปัจจุบัน) — แก้ค่าให้ถูกไว้กันบั๊กตอน Matchmaking เริ่มเรียกใช้จริงในอนาคต
  tierRanges: {
    initiate:   { min: 100,      max: 9_999    },  // Tier 1 — เรียนรู้เกม
    adept:      { min: 10_000,   max: 39_999   },  // Tier 2 — เริ่มเจอคนจริง
    mastermind: { min: 40_000,   max: 99_999   },  // Tier 3 — ปลดล็อค Auction + Betting
    highNoble:  { min: 100_000,  max: Infinity },  // Tier 4 — Full experience + จตุรเทพ AI
    lastBoss:   { min: 400_000,  max: Infinity },  // ย้ายไป The Arena แล้ว — ห้ามใช้ใน matchmaking แอปหลัก (ยังไม่ลบ กัน import พัง — ค่อยเก็บกวาดตอน refactor Ascendant)
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
  },

  // ─── Token Pot ───────────────────────────────────────────────
  // ค่า Ante และ Call Amount ต่อ Tier — จ่ายอัตโนมัติต้น Hand
  tokenPot: {
    tiers: {
      initiate:   { pile1: 10,  pile2: 20,   pile3: 40,   call: null  }, // ไม่มี Call
      adept:      { pile1: 60,  pile2: 100,  pile3: 140,  call: null  }, // ไม่มี Call
      mastermind: { pile1: 200, pile2: 300,  pile3: 500,  call: 1_000 },
      highNoble:  { pile1: 500, pile2: 1_000,pile3: 1_500,call: 3_000 },
      lastBoss:   { pile1: 1_000,pile2: 2_000,pile3: 3_000,call: 6_000 },
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
    mastermind: 9_000,
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
  arrangementTimer: {
    initiate:   90,
    adept:      75,
    mastermind: 60,
    highNoble:  35, // Patch: ลดเหลือ 35 (R1+R2 ใช้ค่านี้ทั้งคู่ — ครั้งหน้าแก้ที่นี่จุดเดียว)
    lastBoss:   75, // แยกจาก highNoble — ให้เวลาคิดมากขึ้นเพราะ AI เก่งระดับ DDE/MCTS
  },

  // ─── Auto-Sort Fee ───────────────────────────────────────────
  // *** ADDED v1.1 — ค่าธรรมเนียม Auto-sort ต่อ Tier ***
  // Beginner ได้ Auto-sort ฟรี 10 Round แรก (นับรวมทุกเกม)
  autoSort: {
    freeRoundsForNewUser: 10,
    feeAfterFreeRounds: {
      initiate:   15,
      adept:      30,
      mastermind: 60,
      highNoble:  100,
      lastBoss:   100,
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
    callAmount: {
      initiate:   null,
      adept:      null,
      mastermind: 600,
      highNoble:  2_000,
      lastBoss:   4_000,
    },
    betTimer: {
      initiate:   null,
      adept:      null,
      mastermind: 20,
      highNoble:  8,
      lastBoss:   8,
    },
    // ลำดับ Betting
    bettingOrder: {
      s1s2:   ["ai", "player1", "player2", "player3"], // AI เดิมพันก่อน
      s3clan: ["leaderA", "leaderB"],                  // Leader แทนทีม
    },
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

  // ─── Monarch (TriplePoker_Monarch_Spec_v1_3) ──────────────────
  // บอสลับตัวที่ 5 ของ Tier A+ (High Noble) — สุ่ม Base 3% + Pity Counter ต่อผู้เล่น (max ของโต๊ะ)
  monarchConfig: {
    spawnRateBase:   0.03,   // 3% พื้นฐาน
    pityStepPerGame: 0.005,  // +0.5% ต่อเกม High Noble ที่ไม่เจอ Monarch (นับจาก reset ล่าสุด)
    pityGuaranteeAt: 30,     // เกมที่ 30 นับจาก reset ยังไม่เจอ → บังคับ spawn (effective rate = 100%)
    potMultiplier:   2.0,    // Pot ×2 เมื่อผู้เล่น human ชนะ Monarch — ส่วนต่าง House mint ไม่หักจากผู้เล่นอื่น
    // น้ำหนักสุ่ม Boss ปกติของ High Noble (รวม Monarch, รวมกัน = 100) — ไม่ใช่ Monarch → normalize 4 ตัวที่เหลือตามสัดส่วนเดิม
    bossWeights: { reaper: 28, crag: 25, cortex: 25, cipher: 19, monarch: 3 },
    // Personality Lock ของ Monarch — แบ่ง Total Hand Strength (bestArrangement) เป็น 4 ช่วงด้วย quartile threshold
    // (Spec v1.3 ให้แค่คำบรรยายเชิงคุณภาพ "แข็งมาก/ปานกลาง/ปานกลางค่อนอ่อน/อ่อน" — ตัวเลขนี้เป็นค่าเริ่มต้นที่ปรับจูนได้หลัง playtest จริง)
    handStrengthQuartile: { veryStrong: 0.75, medium: 0.5, mediumWeak: 0.25 },
  },

  // ─── Performance Score (PS) ────────────────────────────────────
  // Active ตั้งแต่ Tier A+ ขึ้นไป (เดิม dormant รอ Arena) — ใช้คัดเลือก "Ascendant Star" ใน Ascendant Tier
  psConfig: {
    highNobleWin:        5,   // อันดับ 1 ในโต๊ะ High Noble (ชนะ Four Gods)
    highNobleMonarchWin: 10,  // อันดับ 1 + Boss เป็น Monarch (×2 เสมอ)
    ascendantWin:        7,
    ascendantMonarchWin: 14,  // ×2 เสมอ เช่นเดียวกับ A+
    notWinNonNegative:   2,   // ไม่ชนะ แต่ token สุทธิของเกมนั้นไม่ติดลบ
    negative:            0,   // token สุทธิติดลบ — ไม่มี PS ติดลบใน Main App
    monarchMultiplier:   2,   // กฎล็อค: Monarch = x2 ของค่าชนะปกติในระดับตนเสมอ
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

  // ─── Ascendant Gate (Monarch_Spec_v1_3 §5 — ทับ MasterPlan §5 เดิม) ─
  // Ascendant ยังไม่ใช่ tier เต็มรูปแบบใน tierRanges/getTierFromToken() — ใช้ค่านี้ตรงใน ascendantGate.ts เท่านั้น
  ascendantConfig: {
    tokenMin:              600_000,
    tokenMax:              999_999,
    requireMonarchVictory: true,   // ต้องมี monarch_victories >= 1 ก่อนเริ่มนับหน้าต่าง (badge ต้องได้ก่อนเข้า ไม่ใช่ระหว่างนับเวลา)
    windowDays:            30,     // ต้องขึ้น Tier S (token >= 1M) ภายใน 30 วันหลังเข้า Ascendant
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

    // Adept public (auto-match) grace period เดิม (v1.0) — เก็บไว้เผื่อ path เก่ายังอ้างอิง ไม่ได้ใช้ต่อใน flow ใหม่ v1.1 แล้ว
    adeptGraceMs: 40_000,

    // ─── v1.1: 2-stage timer ใหม่ (Human เติมจากหัว / AI เติมจากท้าย) — Adept + HighNoble ใช้ prefix เดียวกัน
    // ค่าเริ่มต้นเท่ากันทั้ง 2 Tier ตาม Spec — แยก key ต่อ Tier ไว้เผื่อปรับจูนทีหลังไม่เท่ากัน
    adept: {
      secondHumanWaitMs: 120_000, // Human คนที่ 1 เข้า → รอ 2 นาที ให้คนที่ 2 เข้า ไม่งั้นปิดโต๊ะ (Human>=2 บังคับ)
      thirdHumanWaitMs:  15_000,  // Human คนที่ 2 เข้า → รอ 15 วิ ให้คนที่ 3 เข้า ไม่งั้นเติม AI ตัวที่ 2
    },
    highNoble: {
      secondHumanWaitMs: 120_000,
      thirdHumanWaitMs:  15_000,
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

// ดึง Tier จาก Token balance ของผู้เล่น
export function getTierFromToken(tokenBalance: number): Tier {
  const { tierRanges } = gameConfig;
  if (tokenBalance >= tierRanges.highNoble.min) return "highNoble";
  if (tokenBalance >= tierRanges.mastermind.min) return "mastermind";
  if (tokenBalance >= tierRanges.adept.min) return "adept";
  return "initiate";
  // หมายเหตุ: lastBoss เป็น special encounter — กำหนดผ่าน encounter conditions
  // Tier progression: Initiate(~6d) → Adept(~12d) → Mastermind(~31d) → High Noble(endgame)
}
