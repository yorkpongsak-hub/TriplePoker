const mockRpc=jest.fn()
jest.mock('../../src/config/supabase',()=>({supabaseAdmin:{rpc:mockRpc}}))
import { gameTelemetry,serverTelemetryDiagnostics } from '../../src/telemetry/gameplay'
const original={...process.env}
const context={player_id:'00000000-0000-4000-8000-000000000091',session_id:'00000000-0000-4000-8000-000000000092',app_version:'1.0.0',platform:'android'}
beforeEach(()=>{process.env.TELEMETRY_ENABLED='true';process.env.TELEMETRY_ENV='development';mockRpc.mockReset().mockResolvedValue({error:null})})
afterEach(()=>{process.env={...original};jest.useRealTimers()})
const tick=()=>new Promise(done=>setImmediate(done))
test('real server sink persists server-owned batches and never blocks the producer on a delayed DB',async()=>{
  let release!:(value:unknown)=>void
  mockRpc.mockImplementationOnce(()=>new Promise(done=>{release=done}))
  gameTelemetry.setContext('sink-human',context)
  const state={tier:'initiate',escrowId:'sink-1',humanPlayerId:'sink-human',results:[]}
  expect(()=>gameTelemetry.startSolo(state)).not.toThrow();expect(()=>gameTelemetry.endSolo(state,'sink-human')).not.toThrow()
  expect(mockRpc).toHaveBeenCalledTimes(1)
  release({error:null});await tick();await tick()
  const rows=mockRpc.mock.calls.flatMap(call=>call[1].p_events)
  expect(rows.map((row:any)=>row.event_name)).toEqual(['game_start','game_end','first_game_complete'])
  expect(rows.every((row:any)=>row.source==='server'&&row.environment==='development')).toBe(true)
  expect(JSON.stringify(rows)).not.toContain('sink-human')
})
test('failed server upload retries identical event IDs safely without throwing into gameplay',async()=>{
  jest.useFakeTimers({doNotFake:['setImmediate']});mockRpc.mockResolvedValueOnce({error:{message:'offline'}})
  gameTelemetry.setContext('retry-human',context)
  const state={tier:'adept',escrowId:'sink-2',humanPlayerId:'retry-human',results:[]}
  gameTelemetry.startSolo(state);await tick();expect(serverTelemetryDiagnostics.failedBatches).toBeGreaterThan(0)
  const id=mockRpc.mock.calls[0][1].p_events[0].event_id
  await jest.advanceTimersByTimeAsync(1001);await tick()
  expect(mockRpc.mock.calls[1][1].p_events[0].event_id).toBe(id)
})
