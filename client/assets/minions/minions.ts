// รายชื่อ Bot AI ประจำโต๊ะ Tier B (Adept) — 25 ตัว
// ใช้สุ่มชื่อ + avatar ตอน auto-fill ที่นั่งในห้อง
// ไฟล์ภาพอยู่ที่ assets/bots/ ตาม naming: bot_adept_[nn]_[name].png

export interface MinionProfile {
  id: number;
  name: string;   // ชื่อที่แสดงบนโต๊ะ (English — global users)
  file: string;   // ชื่อไฟล์ avatar
}

export const ADEPT_MINIONS: MinionProfile[] = [
  { id: 1,  name: 'Alex',     file: 'bot_adept_01_alex.png' },
  { id: 2,  name: 'Bella',    file: 'bot_adept_02_bella.png' },
  { id: 3,  name: 'Charlie',  file: 'bot_adept_03_charlie.png' },
  { id: 4,  name: 'Diana',    file: 'bot_adept_04_diana.png' },
  { id: 5,  name: 'Edward',   file: 'bot_adept_05_edward.png' },
  { id: 6,  name: 'Fiona',    file: 'bot_adept_06_fiona.png' },
  { id: 7,  name: 'Gabriel',  file: 'bot_adept_07_gabriel.png' },
  { id: 8,  name: 'Hana',     file: 'bot_adept_08_hana.png' },
  { id: 9,  name: 'Ivan',     file: 'bot_adept_09_ivan.png' },
  { id: 10, name: 'Julia',    file: 'bot_adept_10_julia.png' },
  { id: 11, name: 'Kevin',    file: 'bot_adept_11_kevin.png' },
  { id: 12, name: 'Lily',     file: 'bot_adept_12_lily.png' },
  { id: 13, name: 'Max',      file: 'bot_adept_13_max.png' },
  { id: 14, name: 'Natalie',  file: 'bot_adept_14_natalie.png' },
  { id: 15, name: 'Oliver',   file: 'bot_adept_15_oliver.png' },
  { id: 16, name: 'Prim',     file: 'bot_adept_16_prim.png' },
  { id: 17, name: 'Queenie',  file: 'bot_adept_17_queenie.png' },
  { id: 18, name: 'Ryan',     file: 'bot_adept_18_ryan.png' },
  { id: 19, name: 'Sophia',   file: 'bot_adept_19_sophia.png' },
  { id: 20, name: 'Tom',      file: 'bot_adept_20_tom.png' },
  { id: 21, name: 'Uma',      file: 'bot_adept_21_uma.png' },
  { id: 22, name: 'Vincent',  file: 'bot_adept_22_vincent.png' },
  { id: 23, name: 'Willow',   file: 'bot_adept_23_willow.png' },
  { id: 24, name: 'Xander',   file: 'bot_adept_24_xander.png' },
  { id: 25, name: 'Yuri',     file: 'bot_adept_25_yuri.png' },
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
