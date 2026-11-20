const mockUpsert = jest.fn()
jest.mock('../../src/config/supabase', () => ({ supabaseAdmin: { rpc: mockUpsert } }))
import Fastify from 'fastify'
import { telemetryRoutes } from '../../src/routes/telemetry'
import { telemetryConfig, telemetryEventSchema } from '../../src/telemetry/schema'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const event = () => ({ event_id: '00000000-0000-4000-8000-000000000001', schema_version: 1,
  occurred_at: new Date().toISOString(), player_id: '00000000-0000-4000-8000-000000000002',
  session_id: '00000000-0000-4000-8000-000000000003', app_version: '1.0.0', platform: 'android',
  event_name: 'app_open', properties: {},
})
const originalEnv = { ...process.env }
beforeEach(() => { jest.clearAllMocks(); process.env.TELEMETRY_ENABLED = 'true'; process.env.TELEMETRY_ENV = 'development'; mockUpsert.mockResolvedValue({ error: null }) })
afterEach(() => { process.env = { ...originalEnv }; jest.useRealTimers() })
async function post(payload: unknown) {
  const app = Fastify(); await app.register(telemetryRoutes)
  try { return await app.inject({ method: 'POST', url: '/telemetry/batch', payload: payload as object }) }
  finally { await app.close() }
}

const snapshot = (plan: 'FREE' | 'PRO' | 'PRO_PLUS') => ({
  plan, entitled: plan !== 'FREE', entitlements: {
    hasNoForcedInterstitialAds: false, canUseRewardedAdsForExtras: true,
    canCreatePrivateTable: false, canUsePrivateTablePin: false, canUseGolfGroupMode: false,
    canViewAnalysisWithoutAd: false, canUseProPlusSocialBenefits: false,
  },
})
test.each(['FREE', 'PRO', 'PRO_PLUS'] as const)('ingestion preserves %s snapshot through RPC and retry with identical event ID', async plan => {
  const input = { ...event(), membership: snapshot(plan) }
  mockUpsert.mockResolvedValueOnce({ error: { message: 'temporary failure' } })
  expect((await post({ events: [input] })).statusCode).toBe(503)
  const response = await post({ events: [input, input] })
  expect(response.json().acknowledged).toEqual([input.event_id])
  expect(mockUpsert.mock.calls[0][1].p_events).toEqual(mockUpsert.mock.calls[1][1].p_events)
  expect(mockUpsert.mock.calls[1][1].p_events).toHaveLength(1)
  expect(mockUpsert.mock.calls[1][1].p_events[0].membership).toEqual(input.membership)
})
test('old envelopes remain valid and invalid/sensitive snapshots never reach storage', async () => {
  expect((await post({ events: [event()] })).statusCode).toBe(200)
  expect(mockUpsert.mock.calls[0][1].p_events[0]).not.toHaveProperty('membership')
  mockUpsert.mockClear()
  for (const membership of [
    { ...snapshot('FREE'), plan: 'GOLD' },
    { ...snapshot('PRO'), payment_token: 'private' },
    { ...snapshot('PRO'), entitled: 'true' },
    { ...snapshot('PRO'), entitlements: {} },
    { ...snapshot('PRO'), entitlements: { ...snapshot('PRO').entitlements, email: 'private' } },
  ]) {
    const response = await post({ events: [{ ...event(), membership }] })
    expect(response.json().rejected).toEqual([{ index: 0, reason: 'INVALID_EVENT' }])
  }
  expect(mockUpsert).not.toHaveBeenCalled()
})

test('economy/item/ad names are server-only even with valid payloads; VIP state rejects sensitive fields',async()=>{
  const id=event().event_id
  const payloads=[
    {event_name:'token_balance_change',properties:{transaction_id:'1',ledger_id:'2',delta:10,balance_before:0,balance_after:10,flow:'source',reason:'AD_REWARD'}},
    {event_name:'item_use',properties:{receipt_id:id,item_type:'swap',quantity:1,tier:'tier_d'}},
    {event_name:'item_reward',properties:{receipt_id:id,item_type:'freeze',quantity:1,reward_source:'level_clear'}},
    {event_name:'ad_reward',properties:{claim_id:id,placement:'TOKEN_RESCUE',reward_type:'token',quantity:10}},
  ]
  for(const p of payloads){expect(telemetryEventSchema.safeParse({...event(),...p}).success).toBe(true);expect((await post({events:[{...event(),...p}]})).json().rejected[0].reason).toBe('CLIENT_AUTHORITY_FORBIDDEN')}
  expect(mockUpsert).not.toHaveBeenCalled()
  expect(telemetryEventSchema.safeParse({...event(),membership:{plan:'PRO',entitled:true,payment_token:'secret',entitlements:{}}}).success).toBe(false)
})

