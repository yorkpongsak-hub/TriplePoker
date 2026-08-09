// Soren — ไม่มีต้นแบบจาก Tier ล่างเลย (Tier A+ ไม่มี Boss นี้) ออกแบบใหม่ทั้งหมดตาม lore ใน
// TriplePoker_Rise_Tier_S_SPlus_Development_Spec.md §10.2: "อ่านยากกว่า Monarch, มี Bluff,
// ปรับจังหวะตามพฤติกรรมผู้เล่น, ใช้ข้อมูลจาก Game ก่อนหน้าใน Match มาปรับน้ำหนักได้"
//
// ต่างจาก Monarch (ล็อกบุคลิกนิ่งตอนแจกไพ่เกม 1) — Soren ไม่มี "บุคลิกคงที่" เลย ใช้ฐาน cipher-like
// (สุ่ม/คาดเดายาก) แล้วขยับ bias ทุกเกมตามสถิติจริงของ Human ในแมตช์นี้ + bluff-flip ท้ายสุดเสมอ

export interface SorenMatchStats { humanCalls: number; humanFolds: number }

export function recordHumanGfDecision(stats: SorenMatchStats, decision: 'CALL' | 'FOLD'): SorenMatchStats {
  return decision === 'CALL'
    ? { ...stats, humanCalls: stats.humanCalls + 1 }
    : { ...stats, humanFolds: stats.humanFolds + 1 }
}

const BLUFF_FLIP_RATE = 0.2

// เริ่มฐาน cipher-like (30% สุ่มล้วนไม่สนไพ่ ที่เหลือใช้ winrate) แล้วขยับตามอัตรา Call ของ Human ในแมตช์นี้
// (Human Call บ่อย -> Soren ระวังขึ้น / Human Fold บ่อย -> Soren กดดันมากขึ้น) ปิดท้ายด้วย bluff-flip
// ~20% พลิกผลตัดสินใจสุดท้าย ให้ "อ่านยากกว่า Monarch" ตาม lore
export function sorenGfDecision(stats: SorenMatchStats, winrate: number, random: () => number = Math.random): 'CALL' | 'FOLD' {
  const totalDecisions = stats.humanCalls + stats.humanFolds
  const humanCallRate = totalDecisions > 0 ? stats.humanCalls / totalDecisions : 0.5
  const adaptiveBias = (0.5 - humanCallRate) * 0.3 // Human Call เยอะ (rate สูง) -> bias ติดลบ (ระวังขึ้น), Fold เยอะ -> bias บวก (กดดันมากขึ้น) สูงสุด ±0.15

  let decision: 'CALL' | 'FOLD'
  if (random() < 0.3) {
    decision = random() < 0.5 ? 'CALL' : 'FOLD'
  } else {
    const callProb = Math.min(0.95, Math.max(0.05, winrate + adaptiveBias))
    decision = random() < callProb ? 'CALL' : 'FOLD'
  }

  return random() < BLUFF_FLIP_RATE ? (decision === 'CALL' ? 'FOLD' : 'CALL') : decision
}

// ฐานสุดขั้วแบบ Cipher บวก pressure เพิ่มขึ้นถ้า Human Fold บ่อยในแมตช์นี้ (จับสัญญาณแล้วบุกต่อ)
export function sorenAuctionBid(stats: SorenMatchStats, random: () => number = Math.random): 0 | 3 | 6 | 9 | 12 {
  const totalDecisions = stats.humanCalls + stats.humanFolds
  const humanFoldRate = totalDecisions > 0 ? stats.humanFolds / totalDecisions : 0.5
  const willBidChance = 0.7 + humanFoldRate * 0.2 // 0.70-0.90
  if (random() >= willBidChance) return 0
  return random() < 0.5 ? 3 : 12
}
