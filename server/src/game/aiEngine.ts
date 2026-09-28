// ============================================================
// aiEngine.ts — AI Arrangement Engine
// 3 Personality: The Sage / The Reckless / The Ghost
// Beginner's Luck System: Beginner table เท่านั้น
// The Sage Unicorn Studio Co., Ltd.
// ============================================================

import { Card } from './deck'
import { evaluateBestFive, evaluateHand, compareHands } from './handEvaluator'
import { checkTierCFoul, PlayerArrangement, CommunityCards } from './foulChecker'
import { comboKind, missionResult, type Mission } from './leagueGameplay'
import { getMissionDifficulty, TIER_C_PLUS_RULES } from './tierCPlusScoring'

// ── Types ────────────────────────────────────────────────────
export type AIPersonality =
  | 'sage' | 'reckless' | 'ghost' | 'reaper' | 'crag' | 'cortex' | 'cipher'
  | 'iron_wall' | 'chivalry' | 'war_lord' | 'phantom' | 'dark_shark' | 'oracle' | 'jester' | 'phoenix' | 'black_magic'

export interface AIConfig {
  id: string
  name: string
  emoji: string
  personality: AIPersonality
}

export type AISearchRole = 'boss' | 'support'

/** Only P3/Boss receives the tier budget; every other AI is capped at 10%. */
export function arrangementSearchBudget(tier: string, role: AISearchRole): number {
  const bossBudget = tier === 'highNoble' ? 640 : tier === 'mastermind' ? 400 : tier === 'adept' ? 240 : 20
  return role === 'boss' ? bossBudget : Math.max(1, Math.floor(bossBudget * 0.10))
}

// AI 3 ตัวในโต๊ะ (Mastermind/Last Boss ใช้ทั้ง P2/Boss/P4)
export const AI_CONFIGS: AIConfig[] = [
  { id: 'AI_SAGE',     name: 'The Sage',     emoji: '🧙', personality: 'sage'     },
  { id: 'AI_RECKLESS', name: 'The Reckless', emoji: '😈', personality: 'reckless' },
  { id: 'AI_GHOST',    name: 'The Ghost',    emoji: '👻', personality: 'ghost'    },
]
// Patch High Noble: จตุรเทพ 4 องค์ — ใช้แทนที่นั่ง Boss (P3) เท่านั้น เลือกได้ผ่าน Dev Boss Selector (__DEV__)
// P2/P4 ยังใช้ AI_CONFIGS (Sage/Reckless/Ghost) เดิมไม่เปลี่ยน
export const FOUR_GODS: AIConfig[] = [
  { id: 'AI_REAPER', name: 'Reaper',    emoji: '💀', personality: 'reaper' },
  { id: 'AI_CRAG',   name: 'The Crag',  emoji: '🗿', personality: 'crag'   },
  { id: 'AI_CORTEX', name: 'Cortex',    emoji: '🤖', personality: 'cortex' },
  { id: 'AI_CIPHER', name: 'Cipher',    emoji: '🎭', personality: 'cipher' },
]

// Patch Mastermind Conquest: The Nine Sentinels — ผู้เล่นเลือกเองจาก select.tsx (ไม่สุ่มแบบ Four Gods)
// bossId (key) ต้องตรงกับชื่อไฟล์ asset boss_[key].png และ route param จาก client ทุกจุด
// P2/P4: LobbyMatchmaking_Spec_v1_0 §5 เปลี่ยนจาก AI_CONFIGS (Sage/Reckless/Ghost) เดิม → Minion สุ่ม 2 ใน 25
// (ดู MINION_NAMES/pickRandomMinions ด้านล่าง + getEffectiveAIConfig ใน gameLoop.ts) — Sentinel แทนที่นั่ง Boss (P3) เท่านั้น ไม่เปลี่ยน
export const NINE_SENTINELS: (AIConfig & { bossId: string })[] = [
  { id: 'AI_IRON_WALL',   bossId: 'iron_wall',   name: 'Iron Wall',   emoji: '🛡️', personality: 'iron_wall'   },
  { id: 'AI_CHIVALRY',    bossId: 'chivalry',    name: 'Chivalry',    emoji: '⚔️', personality: 'chivalry'    },
  { id: 'AI_WAR_LORD',    bossId: 'war_lord',    name: 'War Lord',    emoji: '🪓', personality: 'war_lord'    },
  { id: 'AI_PHANTOM',     bossId: 'phantom',     name: 'Phantom',     emoji: '🌫️', personality: 'phantom'     },
  { id: 'AI_DARK_SHARK',  bossId: 'dark_shark',  name: 'Dark Shark',  emoji: '🦈', personality: 'dark_shark'  },
  { id: 'AI_ORACLE',      bossId: 'oracle',      name: 'Oracle',      emoji: '🔮', personality: 'oracle'      },
  { id: 'AI_JESTER',      bossId: 'jester',      name: 'Jester',      emoji: '🤡', personality: 'jester'      },
  { id: 'AI_PHOENIX',     bossId: 'phoenix',     name: 'Phoenix',     emoji: '🔥', personality: 'phoenix'     },
  { id: 'AI_BLACK_MAGIC', bossId: 'black_magic', name: 'Black Magic', emoji: '🪄', personality: 'black_magic' },
]

