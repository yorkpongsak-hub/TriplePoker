export type TelemetryPlatform = 'android' | 'ios' | 'web'
export type TelemetryEnvironment = 'development' | 'production'
export type MembershipSnapshot = { plan: 'FREE'|'PRO'|'PRO_PLUS'; entitled: boolean; entitlements: {
  hasNoForcedInterstitialAds: boolean; canUseRewardedAdsForExtras: boolean; canCreatePrivateTable: boolean;
  canUsePrivateTablePin: boolean; canUseGolfGroupMode: boolean; canViewAnalysisWithoutAd: boolean; canUseProPlusSocialBenefits: boolean;
} }
export type Tutorial = 'three_piles' | 'strategy_check' | 'tier_d_guide'
export type LaunchStep = 'launch' | 'training' | 'sign_in' | 'how_to_play' | 'tier_d_entry' | 'tier_d_table' | 'lobby' | 'classic_lobby' | 'classic_table' | 'mastermind_select'
export type TrainingGame = { game_id: string; mode: 'training'; tier: 'training'; human_count: 1; bot_count: 1 }
export type TelemetryContext = { player_id: string; session_id: string; app_version: string; platform: TelemetryPlatform }
export type TelemetryInput = { session_id: string; membership?: MembershipSnapshot } & (
  | { event_name: 'vip_status'; properties: MembershipSnapshot & {trigger: 'session_start'|'change'} }
  | { event_name: 'app_open'; properties: Record<string, never> }
  | { event_name: 'session_start'; properties: { session_number?: number; is_return?: boolean } }
  | { event_name: 'session_end'; properties: { duration_ms: number; reason: 'background' | 'timeout' | 'shutdown' | 'recovered'; inferred?: boolean } }
  | { event_name: 'telemetry_upload_failure'; properties: { reason: 'network' | 'timeout' | 'http' | 'protocol' | 'storage'; count: number; status?: number } }
  | { event_name: 'game_start'; properties: TrainingGame }
  | { event_name: 'game_end'; properties: TrainingGame & { outcome: 'win' | 'loss' | 'draw'; duration_ms: number; score: number; score_kind: 'points'; opponent_score: number; seal_wins: number } }
  | { event_name: 'first_game_complete'; properties: Pick<TrainingGame, 'game_id' | 'mode' | 'tier'> }
  | { event_name: 'tutorial_start' | 'tutorial_complete'; properties: { tutorial: Tutorial } }
  | { event_name: 'tutorial_step'; properties: { tutorial: Tutorial; step: number } }
  | { event_name: 'launch_step'; properties: { step: LaunchStep } }
)
export type TelemetryEvent = TelemetryInput & {
  event_id: string; schema_version: 1; occurred_at: string; player_id: string
  app_version: string; platform: TelemetryPlatform; build_number?: string
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const validUuid = (value: unknown): value is string => typeof value === 'string' && uuid.test(value)
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const integer = (value: unknown, min: number, max: number) => Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max

// ตรวจข้อมูลจาก storage ด้วย ไม่ส่ง properties นอก allowlist แม้คิวถูกแก้ไข
export function validEvent(value: unknown): value is TelemetryEvent {
  if (!object(value)) return false
  const keys = ['event_id', 'schema_version', 'occurred_at', 'player_id', 'session_id', 'app_version', 'build_number', 'platform', 'event_name', 'properties', 'membership']
  if (Object.keys(value).some(key => !keys.includes(key))) return false
  if (!validUuid(value.event_id) || !validUuid(value.player_id) || !validUuid(value.session_id) || value.schema_version !== 1) return false
  if (typeof value.occurred_at !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.occurred_at) || !Number.isFinite(Date.parse(value.occurred_at))) return false
  if (typeof value.app_version !== 'string' || value.app_version.length > 40 || !/^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(value.app_version)) return false
  if (value.build_number !== undefined && (typeof value.build_number !== 'string' || !/^\d{1,20}$/.test(value.build_number))) return false
  if (!['android', 'ios', 'web'].includes(value.platform as string) || !object(value.properties)) return false
  const p = value.properties
  if (value.membership !== undefined && !validMembership(value.membership)) return false
  let allowed: string[]
  switch (value.event_name) {
    case 'vip_status':
      allowed = ['plan','entitled','entitlements','trigger']
      if (!validMembership({plan:p.plan,entitled:p.entitled,entitlements:p.entitlements}) || !['session_start','change'].includes(p.trigger as string)) return false
      break
    case 'app_open': allowed = []; break
    case 'session_start':
      allowed = ['session_number', 'is_return']
      if (p.session_number !== undefined && !integer(p.session_number, 1, 1_000_000)) return false
      if (p.is_return !== undefined && typeof p.is_return !== 'boolean') return false
      break
    case 'session_end':
      allowed = ['duration_ms', 'reason', 'inferred']
      if (!integer(p.duration_ms, 0, 7 * 24 * 60 * 60 * 1000) || !['background', 'timeout', 'shutdown', 'recovered'].includes(p.reason as string)) return false
      if (p.inferred !== undefined && typeof p.inferred !== 'boolean') return false
      break
    case 'telemetry_upload_failure':
      allowed = ['reason', 'count', 'status']
      if (!['network', 'timeout', 'http', 'protocol', 'storage'].includes(p.reason as string) || !integer(p.count, 1, 1_000_000)) return false
      if (p.status !== undefined && !integer(p.status, 100, 599)) return false
      break
    case 'game_start':
    case 'game_end':
    case 'first_game_complete': {
      allowed = ['game_id', 'mode', 'tier']
      if (!validUuid(p.game_id) || p.mode !== 'training' || p.tier !== 'training') return false
      if (value.event_name !== 'first_game_complete') {
        allowed.push('human_count', 'bot_count')
        if (p.human_count !== 1 || p.bot_count !== 1) return false
      }
      if (value.event_name === 'game_end') {
        allowed.push('outcome', 'duration_ms', 'score', 'score_kind', 'opponent_score', 'seal_wins')
        if (!['win', 'loss', 'draw'].includes(p.outcome as string) || !integer(p.duration_ms, 0, Number.MAX_SAFE_INTEGER)
          || typeof p.score !== 'number' || !Number.isFinite(p.score) || p.score < 0 || p.score > Number.MAX_SAFE_INTEGER
          || p.score_kind !== 'points' || typeof p.opponent_score !== 'number' || !Number.isFinite(p.opponent_score)
          || p.opponent_score < 0 || p.opponent_score > Number.MAX_SAFE_INTEGER || !integer(p.seal_wins, 0, 3)) return false
      }
      break
    }
    case 'tutorial_start':
    case 'tutorial_complete':
    case 'tutorial_step':
      allowed = ['tutorial']
      if (!['three_piles', 'strategy_check', 'tier_d_guide'].includes(p.tutorial as string)) return false
      if (value.event_name === 'tutorial_step') { allowed.push('step'); if (!integer(p.step, 1, 10)) return false }
      break
    case 'launch_step':
      allowed = ['step']
      if (!['launch', 'training', 'sign_in', 'how_to_play', 'tier_d_entry', 'tier_d_table', 'lobby', 'classic_lobby', 'classic_table', 'mastermind_select'].includes(p.step as string)) return false
      break
    default: return false
  }
  return Object.keys(p).every(key => allowed.includes(key))
}

export function validMembership(value: unknown): value is MembershipSnapshot {
  if (!object(value) || Object.keys(value).some(k=>!['plan','entitled','entitlements'].includes(k))
    || !['FREE','PRO','PRO_PLUS'].includes(value.plan as string) || typeof value.entitled !== 'boolean' || !object(value.entitlements)) return false
  const keys=['hasNoForcedInterstitialAds','canUseRewardedAdsForExtras','canCreatePrivateTable','canUsePrivateTablePin','canUseGolfGroupMode','canViewAnalysisWithoutAd','canUseProPlusSocialBenefits']
  return Object.keys(value.entitlements).length===keys.length && keys.every(k=>typeof (value.entitlements as Record<string,unknown>)[k]==='boolean')
}
