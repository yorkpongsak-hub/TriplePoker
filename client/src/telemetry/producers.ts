import type { TelemetryQueue } from './queue'
import type { TelemetryContext, TelemetryInput, Tutorial, LaunchStep, TrainingGame } from './types'
import { entitlementsFromVipStatus } from '../membership/entitlements'
import type { MembershipSnapshot } from './types'

export type TrainingTrace = { gameId: string; startedAt: number; onboardingMatch?: 1 | 2 }
type Body = TelemetryInput extends infer T ? T extends TelemetryInput ? Omit<T, 'session_id'> : never : never

export class ClientTelemetry {
  private context?: TelemetryContext
  private startedAt = 0
  private bootReported = false
  private serial: Promise<unknown> = Promise.resolve()
  private listeners = new Set<(context: TelemetryContext) => void>()
  private lastRoute?: string
  private membership?: MembershipSnapshot
  private reportedMembership?: string
  constructor(private readonly queue: TelemetryQueue, private readonly now: () => number = Date.now) {}
  private ordered(work: () => Promise<void>) {
    this.serial = this.serial.catch(() => {}).then(work).catch(() => {})
    return this.serial as Promise<void>
  }
  private async ensure() {
    if (this.context) return this.context
    const context = await this.queue.createSession()
    if (!context) return undefined
    this.context = { player_id: context.player_id, session_id: context.session_id, app_version: context.app_version, platform: context.platform }
    this.startedAt = this.now()
    await this.queue.enqueue({ session_id: context.session_id, event_name: 'session_start', ...(this.membership?{membership:this.membership}:{}),
      properties: { session_number: context.session_number, is_return: context.is_return } }, `session_start:${context.session_id}`)
    if (!this.bootReported) {
      this.bootReported = true
      await this.queue.enqueue({ session_id: context.session_id, event_name: 'app_open', properties: {} })
    }
    for (const listener of this.listeners) { try { listener(this.context) } catch {} }
    await this.reportMembership('session_start')
    return this.context
  }
  active(): Promise<void> {
    if (!this.queue.enabled) return Promise.resolve()
    return this.ordered(async () => { await this.ensure(); this.queue.start() })
  }
  background(): Promise<void> {
    if (!this.queue.enabled) return Promise.resolve()
    const endedAt = this.now()
    return this.ordered(async () => {
      const context = this.context; if (!context) return
      await this.queue.enqueue({ event_name: 'session_end', session_id: context.session_id,
        properties: { duration_ms: Math.min(7 * 86400_000, Math.max(0, endedAt - this.startedAt)), reason: 'background' } }, `session_end:${context.session_id}`)
      this.context = undefined; this.lastRoute = undefined; this.reportedMembership = undefined; this.queue.stop(); void this.queue.flush()
    })
  }
  subscribeContext(listener: (context: TelemetryContext) => void): () => void {
    this.listeners.add(listener)
    if (this.context) { try { listener(this.context) } catch {} }
    return () => { this.listeners.delete(listener) }
  }
  private emit(body: Body, key?: string): Promise<void> {
    if (!this.queue.enabled) return Promise.resolve()
    return this.ordered(async () => {
      const context = await this.ensure(); if (!context) return
      await this.queue.enqueue({ ...body, session_id: context.session_id, ...(this.membership?{membership:this.membership}:{}) } as TelemetryInput, key)
    })
  }
  membershipStatus(status: unknown): Promise<void> {
    if (!this.queue.enabled) return Promise.resolve()
    return this.ordered(async()=>{
      if (!['none','vip','vip_pro'].includes(status as string)) { this.membership=undefined; return }
      const {plan,...entitlements}=entitlementsFromVipStatus(status as string)
      this.membership={plan,entitled:plan!=='FREE',entitlements}
      if (!this.context) return // background/profile changes do not invent a new session
      await this.reportMembership(this.reportedMembership?'change':'session_start')
    })
  }
  private async reportMembership(trigger: 'session_start'|'change') {
    if (!this.context || !this.membership) return
    const fingerprint=JSON.stringify(this.membership)
    if (this.reportedMembership===fingerprint) return
    await this.queue.enqueue({session_id:this.context.session_id,event_name:'vip_status',membership:this.membership,
      properties:{...this.membership,trigger}})
    this.reportedMembership=fingerprint
    // Refresh the existing authenticated server context when the observed profile changes.
    for (const listener of this.listeners) { try { listener(this.context) } catch {} }
  }
  route(path: string): Promise<void> {
    const routes: Record<string, LaunchStep> = { launch: 'launch', duel: 'training', '(auth)/login': 'sign_in',
      '(auth)/onboarding': 'how_to_play', 'game/tier-d/entry': 'tier_d_entry', 'game/tier-d': 'tier_d_table',
      '(home)/lobby': 'lobby', '(home)/classic-lobby': 'classic_lobby', 'game/mastermind/select': 'mastermind_select',
      'game/initiate': 'classic_table', 'game/adept': 'classic_table', 'game/mastermind': 'classic_table', 'game/highNoble': 'classic_table' }
    const step = routes[path]; if (!step || this.lastRoute === path || !this.queue.enabled) return Promise.resolve()
    this.lastRoute = path
    return this.emit({ event_name: 'launch_step', properties: { step } })
  }
  tutorialStart(tutorial: Tutorial): Promise<void> { return this.emit({ event_name: 'tutorial_start', properties: { tutorial } }, `tutorial_start:${tutorial}`) }
  tutorialStep(tutorial: Tutorial, step: number): Promise<void> { return this.emit({ event_name: 'tutorial_step', properties: { tutorial, step } }, `tutorial_step:${tutorial}:${step}`) }
  tutorialComplete(tutorial: Tutorial): Promise<void> { return this.emit({ event_name: 'tutorial_complete', properties: { tutorial } }, `tutorial_complete:${tutorial}`) }
  trainingStart(completed: number): TrainingTrace | undefined {
    const gameId = this.queue.newId(); if (!gameId) return undefined
    const trace: TrainingTrace = { gameId, startedAt: this.now(), ...(completed < 2 ? { onboardingMatch: (completed + 1) as 1 | 2 } : {}) }
    const properties: TrainingGame = { game_id: gameId, mode: 'training', tier: 'training', human_count: 1, bot_count: 1 }
    void this.emit({ event_name: 'game_start', properties }, `game_start:${gameId}`)
    if (trace.onboardingMatch) { void this.tutorialStart('three_piles'); void this.tutorialStep('three_piles', trace.onboardingMatch * 2 - 1) }
    return trace
  }
  trainingEnd(trace: TrainingTrace | undefined, score: number, opponentScore: number, sealWins: number): void {
    if (!trace) return
    const properties = { game_id: trace.gameId, mode: 'training' as const, tier: 'training' as const, human_count: 1 as const, bot_count: 1 as const,
      outcome: score > opponentScore ? 'win' as const : score < opponentScore ? 'loss' as const : 'draw' as const,
      duration_ms: Math.max(0, this.now() - trace.startedAt), score, score_kind: 'points' as const, opponent_score: opponentScore, seal_wins: sealWins }
    void this.emit({ event_name: 'game_end', properties }, `game_end:${trace.gameId}`)
    void this.emit({ event_name: 'first_game_complete', properties: { game_id: trace.gameId, mode: 'training', tier: 'training' } }, 'first_game_complete')
    if (trace.onboardingMatch) {
      void this.tutorialStep('three_piles', trace.onboardingMatch * 2)
      if (trace.onboardingMatch === 2) void this.tutorialComplete('three_piles')
    }
  }
  settled(): Promise<void> { return this.serial.then(() => {}) }
}