/** Mastermind progression rule: Sentinels 1-5 have no Missions; 6-9 require them. */
export function mastermindBossUsesMissions(bossId: string): boolean {
  const index = NINE_SENTINELS.findIndex(sentinel => sentinel.bossId === bossId)
  return index >= 5
}

// LobbyMatchmaking_Spec_v1_0 §5: Minion Avatars 25 ตัว (bot_minion_[nn]_[name].png ที่ client/assets/minions/ —
// เดิม bot_adept_ เปลี่ยนชื่อแล้ว 2026-07-17 เพราะ reuse ข้าม Adept/Mastermind/High Noble ไม่ใช่ Adept อย่างเดียว)
// ใช้เป็น P2/P4 filler ของ Mastermind — ชื่อต้องตรงกับ suffix ไฟล์เป๊ะ (ตัวพิมพ์เล็ก) ห้ามลบชื่อกลุ่ม pride flag
// (Prim, Xander, Yuri) ออกจาก roster นี้เด็ดขาด
export const MINION_NAMES: string[] = [
  'Veyra', 'Kaelith', 'Morwyn', 'Zephra', 'Orlune', 'Nyxen', 'Grimble', 'Fenwick', 'Runebit', 'Zorvak',
  'Draven', 'Vaelor', 'Korrin', 'Pyralis', 'Iskara', 'Elarin', 'Bellara', 'Luneth', 'Bramble', 'Mosskin',
  'Noctis', 'Duskryn', 'Ashveil', 'Sylphin', 'Thorn',
]

// สุ่ม Minion `count` ตัวแบบไม่ซ้ำกันจาก MINION_NAMES (Fisher-Yates แบบย่อ)
export function pickRandomMinions(count: number, excludeNames: string[] = []): string[] {
  const excluded = new Set(excludeNames)
  const pool = MINION_NAMES.filter(name => !excluded.has(name))
  const picked: string[] = []
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length)
    picked.push(pool[idx])
    pool.splice(idx, 1)
  }
  return picked
}

// ── Helper: First-Valid Arrangement (สำหรับ Initiate) ─────────
// สุ่มจัดไพ่จนผ่าน Foul → ใช้เลย (ไม่ optimize) — AI อ่อนมาก เหมาะกับผู้เล่นใหม่
export function firstValidArrangement(cards: Card[], community: CommunityCards, maxAttempts = 20): PlayerArrangement {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const shuffled = [...cards].sort(() => Math.random() - 0.5)
    const arr: PlayerArrangement = {
      pile1: shuffled.slice(0, 3),
      pile2: shuffled.slice(3, 6),
      pile3: shuffled.slice(6),
    }
    const foul = checkTierCFoul(arr, community)
    if (!foul.isFoul) return arr
  }
  // fallback ถ้าสุ่ม 100 ครั้งไม่ผ่าน → ใช้ bestArrangement
  return greedyArrangement(cards, community, [], { w1: 1, w2: 2, w3: 4 }, 20)
}