test('flags fail closed, production cannot store development data', async () => {
  expect(telemetryConfig({}).enabled).toBe(false)
  expect(telemetryConfig({ TELEMETRY_ENABLED: 'true', TELEMETRY_ENV: 'development', NODE_ENV: 'production' }).enabled).toBe(false)
  expect(telemetryConfig({ TELEMETRY_ENABLED: 'true', TELEMETRY_ENV: 'production', NODE_ENV: 'production' }).enabled).toBe(true)
  process.env.TELEMETRY_ENABLED = 'false'
  const response = await post({ events: [event()] })
  expect(response.statusCode).toBe(503); expect(response.headers['retry-after']).toBe('60'); expect(mockUpsert).not.toHaveBeenCalled()
})
test('rejects oversized/empty envelopes and privacy-sensitive fields', async () => {
  for (const payload of [{ events: [] }, { events: Array(21).fill(event()) }, { events: [event()], secret: 'x' }]) {
    expect((await post(payload)).statusCode).toBe(400)
  }
  const response = await post({ events: [{ ...event(), properties: { email: 'private@example.com' } }, { ...event(), user_id: 'account' }] })
  expect(response.json()).toEqual({ acknowledged: [], rejected: [{ index: 0, reason: 'INVALID_EVENT' }, { index: 1, reason: 'INVALID_EVENT' }] })
  expect(mockUpsert).not.toHaveBeenCalled()
})
test('partial validation does not poison valid events and environment/source are server controlled', async () => {
  const response = await post({ events: [event(), { ...event(), event_name: 'game_end' }, { ...event(), occurred_at: new Date(Date.now() + 600_000).toISOString() }] })
  expect(response.statusCode).toBe(200)
  expect(response.json().acknowledged).toEqual([event().event_id]); expect(response.json().rejected).toHaveLength(2)
  expect(mockUpsert).toHaveBeenCalledWith('telemetry_ingest_events', { p_events:[expect.objectContaining({ environment: 'development', source: 'client' })] })
})
test('deduplicates in batch and safely acknowledges replay without overwriting', async () => {
  const payload = { events: [event(), event()] }
  const first = await post(payload); const replay = await post(payload)
  expect(first.json()).toEqual(replay.json())
  expect(mockUpsert.mock.calls[0][1].p_events).toHaveLength(1)
  expect(mockUpsert.mock.calls[1][0]).toBe('telemetry_ingest_events')
})
test('DB failure or throw is retryable and contains no sensitive database details', async () => {
  mockUpsert.mockResolvedValueOnce({ error: { message: 'SECRET_EMAIL' } }).mockRejectedValueOnce(new Error('SECRET_EMAIL'))
  for (let i = 0; i < 2; i++) {
    const response = await post({ events: [event()] })
    expect(response.statusCode).toBe(503); expect(response.json()).toEqual({ error: 'TELEMETRY_UNAVAILABLE' })
    expect(response.body).not.toContain('SECRET_EMAIL'); expect(response.headers['retry-after']).toBe('5')
  }
})
test('DB timeout acknowledges nothing; retry may dedup a late commit', async () => {
  mockUpsert.mockImplementation(() => new Promise(() => {}))
  const response = await post({ events: [event()] })
  expect(response.statusCode).toBe(503)
  expect(response.json().acknowledged).toBeUndefined()
}, 15_000)
test('rate limit and 64 KiB body limit apply to public pre-login ingestion', async () => {
  const app = Fastify(); await app.register(telemetryRoutes)
  try {
    for (let i = 0; i < 30; i++) expect((await app.inject({ method: 'POST', url: '/telemetry/batch', payload: { events: [event()] } })).statusCode).toBe(200)
    const limit = await app.inject({ method: 'POST', url: '/telemetry/batch', payload: { events: [event()] } })
    expect(limit.statusCode).toBe(429); expect(limit.headers['retry-after']).toBe('60')
    const large = await app.inject({ method: 'POST', url: '/telemetry/batch', payload: { events: ['x'.repeat(70_000)] } })
    expect(large.statusCode).toBe(413)
  } finally { await app.close() }
})
test('schema constrains properties and migration isolates telemetry from economy', () => {
  expect(telemetryEventSchema.safeParse({ ...event(), event_name: 'session_end', properties: { duration_ms: -1, reason: 'background' } }).success).toBe(false)
  const sql = readFileSync(resolve(__dirname, '../../../supabase/migrations/088_telemetry_foundation.sql'), 'utf8')
  expect(sql).toContain('event_id uuid PRIMARY KEY'); expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
  expect(sql).toContain('REVOKE ALL'); expect(sql).toContain('GRANT SELECT, INSERT')
  expect(sql).not.toMatch(/UPDATE public\.users|economy_apply_transaction|DROP TABLE|TRUNCATE/i)
})
test('only training gameplay may originate from the public client ingestion endpoint', async () => {
  const properties={game_id:'00000000-0000-4000-8000-000000000010',mode:'solo',tier:'initiate',human_count:1,bot_count:3}
  const response=await post({events:[{...event(),event_name:'game_start',properties},{...event(),event_name:'game_start',properties:{...properties,mode:'training',tier:'training',bot_count:1}}]})
  expect(response.json().rejected).toEqual([{index:0,event_id:event().event_id,reason:'CLIENT_AUTHORITY_FORBIDDEN'}])
  expect(mockUpsert.mock.calls[0][1].p_events).toHaveLength(1)
  expect(mockUpsert.mock.calls[0][1].p_events[0].properties.mode).toBe('training')
})
test('game/funnel schema denies hands, identity and excluded analytics fields', () => {
  const valid={...event(),event_name:'game_end',properties:{game_id:event().event_id,mode:'training',tier:'training',human_count:1,bot_count:1,outcome:'draw',duration_ms:1000,score:4.5,score_kind:'points',opponent_score:4.5,seal_wins:0}}
  expect(telemetryEventSchema.safeParse(valid).success).toBe(true)
  for(const key of ['cards','hands','seed','token_balance','vip_status','ad_reward','items','user_id'])expect(telemetryEventSchema.safeParse({...valid,properties:{...valid.properties,[key]:'secret'}}).success).toBe(false)
  const sql=readFileSync(resolve(__dirname,'../../../supabase/migrations/089_telemetry_gameplay_funnel.sql'),'utf8')
  expect(sql).toContain('ON CONFLICT DO NOTHING');expect(sql).toContain('telemetry_game_once_idx');expect(sql).toContain('telemetry_first_game_once_idx')
  expect(sql).toContain('SECURITY INVOKER');expect(sql).toContain('REVOKE ALL');expect(sql).not.toMatch(/DROP TABLE|TRUNCATE|economy_apply_transaction/i)
})
