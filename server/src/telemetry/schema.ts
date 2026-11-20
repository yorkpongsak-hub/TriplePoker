import { z } from 'zod'

export const TELEMETRY_BATCH_SIZE = 20
export const TELEMETRY_ENVIRONMENTS = ['development', 'production'] as const
export const membershipSchema = z.object({
  plan: z.enum(['FREE', 'PRO', 'PRO_PLUS']), entitled: z.boolean(),
  entitlements: z.object({ hasNoForcedInterstitialAds: z.boolean(), canUseRewardedAdsForExtras: z.boolean(),
    canCreatePrivateTable: z.boolean(), canUsePrivateTablePin: z.boolean(), canUseGolfGroupMode: z.boolean(),
    canViewAnalysisWithoutAd: z.boolean(), canUseProPlusSocialBenefits: z.boolean() }).strict(),
}).strict()
export type MembershipSnapshot = z.infer<typeof membershipSchema>
const itemType = z.enum(['shuffle','swap','double_pile','freeze','auto_sort','undo','single_card_swap','full_redraw','bomb_defuser','heart','rose','medal','trophy'])
const receiptId = z.string().uuid()
const quantity = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
const economyReasons = ['GENESIS','INITIAL_FUNDING','NPC_INITIAL_FUNDING','TEST_ACCOUNT_FUNDING','MATCH_SETTLEMENT','ANTE','POT','AUCTION','AUTO_SORT','RETRY','TOKEN_TO_CROWN','SHOP_PURCHASE','JOURNEY_PASS','EVENT_REWARD','ACHIEVEMENT','PROMOTION','ADMIN_CORRECTION','DEBT_CARRY','WELCOME_BONUS','STREAK_BONUS','STREAK_MILESTONE_BONUS','AD_REWARD','TIER_D_LEVEL_500_UNLOCK','TIER_D_LEVEL_250_TIER_C_UNLOCK','OTHER'] as const

const envelope = {
  event_id: z.string().uuid(),
  schema_version: z.literal(1),
  occurred_at: z.string().datetime(),
  player_id: z.string().uuid(),
  session_id: z.string().uuid(),
  app_version: z.string().regex(/^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/).max(40),
  build_number: z.string().regex(/^\d+$/).max(20).optional(),
  platform: z.enum(['android', 'ios', 'web']),
  membership: membershipSchema.optional(),
}
const sessionProperties = z.object({
  session_number: z.number().int().min(1).max(1_000_000).optional(),
  is_return: z.boolean().optional(),
}).strict()
export const telemetryContextSchema = z.object({
  player_id: envelope.player_id, session_id: envelope.session_id,
  app_version: envelope.app_version, platform: envelope.platform,
}).strict()
export type TelemetryContext = z.infer<typeof telemetryContextSchema>
const gameProperties = {
  game_id: z.string().uuid(), mode: z.enum(['training', 'solo', 'multiplayer', 'tier_d_solo', 'tier_d_duel']),
  tier: z.enum(['training', 'tier_d', 'initiate', 'adept', 'mastermind', 'highNoble']),
  level: z.number().int().min(1).max(1_000_000).optional(),
  human_count: z.number().int().min(1).max(4), bot_count: z.number().int().min(1).max(3),
}
const tutorialProperties = {
  tutorial: z.enum(['three_piles', 'strategy_check', 'tier_d_guide']),
}
export const launchSteps = ['launch', 'training', 'sign_in', 'how_to_play', 'tier_d_entry', 'tier_d_table', 'lobby', 'classic_lobby', 'classic_table', 'mastermind_select'] as const