// ── Helper: Greedy Arrangement (สำหรับ Adept + Mastermind Minions) ─────────────
// เลือกทีละกอง: กอง 3 ดีสุดก่อน → กอง 2 จากที่เหลือ → กอง 1 ที่เหลือทั้งหมด
// ดีกว่า First-Valid แต่พลาดกรณีที่ต้อง swap ข้ามกอง
export function greedyArrangement(cards: Card[], community: CommunityCards, missions: readonly Mission[] = [],weights:{w1:number;w2:number;w3:number}={w1:2,w2:3,w3:5},maxEvaluations=640): PlayerArrangement {
  if(cards.length<11)throw new Error(`greedyArrangement requires at least 11 cards; received ${cards.length}`)
  const pile3Candidates=cardCombinations(cards,5).map(pile3=>{
    const hand=evaluateBestFive([...pile3,...community.row3])
    const mission=missions.find(item=>item.pile===3);const outcome=mission?missionResult(mission,hand.rank):undefined
    const objective=hand.rankIndex*25+(outcome?.complete?TIER_C_PLUS_RULES.missionScore[3][getMissionDifficulty(mission!)]:0)+(outcome?.penalty??0)
    return{pile3,objective,raw:hand.score}
  })
  // Bounded search: retain the strongest G3 candidates plus raw-strength
  // alternatives, then score every remaining G1/G2 split with the full
  // canonical objective (Missions, Combo, Super Combo and sweep EV).
  const splitsPerPile3=cards.length===11?20:35
  const pile3Limit=Math.max(1,Math.ceil(maxEvaluations/splitsPerPile3))
  const rawLimit=Math.max(1,Math.floor(pile3Limit/4))
  const byObjective=[...pile3Candidates].sort((a,b)=>b.objective-a.objective||b.raw-a.raw).slice(0,Math.max(1,pile3Limit-rawLimit))
  const byRaw=[...pile3Candidates].sort((a,b)=>b.raw-a.raw).slice(0,rawLimit)
  const candidateMap=new Map<string,(typeof pile3Candidates)[number]>()
  for(const candidate of [...byObjective,...byRaw])candidateMap.set(candidate.pile3.map(card=>`${card.value}:${card.suit}`).sort().join('|'),candidate)
  let best:PlayerArrangement|undefined,bestScore=-Infinity,evaluated=0
  for(const pile3Candidate of candidateMap.values()){
    const remaining=withoutCards(cards,pile3Candidate.pile3)
    for(const pile1 of cardCombinations(remaining,3)){
      if(evaluated>=maxEvaluations)break
      evaluated++
      const pile2=withoutCards(remaining,pile1);const candidate={pile1,pile2,pile3:pile3Candidate.pile3}
      if(checkTierCFoul(candidate,community).isFoul)continue
      const score=missions.length
        ? canonicalArrangementObjective(candidate,community,missions,weights)
        : evaluateHand([...pile1,...community.row1]).score*weights.w1
          +evaluateBestFive([...pile2,...community.row2]).score*weights.w2
          +pile3Candidate.raw*weights.w3
      if(score>bestScore){best=candidate;bestScore=score}
    }
  }
  if(best)return best
  const sorted=[...cards].sort((a,b)=>a.value-b.value)
  return {pile1:sorted.slice(0,3),pile2:sorted.slice(3,6),pile3:sorted.slice(6)}
}

function cardCombinations(cards:readonly Card[],size:number):Card[][]{const result:Card[][]=[];const visit=(start:number,chosen:Card[])=>{if(chosen.length===size){result.push([...chosen]);return}for(let index=start;index<=cards.length-(size-chosen.length);index++){chosen.push(cards[index]);visit(index+1,chosen);chosen.pop()}};visit(0,[]);return result}
function withoutCards(cards:readonly Card[],removed:readonly Card[]):Card[]{const keys=new Set(removed.map(card=>`${card.value}:${card.suit}`));return cards.filter(card=>!keys.has(`${card.value}:${card.suit}`))}

// ── Helper: bounded best arrangement ─────────────────────────
function bestArrangement(
  cards: Card[],
  community: CommunityCards,
  weights: { w1: number; w2: number; w3: number } = { w1: 1, w2: 2, w3: 4 },
  requireBestG3Category = false,
  missions: readonly Mission[] = [],
  maxEvaluations = 640,
): PlayerArrangement {
  // Strength-only and mission games now share one capped path. The G3-first
  // shortlist retains the old boss preference without a 9,240-way search.
  void requireBestG3Category
  return greedyArrangement(cards,community,missions,weights,maxEvaluations)
}

