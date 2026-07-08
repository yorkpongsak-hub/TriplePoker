// TriplePoker — Season Config
// Season 1: Classic | Season 2: Hidden Information & Auction Warfare

export type Season = 'season1' | 'season2'

export const seasonConfig = {

  // Season ปัจจุบัน — เปลี่ยนได้โดยไม่ต้อง redeploy
  current: 'season1' as Season,

  season1: {
    name: 'Classic',
    showCardsVisible: true,       // ไพ่กลางเปิดตั้งแต่ต้น
    auctionPhaseEnabled: false,   // ไม่มี Auction Phase ก่อน Arrangement
    surgicalSwapEnabled: false,
    blindAuctionEnabled: true,    // Blind Auction ก่อน Pile 3
  },

  season2: {
    name: 'Hidden Information & Auction Warfare',
    showCardsVisible: false,      // ไพ่กลางคว่ำทั้งหมด
    auctionPhaseEnabled: true,    // มี Auction Phase 6 rounds ก่อน Arrangement
    surgicalSwapEnabled: true,    // Surgical Swap mechanic
    blindAuctionEnabled: true,
    auctionRounds: 6,             // จำนวน auction rounds ต่อ hand
    auctionQuotaPerPlayer: 2,     // ประมูลได้สูงสุด 2 ใบ/hand
    tokenDebtAllowed: true,       // Token ติดลบได้
  },
}

export type SeasonConfig = typeof seasonConfig
