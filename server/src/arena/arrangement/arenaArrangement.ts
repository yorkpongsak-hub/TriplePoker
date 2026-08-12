import { arenaCardKey, ArenaCard, ArenaDeal } from '../cards/arenaDeck'
import { ArenaHandResult, compareArenaHands, evaluateArenaHand } from '../joker/wildHandEvaluator'

export interface ArenaArrangement { pile1: string[]; pile2: string[]; pile3: string[] }
export interface ArenaPartitionCheck { ok: boolean; reason?: string }
export interface ArenaFoulResult { fouled: boolean; reason?: string }

// ตรวจว่า arrangement แบ่งไพ่ที่ actor ถืออยู่จริงครบทุกใบ ไม่ขาดไม่เกินไม่ซ้ำ (integrity เท่านั้น ไม่เช็คลำดับแรง)
export function validateArenaPartition(arrangement: ArenaArrangement, heldCardIds: ReadonlySet<string>): ArenaPartitionCheck {
  if (arrangement.pile1.length !== 3) return { ok: false, reason: 'ARENA_PILE1_MUST_HAVE_3_CARDS' }
  if (arrangement.pile2.length !== 3) return { ok: false, reason: 'ARENA_PILE2_MUST_HAVE_3_CARDS' }
  const expectedPile3 = heldCardIds.size - 6
  if (arrangement.pile3.length !== expectedPile3) return { ok: false, reason: 'ARENA_PILE3_WRONG_CARD_COUNT' }
  const allIds = [...arrangement.pile1, ...arrangement.pile2, ...arrangement.pile3]
  if (new Set(allIds).size !== allIds.length) return { ok: false, reason: 'ARENA_ARRANGEMENT_HAS_DUPLICATE_CARD' }
  if (allIds.length !== heldCardIds.size) return { ok: false, reason: 'ARENA_ARRANGEMENT_CARD_COUNT_MISMATCH' }
  if (!allIds.every(id => heldCardIds.has(id))) return { ok: false, reason: 'ARENA_ARRANGEMENT_USES_UNHELD_CARD' }
  return { ok: true }
}

// evaluateArenaHand รับ 5-7 ใบเท่านั้น — ถ้า pile3 ยังไม่ Discard (6 ใบ + community 2 = 8) ให้ลอง drop ทีละใบแล้วเลือกที่ดีสุด
// export ไว้ให้ engine/bot-decision layer เรียกใช้ตรงๆ ได้ (กันเรียก evaluateArenaHand ตรงๆ แล้วพังตอน pile3 ยังไม่ Discard)
export function evaluatePileBest(pileCards: readonly ArenaCard[], communityCards: readonly ArenaCard[]): ArenaHandResult {
  if (communityCards.length !== 2) throw new Error('ARENA_PILE_REQUIRES_TWO_COMMUNITY_CARDS')
  if (pileCards.length < 3) throw new Error('ARENA_PILE_REQUIRES_THREE_PRIVATE_CARDS')
  if (pileCards.length === 3) return evaluateArenaHand([...pileCards, ...communityCards])
  let best: ArenaHandResult | null = null
  for (const subset of combinations(pileCards, 3)) {
    const result = evaluateArenaHand([...subset, ...communityCards])
    if (!best || compareArenaHands(result, best) > 0) best = result
  }
  return best!
}

function resolveCards(ids: readonly string[], cardsById: ReadonlyMap<string, ArenaCard>): ArenaCard[] {
  return ids.map(id => {
    const card = cardsById.get(id)
    if (!card) throw new Error('ARENA_ARRANGEMENT_UNKNOWN_CARD_ID')
    return card
  })
}

// เช็ค ordering foul (pile1 <= pile2 <= pile3) — เรียกตอน FINAL_LOCK เท่านั้น (soft foul: ยัง lock ได้ แค่แพ้กองที่ผิด)
export function checkArenaFoul(arrangement: ArenaArrangement, cardsById: ReadonlyMap<string, ArenaCard>, community: ArenaDeal['community']): ArenaFoulResult {
  const hand1 = evaluatePileBest(resolveCards(arrangement.pile1, cardsById), community.pile1)
  const hand2 = evaluatePileBest(resolveCards(arrangement.pile2, cardsById), community.pile2)
  const hand3 = evaluatePileBest(resolveCards(arrangement.pile3, cardsById), community.pile3)
  if (compareArenaHands(hand1, hand2) > 0) return { fouled: true, reason: 'ARENA_PILE1_CANNOT_BEAT_PILE2' }
  if (compareArenaHands(hand2, hand3) > 0) return { fouled: true, reason: 'ARENA_PILE2_CANNOT_BEAT_PILE3' }
  return { fouled: false }
}

function combinations<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = []
  const visit = (start: number, chosen: T[]) => {
    if (chosen.length === size) { result.push([...chosen]); return }
    for (let index = start; index <= items.length - (size - chosen.length); index++) {
      chosen.push(items[index]); visit(index + 1, chosen); chosen.pop()
    }
  }
  visit(0, [])
  return result
}

// Greedy: เลือก pile3 (กองใหญ่สุด น้ำหนักมากสุด) ที่ดีที่สุดก่อนจากไพ่ทั้งหมด แล้วเลือก pile2 ที่ดีที่สุดจากไพ่ที่เหลือ 6 ใบ pile1 = ที่เหลือ
// ตั้งใจใช้ greedy แทน full brute force C(n,3)xC(n-3,3) ของ aiEngine.ts's bestArrangement เดิม — Joker wild ทำให้
// evaluateArenaHand แพงกว่า evaluateHand ธรรมดามาก (ลองทุก rank x suit) brute force เดิมช้าเกินจะให้บอทตอบสนองได้ทันทุก tick
// เสียความฉลาดของ AI เล็กน้อย (ไม่ได้การันตี arrangement ที่ดีที่สุดเป๊ะ + ไม่เช็ค foul) แลกกับความเร็วที่จำเป็นสำหรับ real-time bot
export function bestArenaArrangement(cards: readonly ArenaCard[], community: ArenaDeal['community']): ArenaArrangement {
  const n = cards.length
  const pile3Size = n - 6

  let bestPile3Score = -Infinity
  let pile3: ArenaCard[] = cards.slice(n - pile3Size)
  let afterPile3: ArenaCard[] = cards.slice(0, n - pile3Size)
  for (const combo of combinations(cards, pile3Size)) {
    const score = evaluatePileBest(combo, community.pile3).score
    if (score > bestPile3Score) {
      bestPile3Score = score
      pile3 = combo
      afterPile3 = cards.filter(card => !combo.includes(card))
    }
  }

  let bestPile2Score = -Infinity
  let pile2: ArenaCard[] = afterPile3.slice(0, 3)
  let pile1: ArenaCard[] = afterPile3.slice(3)
  for (const combo of combinations(afterPile3, 3)) {
    const score = evaluatePileBest(combo, community.pile2).score
    if (score > bestPile2Score) {
      bestPile2Score = score
      pile2 = combo
      pile1 = afterPile3.filter(card => !combo.includes(card))
    }
  }

  return { pile1: pile1.map(card => arenaCardKey(card)), pile2: pile2.map(card => arenaCardKey(card)), pile3: pile3.map(card => arenaCardKey(card)) }
}
