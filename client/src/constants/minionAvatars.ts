// minionAvatars.ts
// Minion Avatar map — LobbyMatchmaking_Spec_v1_0 §5 (Mastermind P2/P4) + §6.1 (High Noble Deadlock
// "Start Now" rescue + mid-match disconnect filler) — ชื่อต้องตรงกับที่ server ส่งมาเป๊ะ (ดู
// server/src/game/aiEngine.ts MINION_NAMES และ client/assets/minions/minions.ts ADEPT_MINIONS)
// Metro bundler ไม่รองรับ dynamic require() ด้วยตัวแปร ต้อง require() แบบ static ทีละไฟล์
// ห้ามลบชื่อกลุ่ม pride flag (Prim, Xander, Yuri) ออกจาก roster นี้
// The Sage Unicorn Studio Co., Ltd.

export const MINION_AVATAR: Record<string, any> = {
  Alex:     require('../../assets/minions/bot_adept_01_alex.png'),
  Bella:    require('../../assets/minions/bot_adept_02_bella.png'),
  Charlie:  require('../../assets/minions/bot_adept_03_charlie.png'),
  Diana:    require('../../assets/minions/bot_adept_04_diana.png'),
  Edward:   require('../../assets/minions/bot_adept_05_edward.png'),
  Fiona:    require('../../assets/minions/bot_adept_06_fiona.png'),
  Gabriel:  require('../../assets/minions/bot_adept_07_gabriel.png'),
  Hana:     require('../../assets/minions/bot_adept_08_hana.png'),
  Ivan:     require('../../assets/minions/bot_adept_09_ivan.png'),
  Julia:    require('../../assets/minions/bot_adept_10_julia.png'),
  Kevin:    require('../../assets/minions/bot_adept_11_kevin.png'),
  Lily:     require('../../assets/minions/bot_adept_12_lily.png'),
  Max:      require('../../assets/minions/bot_adept_13_max.png'),
  Natalie:  require('../../assets/minions/bot_adept_14_natalie.png'),
  Oliver:   require('../../assets/minions/bot_adept_15_oliver.png'),
  Prim:     require('../../assets/minions/bot_adept_16_prim.png'),
  Queenie:  require('../../assets/minions/bot_adept_17_queenie.png'),
  Ryan:     require('../../assets/minions/bot_adept_18_ryan.png'),
  Sophia:   require('../../assets/minions/bot_adept_19_sophia.png'),
  Tom:      require('../../assets/minions/bot_adept_20_tom.png'),
  Uma:      require('../../assets/minions/bot_adept_21_uma.png'),
  Vincent:  require('../../assets/minions/bot_adept_22_vincent.png'),
  Willow:   require('../../assets/minions/bot_adept_23_willow.png'),
  Xander:   require('../../assets/minions/bot_adept_24_xander.png'),
  Yuri:     require('../../assets/minions/bot_adept_25_yuri.png'),
}