/** Expected canonical score used while opponents' hidden arrangements are unknown. */
export function canonicalArrangementObjective(arrangement:PlayerArrangement,community:CommunityCards,missions:readonly Mission[],weights:{w1:number;w2:number;w3:number}={w1:2,w2:3,w3:5}):number{
  if(checkTierCFoul(arrangement,community).isFoul)return-Infinity
  const hands=[evaluateHand([...arrangement.pile1,...community.row1]),evaluateBestFive([...arrangement.pile2,...community.row2]),evaluateBestFive([...arrangement.pile3,...community.row3])]
  const personality=[weights.w1,weights.w2,weights.w3];const average=(weights.w1+weights.w2+weights.w3)/3
  const winProbabilities=hands.map(hand=>Math.min(.95,.12+hand.rankIndex*.09))
  const expectedWins=hands.reduce((sum,_hand,index)=>sum+TIER_C_PLUS_RULES.winScore[(index+1) as 1|2|3]*winProbabilities[index]*(personality[index]/average),0)
  const outcomes=missions.map(mission=>missionResult(mission,hands[mission.pile-1].rank))
  const missionPoints=missions.reduce((sum,mission,index)=>sum+(outcomes[index].complete?TIER_C_PLUS_RULES.missionScore[mission.pile][getMissionDifficulty(mission)]:0)+outcomes[index].penalty,0)
  const combo=TIER_C_PLUS_RULES.comboScore[comboKind(outcomes.map(outcome=>outcome.complete))??'NONE']
  const expectedSweep=TIER_C_PLUS_RULES.tripleSweepScore*winProbabilities.reduce((product,value)=>product*value,1)
  const tieBreak=hands.reduce((sum,hand,index)=>sum+hand.score*personality[index],0)/1e12
  return expectedWins+missionPoints+combo+expectedSweep+tieBreak
}

// ── Helper: arrangement ดีรองลงมา (สำหรับ Beginner's Luck) ──
function subOptimalArrangement(
  cards: Card[],
  community: CommunityCards,
  maxEvaluations = 20,
): PlayerArrangement {
  // สุ่มสลับไพ่ใน pile3 บางใบกับ pile1/pile2 เพื่อให้แย่ลงเล็กน้อย
  const best = bestArrangement(cards, community, undefined, false, [], maxEvaluations)
  // swap ไพ่แรกของ pile3 กับไพ่สุดท้ายของ pile1
  const p1 = [...best.pile1]
  const p3 = [...best.pile3]
  const tmp = p1[0]
  p1[0] = p3[0]
  p3[0] = tmp
  const arr = { pile1: p1, pile2: best.pile2, pile3: p3 }
  // ถ้า foul → คืน best แทน
    const foul = checkTierCFoul(arr, community)
  return foul.isFoul ? best : arr
}

