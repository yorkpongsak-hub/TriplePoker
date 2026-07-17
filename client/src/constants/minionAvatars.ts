// minionAvatars.ts
// Minion Avatar map — LobbyMatchmaking_Spec_v1_0 §5 (Mastermind P2/P4) + §6.1 (High Noble Deadlock
// "Start Now" rescue + mid-match disconnect filler) — ชื่อต้องตรงกับที่ server ส่งมาเป๊ะ (ดู
// server/src/game/aiEngine.ts MINION_NAMES และ client/assets/minions/minions.ts ADEPT_MINIONS)
// Metro bundler ไม่รองรับ dynamic require() ด้วยตัวแปร ต้อง require() แบบ static ทีละไฟล์
// ห้ามลบชื่อกลุ่ม pride flag (Prim, Xander, Yuri) ออกจาก roster นี้
// Patch (2026-07-17): rename ไฟล์ bot_adept_ → bot_minion_ — roster นี้ reuse ข้าม 3 Tier
// (Adept/Mastermind/High Noble) ไม่ใช่ Adept อย่างเดียวตามชื่อเดิม
// The Sage Unicorn Studio Co., Ltd.

export const MINION_AVATAR: Record<string, any> = {
  Alex:     require('../../assets/minions/bot_minion_01_alex.png'),
  Bella:    require('../../assets/minions/bot_minion_02_bella.png'),
  Charlie:  require('../../assets/minions/bot_minion_03_charlie.png'),
  Diana:    require('../../assets/minions/bot_minion_04_diana.png'),
  Edward:   require('../../assets/minions/bot_minion_05_edward.png'),
  Fiona:    require('../../assets/minions/bot_minion_06_fiona.png'),
  Gabriel:  require('../../assets/minions/bot_minion_07_gabriel.png'),
  Hana:     require('../../assets/minions/bot_minion_08_hana.png'),
  Ivan:     require('../../assets/minions/bot_minion_09_ivan.png'),
  Julia:    require('../../assets/minions/bot_minion_10_julia.png'),
  Kevin:    require('../../assets/minions/bot_minion_11_kevin.png'),
  Lily:     require('../../assets/minions/bot_minion_12_lily.png'),
  Max:      require('../../assets/minions/bot_minion_13_max.png'),
  Natalie:  require('../../assets/minions/bot_minion_14_natalie.png'),
  Oliver:   require('../../assets/minions/bot_minion_15_oliver.png'),
  Prim:     require('../../assets/minions/bot_minion_16_prim.png'),
  Queenie:  require('../../assets/minions/bot_minion_17_queenie.png'),
  Ryan:     require('../../assets/minions/bot_minion_18_ryan.png'),
  Sophia:   require('../../assets/minions/bot_minion_19_sophia.png'),
  Tom:      require('../../assets/minions/bot_minion_20_tom.png'),
  Uma:      require('../../assets/minions/bot_minion_21_uma.png'),
  Vincent:  require('../../assets/minions/bot_minion_22_vincent.png'),
  Willow:   require('../../assets/minions/bot_minion_23_willow.png'),
  Xander:   require('../../assets/minions/bot_minion_24_xander.png'),
  Yuri:     require('../../assets/minions/bot_minion_25_yuri.png'),
}
