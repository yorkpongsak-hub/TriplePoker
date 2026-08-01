import { canAccessGrandmaster } from '../../game/tierAuthority'

export interface TierSEligibility {
  eligible: boolean
  reason: 'ELIGIBLE' | 'TOKEN_THRESHOLD_NOT_EXCEEDED'
}

// Canon ใหม่ของ Grandmaster ใช้ Token อย่างเดียวและเป็นเงื่อนไขมากกว่า 1M แบบ exclusive
export function checkTierSEligibility(tokenBalance: number, tierUnlockedMax?: unknown): TierSEligibility {
  return canAccessGrandmaster(tokenBalance, tierUnlockedMax)
    ? { eligible: true, reason: 'ELIGIBLE' }
    : { eligible: false, reason: 'TOKEN_THRESHOLD_NOT_EXCEEDED' }
}
