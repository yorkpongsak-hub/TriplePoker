// รายชื่อ Bot AI Minion — 25 ตัว — reuse ข้าม 3 Tier (Adept auto-fill / Mastermind P2/P4 /
// High Noble Deadlock rescue) ไม่ใช่ Adept อย่างเดียว (เดิมชื่อไฟล์เป็น bot_adept_ เข้าใจผิดได้ว่าใช้
// เฉพาะ Adept — เปลี่ยนเป็น bot_minion_ แล้ว 2026-07-17)
// ใช้สุ่มชื่อ + avatar ตอน auto-fill ที่นั่งในห้อง
// ไฟล์ภาพอยู่ที่ assets/minions/ ตาม naming: bot_minion_[nn]_[name].png

export interface MinionProfile {
  id: number;
  name: string;   // ชื่อที่แสดงบนโต๊ะ (English — global users)
  file: string;   // ชื่อไฟล์ avatar
}

export const ADEPT_MINIONS: MinionProfile[] = [
  { id: 1,  name: 'Alex',     file: 'bot_minion_01_alex.png' },
  { id: 2,  name: 'Bella',    file: 'bot_minion_02_bella.png' },
  { id: 3,  name: 'Charlie',  file: 'bot_minion_03_charlie.png' },
  { id: 4,  name: 'Diana',    file: 'bot_minion_04_diana.png' },
  { id: 5,  name: 'Edward',   file: 'bot_minion_05_edward.png' },
  { id: 6,  name: 'Fiona',    file: 'bot_minion_06_fiona.png' },
  { id: 7,  name: 'Gabriel',  file: 'bot_minion_07_gabriel.png' },
  { id: 8,  name: 'Hana',     file: 'bot_minion_08_hana.png' },
  { id: 9,  name: 'Ivan',     file: 'bot_minion_09_ivan.png' },
  { id: 10, name: 'Julia',    file: 'bot_minion_10_julia.png' },
  { id: 11, name: 'Kevin',    file: 'bot_minion_11_kevin.png' },
  { id: 12, name: 'Lily',     file: 'bot_minion_12_lily.png' },
  { id: 13, name: 'Max',      file: 'bot_minion_13_max.png' },
  { id: 14, name: 'Natalie',  file: 'bot_minion_14_natalie.png' },
  { id: 15, name: 'Oliver',   file: 'bot_minion_15_oliver.png' },
  { id: 16, name: 'Prim',     file: 'bot_minion_16_prim.png' },
  { id: 17, name: 'Queenie',  file: 'bot_minion_17_queenie.png' },
  { id: 18, name: 'Ryan',     file: 'bot_minion_18_ryan.png' },
  { id: 19, name: 'Sophia',   file: 'bot_minion_19_sophia.png' },
  { id: 20, name: 'Tom',      file: 'bot_minion_20_tom.png' },
  { id: 21, name: 'Uma',      file: 'bot_minion_21_uma.png' },
  { id: 22, name: 'Vincent',  file: 'bot_minion_22_vincent.png' },
  { id: 23, name: 'Willow',   file: 'bot_minion_23_willow.png' },
  { id: 24, name: 'Xander',   file: 'bot_minion_24_xander.png' },
  { id: 25, name: 'Yuri',     file: 'bot_minion_25_yuri.png' },
];

// สุ่ม minion แบบไม่ซ้ำกันในโต๊ะเดียว — count = จำนวน bot ที่ต้องเติม
export function pickRandomMinions(count: number, excludeIds: number[] = []): MinionProfile[] {
  const pool = ADEPT_MINIONS.filter((m) => !excludeIds.includes(m.id));
  // สับลำดับแบบ Fisher–Yates แล้วหยิบตามจำนวนที่ต้องการ
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