// ── AI Arrangement ตาม Personality ──────────────────────────
function arrangeByPersonality(
  personality: AIPersonality,
  cards: Card[],
  community: CommunityCards,
  missions: readonly Mission[] = [],
  maxEvaluations = 640,
): PlayerArrangement {
  switch (personality) {

    case 'sage': {
      // Defensive: เน้น Pile 1/2 แข็ง → sort cards ค่าสูงลงมา แล้วแจกให้ Pile 1 ก่อน
      const sorted = [...cards].sort((a, b) => b.value - a.value)
      const p1 = sorted.slice(0, 3)
      const p2 = sorted.slice(3, 6)
      const p3 = sorted.slice(6)
      const arr = { pile1: p1, pile2: p2, pile3: p3 }
  const foul = checkTierCFoul(arr, community)
      return foul.isFoul ? bestArrangement(cards, community,undefined,false,missions,maxEvaluations) : (missions.length?bestArrangement(cards,community,{w1:4,w2:4,w3:2},false,missions,maxEvaluations):arr)
    }

    case 'reckless': {
      // Aggressive: โยน hand ดีสุดลง Pile 3 เสมอ → best arrangement แล้ว boost pile3
      return bestArrangement(cards, community,undefined,false,missions,maxEvaluations)
    }

    case 'ghost': {
      // Unpredictable: 50% best, 50% สุ่มกอง
      if (Math.random() < 0.5) return bestArrangement(cards, community,undefined,false,missions,maxEvaluations)
      const shuffled = [...cards].sort(() => Math.random() - 0.5)
      const arr = { pile1: shuffled.slice(0, 3), pile2: shuffled.slice(3, 6), pile3: shuffled.slice(6) }
      const foul = checkTierCFoul(arr, community)
      return foul.isFoul||missions.length ? bestArrangement(cards, community,{w1:2,w2:3,w3:5},false,missions,maxEvaluations) : arr
    }

    // ── จตุรเทพ (High Noble Boss เท่านั้น) ──────────────────────
    // ทุกตนจัดไพ่เต็มฝีมือ (bestArrangement) — ความแตกต่างอยู่ที่สไตล์ประมูล/Call-Fold
    // ใน Grand Finale (ดู decideAIGrandFinaleAction + AI bid logic ใน gameLoop.ts) ไม่ใช่ตอนจัดไพ่
    // Patch: กระจาย weight ให้ครอบคลุม 3 สไตล์ — Reaper เน้นกอง 3, Cortex สมดุล, Crag เน้นกอง 1-2
    case 'reaper': { // นักเก็บเกี่ยว — เน้นกอง 3 (เพื่อ Pot สูง + ดุตอน Call/Fold)
      return bestArrangement(cards, community, { w1: 1, w2: 2, w3: 4 }, true,missions,maxEvaluations)
    }

    case 'cortex': { // สมองกล — คำนวณ EV สมดุล (ตรงตาม token pot ratio + Call value)
      return bestArrangement(cards, community, { w1: 2, w2: 3, w3: 4 }, true,missions,maxEvaluations)
    }

    case 'crag': {   // หินผา — เน้นกอง 1-2 (ป้องกันแน่น ลด w2 จาก 6 เป็น 5 ให้อยู่ในช่วงเดียวกับ Cipher)
      return bestArrangement(cards, community, { w1: 5, w2: 5, w3: 4 }, true,missions,maxEvaluations)
    }

    case 'cipher': { // รหัสลับ — สุ่มตัวคูณ 1-5 (เดิม 1-10) บางครั้งออกตรงสไตล์จตุรเทพคนอื่นได้
      const w1 = Math.floor(Math.random() * 5) + 1
      const w2 = Math.floor(Math.random() * 5) + 1
      const w3 = Math.floor(Math.random() * 5) + 1
      return bestArrangement(cards, community, { w1, w2, w3 }, true,missions,maxEvaluations)
    }

    // ── The Nine Sentinels (Mastermind Conquest Boss เท่านั้น) ──────
    // Weight canon จาก MasterPlan v1.1 — ห้ามแก้ค่า (ยกเว้น Jester ที่สุ่มใหม่ทุกครั้งตามสเปค)
    case 'iron_wall':   return bestArrangement(cards, community, { w1: 4, w2: 4, w3: 2 },false,missions,maxEvaluations)
    case 'chivalry':    return bestArrangement(cards, community, { w1: 2, w2: 3, w3: 5 },false,missions,maxEvaluations)
    case 'war_lord':    return bestArrangement(cards, community, { w1: 1, w2: 2, w3: 7 },false,missions,maxEvaluations)
    case 'phantom':     return bestArrangement(cards, community, { w1: 2, w2: 3, w3: 5 },false,missions,maxEvaluations)
    case 'dark_shark':  return bestArrangement(cards, community, { w1: 2, w2: 4, w3: 4 },false,missions,maxEvaluations)
    case 'oracle':      return bestArrangement(cards, community, { w1: 2, w2: 3, w3: 5 },false,missions,maxEvaluations)
    case 'phoenix':     return bestArrangement(cards, community, { w1: 2, w2: 3,w3: 5 },false,missions,maxEvaluations)
    case 'black_magic': return bestArrangement(cards, community, { w1: 3, w2: 3, w3: 4 },false,missions,maxEvaluations)

    case 'jester': { // ตัวตลก — สุ่ม weight 1-10 ใหม่ทุกเกม (pattern เดียวกับ Cipher แต่ range กว้างกว่า)
      const w1 = Math.floor(Math.random() * 10) + 1
      const w2 = Math.floor(Math.random() * 10) + 1
      const w3 = Math.floor(Math.random() * 10) + 1
      return bestArrangement(cards, community, { w1, w2, w3 },false,missions,maxEvaluations)
    }
  }
}

