import { AppState, AppStateStatus, Platform } from 'react-native'
import { setAudioModeAsync, setIsAudioActiveAsync } from 'expo-audio'
import { createManagedPlayer, ManagedPlayer as AudioPlayer } from './playerFactory'
import { audioRegistry, PRELOAD_AUDIO_EVENTS } from './audioRegistry'
import { AudioCategory, AudioEvent, AudioPlayContext, AudioPriority } from './audioEvents'
import { AudioSettings, DEFAULT_AUDIO_SETTINGS, clampVolume, loadAudioSettings, saveAudioSettings } from './audioSettings'
import { BossAudioProfile, bossAudioProfiles } from './bossAudioProfiles'

type ActiveAudio = {
  event: AudioEvent
  player: AudioPlayer
  priority: AudioPriority
  baseVolume: number
  startedAt: number
  cleanup?: () => void
  safetyTimer?: ReturnType<typeof setTimeout>
  recoveryTimer?: ReturnType<typeof setInterval>
  /** When a CRITICAL entry stops actually blocking lower-priority sounds — see hasBlockingPriority(). */
  blockUntil?: number
}
type Listener = (settings: AudioSettings) => void
const PRIVATE_EVENTS = new Set([AudioEvent.PLAYER_TURN, AudioEvent.TIMER_WARNING, AudioEvent.TIMER_CRITICAL, AudioEvent.TIMER_PRESSURE, AudioEvent.TIMER_LONG])
const RESULT_EVENTS = new Set([AudioEvent.PILE_WIN, AudioEvent.MATCH_WIN, AudioEvent.TRIPLE_SWEEP_CELEBRATION, AudioEvent.RANK_COMPLETE, AudioEvent.TIER_UNLOCK, AudioEvent.RARE_REACTION])
const CACHED_EVENTS = new Set<AudioEvent>(PRELOAD_AUDIO_EVENTS)
const MAX_ONE_SHOT_MS = 3_000
const ONE_SHOT_CLEANUP_GRACE_MS = 1_000
const ARRANGEMENT_EVENTS = new Set([AudioEvent.CARD_SELECT, AudioEvent.CARD_MOVE])

class AudioManager {
  private settings: AudioSettings = DEFAULT_AUDIO_SETTINGS
  private active = new Map<AudioEvent, ActiveAudio>()
  private lastPlayed = new Map<AudioEvent, number>()
  private dedupeKeys = new Map<string, number>()
  private fadeTimers = new Map<AudioEvent | AudioCategory, ReturnType<typeof setInterval>>()
  private listeners = new Set<Listener>()
  private duckFactor = 1
  private initialized = false
  private appStateSubscription: { remove(): void } | null = null
  private resumeBgm: AudioEvent | null = null
  private activationPromise: Promise<void> | null = null
  private cachedPlayers = new Map<AudioEvent, AudioPlayer>()
  private lifecycle = 0
  private settingsRevision = 0
  private musicRecoveryTimer?: ReturnType<typeof setInterval>
  private bgmOwner: symbol | null = null

