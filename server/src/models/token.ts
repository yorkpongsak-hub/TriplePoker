// Token model — ตรงกับ DB Schema

export interface TokenTransaction {
  id: string
  user_id: string
  amount: number          // บวก = รับ, ลบ = จ่าย
  ref_type: TokenRefType
  ref_id: string | null
  created_at: string
}

export type TokenRefType =
  | 'game_win'            // ชนะ pile
  | 'game_loss'           // แพ้ pile
  | 'auction_bid'         // จ่ายประมูล
  | 'auction_refund'      // คืนเงินประมูล
  | 'auto_sort_fee'       // ค่า auto-sort
  | 'daily_login'         // รางวัล login ประจำวัน
  | 'rewarded_ad'         // ดูโฆษณา
  | 'shop_purchase'       // ซื้อของในร้าน
  | 'milestone_reward'    // รางวัล milestone
  | 'vip_monthly'         // รางวัล VIP รายเดือน
  | 'admin_adjust'        // ปรับโดย admin

export interface TokenEconomySnapshot {
  snapshot_date: string
  total_token_in_system: number
  avg_token_per_player: number
  token_earned_today: number
  token_burned_today: number
  burn_ratio: number      // เป้าหมาย: 0.8–1.0
  velocity: number        // เป้าหมาย: > 0.3
  inflation_rate: number  // เป้าหมาย: < 5%/เดือน
}