// ── Main: AI decide arrangement ──────────────────────────────
export function aiDecideArrangement(
  config: AIConfig,
  cards: Card[],
  community: CommunityCards,
  roundNumber: number,       // เริ่มจาก 1
  tier: string,
  humanWinStreak: number,    // จำนวนตาที่ human ชนะต่อกัน
  missions: readonly Mission[] = [],
  searchRole: AISearchRole = 'boss',
): PlayerArrangement {

  const maxEvaluations = arrangementSearchBudget(tier, searchRole)

  const isBeginnerTable = tier === 'initiate'

  // ── Beginner's Luck System ───────────────────────────────
  if (isBeginnerTable) {

    // ตา 1-2: AI จงใจอ่อนฝีมือ
    if (roundNumber <= 2) {
      return subOptimalArrangement(cards, community, maxEvaluations)
    }

    // ตา 3: AI เล่นปกติแต่ ghost มีโอกาส foul 30%
    if (roundNumber === 3) {
      if (config.personality === 'ghost' && Math.random() < 0.3) {
        // จัดแบบสุ่มเพื่อเพิ่มโอกาส foul
        const shuffled = [...cards].sort(() => Math.random() - 0.5)
        return { pile1: shuffled.slice(0, 3), pile2: shuffled.slice(3, 6), pile3: shuffled.slice(6) }
      }
      // Patch: Initiate ใช้ First-Valid (ไม่ใช่ bestArrangement) — AI อ่อนกว่า Tier สูง
      return firstValidArrangement(cards, community, maxEvaluations)
    }

    // ตา 4+: สุ่ม 50% อ่อนฝีมือ / 50% First-Valid
    if (roundNumber >= 4) {
      if (Math.random() < 0.5) {
        return subOptimalArrangement(cards, community, maxEvaluations)
      }
      return firstValidArrangement(cards, community, maxEvaluations)
    }
  }

  // ── Adept table: ใช้ Greedy (ดีกว่า First-Valid แต่ยังไม่ optimal) ────
  if (tier === 'adept') {
    return greedyArrangement(cards, community,missions,undefined,maxEvaluations)
  }

  // ── ไพ่เกิน 11 ใบ (Boss/AI ชนะ Blind Auction มา — High Noble Round 2, "สูงสุด 12 ใบ") ──
  // Full exhaustive arrangement grows sharply above 11 cards. Keep the
  // canonical Best-Five evaluator but use the bounded greedy selector after Auction.
  // บนเครื่องที่ไม่แรงมาก (วัดจริงตอนไล่หาสาเหตุ hnGracePeriod.test.ts timeout, 2026-08-31) บล็อก event
  // loop ทั้งเซิร์ฟเวอร์ทุกโต๊ะพร้อมกัน — ใช้ greedyArrangement แทน (pattern เดียวกับที่ Minion ที่ชนะ
  // ประมูลใน Mastermind ใช้อยู่แล้วจริงที่ gameLoop.ts, และเดียวกับที่ Arena เลือกใช้แทน brute-force
  // เต็มรูปแบบด้วยเหตุผลเดียวกันทุกประการ — ดู bestArenaArrangement) ยอมเสียความละเอียดของ personality
  // ตอนจัดไพ่เฉพาะเคสนี้ (บอทอาจ foul เองได้บ้าง เสียแค่กองนั้น ไม่ crash) แลกกับความเสถียรของเซิร์ฟเวอร์
  if (cards.length > 11) {
    return greedyArrangement(cards, community,missions,undefined,maxEvaluations)
  }

  // ── Mastermind+ table: เต็มฝีมือตาม personality ────────────────
  return arrangeByPersonality(config.personality, cards, community,missions,maxEvaluations)
}