// allowlist สำหรับ launch เท่านั้น ไม่รับ raw hand หรือข้อมูลเศรษฐกิจ
export const telemetryEventSchema = z.discriminatedUnion('event_name', [
  z.object({ ...envelope, event_name: z.literal('token_balance_change'), properties: z.object({
    transaction_id: z.string().regex(/^\d{1,20}$/), ledger_id: z.string().regex(/^\d{1,20}$/),
    delta: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER).refine(v=>v!==0),
    balance_before: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), balance_after: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    flow: z.enum(['source','sink']), reason: z.enum(economyReasons), tier: z.enum(['tier_d','initiate','adept','mastermind','highNoble']).optional(),
  }).strict() }).strict(),
  z.object({ ...envelope, event_name: z.literal('item_use'), properties: z.object({ receipt_id: receiptId,
    item_type: itemType, quantity, tier: z.literal('tier_d'), game_id: receiptId.optional(), match_number: z.number().int().min(1).optional() }).strict() }).strict(),
  z.object({ ...envelope, event_name: z.literal('item_reward'), properties: z.object({ receipt_id: receiptId,
    item_type: itemType, quantity, reward_source: z.enum(['level_clear','runtime_ad','offer','daily_streak','league','tournament','legacy_reward']),
    tier: z.literal('tier_d').optional(), level: z.number().int().min(1).optional() }).strict() }).strict(),
  z.object({ ...envelope, event_name: z.literal('ad_reward'), properties: z.object({ claim_id: receiptId,
    placement: z.enum(['TOKEN_RESCUE','TIER_D_LEVEL_CLEAR','TIER_D_ITEM_REFILL','TIER_D_ITEM_OFFER','DAILY_STREAK','TIER_D_LEGACY_REWARD']),
    reward_type: z.enum(['token',...itemType.options]), quantity }).strict() }).strict(),
  z.object({ ...envelope, event_name: z.literal('vip_status'), properties: z.object({
    ...membershipSchema.shape, trigger: z.enum(['session_start','change']),
  }).strict() }).strict(),
  z.object({ ...envelope, event_name: z.literal('app_open'), properties: z.object({}).strict() }).strict(),
  z.object({ ...envelope, event_name: z.literal('session_start'), properties: sessionProperties }).strict(),
  z.object({ ...envelope, event_name: z.literal('session_end'), properties: z.object({
    duration_ms: z.number().int().min(0).max(7 * 24 * 60 * 60 * 1000),
    reason: z.enum(['background', 'timeout', 'shutdown', 'recovered']),
    inferred: z.boolean().optional(),
  }).strict() }).strict(),
  z.object({ ...envelope, event_name: z.literal('telemetry_upload_failure'), properties: z.object({
    reason: z.enum(['network', 'timeout', 'http', 'protocol', 'storage']),
    count: z.number().int().min(1).max(1_000_000),
    status: z.number().int().min(100).max(599).optional(),
  }).strict() }).strict(),
  z.object({ ...envelope, event_name: z.literal('game_start'), properties: z.object(gameProperties).strict() }).strict(),
  z.object({ ...envelope, event_name: z.literal('game_end'), properties: z.object({
    ...gameProperties, outcome: z.enum(['win', 'loss', 'draw']),
    duration_ms: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    score: z.number().finite().min(0).max(Number.MAX_SAFE_INTEGER),
    score_kind: z.enum(['points', 'pile_wins']),
    opponent_score: z.number().finite().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
    seal_wins: z.number().int().min(0).max(3).optional(),
    triple_sweep: z.boolean().optional(), open_challenge_passed: z.boolean().optional(),
  }).strict() }).strict(),
  z.object({ ...envelope, event_name: z.literal('first_game_complete'), properties: z.object({
    game_id: gameProperties.game_id, mode: gameProperties.mode, tier: gameProperties.tier,
  }).strict() }).strict(),
  z.object({ ...envelope, event_name: z.literal('tutorial_start'), properties: z.object(tutorialProperties).strict() }).strict(),
  z.object({ ...envelope, event_name: z.literal('tutorial_step'), properties: z.object({
    ...tutorialProperties, step: z.number().int().min(1).max(10),
  }).strict() }).strict(),
  z.object({ ...envelope, event_name: z.literal('tutorial_complete'), properties: z.object(tutorialProperties).strict() }).strict(),
  z.object({ ...envelope, event_name: z.literal('launch_step'), properties: z.object({ step: z.enum(launchSteps) }).strict() }).strict(),
])

export const telemetryBatchSchema = z.object({ events: z.array(z.unknown()).min(1).max(TELEMETRY_BATCH_SIZE) }).strict()
export type TelemetryEvent = z.infer<typeof telemetryEventSchema>
export type TelemetryEnvironment = typeof TELEMETRY_ENVIRONMENTS[number]
export type TelemetryRow = TelemetryEvent & { environment: TelemetryEnvironment; source: 'client' | 'server' }
export type GameStartProperties = Extract<TelemetryEvent, { event_name: 'game_start' }>['properties']
export type GameEndProperties = Extract<TelemetryEvent, { event_name: 'game_end' }>['properties']

export function telemetryConfig(env: { TELEMETRY_ENABLED?:string; TELEMETRY_ENV?:string; NODE_ENV?:string } = process.env) {
  const environment = env.TELEMETRY_ENV
  const enabled = env.TELEMETRY_ENABLED === 'true'
    && TELEMETRY_ENVIRONMENTS.includes(environment as TelemetryEnvironment)
    && (env.NODE_ENV !== 'production' || environment === 'production')
  return { enabled, environment: environment as TelemetryEnvironment }
}
