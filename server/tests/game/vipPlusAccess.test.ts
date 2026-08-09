import {
  evaluateVipPlusAccess,
  isVipPlusFeatureEnabled,
  VIP_PLUS_FEATURE_FLAG,
} from '../../src/game/vipPlusAccess'

describe('VIP Plus Gate 1 access policy', () => {
  test('uses a dedicated disabled-by-default feature flag', () => {
    expect(VIP_PLUS_FEATURE_FLAG).toBe('VIP_PLUS_5P_ENABLED')
    expect(isVipPlusFeatureEnabled(undefined)).toBe(false)
    expect(isVipPlusFeatureEnabled('false')).toBe(false)
    expect(isVipPlusFeatureEnabled('TRUE')).toBe(false)
    expect(isVipPlusFeatureEnabled('true')).toBe(true)
  })

  test.each(['none', 'vip'] as const)('rejects %s membership when enabled', vipStatus => {
    expect(evaluateVipPlusAccess(vipStatus, true)).toEqual({
      allowed: false,
      reason: 'VIP_PRO_REQUIRED',
    })
  })

  test('allows only existing vip_pro membership when enabled', () => {
    expect(evaluateVipPlusAccess('vip_pro', true)).toEqual({
      allowed: true,
      reason: 'ELIGIBLE',
    })
  })

  test('fails closed for every membership while the feature is disabled', () => {
    expect(evaluateVipPlusAccess('vip_pro', false)).toEqual({
      allowed: false,
      reason: 'FEATURE_DISABLED',
    })
  })
})
