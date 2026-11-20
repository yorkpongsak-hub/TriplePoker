import { createHash, randomUUID } from 'crypto'
import { storeTelemetry } from './store'
import { telemetryConfig, telemetryContextSchema, telemetryEventSchema, membershipSchema, type MembershipSnapshot, type TelemetryContext, type TelemetryRow, type GameStartProperties, type GameEndProperties } from './schema'

type Participant = { userId: string; context?: TelemetryContext; started: boolean }
type RecordState = { properties: GameStartProperties; participants: Participant[]; startedAt: number; ended: boolean }
type Round = { pile1Winner: string; pile2Winner: string; pile3Winner: string }
type ClassicSolo = { tier: string; escrowId?: string; humanPlayerId: string; results: Round[] }
type ClassicMulti = { tier: 'adept'; escrowIds: Record<string,string>; humanPlayerIds: string[]; aiPlayerIds: string[]; results: Round[] }
type HighNoble = { escrowIds: Record<string,string>; seats: { id: string; isHuman: boolean; isMonarch?: boolean }[]; results: Round[] }
type TierD = { gameId: string; userId: string; levelStartedAt: number; state: { level: number; duel?: unknown; seats: { isBot: boolean }[] }; cumulativeScores: Record<string,number> }

export function anonymousGameId(key: string) {
  const bytes = createHash('sha256').update(`rise-game-v1:${key}`).digest().subarray(0,16)
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128
  const hex = bytes.toString('hex')
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
}

export class ServerGameTelemetry {
  private contexts = new Map<string, { value: TelemetryContext & {membership?:MembershipSnapshot}; receivedAt: number }>()
  private games = new WeakMap<object, RecordState>()
  constructor(private readonly enabled: () => boolean, private readonly emit: (context: TelemetryContext, name: 'game_start' | 'game_end' | 'first_game_complete', properties: unknown, occurredAt: number) => void,
    private readonly now: () => number = Date.now) {}
  setContext(userId: unknown, input: unknown): void {
    try {
      if (!this.enabled() || typeof userId !== 'string') return
      const parsed = telemetryContextSchema.safeParse(input); if (!parsed.success) return
      if (this.contexts.size >= 10_000) this.contexts.delete(this.contexts.keys().next().value!)
      this.contexts.set(userId, { value: parsed.data, receivedAt: this.now() })
    } catch {}
  }
  context(userId: string) {
    const entry = this.contexts.get(userId)
    return entry && this.now()-entry.receivedAt < 24*3600_000 ? entry.value : undefined
  }
  setMembership(userId:string,sessionId:string,snapshot:MembershipSnapshot):void {
    try {
      const entry=this.contexts.get(userId),parsed=membershipSchema.safeParse(snapshot)
      if(entry?.value.session_id===sessionId && parsed.success)entry.value={...entry.value,membership:parsed.data}
    } catch {}
  }
  private sendStart(game: RecordState, participant: Participant) {
    const context = participant.context ?? this.context(participant.userId)
    if (!context || participant.started) return
    participant.context = context; participant.started = true
    this.emit(context, 'game_start', game.properties, game.startedAt)
  }
  private begin(owner: object, stableKey: string, users: string[], properties: Omit<GameStartProperties,'game_id'>, startedAt = this.now()) {
    if (!this.enabled() || this.games.has(owner)) return
    const game: RecordState = { properties: { ...properties, game_id: anonymousGameId(stableKey) },
      participants: users.map(userId => ({ userId, context: this.context(userId), started: false })), startedAt, ended: false }
    this.games.set(owner,game)
    for (const participant of game.participants) this.sendStart(game,participant)
  }
  private finish(owner: object, result: (userId: string) => Omit<GameEndProperties,keyof GameStartProperties | 'duration_ms'>) {
    const game = this.games.get(owner); if (!game || game.ended || !this.enabled()) return
    game.ended = true
    const endedAt = this.now()
    for (const participant of game.participants) {
      // metadata ที่มาช้าสามารถเติม start ด้วยเวลาที่เริ่มจริง โดยไม่รอใน gameplay
      this.sendStart(game,participant)
      if (!participant.context) continue
      this.emit(participant.context, 'game_end', { ...game.properties, ...result(participant.userId), duration_ms: Math.max(0,endedAt-game.startedAt) },endedAt)
      this.emit(participant.context, 'first_game_complete', { game_id: game.properties.game_id, mode: game.properties.mode, tier: game.properties.tier },endedAt)
    }
  }
  startSolo(state: ClassicSolo): void {
    try { if (!['initiate','adept','mastermind','highNoble'].includes(state.tier)) return
      this.begin(state,`${state.tier}:${state.escrowId ?? randomUUID()}`,[state.humanPlayerId],{ mode:'solo',tier:state.tier as GameStartProperties['tier'],human_count:1,bot_count:3 })
    } catch {}
  }
  endSolo(state: ClassicSolo, winner: string): void {
    try { this.finishClassic(state,state.results,winner) } catch {}
  }
  startMulti(state: ClassicMulti): void {
    try { this.begin(state,`adept:${Object.values(state.escrowIds).sort().join(':')}`,state.humanPlayerIds,{mode:'multiplayer',tier:'adept',human_count:state.humanPlayerIds.length,bot_count:state.aiPlayerIds.length}) } catch {}
  }
  endMulti(state: ClassicMulti, winner: string): void { try { this.finishClassic(state,state.results,winner) } catch {} }
  startHighNoble(state: HighNoble): void {
    try { if (state.seats.some(seat=>seat.isMonarch)) return
      this.begin(state,`highNoble:${Object.values(state.escrowIds).sort().join(':')}`,state.seats.filter(seat=>seat.isHuman).map(seat=>seat.id),{
        mode:state.seats.filter(seat=>seat.isHuman).length>1?'multiplayer':'solo',tier:'highNoble',human_count:state.seats.filter(seat=>seat.isHuman).length,bot_count:state.seats.filter(seat=>!seat.isHuman).length })
    } catch {}
  }
  endHighNoble(state: HighNoble, winner: string): void { try { this.finishClassic(state,state.results,winner) } catch {} }
  private finishClassic(owner: object, rounds: Round[], winner: string) {
    this.finish(owner,userId=>({ outcome:winner===userId?'win':'loss',score_kind:'pile_wins',
      score:rounds.reduce((sum,round)=>sum+[round.pile1Winner,round.pile2Winner,round.pile3Winner].filter(id=>id===userId).length,0),
      triple_sweep:rounds.some(round=>round.pile1Winner===userId&&round.pile2Winner===userId&&round.pile3Winner===userId) }))
  }
  startTierD(state: TierD): void {
    try { this.begin(state,`tier_d:${state.gameId}`,[state.userId],{mode:state.state.duel?'tier_d_duel':'tier_d_solo',tier:'tier_d',level:state.state.level,human_count:1,bot_count:state.state.seats.filter(seat=>seat.isBot).length},state.levelStartedAt) } catch {}
  }
  endTierD(state: TierD, won: boolean, opponentScore: number, openChallengePassed: boolean): void {
    try { this.finish(state,userId=>({outcome:won?'win':'loss',score:state.cumulativeScores[userId]??0,score_kind:'points',opponent_score:opponentScore,open_challenge_passed:openChallengePassed})) } catch {}
  }
}

