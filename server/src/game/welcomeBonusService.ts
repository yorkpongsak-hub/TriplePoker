// welcomeBonusService.ts — โบนัสต้อนรับผู้เล่นใหม่ 3,000 Token ผ่าน Central Economy Ledger
// เรียกจาก POST /auth/register หลังผู้เล่นสมัครและตั้งชื่อจริงแล้ว
// เรียกซ้ำได้ปลอดภัยเสมอ เพราะ idempotency key ผูกกับ user_id ตรงๆ ไม่ใช่ event/เวลา
// (ผู้เล่นคนเดียวกันเรียกซ้ำ = no-op)
// The Sage Unicorn Studio Co., Ltd.

import { economyService } from '../economy/economyService'
import { gameConfig } from '../config/gameConfig'

export async function grantWelcomeBonusIfNeeded(userId: string): Promise<void> {
  try {
    await economyService.mint({
      idempotencyKey: `WELCOME_BONUS:${userId}`,
      to: { accountType: 'PLAYER', accountId: userId },
      currency: 'TOKEN',
      amount: gameConfig.dailyEconomy.newUserBonus,
      reason: 'WELCOME_BONUS',
      actor: 'registration_system',
    })
  } catch (err) {
    console.error('[WELCOME_BONUS] mint failed for', userId, err)
  }
}