  async initialize(): Promise<void> {
    if (this.initialized) return
    this.initialized = true
    const lifecycle = ++this.lifecycle
    const settingsRevision = this.settingsRevision
    const loadedSettings = await loadAudioSettings()
    if (!this.initialized || lifecycle !== this.lifecycle) return
    if (settingsRevision === this.settingsRevision) this.settings = loadedSettings
    this.emitSettings()
    try {
      await setAudioModeAsync({
        playsInSilentMode: false,
        interruptionMode: 'mixWithOthers',
        allowsRecording: false,
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      })
      await this.ensureAudioSessionActive()
      if (!this.initialized || lifecycle !== this.lifecycle) return
      this.preloadFrequentlyUsedAudio()
    } catch (error) { this.warn('Could not configure audio focus', error) }
    if (!this.initialized || lifecycle !== this.lifecycle) return
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppState)
    this.musicRecoveryTimer = setInterval(() => {
      if (this.canPlay() && this.resumeBgm && !this.active.has(this.resumeBgm)) this.playBGM(this.resumeBgm)
    }, 2000)
  }

  dispose(): void {
    this.bgmOwner = null
    this.initialized = false
    this.lifecycle++
    if (this.musicRecoveryTimer) clearInterval(this.musicRecoveryTimer)
    this.musicRecoveryTimer = undefined
    this.appStateSubscription?.remove()
    this.appStateSubscription = null
    this.stopAll(true)
    for (const player of this.cachedPlayers.values()) {
      try { player.pause(); player.remove() } catch { /* already released */ }
    }
    this.cachedPlayers.clear()
    this.lastPlayed.clear()
    this.dedupeKeys.clear()
  }

  play(event: AudioEvent, context: AudioPlayContext = {}): boolean {
    const definition = audioRegistry[event]
    if (!definition || !this.canPlay()) return false
    if (PRIVATE_EVENTS.has(event) && (context.spectator || context.isLocalPlayer !== true)) return false
    const now = Date.now()
    this.releaseStaleCriticalAudio(now)
    this.pruneDedupe(now)
    if (context.dedupeKey) {
      if (this.dedupeKeys.has(context.dedupeKey)) return false
    }
    if (definition.cooldownMs && now - (this.lastPlayed.get(event) ?? 0) < definition.cooldownMs) return false
    if (definition.category !== AudioCategory.BGM && !ARRANGEMENT_EVENTS.has(event) && this.hasBlockingPriority(definition.priority)) return false

    // Reserve a server event only after it has passed cooldown/priority gates.
    // Previously a temporarily blocked sound consumed its dedupe key for 30 minutes,
    // so the legitimate retry was discarded and audio appeared to die at random.
    if (context.dedupeKey) this.dedupeKeys.set(context.dedupeKey, now)

    if (definition.category === AudioCategory.TIMER) this.stopCategory(AudioCategory.TIMER, 120)
    if (RESULT_EVENTS.has(event)) this.stopCategory(AudioCategory.RESULT, 100)
    if (definition.priority === AudioPriority.CRITICAL) this.suppressLowPriority()
    if (definition.duckBgm !== undefined) this.duck(AudioCategory.BGM, definition.duckBgm, 300)
    if (this.active.has(event)) this.stop(event, 0)

    try {
      // ExoPlayer accepts play() while a bundled Metro asset is still buffering and
      // starts it as soon as it is ready. Waiting for `isLoaded` here was incorrect:
      // Expo Go on Android does not reliably publish that transition for an idle
      // player, so short SFX were released after five seconds and retried forever.
      const player = this.getOrCreatePlayer(event)
      player.loop = definition.loop === true
      const baseVolume = definition.volume
      player.volume = definition.fadeInMs ? 0 : this.effectiveVolume(definition.category, baseVolume)
      const entry: ActiveAudio = { event, player, priority: definition.priority, baseVolume, startedAt: now }
      this.active.set(event, entry)
      // Also expire players waiting on session activation, not only started sounds.
      if (!player.loop) this.armOneShotSafetyTimer(entry)
      this.lastPlayed.set(event, now)
      if (!player.loop) {
        const subscription = player.addListener('playbackStatusUpdate', status => {
          if (status.didJustFinish) this.release(event, player)
        })
        entry.cleanup = () => subscription.remove()
      }
      const start = () => {
          if (this.active.get(event) !== entry || !this.canPlay()) return
          player.play()
          if (definition.fadeInMs) this.fadeTo(event, this.effectiveVolume(definition.category, baseVolume), definition.fadeInMs)
          if (!player.loop) {
            this.armOneShotSafetyTimer(entry)
            // Android อาจรับ play() แต่ native player ยังไม่เริ่มหลังถูก interrupt (เสีย audio focus
            // ชั่วขณะ) — จังหวะที่ focus กลับมาไม่แน่นอนพอที่จะลองซ้ำครั้งเดียวตายตัวได้ (เดิม 180ms ครั้ง
            // เดียว พลาดบ่อยเพราะ Android คืน focus ช้ากว่านั้นได้บ่อยๆ ต่างจาก loop ที่มี recoveryTimer
            // คอยกู้ต่อเนื่องทุก 2 วิ) ลองซ้ำถี่ๆ ในกรอบเวลาสั้นๆ แทน หยุดเองทันทีที่เริ่มเล่นจริงหรือหมดเวลา
            const recoveryDeadline = Date.now() + 1_500
            entry.recoveryTimer = setInterval(() => {
              if (this.active.get(event) !== entry) { clearInterval(entry.recoveryTimer!); return }
              if (player.playing || player.currentTime >= 0.02) { clearInterval(entry.recoveryTimer!); entry.recoveryTimer = undefined; return }
              if (Date.now() >= recoveryDeadline) { clearInterval(entry.recoveryTimer!); entry.recoveryTimer = undefined; return }
              void this.ensureAudioSessionActive()
                .then(() => {
                  if (this.active.get(event) === entry && this.canPlay() && !player.playing && player.currentTime < 0.02) {
                    try { player.play() } catch (error) { this.warn(`Could not retry ${event}`, error) }
                  }
                })
                .catch(error => this.warn(`Could not recover one-shot ${event}`, error))
            }, 150)
          } else {
            // กู้ loop ใน foreground หลังเสีย audio focus ชั่วคราว ซึ่งบางครั้งไม่มี AppState event
            entry.recoveryTimer = setInterval(() => {
              if (this.active.get(event) !== entry || AppState.currentState !== 'active' || player.playing || !player.isLoaded) return
              void this.ensureAudioSessionActive()
                .then(() => { if (this.active.get(event) === entry && this.canPlay() && !player.playing) player.play() })
                .catch(error => this.warn(`Could not recover loop ${event}`, error))
            }, 2000)
          }
        }
      if (Platform.OS === 'web') { void player.seekTo(0).catch(error => this.warn('Could not rewind audio', error)); start() }
      else void this.ensureAudioSessionActive()
        .then(() => this.active.get(event) === entry ? player.seekTo(0) : undefined)
        .then(start).catch(error => {
          this.warn(`Could not activate audio for ${event}`, error)
          this.release(event, player, true)
        })
      return true
    } catch (error) {
      this.warn(`Failed to play ${event}`, error)
      const failed = this.active.get(event)
      if (failed) this.release(event, failed.player, true)
      else if (definition.duckBgm !== undefined && ![...this.active.keys()].some(key => audioRegistry[key].duckBgm !== undefined)) this.restore(AudioCategory.BGM, 600)
      return false
    }
  }

  playTimer(remainingSeconds: number, options: { localPlayer: boolean; spectator?: boolean; pressure?: boolean; longTexture?: boolean } ): void {
    if (!options.localPlayer || options.spectator || remainingSeconds <= 0) { this.stopCategory(AudioCategory.TIMER); return }
    const context = { isLocalPlayer: true, spectator: options.spectator }
    if (remainingSeconds <= 5) this.play(AudioEvent.TIMER_CRITICAL, context)
    else if (remainingSeconds <= 10) this.play(options.pressure ? AudioEvent.TIMER_PRESSURE : AudioEvent.TIMER_WARNING, context)
    else if (options.longTexture) this.play(AudioEvent.TIMER_LONG, context)
    else this.stopCategory(AudioCategory.TIMER)
  }

  stopTimer(): void { this.stopCategory(AudioCategory.TIMER, 180) }

  /** Recover focus without repeatedly allocating Android MediaSessions. */
  prepareArrangement(): void {
    for (const event of ARRANGEMENT_EVENTS) {
      this.stop(event, 0)
      this.lastPlayed.delete(event)
    }
    this.activationPromise = null
    if (this.canPlay()) void this.ensureAudioSessionActive().catch(error => this.warn('Could not activate arrangement audio', error))
  }

  /** Plays the common tap sound unless the pressed control already emitted a semantic sound. */
  playUiFeedback(): boolean {
    this.recoverOnInteraction()
    const now = Date.now()
    for (const [event, playedAt] of this.lastPlayed) {
      if (event !== AudioEvent.BUTTON_CONFIRM && now - playedAt < 75) return false
    }
    return this.play(AudioEvent.BUTTON_CONFIRM)
  }

  playBGM(event: AudioEvent = AudioEvent.LOBBY_BGM): boolean {
    if (audioRegistry[event]?.category !== AudioCategory.BGM) return false
    // Track screen intent even when muted/backgrounded; never resurrect an old screen's music.
    this.resumeBgm = event
    if (!this.canPlay()) return false
    const existing = this.active.get(event)
    if (existing) {
      // Rescue a loop whose fade-out is still running instead of restarting the same native player.
      const fadeTimer = this.fadeTimers.get(event)
      if (fadeTimer) clearInterval(fadeTimer)
      this.fadeTimers.delete(event)
      existing.player.volume = this.effectiveVolume(AudioCategory.BGM, existing.baseVolume)
      void this.ensureAudioSessionActive()
        .then(() => {
          if (this.active.get(event) === existing && this.canPlay()) existing.player.play()
        })
        .catch(error => this.warn(`Could not resume BGM ${event}`, error))
      return true
    }
    this.stopCategory(AudioCategory.BGM, 300)
    this.resumeBgm = event
    return this.play(event)
  }

  stopBGM(fadeMs = 500): void { this.resumeBgm = null; this.stopCategory(AudioCategory.BGM, fadeMs) }

  /** A late blur/unmount from the old screen must not stop the new screen's same track. */
  acquireBGM(event: AudioEvent, fadeOutMs = 500): () => void {
    const owner = Symbol('music screen')
    this.bgmOwner = owner
    this.playBGM(event)
    return () => {
      if (this.bgmOwner !== owner) return
      this.bgmOwner = null
      this.stop(event, fadeOutMs)
    }
  }

  playBoss(profileName: BossAudioProfile, encounterId: string): boolean {
    const profile = bossAudioProfiles[profileName]
    const key = `boss:${profileName}:${encounterId}`
    if (!this.play(profile.impact, { dedupeKey: key })) return false
    if (profile.ambience) setTimeout(() => this.play(profile.ambience!), profileName === 'caelum' ? 700 : 350)
    return true
  }

  stop(event: AudioEvent, fadeMs = audioRegistry[event]?.fadeOutMs ?? 0): void {
    if (this.resumeBgm === event) this.resumeBgm = null
    const entry = this.active.get(event)
    if (!entry) return
    if (fadeMs > 0) this.fadeTo(event, 0, fadeMs, () => this.release(event, entry.player))
    else this.release(event, entry.player)
  }

  stopCategory(category: AudioCategory, fadeMs = 0): void {
    for (const [event] of this.active) if (audioRegistry[event].category === category) this.stop(event, fadeMs)
  }

  fadeIn(event: AudioEvent, ms: number): boolean {
    const played = this.play(event)
    if (played) this.fadeTo(event, this.effectiveVolume(audioRegistry[event].category, audioRegistry[event].volume), ms)
    return played
  }

  fadeOut(event: AudioEvent, ms: number): void { this.stop(event, ms) }

  duck(category: AudioCategory, factor: number, ms: number): void {
    if (category !== AudioCategory.BGM) return
    this.duckFactor = clampVolume(factor)
    this.fadeCategory(category, ms)
  }

  restore(category: AudioCategory, ms: number): void {
    if (category !== AudioCategory.BGM) return
    this.duckFactor = 1
    this.fadeCategory(category, ms)
  }

  setMasterVolume(value: number): void { this.updateSettings({ ...this.settings, master: clampVolume(value) }) }
  setCategoryVolume(category: AudioCategory, value: number): void {
    this.updateSettings({ ...this.settings, categories: { ...this.settings.categories, [category]: clampVolume(value) } })
  }
  setSfxVolume(value: number): void {
    const volume = clampVolume(value)
    const categories = { ...this.settings.categories }
    for (const category of Object.values(AudioCategory)) if (category !== AudioCategory.BGM) categories[category] = volume
    this.updateSettings({ ...this.settings, categories })
  }
  mute(): void { this.updateSettings({ ...this.settings, muted: true }); this.stopAll(false) }
  unmute(): void {
    this.updateSettings({ ...this.settings, muted: false })
    if (this.resumeBgm) this.playBGM(this.resumeBgm)
  }

  /** Called synchronously inside a user gesture to recover browser autoplay denial. */
  recoverOnInteraction(): void {
    if (!this.canPlay()) return
    for (const [event, pending] of this.active) {
      if (audioRegistry[event].category === AudioCategory.BGM) continue
      if (!pending.player.playing && pending.player.currentTime < 0.02) {
        try { pending.player.play() } catch { this.release(event, pending.player) }
      }
    }
    if (!this.resumeBgm) return
    const entry = this.active.get(this.resumeBgm)
    if (entry && !entry.player.playing && entry.player.isLoaded) {
      try { entry.player.play() } catch (error) { this.warn('Could not resume music on interaction', error) }
    } else if (!entry) this.playBGM(this.resumeBgm)
  }
  setMuted(muted: boolean): void { muted ? this.mute() : this.unmute() }
  getSettings(): AudioSettings { return { ...this.settings, categories: { ...this.settings.categories } } }
  getDebugState() {
    return { currentBGM: [...this.active.keys()].find(e => audioRegistry[e].category === AudioCategory.BGM) ?? null, desiredBGM: this.resumeBgm, activeAudio: [...this.active.keys()],
      players: [...this.active.values()].map(({event,player}) => ({event,loaded:player.isLoaded,playing:player.playing,seconds:player.currentTime,volume:player.volume})),settings: this.getSettings() }
  }
  subscribe(listener: Listener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener) }

  private handleAppState = (state: AppStateStatus): void => {
    if (state !== 'active') {
      // Stop immediately: backgrounded JS timers may never complete a fade.
      // Old one-shots are cancelled, not replayed after returning to the game.
      this.stopAll(false)
    } else if (this.resumeBgm) {
      this.playBGM(this.resumeBgm)
    } else {
      void this.ensureAudioSessionActive().catch(error => this.warn('Could not resume audio session', error))
    }
  }

  private canPlay(): boolean {
    return !this.settings.muted && this.settings.master > 0 &&
      (AppState.currentState === 'active' || AppState.currentState == null)
  }

  private ensureAudioSessionActive(): Promise<void> {
    if (Platform.OS === 'web') return Promise.resolve()
    if (this.activationPromise) return this.activationPromise
    const activation = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Audio session activation timed out')), 1500)
      Promise.resolve().then(() => setIsAudioActiveAsync(true)).then(
        () => { clearTimeout(timer); resolve() },
        error => { clearTimeout(timer); reject(error) },
      )
    })
    this.activationPromise = activation
    void activation.finally(() => {
      if (this.activationPromise === activation) this.activationPromise = null
    }).catch(() => undefined)
    return activation
  }

  private getOrCreatePlayer(event: AudioEvent): AudioPlayer {
    const cached = this.cachedPlayers.get(event)
    if (cached) return cached
    const player = createManagedPlayer(audioRegistry[event].source)
    this.cachedPlayers.set(event, player)
    return player
  }

  private armOneShotSafetyTimer(entry: ActiveAudio): void {
    if (entry.safetyTimer) clearTimeout(entry.safetyTimer)
    const durationMs = Number.isFinite(entry.player.duration) && entry.player.duration > 0
      ? Math.min(MAX_ONE_SHOT_MS, entry.player.duration * 1000)
      : MAX_ONE_SHOT_MS
    // ใช้ความยาวไฟล์จริงตัดสินว่า "บล็อกเสียงอื่น" นานแค่ไหน (hasBlockingPriority อ่านค่านี้) แยกจาก
    // เวลาที่ entry จะถูกเคลียร์ออกจาก active map จริง (safetyTimer ด้านล่าง) — เดิมสองอย่างนี้ผูกกัน
    // (บล็อกจนกว่า entry จะหายจาก active) ทำให้ถ้า Android ไม่ส่ง didJustFinish (คอมเมนต์เดิมด้านล่าง)
    // เสียงอื่นทั้งหมด (การ์ด/ปุ่ม/ชิป) เงียบไปได้นานถึง duration+2000ms หลัง Boss Reveal ทุกครั้ง
    entry.blockUntil = Date.now() + durationMs
    // Android อาจไม่ส่ง didJustFinish หลังเสีย audio focus จึงคืน priority/duck ตามความยาวไฟล์จริง
    const timeoutMs = Math.max(2500, durationMs + ONE_SHOT_CLEANUP_GRACE_MS)
    entry.safetyTimer = setTimeout(() => this.release(entry.event, entry.player), timeoutMs)
  }

  private preloadFrequentlyUsedAudio(): void {
    for (const event of CACHED_EVENTS) {
      try { this.getOrCreatePlayer(event) }
      catch (error) { this.warn(`Could not preload ${event}`, error) }
    }
  }

  private hasBlockingPriority(priority: AudioPriority): boolean {
    if (priority >= AudioPriority.HIGH) return false
    const now = Date.now()
    // blockUntil ยังไม่ถูกตั้ง (ระหว่างรอโหลด/armOneShotSafetyTimer ยังไม่ทำงาน) ให้ถือว่ายังบล็อกอยู่
    // ไปก่อนแบบระมัดระวัง — ช่วงเวลานี้สั้นมาก (ไม่ถึง 1 tick ของ event loop)
    return [...this.active.values()].some(entry =>
      entry.priority === AudioPriority.CRITICAL && (entry.blockUntil === undefined || now < entry.blockUntil))
  }
  private suppressLowPriority(): void {
    for (const [event, entry] of this.active) if (entry.priority <= AudioPriority.NORMAL && audioRegistry[event].category !== AudioCategory.BGM) this.stop(event, 80)
  }
  private stopAll(clearResume: boolean): void {
    const desiredBgm = this.resumeBgm
    for (const [event] of this.active) this.stop(event, 0)
    for (const timer of this.fadeTimers.values()) clearInterval(timer)
    this.fadeTimers.clear()
    this.resumeBgm = clearResume ? null : desiredBgm
    this.duckFactor = 1
  }
  private effectiveVolume(category: AudioCategory, baseVolume: number): number {
    const duck = category === AudioCategory.BGM ? this.duckFactor : 1
    return clampVolume(baseVolume * this.settings.master * this.settings.categories[category] * duck)
  }
  private updateSettings(settings: AudioSettings): void {
    this.settingsRevision++
    this.settings = settings
    for (const entry of this.active.values()) entry.player.volume = this.effectiveVolume(audioRegistry[entry.event].category, entry.baseVolume)
    this.emitSettings()
    void saveAudioSettings(settings)
  }
  private emitSettings(): void { for (const listener of this.listeners) listener(this.getSettings()) }
  private fadeCategory(category: AudioCategory, ms: number): void {
    for (const [event] of this.active) if (audioRegistry[event].category === category) this.fadeTo(event, this.effectiveVolume(category, audioRegistry[event].volume), ms)
  }
  private fadeTo(event: AudioEvent, target: number, ms: number, done?: () => void): void {
    const entry = this.active.get(event)
    if (!entry) return
    const old = this.fadeTimers.get(event)
    if (old) clearInterval(old)
    const start = entry.player.volume
    const started = Date.now()
    const timer = setInterval(() => {
      const current = this.active.get(event)
      if (!current || current.player !== entry.player) { clearInterval(timer); return }
      const progress = Math.min(1, (Date.now() - started) / Math.max(1, ms))
      try { entry.player.volume = start + (target - start) * progress } catch { clearInterval(timer) }
      if (progress >= 1) { clearInterval(timer); this.fadeTimers.delete(event); done?.() }
    }, 40)
    this.fadeTimers.set(event, timer)
  }
  private release(event: AudioEvent, player: AudioPlayer, invalid = false): void {
    const entry = this.active.get(event)
    if (!entry || entry.player !== player) return
    const timer = this.fadeTimers.get(event)
    if (timer) clearInterval(timer)
    this.fadeTimers.delete(event)
    this.active.delete(event)
    if (entry.safetyTimer) clearTimeout(entry.safetyTimer)
    if (entry.recoveryTimer) clearInterval(entry.recoveryTimer)
    try { entry.cleanup?.() } catch { /* already released */ }
    try { player.pause() } catch { invalid = true }
    // Keep one healthy player per event. Every constructor allocates an Android
    // MediaSession; rebuilding after every tap can overwhelm session creation.
    if (invalid || !this.initialized) {
      if (this.cachedPlayers.get(event) === player) this.cachedPlayers.delete(event)
      try { player.remove() } catch { /* native teardown may already have occurred */ }
    }
    if (audioRegistry[event].duckBgm !== undefined && ![...this.active.keys()].some(activeEvent => audioRegistry[activeEvent].duckBgm !== undefined)) {
      this.restore(AudioCategory.BGM, 600)
    }
  }
  private releaseStaleCriticalAudio(now: number): void {
    for (const [event, entry] of this.active) {
      if (entry.priority === AudioPriority.CRITICAL && now - entry.startedAt > 20_000) this.release(event, entry.player)
    }
  }
  private pruneDedupe(now: number): void {
    const ttl = 30 * 60 * 1000
    for (const [key, timestamp] of this.dedupeKeys) if (now - timestamp > ttl) this.dedupeKeys.delete(key)
  }
  private warn(message: string, error: unknown): void {
    if (__DEV__) console.warn(`[audio] ${message}`, error)
  }
}

export const audio = new AudioManager()