// คิว memory จำกัดขนาด; durable dedup อยู่ใน PostgreSQL, restart อาจเสีย event ที่ยังไม่ส่ง
const pending: TelemetryRow[] = []
let uploading = false
let retryTimer: ReturnType<typeof setTimeout> | undefined
let attempts = 0
export const serverTelemetryDiagnostics = { dropped:0,failedBatches:0 }
async function drain() {
  if (uploading || retryTimer || !pending.length || !telemetryConfig().enabled) return
  uploading = true
  const batch = pending.slice(0,20)
  try { await storeTelemetry(batch); pending.splice(0,batch.length); attempts=0 }
  catch {
    serverTelemetryDiagnostics.failedBatches++
    attempts=Math.min(attempts+1,7)
    retryTimer=setTimeout(()=>{retryTimer=undefined;void drain()},Math.min(60_000,1000*2**(attempts-1)))
    retryTimer.unref()
  } finally { uploading=false }
  if (!retryTimer && pending.length) void drain()
}
export function enqueueServerTelemetry(context: TelemetryContext, event_name: TelemetryRow['event_name'], properties: unknown, occurredAt: number,
  eventId: string = randomUUID(), membership?: TelemetryRow['membership']): void {
  try {
    const config=telemetryConfig();if(!config.enabled)return
    const parsed=telemetryEventSchema.safeParse({...context,event_id:eventId,schema_version:1,event_name,properties,occurred_at:new Date(occurredAt).toISOString(),...(membership?{membership}:{})})
    if(!parsed.success)return
    if(pending.length>=500){serverTelemetryDiagnostics.dropped++;return}
    pending.push({...parsed.data,source:'server',environment:config.environment});void drain()
  } catch {}
}
export const gameTelemetry = new ServerGameTelemetry(()=>telemetryConfig().enabled,enqueueServerTelemetry)
