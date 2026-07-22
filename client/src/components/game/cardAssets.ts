/**
 * cardAssets.ts — แหล่งรวม require() ของรูปไพ่ทั้งสำรับ (ไฟล์กลาง)
 * ย้ายมาจาก app/game/initiate/index.tsx เพื่อให้ทุก Tier + PlayerHandView
 * ใช้ map เดียวกัน ไม่ต้อง copy 52 require ซ้ำในทุกไฟล์
 *
 * The Sage Unicorn Studio Co., Ltd.
 */

// รหัสไพ่: [rank][suit] เช่น 'as' = Ace of Spades, '10h' = Ten of Hearts
// rank: a | 2-10 | j | q | k   suit: s(pade) | h(eart) | d(iamond) | c(lub)
export type CardCode = string

// ── หน้าไพ่ (classic deck) 52 ใบ ──
export const CARD_IMG: Record<string, any> = {
  as: require('../../../assets/cards/classic/as.png'),
  '2s': require('../../../assets/cards/classic/2s.png'), '3s': require('../../../assets/cards/classic/3s.png'),
  '4s': require('../../../assets/cards/classic/4s.png'), '5s': require('../../../assets/cards/classic/5s.png'),
  '6s': require('../../../assets/cards/classic/6s.png'), '7s': require('../../../assets/cards/classic/7s.png'),
  '8s': require('../../../assets/cards/classic/8s.png'), '9s': require('../../../assets/cards/classic/9s.png'),
  '10s': require('../../../assets/cards/classic/10s.png'), js: require('../../../assets/cards/classic/js.png'),
  qs: require('../../../assets/cards/classic/qs.png'), ks: require('../../../assets/cards/classic/ks.png'),
  ah: require('../../../assets/cards/classic/ah.png'), '2h': require('../../../assets/cards/classic/2h.png'),
  '3h': require('../../../assets/cards/classic/3h.png'), '4h': require('../../../assets/cards/classic/4h.png'),
  '5h': require('../../../assets/cards/classic/5h.png'), '6h': require('../../../assets/cards/classic/6h.png'),
  '7h': require('../../../assets/cards/classic/7h.png'), '8h': require('../../../assets/cards/classic/8h.png'),
  '9h': require('../../../assets/cards/classic/9h.png'), '10h': require('../../../assets/cards/classic/10h.png'),
  jh: require('../../../assets/cards/classic/jh.png'), qh: require('../../../assets/cards/classic/qh.png'),
  kh: require('../../../assets/cards/classic/kh.png'), ad: require('../../../assets/cards/classic/ad.png'),
  '2d': require('../../../assets/cards/classic/2d.png'), '3d': require('../../../assets/cards/classic/3d.png'),
  '4d': require('../../../assets/cards/classic/4d.png'), '5d': require('../../../assets/cards/classic/5d.png'),
  '6d': require('../../../assets/cards/classic/6d.png'), '7d': require('../../../assets/cards/classic/7d.png'),
  '8d': require('../../../assets/cards/classic/8d.png'), '9d': require('../../../assets/cards/classic/9d.png'),
  '10d': require('../../../assets/cards/classic/10d.png'), jd: require('../../../assets/cards/classic/jd.png'),
  qd: require('../../../assets/cards/classic/qd.png'), kd: require('../../../assets/cards/classic/kd.png'),
  ac: require('../../../assets/cards/classic/ac.png'), '2c': require('../../../assets/cards/classic/2c.png'),
  '3c': require('../../../assets/cards/classic/3c.png'), '4c': require('../../../assets/cards/classic/4c.png'),
  '5c': require('../../../assets/cards/classic/5c.png'), '6c': require('../../../assets/cards/classic/6c.png'),
  '7c': require('../../../assets/cards/classic/7c.png'), '8c': require('../../../assets/cards/classic/8c.png'),
  '9c': require('../../../assets/cards/classic/9c.png'), '10c': require('../../../assets/cards/classic/10c.png'),
  jc: require('../../../assets/cards/classic/jc.png'), qc: require('../../../assets/cards/classic/qc.png'),
  kc: require('../../../assets/cards/classic/kc.png'),
}

// ── หลังไพ่ (default skin) — ใช้ตอนไพ่คว่ำ ──
export const CARD_BACK_IMG = require('../../../assets/images/card_back_default.png')
