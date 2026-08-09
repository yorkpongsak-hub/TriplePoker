import { getUserVipTier, VipStatus } from '../middleware/vipGuard'

export const VIP_PLUS_FEATURE_FLAG = 'VIP_PLUS_5P_ENABLED' as const

export type VipPlusAccessReason =
  | 'ELIGIBLE'
  | 'FEATURE_DISABLED'
  | 'VIP_PRO_REQUIRED'

export interface VipPlusAccessDecision {
  allowed: boolean
  reason: VipPlusAccessReason
}

// รับค่า flag เข้ามาโดยตรงเพื่อให้ startup/test ใช้กติกาเดียวกันโดยไม่ผูก global state
export function isVipPlusFeatureEnabled(value = process.env[VIP_PLUS_FEATURE_FLAG]): boolean {
  return value === 'true'
}

export function evaluateVipPlusAccess(
  vipStatus: VipStatus | null | undefined,
  featureEnabled: boolean,
): VipPlusAccessDecision {
  if (!featureEnabled) return { allowed: false, reason: 'FEATURE_DISABLED' }
  if (vipStatus !== 'vip_pro') return { allowed: false, reason: 'VIP_PRO_REQUIRED' }
  return { allowed: true, reason: 'ELIGIBLE' }
}

// จุด authority กลางสำหรับ Lobby, create/join, confirm และ match start ใน Gate ถัดไป
export async function getVipPlusAccess(userId: string): Promise<VipPlusAccessDecision> {
  if (!isVipPlusFeatureEnabled()) return { allowed: false, reason: 'FEATURE_DISABLED' }
  const vipStatus = await getUserVipTier(userId)
  return evaluateVipPlusAccess(vipStatus, true)
}

export async function assertVipPlusAccess(userId: string): Promise<void> {
  const decision = await getVipPlusAccess(userId)
  if (decision.allowed) return

  const error = new Error(decision.reason) as Error & { code: VipPlusAccessReason; statusCode: number }
  error.code = decision.reason
  error.statusCode = decision.reason === 'FEATURE_DISABLED' ? 404 : 403
  throw error
}
